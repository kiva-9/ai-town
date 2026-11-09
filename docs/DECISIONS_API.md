# Decisions API integration

This server-only integration calls the documented `POST https://api.openai.com/v1/decisions`
endpoint using a backend API key. It does not use chat completions or invent a Responses API schema.
Never import its configuration into browser code, expose keys in Vite variables, or log
authorization headers or upstream errors.

Official references (verified November 2026):

- https://developers.openai.com/api/docs/guides/decisions
- https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create

## Contract

`createDecisionsClient(config, { fetch?, sleep? }).decide(input, questions)` sends
`{model, input, questions}`. The default model is `gpt-6-luna`. Questions support `predicate`,
`choice` (string or boolean values) and `score` (ordered labeled levels). Every question needs a
unique name and instructions.

The result is either `{ok:true, model, answers, usage, costUsd, attempts}` or
`{ok:false, reason, attempts}`. Refusals are typed answers and must be treated as fallback by the
caller, not as action choices. Scores are weighted **zero-based** level indices, not normalized
confidence values. Choice confidence and predicate probability are separate concepts.

Responses are validated before use: complete named answers, expected types, allowed choices, finite
probabilities, distributions, score/level consistency, and nonnegative integer usage. Invalid output
never becomes an NPC action. The caller must independently enforce allowed action targets, movement,
combat, cooldown and state preconditions; an API-selected choice cannot bypass them.

## Configuration and pricing

`DecisionsConfig` accepts `apiKey`, optional `model`, `timeoutMs` (default 5000, maximum 60000),
`maxRetries` (default 1, maximum 3), and explicit `pricing`:

- `inputPerMillionUsd`
- `cachedInputPerMillionUsd`
- `cacheWritePerMillionUsd`
- `outputPerMillionUsd`

All four prices must be finite nonnegative USD rates per million tokens. Supply current verified
rates for the configured model, including explicit zero rates when applicable. No live price is
guessed or permanently hardcoded. Missing pricing or key prevents the request entirely and yields a
clean fallback reason. Deployments should disable hybrid operation until rates are configured and
review rates when changing model.

Usage preserves `input_tokens`, input cached/cache-write details, `output_tokens`, output reasoning
details, and `total_tokens`. Cost is
`(uncached input × input rate + cached input × cached rate + cache-write input × cache-write rate + output × output rate) / 1,000,000`;
cached and cache-write tokens are subtracted from the input total to obtain the ordinary input
bucket. Reasoning tokens are a subset of output, not charged a second time. Invalid accounting fails
closed.

## Reliability and budget boundaries

The timeout covers both fetching headers and reading the JSON body, even with an injected transport
that ignores abort. Only network failures, timeout, HTTP 429 and HTTP 503 are retried, using bounded
exponential delays. Authentication, billing/insufficient-quota errors, malformed responses and other
statuses are not retried. Upstream error text is neither returned nor logged.

Each attempt may incur cost even when the response is lost. The persistent scheduler must reserve
enough for **all** allowed attempts before calling the client, enforce global/monthly/per-agent
limits atomically, and retain conservative cost reservations for ambiguous failures. Returned
`costUsd` represents the successful response's reported usage only, not unreported usage from failed
attempts. A client-side estimate alone is not a hard provider spending limit. Set provider-side
limits where available.

Transport and sleep are injectable for offline tests. Tests never use a real credential or make live
API calls. Run `npm test -- --runInBand convex/npc/decisionsClient.test.ts`.
