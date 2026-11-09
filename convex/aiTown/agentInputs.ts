import { v } from 'convex/values';
import { agentId, conversationId, parseGameId } from './ids';
import { Player, activity } from './player';
import { Conversation, conversationInputs } from './conversation';
import { movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { point } from '../util/types';
import { Descriptions } from '../../data/characters';
import { AgentDescription } from './agentDescription';
import { Agent } from './agent';
import { distance } from '../util/geometry';
import { seededRandom } from '../npc/core';
import { CONVERSATION_COOLDOWN } from '../constants';

export const agentInputs = {
  cancelNpcDecision: inputHandler({
    args: { agentId, operationId: v.string() },
    handler: (game, _now, args) => {
      const agent = game.world.agents.get(parseGameId('agents', args.agentId));
      if (agent?.inProgressOperation?.operationId === args.operationId)
        delete agent.inProgressOperation;
      return null;
    },
  }),
  npcStateUpdated: inputHandler({
    args: { agentId, stateVersion: v.number() },
    handler: (game, _now, args) => {
      const agent = game.world.agents.get(parseGameId('agents', args.agentId));
      if (agent) agent.npcStateVersion = Math.max(agent.npcStateVersion ?? 0, args.stateVersion);
      return null;
    },
  }),
  finishNpcDecision: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
      candidate: v.any(),
      jobId: v.optional(v.string()),
      expiresAt: v.number(),
      epoch: v.number(),
      stateVersion: v.number(),
    },
    handler: (game, now, args) => {
      const agent = game.world.agents.get(parseGameId('agents', args.agentId));
      const ack = (outcome: string) => {
        if (args.jobId)
          game.scheduleOperation('npcDecisionApplied', { jobId: args.jobId, outcome });
        return null;
      };
      if (!agent || agent.inProgressOperation?.operationId !== args.operationId)
        return ack('stale_operation');
      delete agent.inProgressOperation;
      if (
        now >= args.expiresAt ||
        game.npcEpoch !== args.epoch ||
        game.npcMode === 'classic' ||
        agent.npcStateVersion !== args.stateVersion
      )
        return ack('stale_state');
      const player = game.world.players.get(agent.playerId);
      if (!player) return ack('missing_player');
      const candidate = args.candidate;
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        typeof candidate.action !== 'string' ||
        (candidate.targetId !== undefined &&
          (typeof candidate.targetId !== 'string' || !/^p:\d+$/.test(candidate.targetId)))
      )
        return ack('invalid_action');
      const conversation = game.world.playerConversation(player);
      const target = candidate.targetId
        ? game.world.players.get(parseGameId('players', candidate.targetId))
        : undefined;
      if (target?.id === player.id) return ack('invalid_action');
      if (candidate.action === 'accept_invite' || candidate.action === 'reject_invite') {
        if (
          !conversation ||
          conversation.id !== candidate.conversationId ||
          conversation.participants.get(player.id)?.status.kind !== 'invited' ||
          !target ||
          !conversation.participants.has(target.id)
        )
          return ack('invalid_invitation');
        if (candidate.action === 'accept_invite') {
          conversation.acceptInvite(game, player);
          delete player.pathfinding;
        } else conversation.rejectInvite(game, now, player);
        return ack('executed');
      }
      if (conversation) return ack('busy');
      if (candidate.targetId && (!target || distance(player.position, target.position) > 10))
        return ack('target_left');
      if (candidate.action === 'start_conversation' || candidate.action === 'repair_relationship') {
        if (!target || game.world.playerConversation(target)) return ack('target_busy');
        if (
          (agent.lastConversation !== undefined &&
            now < agent.lastConversation + CONVERSATION_COOLDOWN) ||
          (agent.lastInviteAttempt !== undefined &&
            now < agent.lastInviteAttempt + CONVERSATION_COOLDOWN)
        )
          return ack('cooldown');
        const result = Conversation.start(game, now, player, target);
        agent.lastInviteAttempt = now;
        return ack(result.error ? 'invalid_action' : 'executed');
      }
      if (candidate.action === 'rest' || candidate.action === 'greet_briefly') {
        delete player.pathfinding;
        player.activity = {
          description: candidate.action === 'rest' ? 'Taking a quiet break' : 'Waving hello',
          emoji: candidate.action === 'rest' ? '🌿' : '👋',
          until: now + (candidate.action === 'rest' ? 20_000 : 5_000),
        };
        agent.npcAction = {
          candidate,
          started: now,
          startX: player.position.x,
          startY: player.position.y,
          until: player.activity.until,
        };
        return ack('executed');
      }
      if (candidate.action === 'continue_current_goal' && player.pathfinding)
        return ack('executed');
      if (['wander', 'avoid_person', 'continue_current_goal'].includes(candidate.action)) {
        const random = seededRandom(args.operationId);
        let destination = {
          x: 1 + Math.floor(random() * (game.worldMap.width - 2)),
          y: 1 + Math.floor(random() * (game.worldMap.height - 2)),
        };
        if (candidate.action === 'avoid_person' && target)
          destination = {
            x: Math.max(
              1,
              Math.min(
                game.worldMap.width - 2,
                Math.round(player.position.x + (player.position.x - target.position.x) * 2),
              ),
            ),
            y: Math.max(
              1,
              Math.min(
                game.worldMap.height - 2,
                Math.round(player.position.y + (player.position.y - target.position.y) * 2),
              ),
            ),
          };
        movePlayer(game, now, player, destination);
        agent.npcAction = {
          candidate,
          started: now,
          startX: player.position.x,
          startY: player.position.y,
        };
        return ack('executed');
      }
      return ack('invalid_action');
    },
  }),
  finishRememberConversation: inputHandler({
    args: {
      operationId: v.string(),
      agentId,
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} isn't remembering ${args.operationId}`);
      } else {
        delete agent.inProgressOperation;
        delete agent.toRemember;
      }
      return null;
    },
  }),
  finishDoSomething: inputHandler({
    args: {
      operationId: v.string(),
      agentId: v.id('agents'),
      destination: v.optional(point),
      invitee: v.optional(v.id('players')),
      activity: v.optional(activity),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} didn't have ${args.operationId} in progress`);
        return null;
      }
      delete agent.inProgressOperation;
      const player = game.world.players.get(agent.playerId)!;
      if (args.invitee) {
        const inviteeId = parseGameId('players', args.invitee);
        const invitee = game.world.players.get(inviteeId);
        if (!invitee) {
          throw new Error(`Couldn't find player: ${inviteeId}`);
        }
        Conversation.start(game, now, player, invitee);
        agent.lastInviteAttempt = now;
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      }
      if (args.activity) {
        player.activity = args.activity;
      }
      return null;
    },
  }),
  agentFinishSendingMessage: inputHandler({
    args: {
      agentId,
      conversationId,
      timestamp: v.number(),
      operationId: v.string(),
      leaveConversation: v.boolean(),
    },
    handler: (game, now, args) => {
      const agentId = parseGameId('agents', args.agentId);
      const agent = game.world.agents.get(agentId);
      if (!agent) {
        throw new Error(`Couldn't find agent: ${agentId}`);
      }
      const player = game.world.players.get(agent.playerId);
      if (!player) {
        throw new Error(`Couldn't find player: ${agent.playerId}`);
      }
      const conversationId = parseGameId('conversations', args.conversationId);
      const conversation = game.world.conversations.get(conversationId);
      if (!conversation) {
        throw new Error(`Couldn't find conversation: ${conversationId}`);
      }
      if (
        !agent.inProgressOperation ||
        agent.inProgressOperation.operationId !== args.operationId
      ) {
        console.debug(`Agent ${agentId} wasn't sending a message ${args.operationId}`);
        return null;
      }
      delete agent.inProgressOperation;
      conversationInputs.finishSendingMessage.handler(game, now, {
        playerId: agent.playerId,
        conversationId: args.conversationId,
        timestamp: args.timestamp,
      });
      if (args.leaveConversation) {
        conversation.leave(game, now, player);
      }
      return null;
    },
  }),
  createAgent: inputHandler({
    args: {
      descriptionIndex: v.number(),
    },
    handler: (game, now, args) => {
      const description = Descriptions[args.descriptionIndex];
      const playerId = Player.join(
        game,
        now,
        description.name,
        description.character,
        description.identity,
      );
      const agentId = game.allocId('agents');
      game.world.agents.set(
        agentId,
        new Agent({
          id: agentId,
          playerId: playerId,
          inProgressOperation: undefined,
          lastConversation: undefined,
          lastInviteAttempt: undefined,
          toRemember: undefined,
        }),
      );
      game.agentDescriptions.set(
        agentId,
        new AgentDescription({
          agentId: agentId,
          identity: description.identity,
          plan: description.plan,
        }),
      );
      return { agentId };
    },
  }),
};
