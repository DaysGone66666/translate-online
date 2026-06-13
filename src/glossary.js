(function initTranslateOnlineGlossary(globalScope) {
  const HLTV_EN_ZH_CN = Object.freeze([
    ['Player of the week', '本周最佳选手'],
    ["Today's matches", '今日比赛'],
    ["Today's news", '今日新闻'],
    ['Complete ranking', '完整排名'],
    ['Event calendar', '赛事日历'],
    ['Recent activity', '近期动态'],
    ['View your pickems', '查看你的竞猜结果'],
    ['Best of 1', '一局定胜负'],
    ['Best of 3', '三局两胜'],
    ['Best of 5', '五局三胜'],
    ['Group stage', '小组赛'],
    ['Upper bracket', '胜者组'],
    ['Lower bracket', '败者组'],
    ['Player of the match', '本场最佳选手'],
    ['Overview', '概览'],
    ['Matches', '比赛'],
    ['Results', '赛果'],
    ['Stats', '数据统计'],
    ['Ranking', '排名'],
    ['Events', '赛事'],
    ['Players', '选手'],
    ['Teams', '战队'],
    ['News', '新闻'],
    ['Live', '直播'],
    ['Stage', '阶段'],
    ['Playoffs', '淘汰赛'],
    ['Elimination', '淘汰'],
    ['Qualifier', '预选赛'],
    ['Grand final', '总决赛'],
    ['Semi-final', '半决赛'],
    ['Quarter-final', '四分之一决赛']
  ].map(([source, target]) => Object.freeze({ source, target })));

  function parseGlossaryEntries(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 1) return null;
        const source = line.slice(0, separatorIndex).trim();
        const target = line.slice(separatorIndex + 1).trim();
        return source && target ? { source, target } : null;
      })
      .filter(Boolean);
  }

  function isHltvHostname(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    return normalized === 'hltv.org' || normalized.endsWith('.hltv.org');
  }

  function getGlossaryEntries(hostname, sourceLang, targetLang, customGlossary) {
    if (sourceLang !== 'en' || targetLang !== 'zh-CN') return [];

    const entriesBySource = new Map();
    if (isHltvHostname(hostname)) {
      HLTV_EN_ZH_CN.forEach(entry => {
        entriesBySource.set(entry.source.toLowerCase(), { ...entry });
      });
    }
    parseGlossaryEntries(customGlossary).forEach(entry => {
      entriesBySource.set(entry.source.toLowerCase(), entry);
    });

    return [...entriesBySource.values()]
      .sort((a, b) => b.source.length - a.source.length);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function termPattern(source, global) {
    return new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(source)}(?![\\p{L}\\p{N}])`,
      global ? 'giu' : 'iu'
    );
  }

  function findExactGlossaryTranslation(text, entries) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const entry = entries.find(item => item.source.toLowerCase() === normalized);
    return entry ? entry.target : null;
  }

  function findGlossaryMatches(text, entries) {
    const value = String(text || '');
    const occupiedRanges = [];
    const matches = [];

    for (const entry of entries) {
      const pattern = termPattern(entry.source, true);
      let match;
      while ((match = pattern.exec(value)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const overlaps = occupiedRanges.some(range => start < range.end && end > range.start);
        if (!overlaps) {
          occupiedRanges.push({ start, end });
          matches.push({ ...entry });
          break;
        }
      }
    }

    return matches;
  }

  function applyGlossaryCorrections(text, entries) {
    return entries.reduce(
      (result, entry) => result.replace(termPattern(entry.source, true), entry.target),
      String(text || '')
    );
  }

  function formatGlossaryInstruction(entries) {
    if (!entries.length) return '';
    const lines = entries.map(entry => `${entry.source} => ${entry.target}`);
    return `Use these required term translations when they appear:\n${lines.join('\n')}`;
  }

  const api = {
    applyGlossaryCorrections,
    findExactGlossaryTranslation,
    findGlossaryMatches,
    formatGlossaryInstruction,
    getGlossaryEntries,
    parseGlossaryEntries
  };

  globalScope.TranslateOnlineGlossary = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
