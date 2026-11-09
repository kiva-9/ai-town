import { defineTable } from 'convex/server';
import { v } from 'convex/values';
export const modeValidator = v.union(v.literal('classic'), v.literal('hybrid'), v.literal('mock'));
export const languageValidator = v.union(v.literal('zh-CN'), v.literal('en'));
export const npcTables = {
  npcControl: defineTable({
    key: v.string(),
    mode: modeValidator,
    language: v.optional(languageValidator),
    epoch: v.number(),
    day: v.string(),
    requests: v.number(),
    cost: v.number(),
    minuteStart: v.number(),
    minuteRequests: v.number(),
  }).index('key', ['key']),
  npcStates: defineTable({
    worldId: v.id('worlds'),
    playerId: v.string(),
    agentId: v.string(),
    state: v.any(),
    seenEvents: v.array(v.string()),
    updatedAt: v.number(),
    lastDecisionAt: v.number(),
    activeJob: v.optional(v.id('npcJobs')),
    cache: v.optional(v.any()),
  })
    .index('player', ['worldId', 'playerId'])
    .index('world', ['worldId']),
  npcJobs: defineTable({
    worldId: v.id('worlds'),
    agentId: v.string(),
    playerId: v.string(),
    operationId: v.string(),
    npcId: v.id('npcStates'),
    epoch: v.number(),
    stateVersion: v.number(),
    context: v.any(),
    candidates: v.any(),
    event: v.any(),
    cacheKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    status: v.union(v.literal('queued'), v.literal('running'), v.literal('done')),
    leaseUntil: v.optional(v.number()),
    reservedCost: v.number(),
    reservedRequests: v.number(),
    reservationDay: v.optional(v.string()),
    apiResult: v.optional(v.any()),
    decision: v.optional(v.any()),
    source: v.optional(v.string()),
    outcome: v.optional(v.string()),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })
    .index('status', ['status', 'createdAt'])
    .index('player', ['worldId', 'playerId', 'createdAt'])
    .index('operation', ['worldId', 'operationId']),
};
