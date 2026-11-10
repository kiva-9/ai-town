import { readFileSync } from 'node:fs';
import {
  characterDescription,
  characterName,
  getLocale,
  label,
  LOCALE_STORAGE_KEY,
  messages,
  readLocale,
  recordedText,
  setLocale,
  translate,
} from './i18n';
import { Descriptions } from '../data/characters';
import { initialState, makeCandidates } from '../convex/npc/core';

describe('Chinese and English UI', () => {
  afterEach(() => setLocale('zh-CN'));
  test('defaults to Chinese, accepts only supported saved locale, tolerates storage failure', () => {
    expect(readLocale()).toBe('zh-CN');
    expect(readLocale({ getItem: (key) => (key === LOCALE_STORAGE_KEY ? 'en' : null) })).toBe('en');
    expect(readLocale({ getItem: () => 'fr' })).toBe('zh-CN');
    expect(
      readLocale({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('zh-CN');
  });
  test('locale switches affect non-React callers and interpolation in both languages', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(translate('Help')).toBe('Help');
    setLocale('zh-CN');
    expect(translate('Help')).toBe('帮助');
    expect(translate('{name} joined the conversation.', 'zh-CN', { name: '乐奇' })).toBe(
      '乐奇 加入了对话。',
    );
  });
  test('every dictionary entry has non-empty Chinese and preserves interpolation tokens', () => {
    for (const [english, chinese] of Object.entries(messages)) {
      expect(chinese.trim().length).toBeGreaterThan(0);
      expect([...chinese.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort()).toEqual(
        [...english.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
      );
    }
  });
  test('model diagnostics and execution statuses are translated', () => {
    for (const code of [
      'input_budget',
      'cache',
      'budget_fallback',
      'lease_expired',
      'invalidated',
      'single_candidate',
      'choice',
      'predicate',
      'score',
      'refusal',
      'authentication',
      'billing_quota',
      'missing_key',
      'pricing_unavailable',
      'low_confidence',
      'invalid_request',
      'timeout',
      'network_error',
      'rate_limited',
      'service_unavailable',
      'http_error',
      'invalid_response',
      'worker_error',
      'A conversation invitation was declined.',
      'Completed a shared conversation. This records contact, not inferred sentiment.',
    ])
      expect(label(code, 'zh-CN')).not.toBe(code);
  });
  test('current protocol enums and execution outcomes have explicit dictionary entries', () => {
    const core = readFileSync('convex/npc/core.ts', 'utf8');
    const transport = readFileSync('convex/npc/decisionsClient.ts', 'utf8');
    for (const [source, type] of [
      [core, 'NpcAction'],
      [core, 'GoalKind'],
      [core, 'SocialEventKind'],
      [transport, 'DecisionFallbackReason'],
    ]) {
      const declaration = source.match(new RegExp(`export type ${type} =\\s*([\\s\\S]*?);`))?.[1];
      expect(declaration).toBeDefined();
      for (const match of declaration!.matchAll(/'([^']+)'/g))
        expect(Object.prototype.hasOwnProperty.call(messages, match[1])).toBe(true);
    }
    const execution = readFileSync('convex/aiTown/agentInputs.ts', 'utf8');
    for (const match of execution.matchAll(/ack\('([^']+)'\)/g))
      expect(Object.prototype.hasOwnProperty.call(messages, match[1])).toBe(true);
  });
  test('default human text translates exactly and custom text is preserved', () => {
    expect(characterName('Me', 'zh-CN')).toBe('我');
    expect(characterDescription('Me', 'Me is a human player', 'zh-CN')).toBe('真人玩家');
    expect(characterDescription('Me', 'Me is a human player who writes novels', 'zh-CN')).toBe(
      'Me is a human player who writes novels',
    );
  });
  test('free-form records remain verbatim and are marked as original', () => {
    expect(recordedText('myCamelCase_private note', 'zh-CN')).toEqual({
      text: 'myCamelCase_private note',
      original: true,
    });
    expect(recordedText('A conversation invitation was declined.', 'zh-CN')).toEqual({
      text: '一次对话邀请被拒绝了。',
      original: false,
    });
  });
  test('all original residents have translations without changing canonical identities', () => {
    expect(Descriptions).toHaveLength(12);
    for (const resident of Descriptions) {
      expect(characterName(resident.name, 'en')).toBe(resident.name);
      expect(characterName(resident.name, 'zh-CN')).toBe(resident.nameZh);
      expect(characterDescription(resident.name, resident.identity, 'zh-CN')).toBe(
        resident.identityZh,
      );
    }
    expect(characterName('Visitor', 'zh-CN')).toBe('Visitor');
    expect(characterDescription('Lucky', 'My customized character', 'zh-CN')).toBe(
      'My customized character',
    );
  });
  test('personality, actions and deterministic reasons have Chinese labels; unknown labels fall back', () => {
    const state = initialState('Lucky', 0);
    for (const trait of Object.keys(state.personality))
      expect(label(trait, 'zh-CN')).not.toBe(trait);
    const candidates = makeCandidates({
      state,
      now: 0,
      nearby: [{ playerId: 'p:1', available: true }],
    });
    for (const candidate of candidates) {
      expect(label(candidate.action, 'zh-CN')).not.toBe(candidate.action);
      expect(label(candidate.reason, 'zh-CN')).not.toBe(candidate.reason);
    }
    expect(label('future_action', 'zh-CN')).toBe('future action');
    expect(label('start_conversation', 'en')).toBe('start conversation');
  });
});
