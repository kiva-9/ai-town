import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLocale, LOCALE_KEY, messages, readLocale, t } from './i18n.js';

test('editor dictionary covers both languages and uses the game preference', () => {
  assert.equal(LOCALE_KEY, 'ai-town.locale');
  for (const translations of Object.values(messages)) {
    assert.equal(translations.length, 2);
    assert.ok(translations.every((text) => typeof text === 'string' && text.length > 0));
  }
});

test('defaults to Chinese and survives unavailable storage', () => {
  globalThis.localStorage = { getItem() { throw new Error('Storage blocked'); } };
  assert.equal(readLocale(), 'zh-CN');
  globalThis.localStorage = { getItem: () => 'en' };
  assert.equal(readLocale(), 'en');
  globalThis.localStorage = { getItem: () => 'unsupported' };
  assert.equal(readLocale(), 'zh-CN');
  delete globalThis.localStorage;
});

test('switches labels, accessibility text and page language without reloading', () => {
  const label = { dataset: { i18n: 'saveComposite' }, textContent: '' };
  const canvas = { dataset: { i18nLabel: 'background' }, setAttribute(name, value) { this[name] = value; } };
  const selector = { value: '' };
  globalThis.document = {
    documentElement: { lang: '' },
    querySelectorAll: (query) => query === '[data-i18n]' ? [label] : [canvas],
    getElementById: () => selector,
  };
  applyLocale('en');
  assert.equal(label.textContent, 'Save composite');
  assert.equal(canvas['aria-label'], 'Background layer');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(selector.value, 'en');
  applyLocale('zh-CN');
  assert.equal(label.textContent, '保存合成图');
  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(t('fileError'), '读取文件失败，请检查文件后重试。');
  delete globalThis.document;
});
