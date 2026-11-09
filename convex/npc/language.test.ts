import { Descriptions } from '../../data/characters';
import {
  languageInstruction,
  localizeCharacterText,
  localizedName,
  mockDialogue,
  npcLanguage,
} from './language';

describe('NPC language', () => {
  test('defaults to simplified Chinese and supports explicit English', () => {
    expect(npcLanguage()).toBe('zh-CN');
    expect(npcLanguage('zh-CN')).toBe('zh-CN');
    expect(npcLanguage('')).toBe('zh-CN');
    expect(npcLanguage('unknown')).toBe('zh-CN');
    expect(npcLanguage(' en ')).toBe('en');
  });

  test('adds translations to the original twelve residents, preserving canonical names', () => {
    expect(Descriptions.map(({ name }) => name)).toEqual([
      'Lucky',
      'Bob',
      'Stella',
      'Alice',
      'Pete',
      'Mira',
      'Theo',
      'June',
      'Arun',
      'Nora',
      'Felix',
      'Iris',
    ]);
    for (const character of Descriptions) {
      expect(character.nameZh).toMatch(/[\u4e00-\u9fff]/);
      expect(character.identityZh).toMatch(/[\u4e00-\u9fff]/);
      expect(character.planZh).toMatch(/[\u4e00-\u9fff]/);
      expect(localizedName(character.name)).toBe(character.nameZh);
      expect(localizedName(character.name, 'en')).toBe(character.name);
      expect(localizeCharacterText(character.identity)).toBe(character.identityZh);
      expect(localizeCharacterText(character.plan)).toBe(character.planZh);
      expect(localizeCharacterText(character.identity, 'en')).toBe(character.identity);
      expect(localizeCharacterText(character.plan, 'en')).toBe(character.plan);
    }
  });

  test('does not overwrite custom names, translated names, or edited identities', () => {
    expect(localizedName('p:123')).toBe('p:123');
    expect(localizedName('自定义角色')).toBe('自定义角色');
    expect(localizedName('乐奇')).toBe('乐奇');
    expect(localizeCharacterText('Lucky is a custom character.')).toBe(
      'Lucky is a custom character.',
    );
  });

  test('language guidance preserves security and protocol requirements', () => {
    const chinese = languageInstruction('zh-CN');
    expect(chinese).toContain('简体中文');
    expect(chinese).toContain('不可信');
    expect(chinese).toContain('ID');
    expect(chinese).toContain('字段名');
    expect(languageInstruction('en')).toContain('English');
    expect(languageInstruction('en')).toContain('untrusted');
  });

  test.each(['start', 'continue', 'leave'] as const)(
    '%s fixtures use the selected language',
    (type) => {
      expect(mockDialogue(type, npcLanguage())).toMatch(/^【模拟对话】[\u4e00-\u9fff]/);
      expect(mockDialogue(type, 'en')).toMatch(/^\[Mock dialogue\] /);
      expect(mockDialogue(type, 'en')).not.toMatch(/[\u4e00-\u9fff]/);
    },
  );
});
