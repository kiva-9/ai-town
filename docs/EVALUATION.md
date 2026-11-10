# Reproducible NPC evaluation

Run `npm run evaluate:npcs -- --seed demo --steps 80 --out reports/demo`. The directory receives
`evaluation.json` (initial state, complete event fixture, per-mode metrics, action traces, final
state) and `evaluation.md`. Repeating a seed and step count yields byte-identical files. No
credentials, deployment, network or model API is used. Run tests with
`npm test -- --runInBand convex/npc`.

## Experiment

All three modes start from a deep copy of the same seeded personality and goal state. They receive
the exact same ordered exogenous events every 20 simulated seconds: stranger encounter, invitation,
conflict, rejection, promise due, stalled goal, positive relationship change and known encounter.
Three fixed peers have identical deterministic availability in every mode. Outcome draws are seeded
by step, avoiding policy-dependent random-stream drift.

- **Classic scripted adapter:** reproduces the upstream 0.8 NPC invitation acceptance probability
  and activity, wander, nearest available conversation pattern with invitation cooldown. Activities
  collapse to `rest`; timing, conversation duration, pair cooldown and pathfinding are simplified.
  This is not a replay of the upstream full engine.
- **Mock:** actual `chooseMock` with per-step seed and bounded utility perturbation.
- **Hybrid unavailable / utility fallback:** actual `chooseUtility`, with no claimed live strategy
  response. This benchmark cannot measure the incremental benefit of an LLM. Add a separately
  labelled live controlled experiment before making that claim.

The fixture is closed-loop only in a limited sense: selected legal social actions have an assumed
75% contact success probability, producing a real reducer event; rest affects energy/stress;
exploration advances with walking. Fixed external relationship events still apply even when the
policy would not have caused them. Therefore relationship change and goal completion are synthetic
outcomes, not measured live world causality. The shared goal ledger also scores Classic, although
Classic does not consult it.

## Metric definitions

- Action distribution: number of decisions per action.
- Repetition: consecutive identical action and target, including valid repeated
  resting/continuation. Lower is not inherently better.
- Goal switches: dominant active goal changes across an external event. “Pointless” is a narrow
  proxy: old goal remains valid and unfinished, with no conflict, due promise or stall explaining
  the switch. It does not count transitions after completion/expiry, nor establish psychological
  coherence.
- Interactions: legal selected social actions whose synthetic contact draw succeeded; not actual
  conversation count.
- Relationship changes: final trust/affinity relative to default 0.5 and familiarity/conflict
  relative to 0, including exogenous and synthetic events.
- Goal completion: distinct completed goal IDs, retained in the count even when bounded state later
  evicts them.
- Decision success: fixture target-availability legality rate, not the engine execution-ack success
  metric.
- API requests and USD cost: exactly zero for all offline policies. API latency: `null`
  (unmeasured), not zero-latency service.
- Stability: count of nonfinite or out-of-range relationship, energy or stress values. Repeatability
  is checked by byte-identical output tests, not wall-clock timing.

## Validation boundaries

`engine.test.ts` directly invokes the production input handler with a minimal world fixture, testing
stale operations, expiry, epoch and state-version invalidation, monotonic state-version updates,
malformed candidates, Classic-mode rejection, unavailable targets, valid rest execution, stale
invitations, and synchronous scheduling without awaiting an unresolved operation. These integration
seams do not replace a deployed end-to-end test involving durable workers, model failure/retry,
multiple simultaneous NPCs, pathfinding and real conversation completion.

Neither this evaluation nor action diversity proves subjective naturalness. Use blinded human
assessment, multiple seeds and initial populations, matched live-world conditions, actual execution
acknowledgments, and real API billing/latency telemetry for broader claims. Do not present fallback
results as live Hybrid results.
