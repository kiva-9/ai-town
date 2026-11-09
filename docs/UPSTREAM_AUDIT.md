# Upstream audit and boundaries

Upstream: https://github.com/a16z-infra/ai-town
Audited commit: `1b2f7d8b824c7bc679017a091d9d45ba3dc3029e` (2026-11-05).
Audit performed 2026-11-09. This is an unofficial MIT-licensed enhancement.

## Observed original behavior

- `convex/aiTown/agent.ts`: tick starts async operations when idle, chooses activities/wandering in `agentOperations`, probabilistically accepts invitations, walks toward conversation partners, and times out/ends long chats. An operation ID locks one asynchronous operation per NPC.
- `convex/aiTown/agentOperations.ts`: original activity choice and destination use `Math.random`; conversation partner selection is a query. The original five residents come from `data/characters.ts`.
- `convex/agent/conversation.ts` reads identity and plan from agent descriptions, retrieves related memories, and calls the configured LLM. `memory.ts` summarizes finished chats and stores vector memories. Those mechanisms are preserved for real LLM mode.
- `convex/engine/abstractGame.ts`: one world step owns simulation state. Inputs are ordered, then the 16 ms tick runs in batches; `Game.saveDiff` persists world state and schedules asynchronous agent operations. External actions must submit inputs, not update the world directly.
- `convex/init.ts` creates a world/engine/map and submits `createAgent` inputs only when there are no existing agents or pending creation inputs.
- Frontend `PlayerDetails.tsx` uses selected player ID and existing Convex subscriptions. The added inspector fits here, without replacing the map, movement or Pixi renderer.
- Existing `participatedTogether` tracks pairs and cooldowns, but is not a multidimensional directed relationship model. Added `npcStates` holds that model separately.

## Original baseline

Before engine changes, `npm ci`, all 53 tests in seven suites, and `npm run build` passed. Existing build warnings concern outdated Browserslist and a >500 kB frontend bundle.

The account-free local backend startup was attempted before integration. The CLI downloaded its official backend binary but hit a Node heap out-of-memory error before completing configuration. This is not a successful original end-to-end baseline. See `VALIDATION.md` for later runtime checks and remaining limits.

## Changes kept narrow

- No replacement of world simulation, map, collision, pathfinding, rendering or the original LLM/vector-memory implementation.
- Optional backward-compatible fields on serialized agents, plus new `npcControl`, `npcStates`, `npcJobs` tables. Old worlds load without a destructive migration.
- Classic bypasses new decision scheduling. Switching mode invalidates pending jobs through an epoch. Existing original residents stay; fresh worlds initialize 12 residents.
- Explicit `NPC_DIALOGUE_MOCK=true` uses visibly labeled fixture dialogue and skips embedding generation. It enables cost-free integration testing; it is not a substitute for real language or vector-memory evaluation.
