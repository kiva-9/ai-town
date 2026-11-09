# Hybrid NPC intelligence

## Four layers

1. **World engine:** original paths, collision, conversations and ordered input execution.
2. **Traditional policy:** `convex/npc/core.ts`, deterministic personality, utility candidates, persistent goals, cooldown/inertia, directed relationships and bounded event memories.
3. **Structured Decisions:** `decisionsClient.ts` validates Choice/Predicate/Score contracts. `worker.ts` sends only bounded fictional NPC context, never world snapshots, account data or full message histories. Official structured output is recorded; no invented reasoning is displayed.
4. **Language:** original conversation and vector-memory layer remains available. Mock dialogue is explicitly labeled.

## Event and asynchronous flow

The tick detects a changed nearby person, an invitation or a stalled goal. It schedules `agentNpcDecision` and returns immediately. The action submits to a durable Convex queue; no network request is awaited inside a tick.

`enqueue` lazily initializes persistent personality, records/deduplicates the event, creates legal candidates, and either selects Mock/utility/cache or queues paid work. `pump` bounds queue, global concurrency, minute/day requests and reserved spend. Every queued job has a 45-second expiry and dispatched work a 20-second lease. Lost workers cannot lock a character forever.

`complete` validates membership in the original legal candidates and sends `finishNpcDecision`. The engine checks operation ID, ordered state version, mode epoch, expiry, target existence/proximity, conversation membership and availability again. An execution acknowledgment distinguishes submission from actual application. Completed activities/movement, not mere selections, update goal progress and energy. Old API results cannot override a newer operation or ordered social event.

The API transport has bounded timeout/backoff, Retry-After, no retry for authentication or billing-quota errors, and strict schema validation. Refusal, low confidence, malformed output, missing key/pricing and failures use traditional fallback.

## Persistence and memory

`npcStates` stores immutable personality, goals and bounded event/relationship arrays. Relationships are directed and carry trust, familiarity, affinity, conflict and promises. Genuine declined invitations cause rejection memory; repeated observed rejection produces conflict. Finished conversations produce a neutral familiarity/contact event, explicitly not a claim that the model inferred positive sentiment. Explicit pleasant-conversation, help, broken-promise and repair evidence have separate reducer effects. Promise/help/repair events can be recorded through internal functions for controlled experiments; this version does not extract reliable promises or helping behavior from arbitrary dialogue.

Original vector memories are unchanged and remain the semantic recall path with a configured LLM. Mock mode is suitable for deterministic state tests, not proof of natural conversation quality. Initial relationship values are neutral; distinct histories emerge from actual events rather than scripted plots.

## Configuration and security

All credentials stay server-side. Only `VITE_CONVEX_URL` belongs in the frontend. `NPC_ALLOW_MODE_CONTROL` is false by default because upstream AI Town does not require authentication: never enable its global mode selector on a public deployment without an owner-only auth policy. Internal queue/social mutations are not browser-callable.

`NPC_DECISION_ENABLED=false` is a server kill switch that overrides persisted mode and prevents new API work. Otherwise persisted control settings are authoritative once initialized; use the guarded mode mutation to change them. A policy switch atomically invalidates each running engine generation, so an old in-memory mode cannot apply queued decisions. The engine reloads existing state without deleting or resetting the world; paused worlds stay paused.

Daily reservations are conservative estimates, not a provider-enforced hard USD ceiling. Lost-response attempts keep their reservation; known unused attempts are refunded. Unknown or blank pricing prevents calls. Configure account/project spending limits with OpenAI as an additional control. The local fixture dialogue flag is independent of decision mode.

## Compatibility and recovery

Do not wipe existing tables. New optional agent fields and lazy state creation accept old worlds. Fresh `init` creates 12 NPCs, but does not add or replace people in an existing world. Use original engine inputs to add residents deliberately. Paused worlds dispatch no new decisions; in-flight calls already sent may still incur cost and their results are discarded if invalid.

Job/event memory is bounded for decisions; old completed jobs are incrementally removed. The durable queue is global across worlds. A tiny race remains between final paused-state query and HTTP dispatch, so pause is not cancellation of already-dispatched network work.
