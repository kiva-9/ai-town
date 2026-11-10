# NPC reproducible evaluation

Seed: ai-town-2026; steps per policy: 80.

## Classic scripted adapter

```json
{
  "decisions": 80,
  "actionDistribution": {
    "rest": 24,
    "accept_invite": 7,
    "start_conversation": 23,
    "wander": 23,
    "reject_invite": 3
  },
  "consecutiveActionTargetRepeats": 0,
  "goalSwitches": 17,
  "pointlessGoalSwitches": 0,
  "successfulInteractions": 22,
  "completedGoals": 1,
  "decisionSuccessRate": 1,
  "relationshipChanges": [
    {
      "playerId": "p:2",
      "trustDelta": -0.45,
      "affinityDelta": -0.5,
      "familiarityDelta": 0.9999999999999999,
      "conflictDelta": 0.6000000000000001
    },
    {
      "playerId": "p:1",
      "trustDelta": -0.45,
      "affinityDelta": -0.5,
      "familiarityDelta": 1,
      "conflictDelta": 0.6000000000000001
    },
    {
      "playerId": "p:3",
      "trustDelta": -0.5,
      "affinityDelta": -0.5,
      "familiarityDelta": 0.56,
      "conflictDelta": 0.8
    }
  ],
  "apiRequests": 0,
  "apiCostUsd": 0,
  "apiLatencyMs": null,
  "invalidStateCount": 0
}
```

## Mock seeded utility perturbation

```json
{
  "decisions": 80,
  "actionDistribution": {
    "wander": 20,
    "accept_invite": 1,
    "repair_relationship": 22,
    "rest": 16,
    "reject_invite": 9,
    "avoid_person": 12
  },
  "consecutiveActionTargetRepeats": 14,
  "goalSwitches": 24,
  "pointlessGoalSwitches": 0,
  "successfulInteractions": 21,
  "completedGoals": 11,
  "decisionSuccessRate": 1,
  "relationshipChanges": [
    {
      "playerId": "p:2",
      "trustDelta": -0.45,
      "affinityDelta": -0.5,
      "familiarityDelta": 1,
      "conflictDelta": 0.6000000000000001
    },
    {
      "playerId": "p:1",
      "trustDelta": -0.45,
      "affinityDelta": -0.5,
      "familiarityDelta": 1,
      "conflictDelta": 0.6000000000000001
    },
    {
      "playerId": "p:3",
      "trustDelta": -0.5,
      "affinityDelta": -0.5,
      "familiarityDelta": 0.8,
      "conflictDelta": 0.8
    }
  ],
  "apiRequests": 0,
  "apiCostUsd": 0,
  "apiLatencyMs": null,
  "invalidStateCount": 0
}
```

## Hybrid unavailable: deterministic utility fallback (no API)

```json
{
  "decisions": 80,
  "actionDistribution": {
    "wander": 26,
    "accept_invite": 1,
    "start_conversation": 1,
    "rest": 16,
    "repair_relationship": 17,
    "reject_invite": 9,
    "avoid_person": 10
  },
  "consecutiveActionTargetRepeats": 19,
  "goalSwitches": 24,
  "pointlessGoalSwitches": 0,
  "successfulInteractions": 15,
  "completedGoals": 10,
  "decisionSuccessRate": 1,
  "relationshipChanges": [
    {
      "playerId": "p:2",
      "trustDelta": -0.45,
      "affinityDelta": -0.5,
      "familiarityDelta": 1,
      "conflictDelta": 0.6000000000000001
    },
    {
      "playerId": "p:1",
      "trustDelta": -0.45,
      "affinityDelta": -0.5,
      "familiarityDelta": 1,
      "conflictDelta": 0.6000000000000001
    },
    {
      "playerId": "p:3",
      "trustDelta": -0.5,
      "affinityDelta": -0.5,
      "familiarityDelta": 0.7200000000000001,
      "conflictDelta": 0.8
    }
  ],
  "apiRequests": 0,
  "apiCostUsd": 0,
  "apiLatencyMs": null,
  "invalidStateCount": 0
}
```

## Limitations

- Offline policy microbenchmark with synthetic consequences, not the live engine.
- Classic uses an activity/wander/conversation adapter, not exact upstream timing or pathfinding.
- Hybrid API is unavailable in this runner; all Hybrid decisions are utility fallback. Zero cost/requests do not estimate live Hybrid cost.
- Decision success means fixture target legality, not successful live execution.
- Relationship and goal outcomes include fixed external events and assumed consequences, not full live world causality.
- Action repeats and pointless-switch counts are proxies, not proof of subjective naturalness. API latency is unmeasured (null).
