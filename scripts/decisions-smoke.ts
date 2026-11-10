import { createDecisionsClient } from '../convex/npc/decisionsClient';
async function main() {
  if (process.env.NPC_LIVE_SMOKE !== '1' || !process.env.OPENAI_API_KEY) {
    console.log(
      'SKIPPED: set NPC_LIVE_SMOKE=1, a server OPENAI_API_KEY, and verified pricing to opt in.',
    );
    process.exitCode = 2;
    return;
  }
  const rate = (key: string) => (process.env[key]?.trim() ? Number(process.env[key]) : NaN);
  const client = createDecisionsClient({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.DECISIONS_MODEL ?? 'gpt-6-luna',
    maxRetries: 0,
    pricing: {
      inputPerMillionUsd: rate('NPC_DECISION_INPUT_PER_MILLION_USD'),
      cachedInputPerMillionUsd: rate('NPC_DECISION_CACHED_INPUT_PER_MILLION_USD'),
      cacheWritePerMillionUsd: rate('NPC_DECISION_CACHE_WRITE_PER_MILLION_USD'),
      outputPerMillionUsd: rate('NPC_DECISION_OUTPUT_PER_MILLION_USD'),
    },
  });
  const result = await client.decide('A fictional NPC is tired and has no urgent commitment.', [
    {
      type: 'choice',
      name: 'action',
      instructions: 'Choose a suitable legal action.',
      choices: [{ value: 'rest' }, { value: 'wander' }],
    },
    { type: 'predicate', name: 'tired', instructions: 'Is the NPC tired?' },
    {
      type: 'score',
      name: 'urgency',
      instructions: 'Rate the urgency of rest.',
      levels: [{ label: 'Low' }, { label: 'Medium' }, { label: 'High' }],
    },
  ]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
main().catch(() => {
  console.error('Smoke test failed. No credentials were logged.');
  process.exitCode = 1;
});
