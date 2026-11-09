import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import { Id } from '../_generated/dataModel';
import { kickEngine } from '../aiTown/main';
import { engineInsertInput } from '../engine/abstractGame';
import {
  initialState,
  applySocialEvent,
  applyActionOutcome,
  makeCandidates,
  chooseUtility,
  chooseMock,
  DecisionContext,
} from './core';
import { modeValidator } from './schema';

const numberEnv = (key: string, fallback: number) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const limits = () => ({
  concurrency: Math.min(8, numberEnv('NPC_DECISION_CONCURRENCY', 2)),
  perMinute: numberEnv('NPC_DECISION_REQUESTS_PER_MINUTE', 12),
  perDay: numberEnv('NPC_DECISION_REQUESTS_PER_DAY', 500),
  dailyCost: numberEnv('NPC_DECISION_DAILY_BUDGET_USD', 2),
  reserve: numberEnv('NPC_DECISION_MAX_COST_USD', 0.1) * 2,
  queue: 64,
});
export function defaultMode(): 'classic' | 'mock' | 'hybrid' {
  return process.env.NPC_DECISION_ENABLED === 'false'
    ? 'classic'
    : process.env.NPC_DECISION_MODE === 'hybrid'
      ? 'hybrid'
      : process.env.NPC_DECISION_MODE === 'classic'
        ? 'classic'
        : 'mock';
}
export const effectiveMode = (mode?: 'classic' | 'hybrid' | 'mock') =>
  process.env.NPC_DECISION_ENABLED === 'false' ? ('classic' as const) : mode || defaultMode();
async function control(ctx: MutationCtx) {
  let row = await ctx.db
    .query('npcControl')
    .withIndex('key', (q) => q.eq('key', 'global'))
    .unique();
  const now = Date.now(),
    day = new Date(now).toISOString().slice(0, 10);
  if (!row) {
    const id = await ctx.db.insert('npcControl', {
      key: 'global',
      mode: defaultMode(),
      epoch: 0,
      day,
      requests: 0,
      cost: 0,
      minuteStart: now,
      minuteRequests: 0,
    });
    row = (await ctx.db.get(id))!;
  }
  const patch = {
    ...(row.day !== day ? { day, requests: 0, cost: 0 } : {}),
    ...(now - row.minuteStart >= 60000 ? { minuteStart: now, minuteRequests: 0 } : {}),
  };
  if (Object.keys(patch).length) {
    await ctx.db.patch(row._id, patch);
    row = { ...row, ...patch };
  }
  return { ...row, mode: effectiveMode(row.mode) };
}
async function status(ctx: MutationCtx, worldId: Id<'worlds'>) {
  return ctx.db
    .query('worldStatus')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .unique();
}
async function stateUpdated(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  agentId: string,
  stateVersion: number,
) {
  const ws = await status(ctx, worldId);
  if (ws) await engineInsertInput(ctx, ws.engineId, 'npcStateUpdated', { agentId, stateVersion });
}
async function cancelOperation(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  agentId: string,
  operationId: string,
) {
  const ws = await status(ctx, worldId);
  if (ws?.status !== 'running') return;
  const world = await ctx.db.get(worldId);
  if (
    world?.agents.find((a) => a.id === agentId)?.inProgressOperation?.operationId === operationId
  ) {
    await engineInsertInput(ctx, ws.engineId, 'cancelNpcDecision', { agentId, operationId });
  }
}
async function finish(
  ctx: MutationCtx,
  jobId: Id<'npcJobs'>,
  candidate: any,
  source: string,
  error?: string,
) {
  const job = await ctx.db.get(jobId);
  if (!job || job.status === 'done') return;
  const [npc, config, worldStatus, world] = await Promise.all([
    ctx.db.get(job.npcId),
    control(ctx),
    status(ctx, job.worldId),
    ctx.db.get(job.worldId),
  ]);
  const liveAgent = world?.agents.find((a) => a.id === job.agentId);
  const fresh =
    npc?.activeJob === jobId &&
    npc.state.version === job.stateVersion &&
    config.epoch === job.epoch &&
    config.mode !== 'classic' &&
    Date.now() < job.expiresAt &&
    worldStatus?.status === 'running' &&
    liveAgent?.inProgressOperation?.operationId === job.operationId;
  await ctx.db.patch(jobId, {
    status: 'done',
    completedAt: Date.now(),
    decision: candidate,
    source,
    outcome: fresh ? 'submitted' : 'stale',
    ...(error ? { error: error.slice(0, 200) } : {}),
  });
  if (npc?.activeJob === jobId)
    await ctx.db.patch(npc._id, {
      activeJob: undefined,
      lastDecisionAt: Date.now(),
      ...(fresh
        ? { cache: { key: job.cacheKey, candidateId: candidate.id, until: Date.now() + 60000 } }
        : {}),
    });
  if (fresh && worldStatus)
    await engineInsertInput(ctx, worldStatus.engineId, 'finishNpcDecision', {
      agentId: job.agentId,
      operationId: job.operationId,
      candidate,
      jobId,
      epoch: job.epoch,
      stateVersion: job.stateVersion,
      expiresAt: job.expiresAt,
    });
  else if (
    worldStatus?.status === 'running' &&
    liveAgent?.inProgressOperation?.operationId === job.operationId
  )
    await engineInsertInput(ctx, worldStatus.engineId, 'cancelNpcDecision', {
      agentId: job.agentId,
      operationId: job.operationId,
    });
}
function classifyEncounter(state: any, event: any) {
  return event.kind === 'encountered_stranger' &&
    state.relationships.some((r: any) => r.playerId === event.targetId && r.familiarity > 0)
    ? { ...event, kind: 'encountered_known' }
    : event;
}
export const enqueue = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    playerId: v.string(),
    operationId: v.string(),
    event: v.any(),
    context: v.any(),
  },
  handler: async (ctx, args): Promise<Id<'npcJobs'> | null> => {
    const config = await control(ctx),
      now = Date.now();
    const old = await ctx.db
      .query('npcJobs')
      .withIndex('status', (q) => q.eq('status', 'done').lt('createdAt', now - 86400000))
      .take(16);
    for (const row of old) await ctx.db.delete(row._id);
    if (config.mode === 'classic' || (await status(ctx, args.worldId))?.status !== 'running') {
      await cancelOperation(ctx, args.worldId, args.agentId, args.operationId);
      return null;
    }
    if (
      await ctx.db
        .query('npcJobs')
        .withIndex('operation', (q) =>
          q.eq('worldId', args.worldId).eq('operationId', args.operationId),
        )
        .first()
    )
      return null;
    let npc = await ctx.db
      .query('npcStates')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .unique();
    if (!npc) {
      const id = await ctx.db.insert('npcStates', {
        worldId: args.worldId,
        playerId: args.playerId,
        agentId: args.agentId,
        state: initialState(args.context.name || args.playerId, now),
        seenEvents: [],
        updatedAt: now,
        lastDecisionAt: 0,
      });
      npc = (await ctx.db.get(id))!;
    }
    if (npc.activeJob) {
      const active = await ctx.db.get(npc.activeJob);
      if (active && active.status !== 'done' && active.expiresAt > now) {
        await cancelOperation(ctx, args.worldId, args.agentId, args.operationId);
        return null;
      }
    }
    let state = npc.state;
    const event = classifyEncounter(state, args.event);
    const eventId = String(event.id || args.operationId);
    if (!npc.seenEvents.includes(eventId))
      state = applySocialEvent(state, { ...event, id: eventId, at: now });
    const context: DecisionContext = {
      state,
      now,
      nearby: (args.context.nearby || []).slice(0, 8),
      ...(args.context.invitation ? { invitation: args.context.invitation } : {}),
      busy: Boolean(args.context.busy),
    };
    const candidates = makeCandidates(context);
    const cacheKey = JSON.stringify({
      candidates: candidates.map((c) => [c.id, Math.round(c.utility * 10)]),
      personality: state.personality,
      energy: Math.round(state.energy * 5),
      stress: Math.round(state.stress * 5),
    });
    const id = await ctx.db.insert('npcJobs', {
      worldId: args.worldId,
      playerId: args.playerId,
      agentId: args.agentId,
      operationId: args.operationId,
      npcId: npc._id,
      epoch: config.epoch,
      stateVersion: state.version,
      context,
      candidates,
      event,
      cacheKey,
      createdAt: now,
      expiresAt: now + 45000,
      status: 'queued',
      reservedCost: 0,
      reservedRequests: 0,
    });
    await ctx.db.patch(npc._id, {
      state,
      seenEvents: [...npc.seenEvents.filter((e) => e !== eventId), eventId].slice(-128),
      updatedAt: now,
      activeJob: id,
    });
    await stateUpdated(ctx, args.worldId, args.agentId, state.version);
    const cached =
      npc.cache?.key === cacheKey && npc.cache.until > now
        ? candidates.find((c) => c.id === npc!.cache.candidateId)
        : undefined;
    const queued = await ctx.db
      .query('npcJobs')
      .withIndex('status', (q) => q.eq('status', 'queued'))
      .take(limits().queue + 1);
    if (
      config.mode === 'mock' ||
      !process.env.OPENAI_API_KEY?.trim() ||
      candidates.length <= 1 ||
      cached ||
      queued.length > limits().queue ||
      now - npc.lastDecisionAt < 10000
    ) {
      await finish(
        ctx,
        id,
        cached ||
          (config.mode === 'mock' || !process.env.OPENAI_API_KEY?.trim()
            ? chooseMock(context, args.operationId)
            : chooseUtility(context)),
        cached
          ? 'cache'
          : config.mode === 'mock' || !process.env.OPENAI_API_KEY?.trim()
            ? 'mock'
            : candidates.length <= 1
              ? 'single_candidate'
              : 'utility',
      );
    } else await ctx.scheduler.runAfter(0, internal.npc.service.pump, {});
    // Expiry always runs, including crashes before an action starts.
    await ctx.scheduler.runAfter(46000, internal.npc.service.expire, { jobId: id });
    return id;
  },
});
export const pump = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    let config = await control(ctx);
    const now = Date.now(),
      cap = limits();
    const running = await ctx.db
      .query('npcJobs')
      .withIndex('status', (q) => q.eq('status', 'running'))
      .take(cap.queue);
    let active = 0;
    for (const job of running) {
      if (job.epoch !== config.epoch || config.mode !== 'hybrid')
        await finish(ctx, job._id, chooseUtility(job.context), 'invalidated');
      else if ((job.leaseUntil || 0) <= now)
        await finish(ctx, job._id, chooseUtility(job.context), 'lease_expired');
      else active++;
    }
    const queue = await ctx.db
      .query('npcJobs')
      .withIndex('status', (q) => q.eq('status', 'queued'))
      .take(cap.queue);
    for (const job of queue) {
      if (
        job.expiresAt <= now ||
        job.epoch !== config.epoch ||
        config.mode !== 'hybrid' ||
        (await status(ctx, job.worldId))?.status !== 'running'
      ) {
        await finish(ctx, job._id, chooseUtility(job.context), 'invalidated');
        continue;
      }
      if (active >= cap.concurrency) break;
      if (
        config.requests + 2 > cap.perDay ||
        config.cost + cap.reserve > cap.dailyCost ||
        config.minuteRequests + 2 > cap.perMinute
      ) {
        await finish(ctx, job._id, chooseUtility(job.context), 'budget_fallback');
        continue;
      }
      config = {
        ...config,
        requests: config.requests + 2,
        cost: config.cost + cap.reserve,
        minuteRequests: config.minuteRequests + 2,
      };
      await ctx.db.patch(config._id, {
        requests: config.requests,
        cost: config.cost,
        minuteRequests: config.minuteRequests,
      });
      await ctx.db.patch(job._id, {
        status: 'running',
        leaseUntil: now + 20000,
        reservedCost: cap.reserve,
        reservedRequests: 2,
        reservationDay: config.day,
      });
      await ctx.scheduler.runAfter(0, internal.npc.worker.process, { jobId: job._id });
      await ctx.scheduler.runAfter(21000, internal.npc.service.pump, {});
      active++;
    }
  },
});
export const expire = internalMutation({
  args: { jobId: v.id('npcJobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (job && job.status !== 'done')
      await finish(ctx, jobId, chooseUtility(job.context), 'expired');
    await ctx.scheduler.runAfter(0, internal.npc.service.pump, {});
  },
});
export const getWork = internalQuery({
  args: { jobId: v.id('npcJobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== 'running' || (job.leaseUntil || 0) <= Date.now()) return null;
    const config = await ctx.db
      .query('npcControl')
      .withIndex('key', (q) => q.eq('key', 'global'))
      .unique();
    const ws = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', job.worldId))
      .unique();
    const npc = await ctx.db.get(job.npcId);
    return npc?.state.version === job.stateVersion &&
      npc.activeJob === job._id &&
      effectiveMode(config?.mode) === 'hybrid' &&
      config?.epoch === job.epoch &&
      ws?.status === 'running'
      ? job
      : null;
  },
});
export const complete = internalMutation({
  args: {
    jobId: v.id('npcJobs'),
    candidateId: v.optional(v.string()),
    apiResult: v.optional(v.any()),
    cost: v.optional(v.number()),
    attempts: v.number(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== 'running') return;
    const config = await control(ctx);
    if (args.apiResult) await ctx.db.patch(job._id, { apiResult: args.apiResult });
    // Failed/uncertain attempts retain their full reservation. Success refunds only known unused capacity.
    if (config.day === job.reservationDay) {
      const knownCost =
        args.attempts === 0
          ? 0
          : args.cost === undefined
            ? job.reservedCost
            : Math.max(0, args.cost) + (Math.max(0, args.attempts - 1) * job.reservedCost) / 2;
      await ctx.db.patch(config._id, {
        cost: Math.max(0, config.cost - job.reservedCost + knownCost),
        requests: Math.max(0, config.requests - Math.max(0, job.reservedRequests - args.attempts)),
      });
    }
    const candidate =
      job.candidates.find((c: any) => c.id === args.candidateId) || chooseUtility(job.context);
    await finish(ctx, job._id, candidate, args.candidateId ? 'decisions' : 'utility', args.error);
    await ctx.scheduler.runAfter(0, internal.npc.service.pump, {});
  },
});
export const executionAck = internalMutation({
  args: { jobId: v.string(), outcome: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('npcJobs', args.jobId);
    if (id && (await ctx.db.get(id)))
      await ctx.db.patch(id, { outcome: args.outcome.slice(0, 200) });
  },
});
export const inspect = query({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) => {
    const npc = await ctx.db
      .query('npcStates')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .unique();
    const jobs = await ctx.db
      .query('npcJobs')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .order('desc')
      .take(12);
    const config = await ctx.db
      .query('npcControl')
      .withIndex('key', (q) => q.eq('key', 'global'))
      .unique();
    return {
      npc,
      jobs,
      mode: effectiveMode(config?.mode),
      disabled: process.env.NPC_DECISION_ENABLED === 'false',
      disabledReason:
        process.env.NPC_DECISION_ENABLED === 'false'
          ? 'Disabled by NPC_DECISION_ENABLED=false on the server.'
          : null,
      epoch: config?.epoch || 0,
    };
  },
});
export const overview = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query('npcControl')
      .withIndex('key', (q) => q.eq('key', 'global'))
      .unique();
    const queued = await ctx.db
      .query('npcJobs')
      .withIndex('status', (q) => q.eq('status', 'queued'))
      .take(65);
    const running = await ctx.db
      .query('npcJobs')
      .withIndex('status', (q) => q.eq('status', 'running'))
      .take(65);
    const states = await ctx.db
      .query('npcStates')
      .withIndex('world', (q) => q.eq('worldId', args.worldId))
      .take(64);
    return {
      mode: effectiveMode(config?.mode),
      disabled: process.env.NPC_DECISION_ENABLED === 'false',
      disabledReason:
        process.env.NPC_DECISION_ENABLED === 'false'
          ? 'Disabled by NPC_DECISION_ENABLED=false on the server.'
          : null,
      epoch: config?.epoch || 0,
      day: config?.day,
      requests: config?.requests || 0,
      cost: config?.cost || 0,
      queued: queued.length,
      running: running.length,
      states,
      limits: limits(),
      controlAllowed: process.env.NPC_ALLOW_MODE_CONTROL === 'true',
    };
  },
});
export const setMode = mutation({
  args: { mode: modeValidator },
  handler: async (ctx, { mode }) => {
    if (process.env.NPC_ALLOW_MODE_CONTROL !== 'true')
      throw new Error(
        'Mode controls are disabled. Enable NPC_ALLOW_MODE_CONTROL only in a trusted local deployment.',
      );
    const config = await control(ctx);
    await ctx.db.patch(config._id, { mode, epoch: config.epoch + 1 });
    // Invalidate cached Game instances atomically with the mode change. Old saves
    // fail the engine generation check; replacements load the new mode/epoch.
    for (const ws of await ctx.db.query('worldStatus').collect()) {
      if (ws.status === 'running') await kickEngine(ctx, ws.worldId);
    }
    await ctx.scheduler.runAfter(0, internal.npc.service.pump, {});
    return { mode, epoch: config.epoch + 1 };
  },
});

/** Actual engine outcomes update directed social memory; duplicate event IDs are idempotent. */
export const recordEvent = internalMutation({
  args: { worldId: v.id('worlds'), agentId: v.string(), playerId: v.string(), event: v.any() },
  handler: async (ctx, args) => {
    let npc = await ctx.db
      .query('npcStates')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .unique();
    const now = Date.now();
    if (!npc) {
      const description = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
        .unique();
      const id = await ctx.db.insert('npcStates', {
        worldId: args.worldId,
        playerId: args.playerId,
        agentId: args.agentId,
        state: initialState(description?.name || args.playerId, now),
        seenEvents: [],
        updatedAt: now,
        lastDecisionAt: 0,
      });
      npc = (await ctx.db.get(id))!;
    }
    if (typeof args.event.id !== 'string' || npc.seenEvents.includes(args.event.id)) return;
    let state = applySocialEvent(npc.state, classifyEncounter(npc.state, args.event));
    if (
      args.event.kind === 'rejected' &&
      state.memories.filter((e: any) => e.kind === 'rejected' && e.targetId === args.event.targetId)
        .length >= 2
    ) {
      state = applySocialEvent(state, {
        id: `${args.event.id}:conflict`,
        kind: 'conflict',
        at: args.event.at,
        targetId: args.event.targetId,
        magnitude: 0.4,
        summary: 'Repeated rejection strained this relationship.',
      });
    }
    await ctx.db.patch(npc._id, {
      state,
      seenEvents: [...npc.seenEvents, args.event.id].slice(-128),
      updatedAt: now,
      cache: undefined,
    });
    await stateUpdated(ctx, args.worldId, args.agentId, state.version);
  },
});

export const actionCompleted = internalMutation({
  args: {
    worldId: v.id('worlds'),
    agentId: v.string(),
    playerId: v.string(),
    candidate: v.any(),
    at: v.number(),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.completed) return;
    const npc = await ctx.db
      .query('npcStates')
      .withIndex('player', (q) => q.eq('worldId', args.worldId).eq('playerId', args.playerId))
      .unique();
    const eventId = `action:${args.agentId}:${args.candidate.id}:${args.at}`;
    if (!npc || npc.seenEvents.includes(eventId)) return;
    const state = applyActionOutcome(npc.state, args.candidate, args.at);
    await ctx.db.patch(npc._id, {
      state,
      updatedAt: Date.now(),
      cache: undefined,
      seenEvents: [...npc.seenEvents, eventId].slice(-128),
    });
    await stateUpdated(ctx, args.worldId, args.agentId, state.version);
  },
});
