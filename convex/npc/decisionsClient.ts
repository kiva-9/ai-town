/** Server-only Decisions transport. Never import into browser code or log its config. */
export type DecisionQuestion =
  | { type: 'predicate'; name: string; instructions: string }
  | {
      type: 'choice';
      name: string;
      instructions: string;
      choices: { value: string | boolean; description?: string }[];
    }
  | {
      type: 'score';
      name: string;
      instructions: string;
      levels: { label: string; description?: string }[];
    };
export type DecisionAnswer =
  | { type: 'predicate'; name: string; probability: number }
  | {
      type: 'choice';
      name: string;
      choice: string | boolean;
      confidence: number;
      probabilities: { value: string | boolean; probability: number }[];
    }
  | {
      type: 'score';
      name: string;
      score: number;
      confidence: number;
      probabilities: { value: number; label: string; probability: number }[];
    }
  | { type: 'refusal'; name: string };
export interface DecisionUsage {
  input_tokens: number;
  input_tokens_details: { cached_tokens: number; cache_write_tokens: number };
  output_tokens: number;
  output_tokens_details: { reasoning_tokens: number };
  total_tokens: number;
}
export interface DecisionsPricing {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  cacheWritePerMillionUsd: number;
  outputPerMillionUsd: number;
}
export interface DecisionsConfig {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  pricing?: DecisionsPricing;
}
export type DecisionFallbackReason =
  | 'missing_key'
  | 'pricing_unavailable'
  | 'invalid_request'
  | 'timeout'
  | 'network_error'
  | 'rate_limited'
  | 'service_unavailable'
  | 'authentication'
  | 'billing_quota'
  | 'http_error'
  | 'invalid_response';
export type DecisionResult =
  | {
      ok: true;
      answers: DecisionAnswer[];
      usage: DecisionUsage;
      costUsd: number;
      model: string;
      attempts: number;
    }
  | { ok: false; reason: DecisionFallbackReason; attempts: number };
export interface DecisionsDependencies {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}
export interface DecisionsClient {
  decide(input: string, questions: DecisionQuestion[]): Promise<DecisionResult>;
}
const ENDPOINT = 'https://api.openai.com/v1/decisions';
const isObject = (x: unknown): x is Record<string, any> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const nonempty = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const probability = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const tokenCount = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const finiteRate = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0;
function validPricing(p: DecisionsPricing | undefined): p is DecisionsPricing {
  return (
    !!p &&
    [
      p.inputPerMillionUsd,
      p.cachedInputPerMillionUsd,
      p.cacheWritePerMillionUsd,
      p.outputPerMillionUsd,
    ].every(finiteRate)
  );
}
function validUsage(u: unknown): u is DecisionUsage {
  if (!isObject(u) || !isObject(u.input_tokens_details) || !isObject(u.output_tokens_details))
    return false;
  const { cached_tokens: cached, cache_write_tokens: written } = u.input_tokens_details;
  return (
    [
      u.input_tokens,
      cached,
      written,
      u.output_tokens,
      u.output_tokens_details.reasoning_tokens,
      u.total_tokens,
    ].every(tokenCount) &&
    cached + written <= u.input_tokens &&
    u.output_tokens_details.reasoning_tokens <= u.output_tokens &&
    u.total_tokens === u.input_tokens + u.output_tokens
  );
}
/** Token buckets partition input_tokens; output rate must be explicitly configured, even if zero. */
export function calculateCostUsd(usage: DecisionUsage, pricing: DecisionsPricing): number {
  if (!validUsage(usage) || !validPricing(pricing)) throw new Error('Invalid usage or pricing');
  const { cached_tokens: cached, cache_write_tokens: written } = usage.input_tokens_details;
  const cost =
    ((usage.input_tokens - cached - written) * pricing.inputPerMillionUsd +
      cached * pricing.cachedInputPerMillionUsd +
      written * pricing.cacheWritePerMillionUsd +
      usage.output_tokens * pricing.outputPerMillionUsd) /
    1_000_000;
  if (!Number.isFinite(cost)) throw new Error('Invalid usage or pricing');
  return cost;
}
function validQuestions(input: unknown, questions: unknown): questions is DecisionQuestion[] {
  if (!nonempty(input) || !Array.isArray(questions) || !questions.length) return false;
  const names = new Set<string>();
  return questions.every((q) => {
    if (!isObject(q) || !nonempty(q.name) || !nonempty(q.instructions) || names.has(q.name))
      return false;
    names.add(q.name);
    if (q.type === 'predicate') return true;
    if (q.type === 'choice')
      return (
        Array.isArray(q.choices) &&
        q.choices.length >= 2 &&
        q.choices.every(
          (c: unknown) =>
            isObject(c) &&
            (typeof c.value === 'boolean' || nonempty(c.value)) &&
            (c.description === undefined || typeof c.description === 'string'),
        ) &&
        new Set(q.choices.map((c: { value: string | boolean }) => c.value)).size ===
          q.choices.length
      );
    if (q.type === 'score')
      return (
        Array.isArray(q.levels) &&
        q.levels.length >= 2 &&
        q.levels.every(
          (l: unknown) =>
            isObject(l) &&
            nonempty(l.label) &&
            (l.description === undefined || typeof l.description === 'string'),
        ) &&
        new Set(q.levels.map((l: { label: string }) => l.label)).size === q.levels.length
      );
    return false;
  });
}
function validAnswers(
  answers: unknown,
  questions: DecisionQuestion[],
): answers is DecisionAnswer[] {
  if (!Array.isArray(answers) || answers.length !== questions.length) return false;
  const seen = new Set<string>();
  return answers.every((a) => {
    if (!isObject(a) || typeof a.name !== 'string' || seen.has(a.name)) return false;
    seen.add(a.name);
    const q = questions.find((q) => q.name === a.name);
    if (!q) return false;
    if (a.type === 'refusal') return true;
    if (a.type !== q.type) return false;
    if (q.type === 'predicate') return probability(a.probability);
    if (!probability(a.confidence) || !Array.isArray(a.probabilities)) return false;
    const ps = a.probabilities;
    if (!ps.every((p: unknown) => isObject(p) && probability(p.probability))) return false;
    if (
      Math.abs(ps.reduce((sum: number, p: { probability: number }) => sum + p.probability, 0) - 1) >
      0.001
    )
      return false;
    if (new Set(ps.map((p: { value: unknown }) => p.value)).size !== ps.length) return false;
    if (q.type === 'choice')
      return (
        ps.length === q.choices.length &&
        q.choices.some((c) => c.value === a.choice) &&
        ps.every((p: { value: unknown }) => q.choices.some((c) => c.value === p.value))
      );
    return (
      typeof a.score === 'number' &&
      Number.isFinite(a.score) &&
      a.score >= 0 &&
      a.score <= q.levels.length - 1 &&
      ps.length === q.levels.length &&
      ps.every(
        (p: { value: number; label: string }) =>
          tokenCount(p.value) && p.value < q.levels.length && q.levels[p.value].label === p.label,
      ) &&
      Math.abs(
        a.score -
          ps.reduce(
            (sum: number, p: { value: number; probability: number }) =>
              sum + p.value * p.probability,
            0,
          ),
      ) <= 0.001
    );
  });
}
function statusReason(status: number, body: unknown): DecisionFallbackReason {
  const error = isObject(body) && isObject(body.error) ? body.error : {};
  // Never expose raw upstream text, which can echo prompts or credentials.
  const code = `${typeof error.code === 'string' ? error.code : ''} ${typeof error.type === 'string' ? error.type : ''}`;
  if (
    status === 402 ||
    /insufficient_quota|billing|quota_exceeded|usage_limit|credit_balance/.test(code)
  )
    return 'billing_quota';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'service_unavailable';
  return 'http_error';
}
export function createDecisionsClient(
  config: DecisionsConfig,
  dependencies: DecisionsDependencies = {},
): DecisionsClient {
  const fetcher = dependencies.fetch ?? fetch;
  const sleep =
    dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  return {
    async decide(input, questions) {
      if (!config.apiKey?.trim()) return { ok: false, reason: 'missing_key', attempts: 0 };
      if (!validPricing(config.pricing))
        return { ok: false, reason: 'pricing_unavailable', attempts: 0 };
      const timeoutMs = config.timeoutMs ?? 5000;
      const maxRetries = config.maxRetries ?? 1;
      const model = config.model ?? 'gpt-6-luna';
      if (
        !validQuestions(input, questions) ||
        !nonempty(model) ||
        !Number.isFinite(timeoutMs) ||
        timeoutMs < 1 ||
        timeoutMs > 60000 ||
        !Number.isInteger(maxRetries) ||
        maxRetries < 0 ||
        maxRetries > 3
      )
        return { ok: false, reason: 'invalid_request', attempts: 0 };
      for (let attempts = 1; ; attempts++) {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let reason: DecisionFallbackReason = 'network_error';
        try {
          // Race bounds even an injected fetch or body reader that ignores abort.
          const result = await Promise.race([
            (async () => {
              const response = await fetcher(ENDPOINT, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${config.apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model, input, questions }),
                signal: controller.signal,
              });
              let body: unknown;
              try {
                body = await response.json();
              } catch {
                body = undefined;
              }
              return { response, body };
            })(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error('timeout'));
              }, timeoutMs);
            }),
          ]);
          if (result.response.ok) {
            const body = result.body;
            if (
              !isObject(body) ||
              body.model !== model ||
              !validUsage(body.usage) ||
              !validAnswers(body.answers, questions)
            ) {
              return { ok: false, reason: 'invalid_response', attempts };
            }
            let costUsd: number;
            try {
              costUsd = calculateCostUsd(body.usage, config.pricing);
            } catch {
              return { ok: false, reason: 'invalid_response', attempts };
            }
            return {
              ok: true,
              answers: body.answers,
              usage: body.usage,
              costUsd,
              model: body.model,
              attempts,
            };
          }
          reason = statusReason(result.response.status, result.body);
        } catch {
          reason = controller.signal.aborted ? 'timeout' : 'network_error';
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
        if (
          attempts > maxRetries ||
          !['network_error', 'timeout', 'rate_limited', 'service_unavailable'].includes(reason)
        )
          return { ok: false, reason, attempts };
        try {
          await sleep(Math.min(250 * 2 ** (attempts - 1), 2000));
        } catch {
          return { ok: false, reason, attempts };
        }
      }
    },
  };
}
