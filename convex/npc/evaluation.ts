/** Deterministic policy microbenchmark, not a live Convex/world or LLM benchmark. */
import {
  activeGoal,
  applySocialEvent,
  chooseMock,
  chooseUtility,
  clamp,
  initialState,
  seededRandom,
} from './core';
import type { Candidate, DecisionContext, NpcState, SocialEvent } from './core';
import { INVITE_ACCEPT_PROBABILITY, CONVERSATION_COOLDOWN } from '../constants';
export type EvaluationMode = 'classic' | 'mock' | 'hybrid';
const modes: EvaluationMode[] = ['classic', 'mock', 'hybrid'];
const kinds: SocialEvent['kind'][] = [
  'encountered_stranger',
  'invitation',
  'conflict',
  'rejected',
  'promise_due',
  'goal_stalled',
  'relationship_changed',
  'encountered_known',
];
export function fixedEvents(steps: number): SocialEvent[] {
  return Array.from({ length: steps }, (_, i) => ({
    id: `fixture:${i}`,
    at: 100_000 + i * 20_000,
    kind: kinds[i % kinds.length],
    targetId: `p:${1 + (i % 3)}`,
    positive: true,
    ...(i % kinds.length === 4
      ? {
          promise: {
            id: `promise:${i}`,
            description: 'Meet again',
            dueAt: 100_000 + i * 20_000,
            status: 'pending' as const,
          },
        }
      : {}),
  }));
}
// Adapter of upstream Agent/agentDoSomething: fixed invite acceptance probability,
// activity -> wander -> nearest available conversation, with cooldown. No personality.
export function classicPolicy(
  context: DecisionContext,
  random: () => number,
  phase: number,
  lastInvite: number,
): Candidate {
  let action: Candidate['action'];
  let targetId: string | undefined;
  if (context.invitation) {
    action = random() < INVITE_ACCEPT_PROBABILITY ? 'accept_invite' : 'reject_invite';
    targetId = context.invitation.playerId;
  } else if (phase % 3 === 0)
    action = 'rest'; // upstream random activities collapsed to one class
  else if (phase % 3 === 1) action = 'wander';
  else {
    targetId =
      context.now - lastInvite >= CONVERSATION_COOLDOWN
        ? [...context.nearby]
            .filter((p) => p.available)
            .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0]?.playerId
        : undefined;
    action = targetId ? 'start_conversation' : 'wander';
  }
  return {
    id: `${action}:${targetId ?? 'self'}`,
    action,
    targetId,
    utility: 0,
    reason: 'Traditional scripted policy adapter',
    conversationId: context.invitation?.conversationId,
  };
}
export function evaluateNpcs(seed = 'ai-town-2026', steps = 80) {
  if (!Number.isInteger(steps) || steps < 8 || steps > 10_000)
    throw new Error('steps must be an integer between 8 and 10000');
  const events = fixedEvents(steps);
  const initial = initialState(`evaluation:${seed}`, events[0].at);
  const results = modes.map((mode) => {
    let state: NpcState = JSON.parse(JSON.stringify(initial));
    const random = seededRandom(`${seed}:classic`);
    const completed = new Set<string>();
    let repeats = 0,
      switches = 0,
      pointlessSwitches = 0,
      interactions = 0,
      successes = 0,
      invalidStates = 0,
      lastInvite = -Infinity;
    let previousAction: string | undefined;
    const actions: Record<string, number> = {};
    const trace = events.map((event, i) => {
      const priorGoal = activeGoal(state, event.at);
      state = applySocialEvent(state, event);
      const before = activeGoal(state, event.at);
      if (priorGoal && before && priorGoal.id !== before.id) {
        switches++;
        if (
          priorGoal.status === 'active' &&
          priorGoal.progress < 1 &&
          priorGoal.expiresAt > event.at &&
          !['conflict', 'promise_due', 'goal_stalled'].includes(event.kind)
        )
          pointlessSwitches++;
      }
      const context: DecisionContext = {
        now: event.at,
        state,
        nearby: [1, 2, 3].map((n) => ({
          playerId: `p:${n}`,
          available: (i + n) % 5 !== 0,
          distance: n,
        })),
        ...(event.kind === 'invitation'
          ? { invitation: { playerId: event.targetId!, conversationId: `c:${i}` } }
          : {}),
      };
      const decision =
        mode === 'classic'
          ? classicPolicy(context, random, i, lastInvite)
          : mode === 'mock'
            ? chooseMock(context, `${seed}:${i}`)
            : chooseUtility(context);
      actions[decision.action] = (actions[decision.action] ?? 0) + 1;
      if (decision.id === previousAction) repeats++;
      previousAction = decision.id;
      const social = [
        'start_conversation',
        'accept_invite',
        'repair_relationship',
        'greet_briefly',
      ].includes(decision.action);
      const legal =
        !decision.targetId ||
        context.nearby.some(
          (p) =>
            p.playerId === decision.targetId &&
            (p.available ||
              decision.action === 'accept_invite' ||
              decision.action === 'reject_invite' ||
              decision.action === 'avoid_person' ||
              decision.action === 'continue_current_goal'),
        );
      if (legal) successes++;
      if (decision.action === 'start_conversation') lastInvite = event.at;
      // Common random numbers keyed by step, not policy-dependent RNG consumption.
      if (social && legal && seededRandom(`${seed}:outcome:${i}`)() < 0.75) {
        interactions++;
        const promise =
          decision.action === 'repair_relationship'
            ? state.relationships
                .find((r) => r.playerId === decision.targetId)
                ?.promises.find((p) => p.status === 'pending')
            : undefined;
        state = applySocialEvent(state, {
          id: `outcome:${i}`,
          at: event.at,
          kind: 'relationship_changed',
          targetId: decision.targetId,
          positive: true,
          ...(promise ? { promise: { ...promise, status: 'fulfilled' } } : {}),
        });
      }
      // Explicit toy consequences, equal for all policies; not engine telemetry.
      state.energy = clamp(state.energy + (decision.action === 'rest' ? 0.15 : -0.04));
      state.stress = clamp(state.stress - (decision.action === 'rest' ? 0.1 : 0));
      for (const goal of state.goals) {
        if (
          goal.status === 'active' &&
          ((goal.kind === 'explore' && decision.action === 'wander') ||
            (goal.kind === 'recover' && decision.action === 'rest'))
        ) {
          goal.progress = clamp(goal.progress + 0.25);
          if (goal.progress === 1) goal.status = 'completed';
        }
        if (goal.status === 'completed') completed.add(goal.id);
      }
      if (
        ![
          state.energy,
          state.stress,
          ...state.relationships.flatMap((r) => [r.trust, r.affinity, r.conflict, r.familiarity]),
        ].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      )
        invalidStates++;
      return {
        step: i,
        eventId: event.id,
        action: decision.action,
        targetId: decision.targetId ?? null,
        legal,
        goalId: before?.id ?? null,
      };
    });
    return {
      mode,
      label:
        mode === 'hybrid'
          ? 'Hybrid unavailable: deterministic utility fallback (no API)'
          : mode === 'classic'
            ? 'Classic scripted adapter'
            : 'Mock seeded utility perturbation',
      metrics: {
        decisions: steps,
        actionDistribution: actions,
        consecutiveActionTargetRepeats: repeats,
        goalSwitches: switches,
        pointlessGoalSwitches: pointlessSwitches,
        successfulInteractions: interactions,
        completedGoals: completed.size,
        decisionSuccessRate: successes / steps,
        relationshipChanges: state.relationships.map((r) => ({
          playerId: r.playerId,
          trustDelta: r.trust - 0.5,
          affinityDelta: r.affinity - 0.5,
          familiarityDelta: r.familiarity,
          conflictDelta: r.conflict,
        })),
        apiRequests: 0,
        apiCostUsd: 0,
        apiLatencyMs: null,
        invalidStateCount: invalidStates,
      },
      trace,
      finalState: state,
    };
  });
  return {
    schemaVersion: 1,
    seed,
    steps,
    initialState: initial,
    events,
    results,
    limitations: [
      'Offline policy microbenchmark with synthetic consequences, not the live engine.',
      'Classic uses an activity/wander/conversation adapter, not exact upstream timing or pathfinding.',
      'Hybrid API is unavailable in this runner; all Hybrid decisions are utility fallback. Zero cost/requests do not estimate live Hybrid cost.',
      'Decision success means fixture target legality, not successful live execution.',
      'Relationship and goal outcomes include fixed external events and assumed consequences, not full live world causality.',
      'Action repeats and pointless-switch counts are proxies, not proof of subjective naturalness. API latency is unmeasured (null).',
    ],
  };
}
export function evaluationMarkdown(report: ReturnType<typeof evaluateNpcs>): string {
  return (
    `# NPC reproducible evaluation\n\nSeed: ${report.seed}; steps per policy: ${report.steps}.\n\n` +
    report.results
      .map((r) => `## ${r.label}\n\n\`\`\`json\n${JSON.stringify(r.metrics, null, 2)}\n\`\`\`\n`)
      .join('\n') +
    '\n## Limitations\n\n' +
    report.limitations.map((s) => `- ${s}`).join('\n') +
    '\n'
  );
}
