import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  enqueue,
  recordEvent,
  actionCompleted,
  setMode,
  limits,
  defaultMode,
  pump,
  complete,
  getWork,
  overview,
} from './service';

import { parsePricingValue } from './worker';

type Row = Record<string, any>;
function fixture() {
  const rows: Row[] = [
    {
      _id: 'world',
      _table: 'worlds',
      agents: [{ id: 'a:0', inProgressOperation: { operationId: 'o:0' } }],
    },
    {
      _id: 'status',
      _table: 'worldStatus',
      worldId: 'world',
      engineId: 'engine',
      status: 'running',
    },
  ];
  let serial = 0;
  const db = {
    query(table: string) {
      let selected = rows.filter((r) => r._table === table);
      const query = {
        withIndex(_name: string, cb: (q: any) => any) {
          const filter: any = {
            eq(key: string, value: any) {
              selected = selected.filter((r) => r[key] === value);
              return filter;
            },
            lt(key: string, value: any) {
              selected = selected.filter((r) => r[key] < value);
              return filter;
            },
          };
          cb(filter);
          return query;
        },
        order(order: string) {
          selected.sort(
            (a, b) =>
              (order === 'desc' ? -1 : 1) *
              ((a.number ?? a.createdAt ?? 0) - (b.number ?? b.createdAt ?? 0)),
          );
          return query;
        },
        async collect() {
          return selected;
        },
        async unique() {
          return selected[0] ?? null;
        },
        async first() {
          return selected[0] ?? null;
        },
        async take(n: number) {
          return selected.slice(0, n);
        },
      };
      return query;
    },
    async get(id: string) {
      return rows.find((r) => r._id === id) ?? null;
    },
    async insert(table: string, value: Row) {
      const id = `${table}:${++serial}`;
      rows.push({ ...value, _id: id, _table: table });
      return id;
    },
    async patch(id: string, value: Row) {
      Object.assign(rows.find((r) => r._id === id)!, value);
    },
    async delete(id: string) {
      const index = rows.findIndex((r) => r._id === id);
      rows.splice(index, 1);
    },
  };
  return { rows, ctx: { db, scheduler: { runAfter: jest.fn(async () => 'scheduled') } } };
}
const invoke = (fn: any, ctx: any, args: any) => fn._handler(ctx, args);
const args = {
  worldId: 'world',
  agentId: 'a:0',
  playerId: 'p:0',
  operationId: 'o:0',
  event: { id: 'event:0', kind: 'encountered_stranger', at: 1000, targetId: 'p:1' },
  context: { name: 'Ada', nearby: [{ playerId: 'p:1', available: true, distance: 2 }] },
};
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.NPC_DECISION_ENABLED;
  process.env.NPC_DECISION_MODE = 'hybrid';
  delete process.env.NPC_ALLOW_MODE_CONTROL;
});
describe('durable NPC service (mock database, no network)', () => {
  test('no key uses mock without reservations and writes state before decision input', async () => {
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    const job = rows.find((r) => r._table === 'npcJobs')!;
    expect(job.status).toBe('done');
    expect(job.source).toBe('mock');
    expect(job.outcome).toBe('submitted');
    expect(rows.find((r) => r._table === 'npcControl')!.requests).toBe(0);
    expect(rows.filter((r) => r._table === 'inputs').map((r) => r.name)).toEqual([
      'npcStateUpdated',
      'finishNpcDecision',
    ]);
    expect(rows.find((r) => r.name === 'finishNpcDecision')!.args.stateVersion).toBe(
      job.stateVersion,
    );
  });
  test('replayed operation and social event do not duplicate effects', async () => {
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    await invoke(enqueue, ctx, args);
    expect(rows.filter((r) => r._table === 'npcJobs')).toHaveLength(1);
    const state = rows.find((r) => r._table === 'npcStates')!;
    const version = state.state.version;
    await invoke(recordEvent, ctx, args);
    expect(state.state.version).toBe(version);
  });
  test('paused worlds never create decision work', async () => {
    const { rows, ctx } = fixture();
    rows.find((r) => r._table === 'worldStatus')!.status = 'inactive';
    expect(await invoke(enqueue, ctx, args)).toBeNull();
    expect(rows.filter((r) => r._table === 'npcJobs')).toHaveLength(0);
  });
  test('actual completed action applies once; interruption earns no progress', async () => {
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    const npc = rows.find((r) => r._table === 'npcStates')!;
    const completion = {
      worldId: 'world',
      agentId: 'a:0',
      playerId: 'p:0',
      candidate: { id: 'rest', action: 'rest', utility: 1, reason: 'tired' },
      at: Date.now(),
      completed: false,
    };
    const version = npc.state.version;
    await invoke(actionCompleted, ctx, completion);
    expect(npc.state.version).toBe(version);
    await invoke(actionCompleted, ctx, { ...completion, completed: true });
    const after = npc.state.version;
    expect(after).toBeGreaterThan(version);
    await invoke(actionCompleted, ctx, { ...completion, completed: true });
    expect(npc.state.version).toBe(after);
  });
  test('mode control is disabled unless explicitly enabled server-side', async () => {
    const { ctx } = fixture();
    await expect(invoke(setMode, ctx, { mode: 'classic' })).rejects.toThrow(
      'Mode controls are disabled',
    );
  });
  test('global concurrency reserves atomically and leaves excess queued', async () => {
    process.env.OPENAI_API_KEY = 'test-only-no-network';
    process.env.NPC_DECISION_CONCURRENCY = '2';
    const { rows, ctx } = fixture();
    for (let i = 0; i < 3; i++) {
      if (i) rows[0].agents.push({ id: `a:${i}`, inProgressOperation: { operationId: `o:${i}` } });
      await invoke(enqueue, ctx, {
        ...args,
        agentId: `a:${i}`,
        playerId: `p:${i}`,
        operationId: `o:${i}`,
      });
    }
    await invoke(pump, ctx, {});
    expect(rows.filter((r) => r._table === 'npcJobs' && r.status === 'running')).toHaveLength(2);
    expect(rows.filter((r) => r._table === 'npcJobs' && r.status === 'queued')).toHaveLength(1);
    expect(rows.find((r) => r._table === 'npcControl')!.requests).toBe(4);
    await invoke(pump, ctx, {});
    expect(rows.find((r) => r._table === 'npcControl')!.requests).toBe(4);
    delete process.env.NPC_DECISION_CONCURRENCY;
  });
  test('daily request limit falls back without scheduling a model action', async () => {
    process.env.OPENAI_API_KEY = 'test-only-no-network';
    process.env.NPC_DECISION_REQUESTS_PER_DAY = '1';
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    await invoke(pump, ctx, {});
    expect(rows.find((r) => r._table === 'npcJobs')!.source).toBe('budget_fallback');
    expect(rows.find((r) => r._table === 'npcControl')!.requests).toBe(0);
    delete process.env.NPC_DECISION_REQUESTS_PER_DAY;
  });
  test('blank or missing pricing is unavailable, never free', () => {
    expect(Number.isNaN(parsePricingValue(undefined))).toBe(true);
    expect(Number.isNaN(parsePricingValue(''))).toBe(true);
    expect(Number.isNaN(parsePricingValue('   '))).toBe(true);
    expect(parsePricingValue('0')).toBe(0);
    expect(parsePricingValue('0.15')).toBe(0.15);
  });
  test('hard disable overrides persisted hybrid and blocks pending work', async () => {
    process.env.OPENAI_API_KEY = 'test-only-no-network';
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    await invoke(pump, ctx, {});
    const job = rows.find((r) => r._table === 'npcJobs')!;
    process.env.NPC_DECISION_ENABLED = 'false';
    expect(await invoke(getWork, ctx, { jobId: job._id })).toBeNull();
    expect(await invoke(enqueue, ctx, { ...args, operationId: 'o:new' })).toBeNull();
    const view = await invoke(overview, ctx, { worldId: 'world' });
    expect(view.mode).toBe('classic');
    expect(view.disabled).toBe(true);
    expect(view.disabledReason).toContain('NPC_DECISION_ENABLED');
    await invoke(pump, ctx, {});
    await invoke(complete, ctx, { jobId: job._id, attempts: 0 });
    expect(job.outcome).toBe('stale');
    expect(rows.filter((r) => r.name === 'finishNpcDecision')).toHaveLength(0);
    expect(rows.filter((r) => r.name === 'cancelNpcDecision')).toHaveLength(1);
  });
  test('new social state invalidates an in-flight result and prevents dispatch', async () => {
    process.env.OPENAI_API_KEY = 'test-only-no-network';
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    await invoke(pump, ctx, {});
    const job = rows.find((r) => r._table === 'npcJobs')!;
    await invoke(recordEvent, ctx, {
      ...args,
      event: { id: 'fresh-evidence', kind: 'rejected', targetId: 'p:1', at: Date.now() },
    });
    expect(await invoke(getWork, ctx, { jobId: job._id })).toBeNull();
    await invoke(complete, ctx, {
      jobId: job._id,
      candidateId: job.candidates[0].id,
      attempts: 1,
      cost: 0.001,
    });
    expect(job.outcome).toBe('stale');
    expect(rows.filter((r) => r.name === 'finishNpcDecision')).toHaveLength(0);
    expect(rows.filter((r) => r.name === 'cancelNpcDecision')).toHaveLength(1);
  });
  test('legacy worlds without NPC fields migrate lazily outside engine state', async () => {
    const { rows, ctx } = fixture();
    const original = JSON.stringify(rows[0]);
    expect(rows.some((r) => r._table === 'npcStates')).toBe(false);
    await invoke(enqueue, ctx, args);
    expect(rows.find((r) => r._table === 'npcStates')!.state.version).toBeGreaterThan(0);
    expect(JSON.stringify(rows[0])).toBe(original);
  });
  test('mode switching restarts only running generations in the same transaction', async () => {
    process.env.NPC_ALLOW_MODE_CONTROL = 'true';
    const { rows, ctx } = fixture();
    rows.push({ _id: 'engine', _table: 'engines', generationNumber: 7, running: true });
    rows.push({
      _id: 'paused-status',
      _table: 'worldStatus',
      worldId: 'paused-world',
      engineId: 'paused-engine',
      status: 'inactive',
    });
    rows.push({ _id: 'paused-engine', _table: 'engines', generationNumber: 3, running: false });
    const result = await invoke(setMode, ctx, { mode: 'mock' });
    expect(result.epoch).toBe(1);
    expect(rows.find((r) => r._id === 'engine')!.generationNumber).toBe(8);
    expect(rows.find((r) => r._id === 'paused-engine')!.generationNumber).toBe(3);
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(
      0,
      expect.anything(),
      expect.objectContaining({ worldId: 'world', generationNumber: 8 }),
    );
  });
  test('repeat encounter is known only after recorded familiarity', async () => {
    const { rows, ctx } = fixture();
    await invoke(enqueue, ctx, args);
    rows[0].agents[0].inProgressOperation.operationId = 'o:next';
    await invoke(enqueue, ctx, {
      ...args,
      operationId: 'o:next',
      event: { ...args.event, id: 'event:next' },
    });
    const jobs = rows.filter((r) => r._table === 'npcJobs');
    expect(jobs[0].event.kind).toBe('encountered_stranger');
    expect(jobs[1].event.kind).toBe('encountered_known');
  });
  test('disabled mode and conservative concurrency defaults', () => {
    process.env.NPC_DECISION_ENABLED = 'false';
    expect(defaultMode()).toBe('classic');
    expect(limits().queue).toBe(64);
    expect(limits().concurrency).toBeLessThanOrEqual(8);
  });
});
