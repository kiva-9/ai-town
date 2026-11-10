import { jest } from '@jest/globals';
import {
  calculateCostUsd,
  createDecisionsClient,
  DecisionQuestion,
  DecisionsPricing,
} from './decisionsClient';

const pricing: DecisionsPricing = {
  inputPerMillionUsd: 1,
  cachedInputPerMillionUsd: 0.2,
  cacheWritePerMillionUsd: 2,
  outputPerMillionUsd: 0,
};
const questions: DecisionQuestion[] = [
  {
    type: 'choice',
    name: 'action',
    instructions: 'Choose a safe action.',
    choices: [{ value: 'rest' }, { value: 'walk' }],
  },
];
const usage = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 },
  output_tokens: 0,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 100,
};
const responseBody = () => ({
  model: 'gpt-6-luna',
  answers: [
    {
      type: 'choice',
      name: 'action',
      choice: 'rest',
      confidence: 0.8,
      probabilities: [
        { value: 'rest', probability: 0.8 },
        { value: 'walk', probability: 0.2 },
      ],
    },
  ],
  usage,
});
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const config = { apiKey: 'test-only-key', pricing };
function setup(mock: jest.Mock, overrides = {}) {
  const sleep = jest.fn(async () => {});
  const client = createDecisionsClient(
    { ...config, ...overrides },
    { fetch: mock as typeof fetch, sleep },
  );
  return { client, sleep };
}

describe('Decisions API client', () => {
  test('uses the documented endpoint/body and records exact token buckets', async () => {
    const mock = jest.fn(async () => reply(responseBody()));
    const { client } = setup(mock);
    const result = await client.decide('NPC context', questions);
    expect(result).toMatchObject({ ok: true, model: 'gpt-6-luna', attempts: 1, usage });
    if (result.ok) expect(result.costUsd).toBeCloseTo(94 / 1_000_000);
    expect(mock.mock.calls[0]).toBeDefined();
    const [url, options] = (mock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe('https://api.openai.com/v1/decisions');
    expect(JSON.parse(options.body as string)).toEqual({
      model: 'gpt-6-luna',
      input: 'NPC context',
      questions,
    });
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-only-key' });
  });
  test.each([
    [{ apiKey: undefined }, 'missing_key'],
    [{ pricing: undefined }, 'pricing_unavailable'],
    [{ pricing: { ...pricing, cachedInputPerMillionUsd: NaN } }, 'pricing_unavailable'],
    [{ maxRetries: 4 }, 'invalid_request'],
  ])('fails closed before transport for %p', async (overrides, reason) => {
    const mock = jest.fn();
    const { client } = setup(mock, overrides);
    expect(await client.decide('context', questions)).toEqual({ ok: false, reason, attempts: 0 });
    expect(mock).not.toHaveBeenCalled();
  });
  test('rejects duplicate question names before transport', async () => {
    const mock = jest.fn();
    expect(await setup(mock).client.decide('context', [...questions, ...questions])).toMatchObject({
      ok: false,
      reason: 'invalid_request',
    });
    expect(mock).not.toHaveBeenCalled();
  });
  test.each([429, 503])('retries transient HTTP %i once', async (status) => {
    const mock = jest
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(reply({}, status))
      .mockResolvedValueOnce(reply(responseBody()));
    const { client, sleep } = setup(mock);
    expect(await client.decide('context', questions)).toMatchObject({ ok: true, attempts: 2 });
    expect(sleep).toHaveBeenCalledWith(250);
  });
  test.each([
    [401, {}, 'authentication'],
    [403, {}, 'authentication'],
    [402, {}, 'billing_quota'],
    [429, { error: { code: 'insufficient_quota' } }, 'billing_quota'],
    [429, { error: { type: 'billing_hard_limit_reached' } }, 'billing_quota'],
    [400, {}, 'http_error'],
    [500, {}, 'http_error'],
  ])('never retries terminal HTTP %i / %p', async (status, body, reason) => {
    const mock = jest.fn(async () => reply(body, status));
    const { client } = setup(mock);
    expect(await client.decide('context', questions)).toEqual({ ok: false, reason, attempts: 1 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  test('bounds network retries and does not expose error contents', async () => {
    const mock = jest.fn(async () => {
      throw new Error('secret upstream detail');
    });
    expect(await setup(mock).client.decide('context', questions)).toEqual({
      ok: false,
      reason: 'network_error',
      attempts: 2,
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  test('bounds fetch that ignores abort', async () => {
    const mock = jest.fn(() => new Promise<Response>(() => {}));
    expect(
      await setup(mock, { timeoutMs: 5, maxRetries: 0 }).client.decide('context', questions),
    ).toEqual({ ok: false, reason: 'timeout', attempts: 1 });
  });
  test('bounds response body read as well as headers', async () => {
    const mock = jest.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }));
    expect(
      await setup(mock, { timeoutMs: 5, maxRetries: 0 }).client.decide('context', questions),
    ).toMatchObject({ ok: false, reason: 'timeout' });
  });
  test.each(['unknown choice', 'missing answer', 'bad probabilities', 'bad usage', 'wrong model'])(
    'rejects %s',
    async (kind) => {
      const body = responseBody();
      if (kind === 'unknown choice') body.answers[0].choice = 'invented';
      if (kind === 'missing answer') body.answers = [];
      if (kind === 'bad probabilities') body.answers[0].probabilities[0].probability = 2;
      if (kind === 'bad usage') body.usage = { ...usage, total_tokens: 0 };
      if (kind === 'wrong model') body.model = 'other-model';
      const mock = jest.fn(async () => reply(body));
      expect(await setup(mock).client.decide('context', questions)).toEqual({
        ok: false,
        reason: 'invalid_response',
        attempts: 1,
      });
    },
  );
  test('accepts predicate, weighted zero-based score, boolean choice and refusal', async () => {
    const qs: DecisionQuestion[] = [
      { type: 'predicate', name: 'safe', instructions: 'Is it safe?' },
      {
        type: 'score',
        name: 'energy',
        instructions: 'Rate energy.',
        levels: [{ label: 'low' }, { label: 'high' }],
      },
      {
        type: 'choice',
        name: 'go',
        instructions: 'Go?',
        choices: [{ value: true }, { value: false }],
      },
      { type: 'predicate', name: 'refused', instructions: 'Answer.' },
    ];
    const body = {
      model: 'gpt-6-luna',
      usage,
      answers: [
        { type: 'predicate', name: 'safe', probability: 0.9 },
        {
          type: 'score',
          name: 'energy',
          score: 0.75,
          confidence: 0.75,
          probabilities: [
            { value: 0, label: 'low', probability: 0.25 },
            { value: 1, label: 'high', probability: 0.75 },
          ],
        },
        {
          type: 'choice',
          name: 'go',
          choice: true,
          confidence: 1,
          probabilities: [
            { value: true, probability: 1 },
            { value: false, probability: 0 },
          ],
        },
        { type: 'refusal', name: 'refused' },
      ],
    };
    expect(
      await setup(jest.fn(async () => reply(body))).client.decide('context', qs),
    ).toMatchObject({ ok: true, answers: body.answers });
  });
  test('rejects invalid accounting instead of silently assigning free usage', () => {
    expect(() =>
      calculateCostUsd(
        { ...usage, input_tokens_details: { cached_tokens: 101, cache_write_tokens: 0 } },
        pricing,
      ),
    ).toThrow();
    expect(() => calculateCostUsd(usage, { ...pricing, inputPerMillionUsd: -1 })).toThrow();
  });
});
