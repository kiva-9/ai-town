/** Pure, serializable NPC policy. No I/O, wall clock, or model calls in the game tick. */
export interface Personality {
  sociability: number;
  caution: number;
  curiosity: number;
  cooperation: number;
  stability: number;
  selfInterest: number;
  loyalty: number;
}
export type GoalKind = 'socialize' | 'explore' | 'recover' | 'repair' | 'keep_promise';
export interface Goal {
  id: string;
  kind: GoalKind;
  priority: number;
  progress: number;
  inertia: number;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'completed' | 'expired';
  targetId?: string;
}
export interface PromiseRecord {
  id: string;
  description: string;
  dueAt: number;
  status: 'pending' | 'fulfilled' | 'broken';
}
/** Directed: A's relationship to B need not match B's relationship to A. */
export interface Relationship {
  playerId: string;
  trust: number;
  familiarity: number;
  affinity: number;
  conflict: number;
  promises: PromiseRecord[];
  updatedAt: number;
}
export type SocialEventKind =
  | 'encountered_known'
  | 'encountered_stranger'
  | 'invitation'
  | 'rejected'
  | 'goal_stalled'
  | 'conflict'
  | 'promise_due'
  | 'relationship_changed'
  | 'pleasant_conversation'
  | 'help'
  | 'broken_promise'
  | 'repair';
export interface SocialEvent {
  id: string;
  kind: SocialEventKind;
  at: number;
  targetId?: string;
  goalId?: string;
  summary?: string;
  magnitude?: number;
  promise?: PromiseRecord;
  /** Explicit evidence of successful social contact, not merely deciding to talk. */
  positive?: boolean;
}
export interface NpcState {
  version: number;
  personality: Personality;
  goals: Goal[];
  relationships: Relationship[];
  memories: SocialEvent[];
  energy: number;
  stress: number;
}
export interface NearbyPerson {
  playerId: string;
  name?: string;
  available: boolean;
  distance?: number;
}
export interface DecisionContext {
  state: NpcState;
  now: number;
  nearby: NearbyPerson[];
  invitation?: { playerId: string; conversationId: string };
  busy?: boolean;
}
export type NpcAction =
  | 'start_conversation'
  | 'accept_invite'
  | 'reject_invite'
  | 'avoid_person'
  | 'continue_current_goal'
  | 'rest'
  | 'wander'
  | 'greet_briefly'
  | 'repair_relationship';
export interface Candidate {
  id: string;
  action: NpcAction;
  targetId?: string;
  conversationId?: string;
  utility: number;
  reason: string;
}
export const MAX_MEMORIES = 24;
export const MAX_CONTEXT_MEMORIES = 6;
export const MAX_RELATIONSHIPS = 32;
export const MAX_GOALS = 6;
export const MAX_NEARBY = 8;
export const clamp = (value: number, min = 0, max = 1) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

/** Stable FNV-1a + mulberry32, independent of runtime random state. */
export function seededRandom(seed: string | number): () => number {
  let value = 2166136261;
  for (const character of String(seed))
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
export function initialState(name: string, now: number): NpcState {
  const random = seededRandom(name);
  const trait = () => Math.round((0.12 + random() * 0.76) * 100) / 100;
  const personality: Personality = {
    sociability: trait(),
    caution: trait(),
    curiosity: trait(),
    cooperation: trait(),
    stability: trait(),
    selfInterest: trait(),
    loyalty: trait(),
  };
  // Anchor known cast identities to their authored descriptions, not scripted behavior.
  const anchors: Record<string, Partial<Personality>> = {
    bob: { sociability: 0.12, caution: 0.8, stability: 0.75 },
    lucky: { curiosity: 0.92, loyalty: 0.94, cooperation: 0.8, caution: 0.2 },
    stella: { sociability: 0.88, cooperation: 0.16, selfInterest: 0.95, loyalty: 0.18 },
    alice: { curiosity: 0.96, stability: 0.3 },
    pete: { sociability: 0.82, stability: 0.8 },
  };
  Object.assign(personality, anchors[name.trim().toLowerCase()]);
  return {
    version: 0,
    personality,
    relationships: [],
    memories: [],
    energy: 0.85,
    stress: 0.1,
    goals: [
      {
        id: `initial:${name}`,
        kind: personality.sociability > personality.curiosity ? 'socialize' : 'explore',
        priority: 0.55,
        progress: 0,
        inertia: 0.3 + personality.stability * 0.4,
        createdAt: now,
        expiresAt: now + 10 * 60_000,
        status: 'active',
      },
    ],
  };
}
export function defaultRelationship(playerId: string, now: number): Relationship {
  return {
    playerId,
    trust: 0.5,
    familiarity: 0,
    affinity: 0.5,
    conflict: 0,
    promises: [],
    updatedAt: now,
  };
}
export function activeGoal(state: NpcState, now: number): Goal | undefined {
  return state.goals
    .filter((goal) => goal.status === 'active' && goal.expiresAt > now && goal.progress < 1)
    .sort(
      (a, b) => b.priority + b.inertia - (a.priority + a.inertia) || a.createdAt - b.createdAt,
    )[0];
}
/** Small bounded context for optional asynchronous strategy prompts. */
export function boundedContext(context: DecisionContext): DecisionContext {
  const nearby = [...context.nearby]
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.playerId.localeCompare(b.playerId))
    .slice(0, MAX_NEARBY);
  const relevant = new Set(nearby.map((person) => person.playerId));
  if (context.invitation) relevant.add(context.invitation.playerId);
  const currentGoal = activeGoal(context.state, context.now);
  if (currentGoal?.targetId) relevant.add(currentGoal.targetId);
  const importance = (event: SocialEvent) =>
    [
      'conflict',
      'promise_due',
      'broken_promise',
      'pleasant_conversation',
      'help',
      'repair',
      'relationship_changed',
      'rejected',
      'goal_stalled',
    ].includes(event.kind)
      ? 1
      : 0;
  const memories = context.state.memories
    .filter((event) =>
      event.targetId
        ? relevant.has(event.targetId)
        : event.kind === 'goal_stalled' && (!event.goalId || event.goalId === currentGoal?.id),
    )
    .sort((a, b) => importance(b) - importance(a) || b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, MAX_CONTEXT_MEMORIES)
    .sort((a, b) => a.at - b.at);
  return {
    ...context,
    nearby,
    state: {
      ...context.state,
      goals: context.state.goals.slice(-MAX_GOALS),
      memories: memories.map((event) => ({
        ...event,
        ...(event.summary === undefined ? {} : { summary: event.summary.slice(0, 240) }),
      })),
      relationships: context.state.relationships
        .filter((relationship) => relevant.has(relationship.playerId))
        .slice(0, MAX_RELATIONSHIPS)
        .map((relationship) => ({ ...relationship, promises: relationship.promises.slice(-4) })),
    },
  };
}
export function makeCandidates(input: DecisionContext): Candidate[] {
  const context = boundedContext(input);
  const { state, now } = context;
  const p = state.personality;
  const goal = activeGoal(state, now);
  const result: Candidate[] = [];
  const add = (
    action: NpcAction,
    utility: number,
    reason: string,
    targetId?: string,
    conversationId?: string,
  ) => {
    result.push({
      id: `${action}:${targetId ?? 'self'}`,
      action,
      utility: Math.round(utility * 1000) / 1000,
      reason,
      ...(targetId ? { targetId } : {}),
      ...(conversationId ? { conversationId } : {}),
    });
  };
  const relationship = (id: string) =>
    state.relationships.find((r) => r.playerId === id) ?? defaultRelationship(id, now);
  if (context.invitation) {
    const invite = context.invitation;
    const r = relationship(invite.playerId);
    add(
      'accept_invite',
      p.sociability * 0.8 +
        p.cooperation * 0.4 +
        r.affinity * 0.3 +
        r.trust * 0.2 -
        r.conflict * 0.9 -
        state.stress * p.caution -
        (1 - state.energy) * 0.3,
      'Respond to an invitation with personality and relationship context.',
      invite.playerId,
      invite.conversationId,
    );
    add(
      'reject_invite',
      p.caution * (r.conflict + 1 - r.trust) +
        state.stress * 0.4 +
        (1 - state.energy) * 0.7 +
        p.selfInterest * (goal?.priority ?? 0) * 0.3,
      'Decline when safety, energy, or existing commitments matter more.',
      invite.playerId,
      invite.conversationId,
    );
    return result;
  }
  if (context.busy) {
    add('continue_current_goal', 1, 'Finish the current engine action before starting another.');
    result[0].id = 'continue_current_goal:busy';
    return result;
  }
  const inertiaBonus = goal ? goal.inertia * p.stability * 0.5 : 0;
  add(
    'rest',
    (1 - state.energy) * 1.3 +
      state.stress * 0.7 +
      (goal?.kind === 'recover' ? 0.4 + inertiaBonus : 0),
    'Recover energy and composure.',
  );
  add(
    'wander',
    0.12 + p.curiosity * 0.5 + (goal?.kind === 'explore' ? goal.priority * 0.35 : 0),
    'Explore using the existing walking mechanism.',
  );
  if (goal?.kind === 'explore')
    add(
      'continue_current_goal',
      0.2 + goal.priority * 0.35 + goal.inertia * p.stability * 0.5,
      'Continue exploring while preserving the current exploration goal.',
      goal.targetId,
    );
  for (const person of context.nearby) {
    const r = relationship(person.playerId);
    if (r.conflict > 0.2 || r.trust < 0.3)
      add(
        'avoid_person',
        p.caution * 0.6 + r.conflict * 0.8 - p.cooperation * 0.15,
        'Give a strained relationship space.',
        person.playerId,
      );
    if (!person.available) continue;
    const novelty = 1 - r.familiarity;
    const social =
      p.sociability * 0.65 +
      p.curiosity * novelty * 0.35 +
      r.affinity * 0.3 +
      r.trust * p.loyalty * 0.3 -
      r.conflict * 0.9 -
      state.stress * p.caution -
      (1 - state.energy) * 0.4;
    add(
      'start_conversation',
      social +
        (goal?.kind === 'socialize' && (!goal.targetId || goal.targetId === person.playerId)
          ? 0.2 + inertiaBonus
          : 0),
      'Seek conversation based on curiosity and social bonds.',
      person.playerId,
    );
    add(
      'greet_briefly',
      0.1 + p.cooperation * 0.3 + r.familiarity * 0.25 + p.caution * 0.1 - r.conflict * 0.4,
      'Offer a brief greeting without a long commitment.',
      person.playerId,
    );
    if (
      r.conflict > 0.15 ||
      ((goal?.kind === 'keep_promise' || goal?.kind === 'repair') &&
        goal.targetId === person.playerId)
    ) {
      add(
        'repair_relationship',
        p.cooperation * 0.5 +
          p.loyalty * r.familiarity * 0.5 +
          r.conflict * 0.2 +
          (goal?.targetId === person.playerId &&
          (goal.kind === 'repair' || goal.kind === 'keep_promise')
            ? goal.priority * 0.5 + inertiaBonus
            : 0) -
          state.stress * 0.3,
        'Use conversation to repair a bond or address a promise.',
        person.playerId,
      );
    }
  }
  return result;
}
export function chooseUtility(context: DecisionContext): Candidate {
  return makeCandidates(context).sort(
    (a, b) => b.utility - a.utility || a.id.localeCompare(b.id),
  )[0];
}
/** Reproducible offline strategy: a small bounded perturbation, never illegal actions. */
export function chooseMock(context: DecisionContext, seed: string | number): Candidate {
  const random = seededRandom(seed);
  return makeCandidates(context)
    .map((candidate) => ({ candidate, score: candidate.utility + random() * 0.18 }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))[0].candidate;
}
export function isDecisionFresh(
  decision: { stateVersion: number; expiresAt: number },
  stateVersion: number,
  now: number,
): boolean {
  return (
    decision.stateVersion === stateVersion &&
    Number.isFinite(decision.expiresAt) &&
    now < decision.expiresAt
  );
}

/** Idempotent event reducer. Only observed outcomes change relationships. */
export function applySocialEvent(previous: NpcState, event: SocialEvent): NpcState {
  if (previous.memories.some((memory) => memory.id === event.id)) return previous;
  const state: NpcState = {
    ...previous,
    version: previous.version + 1,
    goals: previous.goals.map((goal) => ({
      ...goal,
      status:
        goal.progress >= 1
          ? 'completed'
          : goal.status === 'active' && goal.expiresAt <= event.at
            ? 'expired'
            : goal.status,
    })),
    relationships: previous.relationships.map((r) => ({
      ...r,
      promises: r.promises.map((p) => ({ ...p })),
    })),
    memories: [
      ...previous.memories,
      { ...event, ...(event.summary ? { summary: event.summary.slice(0, 240) } : {}) },
    ].slice(-MAX_MEMORIES),
  };
  const amount = clamp(event.magnitude ?? 1);
  let r = event.targetId
    ? state.relationships.find((value) => value.playerId === event.targetId)
    : undefined;
  if (!r && event.targetId) {
    r = defaultRelationship(event.targetId, event.at);
    state.relationships.push(r);
  }
  if (r) {
    r.updatedAt = event.at;
    if (event.kind === 'encountered_known' || event.kind === 'encountered_stranger')
      r.familiarity += 0.04 * amount;
    // Invitations reveal an opportunity, not evidence of affection or trust.
    if (event.kind === 'rejected') {
      r.affinity -= 0.06 * amount;
      state.stress += 0.04 * amount;
    }
    if (event.kind === 'conflict') {
      r.trust -= 0.15 * amount;
      r.affinity -= 0.12 * amount;
      r.conflict += 0.2 * amount;
      state.stress += 0.15 * amount;
    }
    if (event.kind === 'relationship_changed') r.familiarity += 0.08 * amount;
    if (
      event.kind === 'pleasant_conversation' ||
      event.kind === 'help' ||
      event.kind === 'repair'
    ) {
      r.trust += (event.kind === 'help' ? 0.12 : 0.06) * amount;
      r.affinity += 0.08 * amount;
      r.familiarity += 0.08 * amount;
      if (event.kind === 'repair') r.conflict -= 0.2 * amount;
    }
    if (event.kind === 'broken_promise') {
      r.trust -= 0.2 * amount;
      r.affinity -= 0.1 * amount;
      r.conflict += 0.12 * amount;
    }
    if (event.promise) {
      const promise: PromiseRecord = {
        ...event.promise,
        description: event.promise.description.slice(0, 160),
        status: event.kind === 'broken_promise' ? 'broken' : event.promise.status,
      };
      r.promises = [...r.promises.filter((p) => p.id !== promise.id), promise].slice(-4);
    }
    r.trust = clamp(r.trust);
    r.affinity = clamp(r.affinity);
    r.familiarity = clamp(r.familiarity);
    r.conflict = clamp(r.conflict);
  }
  if (event.kind === 'goal_stalled') {
    const goal = event.goalId
      ? state.goals.find((g) => g.id === event.goalId)
      : activeGoal(state, event.at);
    if (goal) {
      goal.inertia = clamp(goal.inertia - 0.2);
      goal.priority = clamp(goal.priority - 0.1);
    }
  }
  if (['pleasant_conversation', 'help', 'repair', 'relationship_changed'].includes(event.kind)) {
    for (const goal of state.goals) {
      if (goal.status !== 'active' || (goal.targetId && goal.targetId !== event.targetId)) continue;
      if (
        goal.kind === 'socialize' ||
        (goal.kind === 'repair' && event.kind === 'repair') ||
        (goal.kind === 'keep_promise' && event.promise?.status === 'fulfilled')
      ) {
        goal.progress = clamp(goal.progress + (goal.kind === 'socialize' ? 0.5 : 1));
        if (goal.progress >= 1) goal.status = 'completed';
      }
    }
  }
  if (
    event.kind === 'conflict' ||
    event.kind === 'broken_promise' ||
    event.kind === 'promise_due'
  ) {
    const kind = event.kind === 'promise_due' ? 'keep_promise' : 'repair';
    if (
      !state.goals.some(
        (g) => g.kind === kind && g.targetId === event.targetId && g.status === 'active',
      )
    ) {
      state.goals.push({
        id: `event:${event.id}`,
        kind,
        priority: kind === 'keep_promise' ? 0.9 : 0.65,
        inertia: 0.4 + state.personality.loyalty * 0.3,
        progress: 0,
        status: 'active',
        createdAt: event.at,
        expiresAt: event.at + 10 * 60_000,
        ...(event.targetId ? { targetId: event.targetId } : {}),
      });
    }
  }
  settleGoals(state, event.at);
  state.relationships.sort((a, b) => b.updatedAt - a.updatedAt);
  state.relationships = state.relationships.slice(0, MAX_RELATIONSHIPS);
  state.energy = clamp(state.energy);
  state.stress = clamp(state.stress);
  return state;
}

/** Mutates only a freshly cloned outcome state, never a candidate-generation context. */
function settleGoals(state: NpcState, now: number): void {
  state.goals = state.goals.map((goal) => ({
    ...goal,
    status:
      goal.progress >= 1
        ? 'completed'
        : goal.status === 'active' && goal.expiresAt <= now
          ? 'expired'
          : goal.status,
  }));
  if (!activeGoal(state, now)) {
    const p = state.personality;
    const kind: GoalKind =
      state.energy < 0.35 || state.stress > 0.7
        ? 'recover'
        : p.sociability > p.curiosity
          ? 'socialize'
          : 'explore';
    state.goals.push({
      id: `renew:${state.version}:${now}`,
      kind,
      priority: 0.55,
      inertia: 0.3 + p.stability * 0.4,
      progress: 0,
      status: 'active',
      createdAt: now,
      expiresAt: now + 10 * 60_000,
    });
  }
  state.goals = state.goals.slice(-MAX_GOALS);
}

/** Call once per successfully completed engine activity, never on proposal/dispatch.
 * Talking alone is not positive social evidence: use explicit pleasant_conversation/help/repair events only for verified outcomes.
 */
export function applyActionOutcome(
  previous: NpcState,
  candidate: Candidate,
  now: number,
): NpcState {
  const exploring =
    candidate.action === 'wander' ||
    (candidate.action === 'continue_current_goal' &&
      candidate.id !== 'continue_current_goal:busy' &&
      activeGoal(previous, now)?.kind === 'explore');
  if (!exploring && !['rest', 'greet_briefly'].includes(candidate.action)) return previous;
  const state: NpcState = {
    ...previous,
    version: previous.version + 1,
    goals: previous.goals.map((goal) => ({ ...goal })),
    relationships: previous.relationships.map((r) => ({ ...r, promises: [...r.promises] })),
  };
  if (candidate.action === 'rest') {
    state.energy = clamp(state.energy + 0.2);
    state.stress = clamp(state.stress - 0.15);
  }
  if (exploring) state.energy = clamp(state.energy - 0.04);
  for (const goal of state.goals) {
    if (goal.status !== 'active' || goal.expiresAt <= now) continue;
    if (
      (candidate.action === 'rest' && goal.kind === 'recover') ||
      (exploring && goal.kind === 'explore')
    ) {
      goal.progress = clamp(goal.progress + (candidate.action === 'rest' ? 0.5 : 0.25));
    }
  }
  if (candidate.action === 'greet_briefly' && candidate.targetId) {
    let relationship = state.relationships.find((r) => r.playerId === candidate.targetId);
    if (!relationship) {
      relationship = defaultRelationship(candidate.targetId, now);
      state.relationships.push(relationship);
    }
    relationship.familiarity = clamp(relationship.familiarity + 0.02);
    relationship.updatedAt = now;
    state.relationships.sort((a, b) => b.updatedAt - a.updatedAt);
    state.relationships = state.relationships.slice(0, MAX_RELATIONSHIPS);
  }
  settleGoals(state, now);
  return state;
}
