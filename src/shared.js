(function initTranslateOnlineShared(globalScope) {
  const STORAGE_KEYS = Object.freeze({
    ACTIVE_PROVIDER: 'active_provider',
    PROVIDER_CONFIGS: 'provider_configs',
    PROVIDER_API_KEYS: 'provider_api_keys',
    DEEPSEEK_KEY: 'deepseek_api_key',
    ENGINE: 'translation_engine',
    SOURCE_LANG: 'source_language',
    TARGET_LANG: 'target_language',
    MODEL: 'deepseek_model',
    HISTORY: 'translation_history',
    API_URL: 'deepseek_api_url',
    CONTEXT_MENU: 'trigger_context_menu',
    AUTO_TRANSLATE: 'trigger_auto_translate',
    CUSTOM_GLOSSARY: 'custom_glossary_entries',
    DISABLED_SITES: 'disabled_sites',
    FLOATING_TOOLBAR_TOP: 'floating_toolbar_top'
  });

  const LANGUAGE_LABELS = Object.freeze({
    auto: '自动检测',
    ar: 'العربية',
    de: 'Deutsch',
    el: 'Ελληνικά',
    en: 'English',
    es: 'Español',
    fr: 'Français',
    ja: '日本語',
    ko: '한국어',
    ru: 'Русский',
    th: 'ไทย',
    'zh-CN': '简体中文',
    'zh-TW': '繁体中文'
  });

  function detectLang(text) {
    if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';
    if (/[一-鿿㐀-䶿]/.test(text)) {
      return 'zh-CN';
    }
    if (/[가-힯]/.test(text)) return 'ko';
    if (/[Ѐ-ӿ]/.test(text)) return 'ru';
    if (/[؀-ۿ]/.test(text)) return 'ar';
    if (/[Ͱ-Ͽ]/.test(text)) return 'el';
    if (/[฀-๿]/.test(text)) return 'th';
    return 'en';
  }

  function formatLanguagePair(sourceLang, targetLang) {
    const source = LANGUAGE_LABELS[sourceLang] || sourceLang || LANGUAGE_LABELS.auto;
    const target = LANGUAGE_LABELS[targetLang] || targetLang;
    return `${source} → ${target}`;
  }

  function normalizeApiBaseUrl(value) {
    let url;
    try {
      url = new URL(String(value || '').trim());
    } catch {
      throw new Error('API 地址格式无效');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('API 地址必须使用 HTTP 或 HTTPS');
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }

  function toOriginPattern(value) {
    const url = new URL(normalizeApiBaseUrl(value));
    return `${url.origin}/*`;
  }

  function normalizeHostname(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      return url.hostname.replace(/\.$/, '');
    } catch {
      return '';
    }
  }

  function parseDisabledSites(value) {
    const lines = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
    return [...new Set(lines.map(normalizeHostname).filter(Boolean))];
  }

  function isSiteDisabled(hostname, disabledSites) {
    const current = normalizeHostname(hostname);
    return parseDisabledSites(disabledSites).some(site =>
      current === site || current.endsWith(`.${site}`)
    );
  }

  function prepareText(value, maxLength = 2000) {
    const original = String(value || '');
    return {
      text: original.slice(0, maxLength),
      truncated: original.length > maxLength
    };
  }

  function createUniqueTextBatch(texts) {
    const uniqueTexts = [];
    const indexes = [];
    const indexByText = new Map();

    for (const value of texts) {
      const text = String(value || '');
      if (!indexByText.has(text)) {
        indexByText.set(text, uniqueTexts.length);
        uniqueTexts.push(text);
      }
      indexes.push(indexByText.get(text));
    }

    return { uniqueTexts, indexes };
  }

  function expandUniqueResults(uniqueResults, indexes) {
    return indexes.map(index => uniqueResults[index]);
  }

  function parseTranslationBatchContent(content, expectedLength) {
    const normalized = String(content || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      const parsed = JSON.parse(normalized);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== expectedLength ||
        !parsed.every(value => typeof value === 'string')
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  const api = {
    LANGUAGE_LABELS,
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
  };

  globalScope.TranslateOnlineShared = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
