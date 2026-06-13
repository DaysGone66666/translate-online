const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyGlossaryCorrections,
  findExactGlossaryTranslation,
  findGlossaryMatches,
  getGlossaryEntries,
  parseGlossaryEntries
} = require('../src/glossary.js');

test('uses built-in HLTV terms only for English to Simplified Chinese on HLTV', () => {
  const hltvEntries = getGlossaryEntries('www.hltv.org', 'en', 'zh-CN', '');
  const otherSiteEntries = getGlossaryEntries('example.com', 'en', 'zh-CN', '');

  assert.equal(findExactGlossaryTranslation('Player of the week', hltvEntries), '本周最佳选手');
  assert.equal(findExactGlossaryTranslation('Player of the week', otherSiteEntries), null);
  assert.deepEqual(getGlossaryEntries('www.hltv.org', 'en', 'ja', ''), []);
});

test('parses custom terms and lets them override built-in terms', () => {
  assert.deepEqual(parseGlossaryEntries('# comment\nStats = 战绩数据\ninvalid'), [
    { source: 'Stats', target: '战绩数据' }
  ]);

  const entries = getGlossaryEntries('hltv.org', 'en', 'zh-CN', 'Stats = 战绩数据');
  assert.equal(findExactGlossaryTranslation('Stats', entries), '战绩数据');
});

test('matches complete terms without changing text inside longer identifiers', () => {
  const entries = getGlossaryEntries('hltv.org', 'en', 'zh-CN', '');

  assert.deepEqual(
    findGlossaryMatches('The group stage includes Stats and StatsPanel.', entries),
    [
      { source: 'Group stage', target: '小组赛' },
      { source: 'Stats', target: '数据统计' }
    ]
  );
  assert.equal(
    applyGlossaryCorrections('Stats remain visible in StatsPanel.', entries),
    '数据统计 remain visible in StatsPanel.'
  );
});
