import { describe, expect, jest, test } from '@jest/globals';
import { agentInputs } from '../aiTown/agentInputs';
import { Agent } from '../aiTown/agent';
import type { Game } from '../aiTown/game';
import { parseGameId } from '../aiTown/ids';

function fixture() {
  const agent = new Agent({
    id: 'a:1',
    playerId: 'p:0',
    npcStateVersion: 1,
    inProgressOperation: { name: 'agentNpcDecision', operationId: 'o:1', started: 100_000 },
  });
  const player = {
    id: parseGameId('players', 'p:0'),
    position: { x: 2, y: 2 },
    activity: undefined as unknown,
    pathfinding: { destination: { x: 3, y: 3 } } as unknown,
  };
  const target = { id: parseGameId('players', 'p:1'), position: { x: 3, y: 2 } };
  const scheduleOperation = jest.fn();
  const game = {
    npcMode: 'hybrid',
    npcEpoch: 2,
    worldId: 'world-test',
    world: {
      agents: new Map([[agent.id, agent]]),
      players: new Map([
        [player.id, player],
        [target.id, target],
      ]),
      playerConversation: () => undefined,
    },
    playerDescriptions: new Map(),
    worldMap: { width: 20, height: 20 },
    scheduleOperation,
    allocId: () => 'o:2',
  };
  const input = {
    agentId: 'a:1',
    operationId: 'o:1',
    epoch: 2,
    stateVersion: 1,
    expiresAt: 200_000,
    jobId: 'job-test',
    candidate: { id: 'rest:self', action: 'rest', utility: 1, reason: 'test' },
  };
  const run = () => agentInputs.finishNpcDecision.handler(game as unknown as Game, 120_000, input);
  return { agent, player, target, game, input, run, scheduleOperation };
}

describe('NPC result application through engine input handler', () => {
  test('stale operation cannot clear or overwrite a newer operation', () => {
    const f = fixture();
    f.input.operationId = 'o:0';
    const newer = f.agent.inProgressOperation;
    f.run();
    expect(f.agent.inProgressOperation).toBe(newer);
    expect(f.player.activity).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'stale_operation',
    });
  });
  test.each(['expired', 'epoch', 'classic'])('%s ignores the result', (condition) => {
    const f = fixture();
    if (condition === 'expired') f.input.expiresAt = 120_000;
    if (condition === 'epoch') f.input.epoch = 1;
    if (condition === 'classic') f.game.npcMode = 'classic';
    f.run();
    expect(f.player.activity).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'stale_state',
    });
  });
  test('a newer event invalidates an in-flight decision and versions cannot roll back', () => {
    const f = fixture();
    agentInputs.npcStateUpdated.handler(f.game as unknown as Game, 119_000, {
      agentId: 'a:1',
      stateVersion: 2,
    });
    agentInputs.npcStateUpdated.handler(f.game as unknown as Game, 119_001, {
      agentId: 'a:1',
      stateVersion: 1,
    });
    expect(f.agent.npcStateVersion).toBe(2);
    f.run();
    expect(f.player.activity).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'stale_state',
    });
  });
  test.each([
    null,
    'rest',
    {},
    { action: 3 },
    { action: 'rest', targetId: 'wrong' },
    { action: 'rest', targetId: 3 },
    { action: 'teleport' },
  ])('malformed candidate %j is rejected without throwing', (candidate) => {
    const f = fixture();
    expect(() =>
      agentInputs.finishNpcDecision.handler(f.game as unknown as Game, 120_000, {
        ...f.input,
        candidate,
      }),
    ).not.toThrow();
    expect(f.player.activity).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'invalid_action',
    });
  });
  test.each(['p:99', 'p:1'])('rejects unavailable or out-of-range target %s', (targetId) => {
    const f = fixture();
    f.target.position.x = 100;
    f.input.candidate = {
      ...f.input.candidate,
      action: 'greet_briefly',
      targetId,
    } as typeof f.input.candidate;
    f.run();
    expect(f.player.activity).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'target_left',
    });
  });
  test('accepts a legitimate rest candidate and clears movement', () => {
    const f = fixture();
    f.run();
    expect(f.player.activity).toEqual({
      description: 'Taking a quiet break',
      emoji: '🌿',
      until: 140_000,
    });
    expect(f.player.pathfinding).toBeUndefined();
    expect(f.agent.inProgressOperation).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'executed',
    });
  });
  test('rejects an invitation result when invitation no longer exists', () => {
    const f = fixture();
    f.input.candidate.action = 'accept_invite';
    f.run();
    expect(f.scheduleOperation).toHaveBeenCalledWith('npcDecisionApplied', {
      jobId: 'job-test',
      outcome: 'invalid_invitation',
    });
  });
  test('tick schedules work synchronously without waiting for an external operation', () => {
    const f = fixture();
    delete f.agent.inProgressOperation;
    // A scheduler that never resolves must not block the synchronous tick.
    f.scheduleOperation.mockImplementation(() => new Promise(() => {}));
    expect(f.agent.tick(f.game as unknown as Game, 120_000)).toBeUndefined();
    expect(f.scheduleOperation).toHaveBeenCalledTimes(1);
    expect(f.scheduleOperation.mock.calls[0][0]).toBe('agentNpcDecision');
    expect(f.agent.serialize().inProgressOperation?.operationId).toBe('o:2');
    f.agent.tick(f.game as unknown as Game, 120_001);
    expect(f.scheduleOperation).toHaveBeenCalledTimes(1);
  });
});
