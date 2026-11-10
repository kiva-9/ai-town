import { describe, expect, test } from '@jest/globals';
import {
  activeGoal,
  applyActionOutcome,
  MAX_CONTEXT_MEMORIES,
  applySocialEvent,
  boundedContext,
  chooseMock,
  chooseUtility,
  defaultRelationship,
  initialState,
  isDecisionFresh,
  makeCandidates,
  MAX_MEMORIES,
  MAX_NEARBY,
  seededRandom,
} from './core';
import type { DecisionContext, NpcState } from './core';

const now = 1_000;
const context = (state = initialState('Ada', now)): DecisionContext => ({
  state,
  now,
  nearby: [{ playerId: 'bob', name: 'Bob', available: true }],
});

describe('NPC identity and deterministic strategy', () => {
  test('profiles are stable by identity, distinct, and bounded', () => {
    expect(initialState('Ada', now).personality).toEqual(initialState('Ada', now + 1).personality);
    expect(initialState('Ada', now).personality).not.toEqual(initialState('Bob', now).personality);
    for (const value of Object.values(initialState('Ada', now).personality)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
  test('seeded random and mock decisions reproduce without global random', () => {
    const a = seededRandom('fixture');
    const b = seededRandom('fixture');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(chooseMock(context(), 'fixture')).toEqual(chooseMock(context(), 'fixture'));
    expect(makeCandidates(context())).toContainEqual(chooseMock(context(), 'fixture'));
  });
  test('contrasting personality creates contrasting behavior in the same world', () => {
    const outgoing = initialState('same', now);
    outgoing.goals = [];
    outgoing.stress = 0;
    outgoing.energy = 1;
    outgoing.personality = {
      sociability: 1,
      curiosity: 0,
      caution: 0,
      cooperation: 1,
      stability: 0,
      selfInterest: 0,
      loyalty: 1,
    };
    const reserved = {
      ...outgoing,
      personality: {
        ...outgoing.personality,
        sociability: 0,
        curiosity: 1,
        cooperation: 0,
        loyalty: 0,
      },
    };
    expect(chooseUtility(context(outgoing)).action).toBe('start_conversation');
    expect(chooseUtility(context(reserved)).action).toBe('wander');
  });
});

describe('legal candidates and bounded model context', () => {
  test('an invitation permits only accept/reject with the exact conversation', () => {
    const candidates = makeCandidates({
      ...context(),
      invitation: { playerId: 'bob', conversationId: 'c:1' },
    });
    expect(candidates.map((candidate) => candidate.action)).toEqual([
      'accept_invite',
      'reject_invite',
    ]);
    expect(
      candidates.every(
        (candidate) => candidate.conversationId === 'c:1' && candidate.targetId === 'bob',
      ),
    ).toBe(true);
  });
  test('busy agents cannot start conflicting work', () => {
    expect(makeCandidates({ ...context(), busy: true }).map((c) => c.action)).toEqual([
      'continue_current_goal',
    ]);
  });
  test('unavailable and absent people never become conversation targets', () => {
    const candidates = makeCandidates({
      ...context(),
      nearby: [{ playerId: 'bob', available: false }],
    });
    expect(
      candidates.some((c) =>
        ['start_conversation', 'greet_briefly', 'repair_relationship'].includes(c.action),
      ),
    ).toBe(false);
    expect(makeCandidates({ ...context(), nearby: [] }).length).toBeGreaterThan(0);
  });
  test('context is bounded, deterministic, and leaves input untouched', () => {
    const input = context();
    input.nearby = Array.from({ length: 100 }, (_, i) => ({
      playerId: `p${i}`,
      available: true,
      distance: i,
    }));
    input.state.memories = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      at: i,
      kind: 'goal_stalled',
      summary: 'x'.repeat(900),
    }));
    const bounded = boundedContext(input);
    expect(bounded.nearby).toHaveLength(MAX_NEARBY);
    expect(bounded.state.memories).toHaveLength(MAX_CONTEXT_MEMORIES);
    expect(bounded.state.memories[0].summary).toHaveLength(240);
    expect(input.nearby).toHaveLength(100);
    expect(input.state.memories[0].summary).toHaveLength(900);
  });
  test('utility always selects a legal maximum', () => {
    const candidates = makeCandidates(context());
    expect(candidates).toContainEqual(chooseUtility(context()));
    expect(chooseUtility(context()).utility).toBe(Math.max(...candidates.map((c) => c.utility)));
  });
});

describe('persistent event effects and goals', () => {
  test('conflict changes only the directed relationship and preserves source data', () => {
    const before = initialState('Ada', now);
    const original = JSON.stringify(before);
    const after = applySocialEvent(before, {
      id: 'conflict1',
      kind: 'conflict',
      targetId: 'bob',
      at: now,
    });
    expect(JSON.stringify(before)).toBe(original);
    expect(after.relationships[0].trust).toBeLessThan(0.5);
    expect(after.relationships[0].conflict).toBeGreaterThan(0);
    expect(after.goals.some((goal) => goal.kind === 'repair' && goal.targetId === 'bob')).toBe(
      true,
    );
    expect(applySocialEvent(after, after.memories[0])).toBe(after);
  });
  test('repeated conflict clamps all relationship and emotional values', () => {
    let state = initialState('Ada', now);
    for (let i = 0; i < 50; i++)
      state = applySocialEvent(state, {
        id: String(i),
        kind: 'conflict',
        targetId: 'bob',
        at: now + i,
      });
    const r = state.relationships[0];
    expect(r.trust).toBe(0);
    expect(r.affinity).toBe(0);
    expect(r.conflict).toBe(1);
    expect(state.stress).toBe(1);
    expect(state.memories).toHaveLength(MAX_MEMORIES);
    expect(state.goals.filter((goal) => goal.kind === 'repair')).toHaveLength(1);
  });
  test('goal inertia survives ordinary encounters and decreases when stalled', () => {
    const before = initialState('Ada', now);
    const after = applySocialEvent(before, {
      id: 'seen',
      kind: 'encountered_stranger',
      targetId: 'bob',
      at: now,
    });
    expect(after.goals).toEqual(before.goals);
    const stalled = applySocialEvent(after, { id: 'stall', kind: 'goal_stalled', at: now });
    expect(stalled.goals[0].inertia).toBeLessThan(after.goals[0].inertia);
  });
  test('expired and completed goals no longer receive inertia', () => {
    const state = initialState('Ada', now);
    expect(activeGoal(state, now)).toBeDefined();
    expect(activeGoal(state, state.goals[0].expiresAt)).toBeUndefined();
    const expired = applySocialEvent(state, {
      id: 'late',
      kind: 'goal_stalled',
      at: state.goals[0].expiresAt,
    });
    expect(expired.goals[0].status).toBe('expired');
    state.goals[0].progress = 1;
    expect(activeGoal(state, now)).toBeUndefined();
  });
  test('only positive observed contact completes repair goals', () => {
    const conflict = applySocialEvent(initialState('Ada', now), {
      id: 'c',
      kind: 'conflict',
      at: now,
      targetId: 'bob',
    });
    const repaired = applySocialEvent(conflict, {
      id: 'r',
      kind: 'repair',
      positive: true,
      at: now + 1,
      targetId: 'bob',
    });
    expect(repaired.goals.find((g) => g.kind === 'repair')?.status).toBe('completed');
    expect(repaired.relationships[0].trust).toBeGreaterThan(conflict.relationships[0].trust);
  });
  test('promise state is tracked and fulfilled evidence completes its goal', () => {
    const promise = {
      id: 'promise1',
      description: 'Meet later',
      dueAt: now,
      status: 'pending' as const,
    };
    const due = applySocialEvent(initialState('Ada', now), {
      id: 'p',
      kind: 'promise_due',
      at: now,
      targetId: 'bob',
      promise,
    });
    expect(due.relationships[0].promises).toEqual([promise]);
    expect(activeGoal(due, now)?.kind).toBe('keep_promise');
    const done = applySocialEvent(due, {
      id: 'f',
      kind: 'relationship_changed',
      positive: true,
      at: now + 1,
      targetId: 'bob',
      promise: { ...promise, status: 'fulfilled' },
    });
    expect(done.goals.find((g) => g.kind === 'keep_promise')?.status).toBe('completed');
  });
  test('hostile history makes invitation rejection more attractive', () => {
    const state: NpcState = initialState('Ada', now);
    state.relationships = [
      { ...defaultRelationship('bob', now), trust: 0, affinity: 0, conflict: 1 },
    ];
    expect(
      chooseUtility({ ...context(state), invitation: { playerId: 'bob', conversationId: 'c:1' } })
        .action,
    ).toBe('reject_invite');
  });
});

test('async decisions require the current revision and an unexpired TTL', () => {
  expect(isDecisionFresh({ stateVersion: 2, expiresAt: 2000 }, 2, 1000)).toBe(true);
  expect(isDecisionFresh({ stateVersion: 2, expiresAt: 2000 }, 3, 1000)).toBe(false);
  expect(isDecisionFresh({ stateVersion: 2, expiresAt: 2000 }, 2, 2000)).toBe(false);
  expect(isDecisionFresh({ stateVersion: 2, expiresAt: NaN }, 2, 1000)).toBe(false);
});

describe('authored identities and completed activity outcomes', () => {
  test('Bob is reserved and Lucky is curious and loyal', () => {
    expect(initialState('Bob', now).personality.sociability).toBeLessThan(0.2);
    expect(initialState('Lucky', now).personality.curiosity).toBeGreaterThan(0.9);
    expect(initialState('Lucky', now).personality.loyalty).toBeGreaterThan(0.9);
  });
  test('API memories exclude unrelated people and prefer important relevant events', () => {
    const input = context();
    input.state.memories = [
      { id: 'unrelated', kind: 'conflict', at: 5000, targetId: 'outsider' },
      { id: 'important', kind: 'conflict', at: 1, targetId: 'bob' },
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `seen${i}`,
        kind: 'encountered_known' as const,
        at: 10 + i,
        targetId: 'bob',
      })),
    ];
    const result = boundedContext(input).state.memories;
    expect(result).toHaveLength(6);
    expect(result.some((m) => m.id === 'important')).toBe(true);
    expect(result.some((m) => m.id === 'unrelated')).toBe(false);
  });
  test('completed rest recovers without changing source and exploration progresses', () => {
    const state = initialState('Lucky', now);
    state.energy = 0.3;
    state.stress = 0.7;
    const rest = applyActionOutcome(
      state,
      { id: 'r', action: 'rest', utility: 1, reason: '' },
      now,
    );
    expect(rest.energy).toBe(0.5);
    expect(rest.stress).toBeCloseTo(0.55);
    expect(state.energy).toBe(0.3);
    const walked = applyActionOutcome(
      rest,
      { id: 'w', action: 'wander', utility: 1, reason: '' },
      now,
    );
    expect(walked.goals[0].progress).toBe(0.25);
  });
  test('talk proposals never imply successful social outcomes', () => {
    const state = initialState('Bob', now);
    for (const action of ['start_conversation', 'accept_invite', 'repair_relationship'] as const) {
      expect(
        applyActionOutcome(
          state,
          { id: action, action, targetId: 'alice', utility: 1, reason: '' },
          now,
        ),
      ).toBe(state);
    }
    const greeted = applyActionOutcome(
      state,
      { id: 'g', action: 'greet_briefly', targetId: 'alice', utility: 1, reason: '' },
      now,
    );
    expect(greeted.relationships[0].familiarity).toBe(0.02);
    expect(greeted.relationships[0].trust).toBe(0.5);
  });
  test('outcomes renew goals but decision reads never renew or reset them', () => {
    const state = initialState('Lucky', now);
    const later = state.goals[0].expiresAt;
    makeCandidates({ ...context(state), now: later });
    expect(state.goals).toHaveLength(1);
    const next = applySocialEvent(state, {
      id: 'renew',
      kind: 'encountered_known',
      at: later,
      targetId: 'bob',
    });
    expect(next.goals[0].status).toBe('expired');
    expect(activeGoal(next, later)?.priority).toBe(0.55);
    expect(activeGoal(next, later)?.inertia).toBe(state.goals[0].inertia);
    let completed = initialState('Lucky', now);
    for (let i = 0; i < 4; i++)
      completed = applyActionOutcome(
        completed,
        { id: 'w', action: 'wander', utility: 1, reason: '' },
        now + i,
      );
    expect(completed.goals[0].status).toBe('completed');
    expect(activeGoal(completed, now + 4)).toBeDefined();
    expect(completed.goals).toHaveLength(2);
  });
});

describe('explicit observed social outcomes', () => {
  test.each(['pleasant_conversation', 'help', 'repair'] as const)(
    '%s raises trust only from explicit evidence',
    (kind) => {
      const state = initialState('Ada', now);
      state.relationships = [{ ...defaultRelationship('bob', now), conflict: 0.5 }];
      const next = applySocialEvent(state, { id: kind, kind, targetId: 'bob', at: now });
      expect(next.relationships[0].trust).toBeGreaterThan(0.5);
      expect(next.relationships[0].affinity).toBeGreaterThan(0.5);
      expect(next.memories[0].kind).toBe(kind);
      if (kind === 'repair') expect(next.relationships[0].conflict).toBeLessThan(0.5);
    },
  );
  test.each(['rejected', 'conflict', 'broken_promise'] as const)(
    '%s preserves its distinct negative memory',
    (kind) => {
      const state = initialState('Ada', now);
      const next = applySocialEvent(state, {
        id: kind,
        kind,
        targetId: 'bob',
        at: now,
        ...(kind === 'broken_promise'
          ? {
              promise: {
                id: 'p',
                description: 'Meet later',
                dueAt: now,
                status: 'pending' as const,
              },
            }
          : {}),
      });
      expect(next.relationships[0].affinity).toBeLessThan(0.5);
      expect(next.memories[0].kind).toBe(kind);
      if (kind === 'broken_promise') {
        expect(next.relationships[0].trust).toBeLessThan(0.5);
        expect(next.relationships[0].promises[0].status).toBe('broken');
      }
    },
  );
  test('ordinary completed contact and invitations never imply pleasant sentiment', () => {
    const initial = initialState('Ada', now);
    const contact = applySocialEvent(initial, {
      id: 'contact',
      kind: 'relationship_changed',
      positive: true,
      targetId: 'bob',
      at: now,
    });
    expect(contact.relationships[0].trust).toBe(0.5);
    expect(contact.relationships[0].affinity).toBe(0.5);
    expect(contact.relationships[0].familiarity).toBeGreaterThan(0);
    const invited = applySocialEvent(contact, {
      id: 'invited',
      kind: 'invitation',
      targetId: 'bob',
      at: now,
    });
    expect(invited.relationships[0].affinity).toBe(0.5);
  });
});

describe('goal-aligned continuation', () => {
  test.each(['socialize', 'repair', 'recover', 'keep_promise'] as const)(
    '%s cannot generate unrelated continuation walking',
    (kind) => {
      const state = initialState('Ada', now);
      state.goals[0].kind = kind;
      expect(makeCandidates(context(state)).some((c) => c.action === 'continue_current_goal')).toBe(
        false,
      );
    },
  );
  test('completed exploration continuation advances exploration, but busy continuation does not', () => {
    const state = initialState('Lucky', now);
    const candidate = makeCandidates(context(state)).find(
      (c) => c.action === 'continue_current_goal',
    );
    expect(candidate).toBeDefined();
    const next = applyActionOutcome(state, candidate!, now);
    expect(next.goals[0].progress).toBe(0.25);
    expect(next.energy).toBeLessThan(state.energy);
    const busy = makeCandidates({ ...context(state), busy: true })[0];
    expect(applyActionOutcome(state, busy, now)).toBe(state);
  });
  test('inertia rewards the relevant action for recovery, socializing, and repair', () => {
    for (const [kind, action] of [
      ['recover', 'rest'],
      ['socialize', 'start_conversation'],
      ['repair', 'repair_relationship'],
    ] as const) {
      const state = initialState('Ada', now);
      state.goals[0].kind = kind;
      state.goals[0].targetId = 'bob';
      state.goals[0].inertia = 0;
      const before = makeCandidates(context(state)).find((c) => c.action === action)!.utility;
      state.goals[0].inertia = 1;
      const after = makeCandidates(context(state)).find((c) => c.action === action)!.utility;
      expect(after).toBeGreaterThan(before);
    }
  });
});
