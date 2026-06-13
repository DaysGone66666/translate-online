const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STORAGE_KEYS,
  createUniqueTextBatch,
  detectLang,
  expandUniqueResults,
  formatLanguagePair,
  isSiteDisabled,
  normalizeApiBaseUrl,
  parseTranslationBatchContent,
  parseDisabledSites,
  prepareText,
  toOriginPattern
} = require('../src/shared.js');

test('defines an exact storage key for the user-selected source language', () => {
  assert.equal(STORAGE_KEYS.ACTIVE_PROVIDER, 'active_provider');
  assert.equal(STORAGE_KEYS.PROVIDER_CONFIGS, 'provider_configs');
  assert.equal(STORAGE_KEYS.PROVIDER_API_KEYS, 'provider_api_keys');
  assert.equal(STORAGE_KEYS.SOURCE_LANG, 'source_language');
  assert.equal(STORAGE_KEYS.FLOATING_TOOLBAR_TOP, 'floating_toolbar_top');
});

test('normalizes supported API base URLs and creates exact origin patterns', () => {
  assert.equal(normalizeApiBaseUrl('https://api.deepseek.com/'), 'https://api.deepseek.com');
  assert.equal(normalizeApiBaseUrl('https://example.com/api/'), 'https://example.com/api');
  assert.equal(toOriginPattern('https://example.com/api'), 'https://example.com/*');
  assert.throws(() => normalizeApiBaseUrl('ftp://example.com'), /HTTP/);
});

test('parses disabled sites and matches subdomains', () => {
  assert.deepEqual(
    parseDisabledSites('Example.com\nhttps://news.example.org/path\nexample.com'),
    ['example.com', 'news.example.org']
  );
  assert.equal(isSiteDisabled('docs.example.com', ['example.com']), true);
  assert.equal(isSiteDisabled('example.net', ['example.com']), false);
});

test('detects common source languages and formats the language pair', () => {
  assert.equal(detectLang('Hello world'), 'en');
  assert.equal(detectLang('こんにちは'), 'ja');
  assert.equal(detectLang('你好世界'), 'zh-CN');
  assert.equal(formatLanguagePair('ja', 'zh-CN'), '日本語 → 简体中文');
});

test('prepares long text without silently hiding truncation', () => {
  const result = prepareText('a'.repeat(2001), 2000);
  assert.equal(result.text.length, 2000);
  assert.equal(result.truncated, true);
  assert.equal(prepareText('short', 2000).truncated, false);
});

test('deduplicates batch text and restores results to the original order', () => {
  const batch = createUniqueTextBatch(['Stats', 'Live', 'Stats']);

  assert.deepEqual(batch, {
    uniqueTexts: ['Stats', 'Live'],
    indexes: [0, 1, 0]
  });
  assert.deepEqual(
    expandUniqueResults(
      [{ success: true, text: '数据' }, { success: true, text: '直播' }],
      batch.indexes
    ),
    [
      { success: true, text: '数据' },
      { success: true, text: '直播' },
      { success: true, text: '数据' }
    ]
  );
});

test('accepts only a complete ordered JSON array from a batch translation response', () => {
  assert.deepEqual(
    parseTranslationBatchContent('```json\n["数据","直播"]\n```', 2),
    ['数据', '直播']
  );
  assert.equal(parseTranslationBatchContent('["数据"]', 2), null);
  assert.equal(parseTranslationBatchContent('not json', 2), null);
});
