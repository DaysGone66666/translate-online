importScripts('shared.js', 'providers.js', 'provider-adapters.js', 'glossary.js');

const {
  STORAGE_KEYS,
  createUniqueTextBatch,
  detectLang,
  expandUniqueResults,
  prepareText,
  toOriginPattern
} = TranslateOnlineShared;

const {
  getDefaultProviderConfig,
  getProvider,
  getProviderDisplayName,
  isProviderConfigured,
  mergeProviderConfig
} = TranslateOnlineProviders;

const {
  requestProviderBatchTranslation,
  requestProviderTranslation
} = TranslateOnlineProviderAdapters;

const {
  applyGlossaryCorrections,
  findExactGlossaryTranslation,
  findGlossaryMatches,
  formatGlossaryInstruction,
  getGlossaryEntries
} = TranslateOnlineGlossary;

const MAX_CACHE_ENTRIES = 300;
const BATCH_ITEM_CONCURRENCY = 2;
const requestControllers = new Map();
const translationCache = new Map();
let translationConfigPromise = null;
let translationConfigVersion = 0;

async function protectLocalStorage() {
  if (typeof chrome.storage.local.setAccessLevel !== 'function') return;
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Older Chromium versions may not support restricting storage access.
  }
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function migrateProviderSettings() {
  const [syncStorage, localStorage] = await Promise.all([
    chrome.storage.sync.get([
      STORAGE_KEYS.ACTIVE_PROVIDER,
      STORAGE_KEYS.PROVIDER_CONFIGS,
      STORAGE_KEYS.ENGINE,
      STORAGE_KEYS.MODEL,
      STORAGE_KEYS.API_URL,
      STORAGE_KEYS.DEEPSEEK_KEY
    ]),
    chrome.storage.local.get([
      STORAGE_KEYS.PROVIDER_API_KEYS,
      STORAGE_KEYS.DEEPSEEK_KEY
    ])
  ]);

  const syncUpdates = {};
  const localUpdates = {};

  if (!hasOwn(syncStorage, STORAGE_KEYS.ACTIVE_PROVIDER)) {
    syncUpdates[STORAGE_KEYS.ACTIVE_PROVIDER] =
      syncStorage[STORAGE_KEYS.ENGINE] === 'deepseek' ? 'deepseek' : 'mymemory';
  }

  const providerConfigs = syncStorage[STORAGE_KEYS.PROVIDER_CONFIGS] &&
    typeof syncStorage[STORAGE_KEYS.PROVIDER_CONFIGS] === 'object'
    ? { ...syncStorage[STORAGE_KEYS.PROVIDER_CONFIGS] }
    : {};
  const hasLegacyProviderSettings = [
    STORAGE_KEYS.ENGINE,
    STORAGE_KEYS.MODEL,
    STORAGE_KEYS.API_URL,
    STORAGE_KEYS.DEEPSEEK_KEY
  ].some(key => hasOwn(syncStorage, key)) ||
    hasOwn(localStorage, STORAGE_KEYS.DEEPSEEK_KEY);
  if (hasLegacyProviderSettings && !hasOwn(providerConfigs, 'deepseek')) {
    const deepSeekConfig = getDefaultProviderConfig('deepseek');
    if (hasOwn(syncStorage, STORAGE_KEYS.MODEL)) {
      deepSeekConfig.model = String(syncStorage[STORAGE_KEYS.MODEL] || '').trim();
    }
    if (hasOwn(syncStorage, STORAGE_KEYS.API_URL)) {
      deepSeekConfig.apiUrl = String(syncStorage[STORAGE_KEYS.API_URL] || '').trim();
    }
    deepSeekConfig.connectionStatus = 'untested';
    providerConfigs.deepseek = deepSeekConfig;
    syncUpdates[STORAGE_KEYS.PROVIDER_CONFIGS] = providerConfigs;
  }

  const providerApiKeys = localStorage[STORAGE_KEYS.PROVIDER_API_KEYS] &&
    typeof localStorage[STORAGE_KEYS.PROVIDER_API_KEYS] === 'object'
    ? { ...localStorage[STORAGE_KEYS.PROVIDER_API_KEYS] }
    : {};
  if (!hasOwn(providerApiKeys, 'deepseek')) {
    const legacyKey = localStorage[STORAGE_KEYS.DEEPSEEK_KEY] ||
      syncStorage[STORAGE_KEYS.DEEPSEEK_KEY];
    if (legacyKey) {
      providerApiKeys.deepseek = legacyKey;
      localUpdates[STORAGE_KEYS.PROVIDER_API_KEYS] = providerApiKeys;
    }
  }

  if (Object.keys(syncUpdates).length > 0) {
    await chrome.storage.sync.set(syncUpdates);
  }
  if (Object.keys(localUpdates).length > 0) {
    await chrome.storage.local.set(localUpdates);
  }

  await Promise.all([
    chrome.storage.sync.remove([
      STORAGE_KEYS.ENGINE,
      STORAGE_KEYS.MODEL,
      STORAGE_KEYS.API_URL,
      STORAGE_KEYS.DEEPSEEK_KEY
    ]),
    chrome.storage.local.remove(STORAGE_KEYS.DEEPSEEK_KEY)
  ]);
}

protectLocalStorage();
let providerMigrationError = null;
const initialProviderMigration = migrateProviderSettings().catch(error => {
  providerMigrationError = error;
  console.error('Provider settings migration failed', error);
});

function makeMigrationFailedError() {
  const error = new Error('设置迁移失败，请重新加载扩展后重试');
  error.code = 'migration_failed';
  return error;
}

async function awaitProviderMigration() {
  await initialProviderMigration;
  if (providerMigrationError) {
    throw makeMigrationFailedError();
  }
}

function getKnownProvider(providerId) {
  try {
    return getProvider(providerId);
  } catch {
    const error = new Error(`未知供应商：${providerId}`);
    error.code = 'unknown_provider';
    throw error;
  }
}

function invalidateTranslationConfig() {
  translationConfigVersion += 1;
  translationConfigPromise = null;
  translationCache.clear();
}

async function loadTranslationConfig() {
  await awaitProviderMigration();
  if (!translationConfigPromise) {
    const readVersion = translationConfigVersion;
    translationConfigPromise = Promise.all([
      chrome.storage.sync.get([
        STORAGE_KEYS.ACTIVE_PROVIDER,
        STORAGE_KEYS.PROVIDER_CONFIGS,
        STORAGE_KEYS.SOURCE_LANG,
        STORAGE_KEYS.TARGET_LANG,
        STORAGE_KEYS.CUSTOM_GLOSSARY
      ]),
      chrome.storage.local.get([STORAGE_KEYS.PROVIDER_API_KEYS])
    ]).then(([syncStorage, localStorage]) => {
      if (readVersion !== translationConfigVersion) {
        return loadTranslationConfig();
      }
      const providerId = syncStorage[STORAGE_KEYS.ACTIVE_PROVIDER] || 'mymemory';
      const provider = getKnownProvider(providerId);
      const providerConfigs = syncStorage[STORAGE_KEYS.PROVIDER_CONFIGS] &&
        typeof syncStorage[STORAGE_KEYS.PROVIDER_CONFIGS] === 'object'
        ? syncStorage[STORAGE_KEYS.PROVIDER_CONFIGS]
        : {};
      const providerApiKeys = localStorage[STORAGE_KEYS.PROVIDER_API_KEYS] &&
        typeof localStorage[STORAGE_KEYS.PROVIDER_API_KEYS] === 'object'
        ? localStorage[STORAGE_KEYS.PROVIDER_API_KEYS]
        : {};
      const providerConfig = mergeProviderConfig(
        providerId,
        providerConfigs[providerId]
      );

      return {
        providerId,
        provider,
        providerConfig,
        apiKey: String(providerApiKeys[providerId] || ''),
        sourceLang: syncStorage[STORAGE_KEYS.SOURCE_LANG] || 'auto',
        targetLang: syncStorage[STORAGE_KEYS.TARGET_LANG] || 'zh-CN',
        customGlossary: syncStorage[STORAGE_KEYS.CUSTOM_GLOSSARY] || ''
      };
    });
  }

  try {
    return await translationConfigPromise;
  } catch (error) {
    invalidateTranslationConfig();
    throw error;
  }
}

function createContextMenu() {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '翻译选中文本',
    contexts: ['selection']
  }, () => {
    void chrome.runtime.lastError;
  });
}

function refreshContextMenu(enabled) {
  chrome.contextMenus.remove('translate-selection', () => {
    void chrome.runtime.lastError;
    if (enabled) createContextMenu();
  });
}

async function handleInstalled(details) {
  if (details.reason === 'install') {
    await awaitProviderMigration();
    const defaults = {
      [STORAGE_KEYS.ACTIVE_PROVIDER]: 'mymemory',
      [STORAGE_KEYS.PROVIDER_CONFIGS]: {},
      [STORAGE_KEYS.SOURCE_LANG]: 'auto',
      [STORAGE_KEYS.TARGET_LANG]: 'zh-CN',
      [STORAGE_KEYS.AUTO_TRANSLATE]: true,
      [STORAGE_KEYS.CONTEXT_MENU]: true,
      [STORAGE_KEYS.CUSTOM_GLOSSARY]: '',
      [STORAGE_KEYS.DISABLED_SITES]: []
    };
    const storage = await chrome.storage.sync.get(Object.keys(defaults));
    const missingDefaults = {};
    Object.entries(defaults).forEach(([key, value]) => {
      if (!hasOwn(storage, key)) {
        missingDefaults[key] = value;
      }
    });
    if (Object.keys(missingDefaults).length > 0) {
      await chrome.storage.sync.set(missingDefaults);
    }
    chrome.tabs.create({ url: 'src/options.html' });
  }

  const storage = await chrome.storage.sync.get([STORAGE_KEYS.CONTEXT_MENU]);
  refreshContextMenu(storage[STORAGE_KEYS.CONTEXT_MENU] !== false);
}

chrome.runtime.onInstalled.addListener((details) => {
  handleInstalled(details).catch(error => {
    console.error('Extension install initialization failed', error);
  });
});

function makeCacheKey(
  providerId,
  text,
  sourceLang,
  targetLang,
  model,
  apiUrl,
  hostname
) {
  return [
    providerId,
    sourceLang,
    targetLang,
    model || '',
    apiUrl || '',
    hostname || '',
    text
  ].join('\u0000');
}

function readCachedTranslation(key) {
  const value = translationCache.get(key);
  if (!value) return null;
  translationCache.delete(key);
  translationCache.set(key, value);
  return { ...value };
}

function cacheTranslation(key, value) {
  translationCache.set(key, { ...value });
  if (translationCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }
}

function makeAbortResult() {
  return { success: false, error: 'cancelled', message: '翻译已取消' };
}

function makeNetworkError(error) {
  if (error && error.name === 'AbortError') return makeAbortResult();
  return {
    success: false,
    error: error?.code || 'network_error',
    message: error?.message || '网络请求失败'
  };
}

function makeInvalidConfigResult(config) {
  const providerName = getProviderDisplayName(
    config.providerId,
    config.providerConfig
  );
  return {
    success: false,
    error: 'invalid_config',
    message: `${providerName} 配置不完整，请打开设置补充 API Key、模型和 API 地址`,
    needsConfig: true
  };
}

function validateProviderConfig(config) {
  if (!isProviderConfigured(
    config.providerId,
    config.providerConfig,
    config.apiKey
  )) {
    return makeInvalidConfigResult(config);
  }

  if (config.provider.protocol !== 'mymemory') {
    try {
      toOriginPattern(config.providerConfig.apiUrl);
    } catch {
      return makeInvalidConfigResult(config);
    }
  }

  return null;
}

function containsPermission(permission) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = value => {
      if (settled) return;
      settled = true;
      resolve(Boolean(value));
    };
    const rejectOnce = error => {
      if (settled) return;
      settled = true;
      const permissionError = new Error('API 权限检查失败');
      permissionError.code = 'permission_check_failed';
      permissionError.cause = error;
      reject(permissionError);
    };
    const callback = value => {
      if (chrome.runtime.lastError) {
        rejectOnce(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolveOnce(value);
    };

    try {
      const result = chrome.permissions.contains(permission, callback);
      if (result && typeof result.then === 'function') {
        result.then(resolveOnce, rejectOnce);
      }
    } catch (error) {
      rejectOnce(error);
    }
  });
}

async function validateProviderAccess(config, configValidated = false) {
  if (!configValidated) {
    const invalidConfig = validateProviderConfig(config);
    if (invalidConfig) return invalidConfig;
  }
  if (config.provider.protocol === 'mymemory') return null;

  let granted;
  try {
    granted = await containsPermission({
      origins: [toOriginPattern(config.providerConfig.apiUrl)]
    });
  } catch {
    return {
      success: false,
      error: 'permission_check_failed',
      message: 'API 地址权限检查失败，请稍后重试'
    };
  }
  if (granted) return null;

  const providerName = getProviderDisplayName(
    config.providerId,
    config.providerConfig
  );
  return {
    success: false,
    error: 'missing_permission',
    message: `${providerName} API 地址尚未授权，请打开设置保存或测试连接`,
    needsConfig: true
  };
}

async function translateMyMemory(text, sourceLang, targetLang, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: 'rate_limited',
          message: '免费引擎请求频繁，请稍后重试或切换其他服务'
        };
      }
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        error: 'api_error',
        message: `HTTP ${response.status}: ${errorText || '请求失败'}`
      };
    }

    const data = await response.json();
    if (data.responseStatus === 200) {
      return { success: true, text: data.responseData.translatedText };
    }
    if (data.responseStatus === 429) {
      return {
        success: false,
        error: 'rate_limited',
        message: '免费引擎请求频繁，请稍后重试或切换其他服务'
      };
    }
    return {
      success: false,
      error: 'api_error',
      message: data.responseDetails || '翻译失败'
    };
  } catch (error) {
    return makeNetworkError(error);
  }
}

function adapterErrorResult(error) {
  const result = makeNetworkError(error);
  if (['unauthorized', 'forbidden', 'invalid_config'].includes(result.error)) {
    result.needsConfig = true;
  }
  return result;
}

function withTranslationMetadata(result, sourceLang, targetLang, truncated) {
  const metadata = { sourceLang, targetLang, truncated };
  if (!result.success) return { ...result, ...metadata };

  return {
    ...result,
    ...metadata,
    ...(truncated ? { _note: '原文超过 2000 字符，已截断翻译' } : {})
  };
}

function isUnchangedTranslation(sourceText, translatedText) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  return normalize(sourceText) === normalize(translatedText);
}

function createTranslationContext(rawText, config, skipUnchanged = false, hostname = '') {
  const prepared = prepareText(rawText, 2000);
  if (!prepared.text.trim()) {
    return {
      immediateResult: {
        success: false,
        error: 'empty_text',
        message: '没有可翻译的文本'
      }
    };
  }

  const detectedSourceLang = config.sourceLang === 'auto'
    ? detectLang(prepared.text)
    : config.sourceLang;
  const glossaryEntries = getGlossaryEntries(
    hostname,
    detectedSourceLang,
    config.targetLang,
    config.customGlossary
  );
  const exactTranslation = findExactGlossaryTranslation(
    prepared.text,
    glossaryEntries
  );

  if (exactTranslation !== null) {
    return {
      immediateResult: withTranslationMetadata(
        { success: true, text: exactTranslation, glossary: true },
        detectedSourceLang,
        config.targetLang,
        prepared.truncated
      )
    };
  }

  const cacheKey = makeCacheKey(
    config.providerId,
    prepared.text,
    detectedSourceLang,
    config.targetLang,
    config.providerConfig.model,
    config.providerConfig.apiUrl,
    hostname
  );

  if (detectedSourceLang === config.targetLang) {
    return {
      immediateResult: withTranslationMetadata(
        skipUnchanged
          ? { success: true, skipped: true, text: '' }
          : { success: true, text: prepared.text },
        detectedSourceLang,
        config.targetLang,
        prepared.truncated
      )
    };
  }

  const cached = readCachedTranslation(cacheKey);
  if (cached) {
    return {
      immediateResult: withTranslationMetadata(
        skipUnchanged && isUnchangedTranslation(prepared.text, cached.text)
          ? { success: true, skipped: true, text: '' }
          : cached,
        detectedSourceLang,
        config.targetLang,
        prepared.truncated
      )
    };
  }

  return {
    prepared,
    sourceLang: detectedSourceLang,
    cacheKey,
    skipUnchanged,
    glossaryMatches: findGlossaryMatches(prepared.text, glossaryEntries)
  };
}

function finishTranslation(context, result, config) {
  if (result.success && context.glossaryMatches.length > 0) {
    const correctedText = applyGlossaryCorrections(
      result.text,
      context.glossaryMatches
    );
    if (correctedText !== result.text) {
      result = { ...result, text: correctedText, glossary: true };
    }
  }

  if (
    result.success &&
    context.skipUnchanged &&
    isUnchangedTranslation(context.prepared.text, result.text)
  ) {
    return withTranslationMetadata(
      { success: true, skipped: true, text: '' },
      context.sourceLang,
      config.targetLang,
      context.prepared.truncated
    );
  }

  if (result.success) cacheTranslation(context.cacheKey, result);
  return withTranslationMetadata(
    result,
    context.sourceLang,
    config.targetLang,
    context.prepared.truncated
  );
}

async function translateContext(context, config, signal) {
  let result;
  if (config.provider.protocol === 'mymemory') {
    result = await translateMyMemory(
      context.prepared.text,
      context.sourceLang,
      config.targetLang,
      signal
    );
  } else {
    try {
      const text = await requestProviderTranslation({
        provider: config.provider,
        config: config.providerConfig,
        apiKey: config.apiKey,
        text: context.prepared.text,
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        glossaryInstruction: formatGlossaryInstruction(context.glossaryMatches),
        signal,
        fetchImpl: fetch
      });
      result = { success: true, text };
    } catch (error) {
      result = adapterErrorResult(error);
    }
  }

  return finishTranslation(context, result, config);
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function mergeGlossaryMatches(contexts) {
  const entriesBySource = new Map();
  contexts.forEach(context => {
    context.glossaryMatches.forEach(entry => {
      entriesBySource.set(entry.source.toLowerCase(), entry);
    });
  });
  return [...entriesBySource.values()];
}

async function translate(rawText, signal, existingConfig, hostname = '') {
  const config = existingConfig || await loadTranslationConfig();
  const invalidConfig = validateProviderConfig(config);
  if (invalidConfig) return invalidConfig;

  const context = createTranslationContext(rawText, config, false, hostname);
  if (context.immediateResult) return context.immediateResult;

  const accessError = await validateProviderAccess(config, true);
  if (accessError) {
    return finishTranslation(context, accessError, config);
  }
  return translateContext(context, config, signal);
}

async function translateBatch(rawTexts, signal, hostname = '') {
  if (!Array.isArray(rawTexts) || rawTexts.length === 0) {
    return {
      success: false,
      error: 'empty_batch',
      message: '没有可翻译的文本'
    };
  }

  const config = await loadTranslationConfig();
  const invalidConfig = validateProviderConfig(config);
  if (invalidConfig) return invalidConfig;

  const { uniqueTexts, indexes } = createUniqueTextBatch(rawTexts);
  const uniqueResults = new Array(uniqueTexts.length);
  const pending = [];

  uniqueTexts.forEach((text, index) => {
    const context = createTranslationContext(text, config, true, hostname);
    if (context.immediateResult) {
      uniqueResults[index] = context.immediateResult;
    } else {
      pending.push({ index, context });
    }
  });

  if (pending.length > 0) {
    const accessError = await validateProviderAccess(config, true);
    if (accessError) {
      pending.forEach(item => {
        uniqueResults[item.index] = finishTranslation(
          item.context,
          accessError,
          config
        );
      });
      return {
        success: true,
        results: expandUniqueResults(uniqueResults, indexes)
      };
    }
  }

  if (pending.length > 0 && config.provider.protocol !== 'mymemory') {
    let batchResult;
    try {
      const texts = await requestProviderBatchTranslation({
        provider: config.provider,
        config: config.providerConfig,
        apiKey: config.apiKey,
        texts: pending.map(item => item.context.prepared.text),
        sourceLang: config.sourceLang,
        targetLang: config.targetLang,
        glossaryInstruction: formatGlossaryInstruction(
          mergeGlossaryMatches(pending.map(item => item.context))
        ),
        signal,
        fetchImpl: fetch
      });
      batchResult = { success: true, texts };
    } catch (error) {
      batchResult = adapterErrorResult(error);
    }

    if (batchResult.success) {
      pending.forEach((item, index) => {
        uniqueResults[item.index] = finishTranslation(
          item.context,
          { success: true, text: batchResult.texts[index] },
          config
        );
      });
    } else if ([
      'invalid_batch_response',
      'empty_response',
      'invalid_response'
    ].includes(batchResult.error)) {
      const fallbackResults = await mapWithConcurrency(
        pending,
        BATCH_ITEM_CONCURRENCY,
        item => translateContext(item.context, config, signal)
      );
      pending.forEach((item, index) => {
        uniqueResults[item.index] = fallbackResults[index];
      });
    } else {
      pending.forEach(item => {
        uniqueResults[item.index] = finishTranslation(
          item.context,
          batchResult,
          config
        );
      });
    }
  } else if (pending.length > 0) {
    const pendingResults = await mapWithConcurrency(
      pending,
      BATCH_ITEM_CONCURRENCY,
      item => translateContext(item.context, config, signal)
    );
    pending.forEach((item, index) => {
      uniqueResults[item.index] = pendingResults[index];
    });
  }

  return {
    success: true,
    results: expandUniqueResults(uniqueResults, indexes)
  };
}

async function testProviderConnection(request) {
  const providerId = request.providerId;
  const provider = getKnownProvider(providerId);
  const providerConfig = mergeProviderConfig(providerId, request.config);
  const config = {
    providerId,
    provider,
    providerConfig,
    apiKey: String(request.apiKey || ''),
    sourceLang: 'en',
    targetLang: 'zh-CN',
    customGlossary: ''
  };
  const accessError = await validateProviderAccess(config);
  if (accessError) return accessError;

  if (provider.protocol === 'mymemory') {
    return translateMyMemory('hello', 'en', 'zh-CN');
  }

  try {
    const text = await requestProviderTranslation({
      provider,
      config: providerConfig,
      apiKey: config.apiKey,
      text: 'hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      glossaryInstruction: '',
      signal: undefined,
      fetchImpl: fetch
    });
    return { success: true, text };
  } catch (error) {
    return adapterErrorResult(error);
  }
}

function respondAsync(sendResponse, task) {
  task().then(sendResponse).catch(error => {
    sendResponse({
      success: false,
      error: error?.code || 'internal_error',
      message: error.message
    });
  });
  return true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'translate': {
      const requestId = typeof request.requestId === 'string'
        ? request.requestId
        : '';
      const controller = new AbortController();
      if (requestId) requestControllers.set(requestId, controller);

      return respondAsync(sendResponse, async () => {
        try {
          return await translate(
            request.text,
            controller.signal,
            undefined,
            request.hostname
          );
        } finally {
          if (requestId) requestControllers.delete(requestId);
        }
      });
    }

    case 'translate-batch': {
      const requestId = typeof request.requestId === 'string'
        ? request.requestId
        : '';
      const controller = new AbortController();
      if (requestId) requestControllers.set(requestId, controller);

      return respondAsync(sendResponse, async () => {
        try {
          return await translateBatch(
            request.texts,
            controller.signal,
            request.hostname
          );
        } finally {
          if (requestId) requestControllers.delete(requestId);
        }
      });
    }

    case 'test-provider-connection':
      return respondAsync(sendResponse, () => testProviderConnection(request));

    case 'cancel-translations':
      for (const requestId of request.requestIds || []) {
        requestControllers.get(requestId)?.abort();
        requestControllers.delete(requestId);
      }
      sendResponse({ success: true });
      return false;

    case 'open-sidebar':
      if (sender.tab?.id !== undefined) {
        chrome.sidePanel.open({ tabId: sender.tab.id });
      }
      return false;

    case 'get-history':
      return respondAsync(sendResponse, async () => {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
        return storage[STORAGE_KEYS.HISTORY] || [];
      });

    case 'save-to-history':
      return respondAsync(sendResponse, async () => {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
        const history = storage[STORAGE_KEYS.HISTORY] || [];
        history.unshift({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          original: request.text,
          translation: request.translation,
          sourceLang: request.sourceLang || 'auto',
          targetLang: request.targetLang || 'zh-CN',
          timestamp: Date.now()
        });
        if (history.length > 100) history.length = 100;
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
        return { success: true };
      });

    case 'delete-history-item':
      return respondAsync(sendResponse, async () => {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
        const history = (storage[STORAGE_KEYS.HISTORY] || [])
          .filter(entry => String(entry.id) !== String(request.id));
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
        return { success: true };
      });

    case 'clear-history':
      return respondAsync(sendResponse, async () => {
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
        return { success: true };
      });

    case 'open-options':
      chrome.runtime.openOptionsPage();
      return false;
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (
    info.menuItemId === 'translate-selection' &&
    info.selectionText &&
    tab?.id !== undefined
  ) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'translate-selection',
      text: info.selectionText
    }, () => {
      void chrome.runtime.lastError;
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'translate-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id === undefined) return;
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: 'translate-selection-command' },
      () => {
        void chrome.runtime.lastError;
      }
    );
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  const syncConfigChanged = areaName === 'sync' && [
    STORAGE_KEYS.ACTIVE_PROVIDER,
    STORAGE_KEYS.PROVIDER_CONFIGS,
    STORAGE_KEYS.SOURCE_LANG,
    STORAGE_KEYS.TARGET_LANG,
    STORAGE_KEYS.CUSTOM_GLOSSARY
  ].some(key => changes[key]);
  const localConfigChanged = areaName === 'local' &&
    Boolean(changes[STORAGE_KEYS.PROVIDER_API_KEYS]);
  if (syncConfigChanged || localConfigChanged) invalidateTranslationConfig();

  if (areaName === 'sync' && changes[STORAGE_KEYS.CONTEXT_MENU]) {
    refreshContextMenu(
      changes[STORAGE_KEYS.CONTEXT_MENU].newValue !== false
    );
  }
});
