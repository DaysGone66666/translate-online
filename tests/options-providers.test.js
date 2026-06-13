const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'options.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'options.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'src', 'options.js'), 'utf8');
const providers = require('../src/providers.js');
const shared = require('../src/shared.js');
const options = require('../src/options.js');

function createState(overrides = {}) {
  return {
    activeProviderId: 'mymemory',
    providerConfigs: options.createProviderDrafts({}),
    providerApiKeys: {},
    ...overrides
  };
}

function createChromeRecorder({
  sync = {},
  local = {},
  failLocalSetAt = [],
  failSyncSetAt = [],
  failLocalGet = false,
  failSyncRemove = false,
  failLocalRemoveAt = []
} = {}) {
  const writes = [];
  const removals = [];
  const operations = [];
  let localSetCount = 0;
  let syncSetCount = 0;
  let localRemoveCount = 0;
  return {
    writes,
    removals,
    operations,
    sync,
    local,
    chromeApi: {
      storage: {
        sync: {
          async set(value) {
            syncSetCount += 1;
            operations.push(`sync.set:${syncSetCount}`);
            if (failSyncSetAt.includes(syncSetCount)) {
              throw new Error('sync set failed');
            }
            writes.push({ area: 'sync', value: structuredClone(value) });
            Object.assign(sync, value);
          },
          async remove(keys) {
            operations.push('sync.remove');
            if (failSyncRemove) {
              throw new Error('sync remove failed');
            }
            removals.push({ area: 'sync', keys: [...keys] });
            for (const key of keys) delete sync[key];
          }
        },
        local: {
          async get(keys) {
            operations.push('local.get');
            if (failLocalGet) throw new Error('local get failed');
            return Object.fromEntries(keys
              .filter(key => Object.prototype.hasOwnProperty.call(local, key))
              .map(key => [key, structuredClone(local[key])]));
          },
          async set(value) {
            localSetCount += 1;
            operations.push(`local.set:${localSetCount}`);
            if (failLocalSetAt.includes(localSetCount)) {
              throw new Error('local set failed');
            }
            writes.push({ area: 'local', value: structuredClone(value) });
            Object.assign(local, value);
          },
          async remove(keys) {
            localRemoveCount += 1;
            operations.push('local.remove');
            if (failLocalRemoveAt.includes(localRemoveCount)) {
              throw new Error(`local remove ${localRemoveCount} failed`);
            }
            const list = Array.isArray(keys) ? keys : [keys];
            removals.push({ area: 'local', keys: list });
            for (const key of list) delete local[key];
          }
        }
      }
    }
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('options HTML exposes the exact provider controls and removes legacy engine UI', () => {
  for (const id of [
    'provider-search',
    'provider-grid',
    'provider-config',
    'provider-config-title',
    'provider-config-summary',
    'provider-free-note',
    'provider-display-name',
    'provider-api-key',
    'provider-model-preset',
    'provider-custom-model',
    'provider-api-url',
    'btn-test-provider',
    'provider-console-link',
    'provider-docs-link'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }

  assert.match(html, /id="provider-search"[^>]*type="search"[^>]*autocomplete="off"[^>]*placeholder="搜索供应商"/);
  assert.match(html, /id="provider-grid"[^>]*role="listbox"[^>]*aria-label="翻译服务"/);
  assert.match(html, /id="provider-config"[^>]*aria-live="polite"/);
  assert.match(html, /id="provider-api-key"[^>]*type="password"[^>]*autocomplete="off"/);
  assert.match(html, /id="provider-api-url"[^>]*type="url"/);
  assert.match(html, /id="btn-test-provider"[^>]*\bdisabled\b/);
  assert.match(html, /id="btn-save"[^>]*\bdisabled\b/);
  assert.match(html, /id="provider-console-link"[^>]*target="_blank"[^>]*rel="noreferrer"/);
  assert.doesNotMatch(html, /name="engine"/);
  assert.doesNotMatch(html, /id="deepseek-config"/);
  assert.match(html, /当前选择的服务/);
  assert.match(html, /API Key[^<]*仅保存在本机[^<]*不同步/);
});

test('options loads shared, providers, and page scripts in exact order', () => {
  const sharedIndex = html.indexOf('<script src="shared.js"></script>');
  const providersIndex = html.indexOf('<script src="providers.js"></script>');
  const optionsIndex = html.indexOf('<script src="options.js"></script>');
  assert.ok(sharedIndex >= 0);
  assert.ok(providersIndex > sharedIndex);
  assert.ok(optionsIndex > providersIndex);
  assert.equal(
    html.match(/<script src="[^"]+"><\/script>/g).join('\n'),
    [
      '<script src="shared.js"></script>',
      '<script src="providers.js"></script>',
      '<script src="options.js"></script>'
    ].join('\n')
  );
});

test('provider grid CSS defines two-column cards, selection, icons, statuses, and narrow layout', () => {
  assert.match(css, /\.provider-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*gap:\s*10px;/);
  assert.match(css, /\.provider-card\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*38px minmax\(0,\s*1fr\) auto;/);
  assert.match(css, /\.provider-card\[aria-selected="true"\]\s*\{[^}]*border-color:\s*#7dd3fc;/s);
  assert.match(css, /\.provider-card img\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*object-fit:\s*contain;/s);
  assert.match(
    css,
    /\.provider-logo\s*\{[^}]*padding:\s*4px;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.94\);/s
  );
  assert.match(css, /\.provider-status\.configured\s*\{[^}]*background:\s*#38bdf8;/s);
  assert.match(css, /\.provider-status\.success\s*\{[^}]*background:\s*#22c55e;/s);
  assert.match(css, /\.provider-status\.failed\s*\{[^}]*background:\s*#ef4444;/s);
  assert.match(css, /@media\s*\(max-width:[^)]+\)\s*\{[\s\S]*\.provider-grid\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.match(
    css,
    /@media\s*\(max-width:\s*680px\)\s*\{[\s\S]*\.provider-search-wrap\s*\{[^}]*flex-basis:\s*auto;/s
  );
  assert.match(css, /\.provider-card:focus-visible/);
});

test('options module uses the provider registry and new storage keys only for normal reads and writes', () => {
  assert.match(script, /const\s*\{\s*PROVIDER_IDS,\s*PROVIDERS,\s*getProvider,\s*getDefaultProviderConfig,\s*mergeProviderConfig,\s*resolveProviderModel,\s*isProviderConfigured,\s*getProviderDisplayName\s*\}\s*=/s);
  assert.match(script, /let activeProviderId\s*=\s*'mymemory'/);
  assert.match(script, /let providerConfigs\s*=\s*\{\}/);
  assert.match(script, /let providerApiKeys\s*=\s*\{\}/);
  assert.match(script, /STORAGE_KEYS\.ACTIVE_PROVIDER/);
  assert.match(script, /STORAGE_KEYS\.PROVIDER_CONFIGS/);
  assert.match(script, /STORAGE_KEYS\.PROVIDER_API_KEYS/);
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /\.set\(\s*\{[\s\S]{0,300}STORAGE_KEYS\.(ENGINE|MODEL|API_URL|DEEPSEEK_KEY)/);
  assert.match(script, /icon\.className = 'provider-logo'/);
  assert.match(script, /icon\.loading = 'eager'/);
  assert.match(script, /icon\.decoding = 'async'/);
  assert.match(script, /typeof globalScope\.chrome\?\.storage\?\.sync\?\.get === 'function'/);
  assert.match(script, /typeof globalScope\.chrome\.permissions\?\.contains === 'function'/);
  assert.match(script, /typeof globalScope\.chrome\.commands\?\.getAll === 'function'/);
});

test('creates exactly 12 ordered local-icon cards and filters by name, id, or custom display name', () => {
  const configs = options.createProviderDrafts({
    custom_openai: {
      displayName: 'Office Gateway',
      model: 'office-model',
      apiUrl: 'https://office.example/v1'
    }
  });
  const cards = options.buildProviderCardData(configs, {}, 'mymemory');

  assert.deepEqual(cards.map(card => card.id), providers.PROVIDER_IDS);
  assert.equal(cards.length, 12);
  assert.ok(cards.every(card => card.icon.startsWith('../images/providers/')));
  assert.ok(cards.every(card => !/^https?:/i.test(card.icon)));
  assert.deepEqual(options.filterProviderIds('deep', configs), ['deepseek']);
  assert.deepEqual(options.filterProviderIds('CUSTOM_OPENAI', configs), ['custom_openai']);
  assert.deepEqual(options.filterProviderIds('office gateway', configs), ['custom_openai']);
  assert.deepEqual(options.filterProviderIds('not-present', configs), []);
});

test('drops unknown top-level providers while preserving exact registry drafts', () => {
  const configs = options.createProviderDrafts({
    deepseek: {
      model: 'deepseek-reasoner',
      apiUrl: 'https://api.deepseek.com',
      connectionStatus: 'success'
    },
    unknown_provider: {
      model: 'must-not-survive'
    }
  });

  assert.deepEqual(Object.keys(configs), providers.PROVIDER_IDS);
  assert.equal(configs.deepseek.model, 'deepseek-reasoner');
  assert.equal(configs.deepseek.connectionStatus, 'success');
  assert.equal(configs.unknown_provider, undefined);
});

test('provider form state handles MyMemory, preset models, and custom models', () => {
  const free = options.getProviderFormState('mymemory', providers.getDefaultProviderConfig('mymemory'));
  assert.equal(free.free, true);
  assert.equal(free.showConfigFields, false);
  assert.equal(free.freeNote, '无需配置');

  const preset = options.getProviderFormState('openai', {
    model: 'gpt-4.1',
    apiUrl: 'https://api.openai.com/v1',
    connectionStatus: 'untested'
  });
  assert.equal(preset.modelPreset, 'gpt-4.1');
  assert.equal(preset.customModel, '');

  const custom = options.getProviderFormState('openai', {
    model: 'private-model',
    apiUrl: 'https://api.openai.com/v1',
    connectionStatus: 'untested'
  });
  assert.equal(custom.modelPreset, '__custom__');
  assert.equal(custom.customModel, 'private-model');
  assert.equal(custom.modelOptions.at(-1).value, '__custom__');
  assert.equal(custom.modelOptions.at(-1).label, '手动输入模型 ID');
});

test('captures provider form drafts without storage and permits a temporarily empty custom model', () => {
  const state = createState();
  const storageCalls = [];
  const result = options.captureProviderValues(state, 'custom_openai', {
    displayName: '<img src=x onerror=alert(1)>',
    apiKey: 'local-secret',
    apiUrl: 'https://gateway.example/v1',
    modelPreset: '__custom__',
    customModel: ''
  }, storageCalls);

  assert.equal(result.providerConfigs.custom_openai.displayName, '<img src=x onerror=alert(1)>');
  assert.equal(result.providerConfigs.custom_openai.model, '');
  assert.equal(result.providerApiKeys.custom_openai, 'local-secret');
  assert.deepEqual(storageCalls, []);
  assert.match(script, /\.textContent\s*=\s*card\.displayName/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('captureProviderValues invalidates connection status only when provider values change', () => {
  const state = createState();
  state.providerConfigs.openai.connectionStatus = 'success';
  state.providerApiKeys.openai = 'same-key';

  options.captureProviderValues(state, 'openai', {
    displayName: '',
    apiKey: 'same-key',
    apiUrl: providers.PROVIDERS.openai.defaultApiUrl,
    modelPreset: providers.PROVIDERS.openai.defaultModel,
    customModel: ''
  });
  assert.equal(state.providerConfigs.openai.connectionStatus, 'success');

  options.captureProviderValues(state, 'openai', {
    displayName: '',
    apiKey: 'same-key',
    apiUrl: providers.PROVIDERS.openai.defaultApiUrl,
    modelPreset: '__custom__',
    customModel: 'gpt-review-model'
  });
  assert.equal(state.providerConfigs.openai.connectionStatus, 'untested');

  state.providerConfigs.openai.connectionStatus = 'success';
  options.captureProviderValues(state, 'openai', {
    displayName: '',
    apiKey: 'changed-key',
    apiUrl: providers.PROVIDERS.openai.defaultApiUrl,
    modelPreset: 'gpt-review-model',
    customModel: ''
  });
  assert.equal(state.providerConfigs.openai.connectionStatus, 'untested');

  state.providerConfigs.custom_openai = {
    ...providers.getDefaultProviderConfig('custom_openai'),
    displayName: 'Private Gateway',
    model: 'private-model',
    apiUrl: 'https://gateway.example/v1',
    connectionStatus: 'success'
  };
  state.providerApiKeys.custom_openai = 'gateway-key';
  options.captureProviderValues(state, 'custom_openai', {
    displayName: 'Renamed Gateway',
    apiKey: 'gateway-key',
    apiUrl: 'https://gateway.example/v1',
    modelPreset: '__custom__',
    customModel: 'private-model'
  });
  assert.equal(state.providerConfigs.custom_openai.connectionStatus, 'untested');

  state.providerConfigs.custom_openai.connectionStatus = 'success';
  options.captureProviderValues(state, 'custom_openai', {
    displayName: 'Renamed Gateway',
    apiKey: 'gateway-key',
    apiUrl: 'https://gateway.example/v2',
    modelPreset: '__custom__',
    customModel: 'private-model'
  });
  assert.equal(state.providerConfigs.custom_openai.connectionStatus, 'untested');

  state.providerConfigs.mymemory.connectionStatus = 'success';
  options.captureProviderValues(state, 'mymemory', {
    displayName: '',
    apiKey: '',
    apiUrl: '',
    modelPreset: '',
    customModel: ''
  });
  assert.equal(state.providerConfigs.mymemory.connectionStatus, 'success');
});

test('provider listbox keyboard navigation wraps and supports Home and End', () => {
  const visibleIds = ['deepseek', 'openai', 'claude'];

  assert.equal(options.getNextProviderId(visibleIds, 'deepseek', 'ArrowRight'), 'openai');
  assert.equal(options.getNextProviderId(visibleIds, 'deepseek', 'ArrowDown'), 'openai');
  assert.equal(options.getNextProviderId(visibleIds, 'deepseek', 'ArrowLeft'), 'claude');
  assert.equal(options.getNextProviderId(visibleIds, 'deepseek', 'ArrowUp'), 'claude');
  assert.equal(options.getNextProviderId(visibleIds, 'openai', 'Home'), 'deepseek');
  assert.equal(options.getNextProviderId(visibleIds, 'openai', 'End'), 'claude');
  assert.equal(options.getNextProviderId(visibleIds, 'missing', 'ArrowRight'), 'deepseek');
  assert.equal(options.getNextProviderId(visibleIds, 'openai', 'Enter'), 'openai');
  assert.equal(options.getNextProviderId([], 'openai', 'ArrowRight'), null);
});

test('provider listbox tab stop falls back to the first visible option without changing selection', () => {
  assert.equal(options.getProviderTabStopId(['deepseek', 'openai'], 'openai'), 'openai');
  assert.equal(options.getProviderTabStopId(['deepseek', 'openai'], 'claude'), 'deepseek');
  assert.equal(options.getProviderTabStopId([], 'openai'), null);
  assert.match(script, /button\.tabIndex\s*=/);
  assert.match(script, /providerGrid\.addEventListener\('keydown'/);
  assert.match(script, /\.focus\(\)/);
});

test('card state reflects configured blue, successful green, and failed red statuses', () => {
  const configs = options.createProviderDrafts({
    openai: {
      model: 'gpt-4.1-mini',
      apiUrl: 'https://api.openai.com/v1',
      connectionStatus: 'untested'
    },
    deepseek: {
      model: 'deepseek-chat',
      apiUrl: 'https://api.deepseek.com',
      connectionStatus: 'success'
    },
    claude: {
      model: 'claude-sonnet-4-6',
      apiUrl: 'https://api.anthropic.com/v1',
      connectionStatus: 'failed'
    }
  });
  const cards = options.buildProviderCardData(configs, {
    openai: 'openai-key',
    deepseek: 'deepseek-key',
    claude: 'claude-key'
  }, 'deepseek');

  assert.equal(cards.find(card => card.id === 'openai').statusClass, 'configured');
  assert.equal(cards.find(card => card.id === 'deepseek').statusClass, 'success');
  assert.equal(cards.find(card => card.id === 'claude').statusClass, 'failed');
  assert.equal(cards.find(card => card.id === 'deepseek').selected, true);
});

test('saving unedited MyMemory requests no permission and writes the new structures', async () => {
  const recorder = createChromeRecorder();
  const permissionRequests = [];
  const state = createState();

  await options.saveProviderSettings({
    chromeApi: recorder.chromeApi,
    state,
    preferences: {
      sourceLang: 'auto',
      targetLang: 'zh-CN',
      autoTranslate: true,
      contextMenu: true,
      disabledSites: [],
      customGlossary: ''
    },
    ensurePermission: async apiUrl => {
      permissionRequests.push(apiUrl);
      return true;
    }
  });

  assert.deepEqual(permissionRequests, []);
  assert.equal(recorder.writes.length, 2);
  const syncWrite = recorder.writes.find(item => item.area === 'sync').value;
  const localWrite = recorder.writes.find(item => item.area === 'local').value;
  assert.equal(syncWrite[shared.STORAGE_KEYS.ACTIVE_PROVIDER], 'mymemory');
  assert.equal(syncWrite[shared.STORAGE_KEYS.PROVIDER_API_KEYS], undefined);
  assert.deepEqual(localWrite[shared.STORAGE_KEYS.PROVIDER_API_KEYS], {});
  assert.deepEqual(recorder.removals, [
    {
      area: 'sync',
      keys: [
        shared.STORAGE_KEYS.ENGINE,
        shared.STORAGE_KEYS.MODEL,
        shared.STORAGE_KEYS.API_URL,
        shared.STORAGE_KEYS.DEEPSEEK_KEY
      ]
    },
    { area: 'local', keys: [shared.STORAGE_KEYS.DEEPSEEK_KEY] }
  ]);
  assert.deepEqual(recorder.operations, [
    'local.get',
    'local.set:1',
    'sync.set:1',
    'sync.remove',
    'local.remove'
  ]);
});

test('local key write failure leaves sync untouched and does not clean legacy keys', async () => {
  const recorder = createChromeRecorder({
    sync: { active_provider: 'mymemory', translation_engine: 'free' },
    local: {
      provider_api_keys: { openai: 'old-key' },
      deepseek_api_key: 'legacy-key'
    },
    failLocalSetAt: [1]
  });
  const configs = options.createProviderDrafts({});
  const state = createState({
    activeProviderId: 'openai',
    providerConfigs: configs,
    providerApiKeys: { openai: 'new-key' }
  });

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => true
    }),
    /local set failed/
  );

  assert.deepEqual(recorder.operations, ['local.get', 'local.set:1']);
  assert.deepEqual(recorder.writes, []);
  assert.deepEqual(recorder.removals, []);
  assert.equal(recorder.sync.active_provider, 'mymemory');
  assert.deepEqual(recorder.local.provider_api_keys, { openai: 'old-key' });
});

test('sync write failure restores the previous local provider keys', async () => {
  const recorder = createChromeRecorder({
    sync: { active_provider: 'mymemory' },
    local: { provider_api_keys: { openai: 'old-key' } },
    failSyncSetAt: [1]
  });
  const state = createState({
    activeProviderId: 'openai',
    providerApiKeys: { openai: 'new-key' }
  });

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => true
    }),
    /sync set failed/
  );

  assert.deepEqual(recorder.operations, [
    'local.get',
    'local.set:1',
    'sync.set:1',
    'local.set:2'
  ]);
  assert.deepEqual(recorder.local.provider_api_keys, { openai: 'old-key' });
  assert.equal(recorder.sync.active_provider, 'mymemory');
  assert.deepEqual(recorder.removals, []);
});

test('sync write failure removes provider keys when the local structure was absent', async () => {
  const recorder = createChromeRecorder({
    local: {},
    failSyncSetAt: [1]
  });
  const state = createState({
    activeProviderId: 'openai',
    providerApiKeys: { openai: 'new-key' }
  });

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => true
    }),
    /sync set failed/
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      recorder.local,
      shared.STORAGE_KEYS.PROVIDER_API_KEYS
    ),
    false
  );
  assert.deepEqual(recorder.operations, [
    'local.get',
    'local.set:1',
    'sync.set:1',
    'local.remove'
  ]);
  assert.deepEqual(recorder.removals, [
    {
      area: 'local',
      keys: [shared.STORAGE_KEYS.PROVIDER_API_KEYS]
    }
  ]);
});

test('sync failure reports rollback failure without exposing provider keys', async () => {
  const recorder = createChromeRecorder({
    local: { provider_api_keys: { openai: 'sensitive-old-key' } },
    failSyncSetAt: [1],
    failLocalSetAt: [2]
  });
  const state = createState({
    activeProviderId: 'openai',
    providerApiKeys: { openai: 'sensitive-new-key' }
  });

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => true
    }),
    error => {
      assert.match(error.message, /保存失败且本地密钥回滚失败/);
      assert.doesNotMatch(error.message, /sensitive-old-key|sensitive-new-key/);
      return true;
    }
  );
  assert.deepEqual(recorder.removals, []);
});

test('successful save validates permissions before local snapshot and writes local then sync then cleanup', async () => {
  const recorder = createChromeRecorder({
    local: { provider_api_keys: { openai: 'old-key' } }
  });
  const state = createState({
    activeProviderId: 'openai',
    providerApiKeys: { openai: 'new-key' }
  });
  const events = [];

  const result = await options.saveProviderSettings({
    chromeApi: recorder.chromeApi,
    state,
    preferences: {},
    ensurePermission: async () => {
      events.push('permission');
      return true;
    }
  });
  events.push(...recorder.operations);

  assert.deepEqual(events, [
    'permission',
    'local.get',
    'local.set:1',
    'sync.set:1',
    'sync.remove',
    'local.remove'
  ]);
  assert.equal(result.cleanupWarning, false);
  assert.deepEqual(result.cleanupErrors, []);
});

test('sync cleanup failure returns a warning after new settings are saved', async () => {
  const recorder = createChromeRecorder({
    sync: { translation_engine: 'deepseek' },
    local: { deepseek_api_key: 'legacy-secret' },
    failSyncRemove: true
  });
  const state = createState();

  const result = await options.saveProviderSettings({
    chromeApi: recorder.chromeApi,
    state,
    preferences: {},
    ensurePermission: async () => true
  });

  assert.equal(recorder.sync[shared.STORAGE_KEYS.ACTIVE_PROVIDER], 'mymemory');
  assert.deepEqual(recorder.local[shared.STORAGE_KEYS.PROVIDER_API_KEYS], {});
  assert.equal(result.cleanupWarning, true);
  assert.deepEqual(result.cleanupErrors, ['sync']);
  assert.equal(JSON.stringify(result).includes('legacy-secret'), false);
  assert.deepEqual(recorder.operations, [
    'local.get',
    'local.set:1',
    'sync.set:1',
    'sync.remove',
    'local.remove'
  ]);
});

test('local cleanup failure returns a warning without rolling back new settings', async () => {
  const recorder = createChromeRecorder({
    sync: { translation_engine: 'deepseek' },
    local: { deepseek_api_key: 'legacy-secret' },
    failLocalRemoveAt: [1]
  });
  const state = createState();

  const result = await options.saveProviderSettings({
    chromeApi: recorder.chromeApi,
    state,
    preferences: {},
    ensurePermission: async () => true
  });

  assert.equal(recorder.sync[shared.STORAGE_KEYS.ACTIVE_PROVIDER], 'mymemory');
  assert.deepEqual(recorder.local[shared.STORAGE_KEYS.PROVIDER_API_KEYS], {});
  assert.equal(result.cleanupWarning, true);
  assert.deepEqual(result.cleanupErrors, ['local']);
  assert.equal(JSON.stringify(result).includes('legacy-secret'), false);
});

test('permission refusal happens before storage and leaves sync/local untouched', async () => {
  const recorder = createChromeRecorder({
    sync: { active_provider: 'mymemory' },
    local: { provider_api_keys: { openai: 'old-key' } }
  });
  const configs = options.createProviderDrafts({});
  configs.openai.connectionStatus = 'success';
  const state = createState({
    activeProviderId: 'openai',
    providerConfigs: configs,
    providerApiKeys: { openai: 'new-key' }
  });

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => false
    }),
    /访问权限/
  );
  assert.deepEqual(recorder.writes, []);
  assert.deepEqual(recorder.removals, []);
});

test('only active or edited providers require complete configuration and permission', async () => {
  const recorder = createChromeRecorder();
  const configs = options.createProviderDrafts({});
  configs.openai.model = 'gpt-4.1';
  const state = createState({
    providerConfigs: configs,
    providerApiKeys: { openai: 'openai-key' }
  });
  const permissionRequests = [];

  await options.saveProviderSettings({
    chromeApi: recorder.chromeApi,
    state,
    preferences: {},
    ensurePermission: async apiUrl => {
      permissionRequests.push(apiUrl);
      return true;
    }
  });

  assert.deepEqual(permissionRequests, ['https://api.openai.com/v1']);
  assert.equal(recorder.writes.length, 2);
  const syncWrite = recorder.writes.find(item => item.area === 'sync').value;
  const localWrite = recorder.writes.find(item => item.area === 'local').value;
  assert.equal(syncWrite[shared.STORAGE_KEYS.PROVIDER_API_KEYS], undefined);
  assert.deepEqual(localWrite[shared.STORAGE_KEYS.PROVIDER_API_KEYS], {
    openai: 'openai-key'
  });
});

test('active non-free provider must be complete before any permission request or write', async () => {
  const recorder = createChromeRecorder();
  const configs = options.createProviderDrafts({});
  const state = createState({
    activeProviderId: 'openai',
    providerConfigs: configs,
    providerApiKeys: {}
  });
  let permissionCount = 0;

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => {
        permissionCount += 1;
        return true;
      }
    }),
    /配置不完整/
  );
  assert.equal(permissionCount, 0);
  assert.deepEqual(recorder.writes, []);
});

test('normalization rejects an empty model ID for every non-free provider', () => {
  for (const providerId of providers.PROVIDER_IDS.filter(id => id !== 'mymemory')) {
    assert.throws(
      () => options.normalizeProviderForSave(providerId, {
        model: '   ',
        apiUrl: providers.PROVIDERS[providerId].defaultApiUrl ||
          'https://gateway.example/v1',
        displayName: 'Gateway'
      }),
      /模型 ID 不能为空/,
      providerId
    );
  }
});

test('saving and testing reject an empty custom model before permission or storage', async () => {
  const recorder = createChromeRecorder();
  const configs = options.createProviderDrafts({
    custom_openai: {
      displayName: 'Gateway',
      model: '',
      apiUrl: 'https://gateway.example/v1'
    }
  });
  const state = createState({
    activeProviderId: 'custom_openai',
    providerConfigs: configs,
    providerApiKeys: { custom_openai: 'secret' }
  });
  let permissionCount = 0;
  let messageCount = 0;

  await assert.rejects(
    options.saveProviderSettings({
      chromeApi: recorder.chromeApi,
      state,
      preferences: {},
      ensurePermission: async () => {
        permissionCount += 1;
        return true;
      }
    }),
    /模型 ID 不能为空/
  );
  await assert.rejects(
    options.testProviderConnection({
      state,
      providerId: 'custom_openai',
      ensurePermission: async () => {
        permissionCount += 1;
        return true;
      },
      sendMessage: async () => {
        messageCount += 1;
        return { success: true };
      }
    }),
    /模型 ID 不能为空/
  );

  assert.equal(permissionCount, 0);
  assert.equal(messageCount, 0);
  assert.deepEqual(recorder.operations, []);
});

test('connection test sends the exact message and updates only in-memory status', async () => {
  const state = createState();
  const sent = [];
  const storageCalls = [];
  const configs = options.createProviderDrafts({
    custom_openai: {
      displayName: 'Private Gateway',
      model: 'private-model',
      apiUrl: 'https://gateway.example/v1'
    }
  });
  state.providerConfigs = configs;
  state.providerApiKeys = { custom_openai: 'secret' };

  const response = await options.testProviderConnection({
    state,
    providerId: 'custom_openai',
    ensurePermission: async () => true,
    sendMessage: async message => {
      sent.push(message);
      return { success: true, text: '你好' };
    },
    storageCalls
  });

  assert.equal(response.success, true);
  assert.deepEqual(sent, [{
    type: 'test-provider-connection',
    providerId: 'custom_openai',
    config: {
      model: 'private-model',
      apiUrl: 'https://gateway.example/v1',
      displayName: 'Private Gateway'
    },
    apiKey: 'secret'
  }]);
  assert.equal(state.providerConfigs.custom_openai.connectionStatus, 'success');
  assert.deepEqual(storageCalls, []);
});

test('connection snapshots contain only fields that affect the tested connection', () => {
  assert.deepEqual(
    options.createConnectionSnapshot('custom_openai', {
      model: 'private-model',
      apiUrl: 'https://gateway.example/v1',
      displayName: 'Private Gateway',
      connectionStatus: 'success',
      ignored: 'value'
    }, 'secret'),
    {
      model: 'private-model',
      apiUrl: 'https://gateway.example/v1',
      displayName: 'Private Gateway',
      apiKey: 'secret'
    }
  );
  assert.deepEqual(
    options.createConnectionSnapshot('openai', {
      model: 'gpt-4.1-mini',
      apiUrl: 'https://api.openai.com/v1',
      displayName: 'ignored',
      connectionStatus: 'failed'
    }, 'openai-key'),
    {
      model: 'gpt-4.1-mini',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-key'
    }
  );
});

test('MyMemory connection test uses the same message contract without permission', async () => {
  const state = createState();
  const sent = [];
  let permissionCount = 0;

  await options.testProviderConnection({
    state,
    providerId: 'mymemory',
    ensurePermission: async () => {
      permissionCount += 1;
      return true;
    },
    sendMessage: async message => {
      sent.push(message);
      return { success: false, error: 'service_unavailable' };
    }
  });

  assert.equal(permissionCount, 0);
  assert.deepEqual(sent, [{
    type: 'test-provider-connection',
    providerId: 'mymemory',
    config: {
      model: '',
      apiUrl: 'https://api.mymemory.translated.net'
    },
    apiKey: ''
  }]);
  assert.equal(state.providerConfigs.mymemory.connectionStatus, 'failed');
});

test('async connection result stays attached to the provider selected when testing started', async () => {
  assert.match(script, /const testedProviderId = selectedProviderId/);
  assert.match(script, /const originalText = button\.textContent/);
  assert.match(script, /const testedDisplayName = getProviderDisplayName/);
  const deferred = createDeferred();
  const state = createState({
    providerApiKeys: {
      openai: 'openai-key',
      deepseek: 'deepseek-key'
    }
  });
  const run = options.runProviderConnectionTest({
    state,
    providerId: 'openai',
    ensurePermission: async () => true,
    sendMessage: () => deferred.promise
  });

  state.providerConfigs.deepseek.connectionStatus = 'failed';
  deferred.resolve({ success: true, text: 'connected' });
  const result = await run;

  assert.equal(result.providerId, 'openai');
  assert.equal(result.displayName, 'OpenAI');
  assert.equal(result.ok, true);
  assert.equal(state.providerConfigs.openai.connectionStatus, 'success');
  assert.equal(state.providerConfigs.deepseek.connectionStatus, 'failed');
});

test('async connection failure marks only the provider selected when testing started', async () => {
  const deferred = createDeferred();
  const state = createState({
    providerApiKeys: {
      openai: 'openai-key',
      deepseek: 'deepseek-key'
    }
  });
  const run = options.runProviderConnectionTest({
    state,
    providerId: 'openai',
    ensurePermission: async () => true,
    sendMessage: () => deferred.promise
  });

  state.providerConfigs.deepseek.connectionStatus = 'success';
  deferred.reject(new Error('network failed'));
  const result = await run;

  assert.equal(result.providerId, 'openai');
  assert.equal(result.ok, false);
  assert.match(result.message, /network failed/);
  assert.equal(state.providerConfigs.openai.connectionStatus, 'failed');
  assert.equal(state.providerConfigs.deepseek.connectionStatus, 'success');
});

test('connection success preserves same-provider edits made while the request is pending', async () => {
  const deferred = createDeferred();
  const sent = [];
  const state = createState({
    providerApiKeys: {
      openai: 'old-key'
    }
  });
  const run = options.runProviderConnectionTest({
    state,
    providerId: 'openai',
    ensurePermission: async () => true,
    sendMessage: message => {
      sent.push(message);
      return deferred.promise;
    }
  });

  options.captureProviderValues(state, 'openai', {
    displayName: '',
    apiKey: 'new-key',
    apiUrl: providers.PROVIDERS.openai.defaultApiUrl,
    modelPreset: '__custom__',
    customModel: 'gpt-new-model'
  });
  deferred.resolve({ success: true, text: 'connected' });
  const result = await run;

  assert.equal(result.ok, true);
  assert.equal(sent[0].config.model, providers.PROVIDERS.openai.defaultModel);
  assert.equal(sent[0].apiKey, 'old-key');
  assert.equal(state.providerConfigs.openai.model, 'gpt-new-model');
  assert.equal(state.providerApiKeys.openai, 'new-key');
  assert.equal(state.providerConfigs.openai.connectionStatus, 'untested');
});

test('connection exception preserves same-provider edits made while the request is pending', async () => {
  const deferred = createDeferred();
  const state = createState({
    providerApiKeys: {
      openai: 'old-key'
    }
  });
  const run = options.runProviderConnectionTest({
    state,
    providerId: 'openai',
    ensurePermission: async () => true,
    sendMessage: () => deferred.promise
  });

  options.captureProviderValues(state, 'openai', {
    displayName: '',
    apiKey: 'new-key',
    apiUrl: providers.PROVIDERS.openai.defaultApiUrl,
    modelPreset: '__custom__',
    customModel: 'gpt-new-model'
  });
  deferred.reject(new Error('network failed'));
  const result = await run;

  assert.equal(result.ok, false);
  assert.equal(state.providerConfigs.openai.model, 'gpt-new-model');
  assert.equal(state.providerApiKeys.openai, 'new-key');
  assert.equal(state.providerConfigs.openai.connectionStatus, 'untested');
});

test('initialization keeps controls locked until settings load succeeds and binds once', async () => {
  const deferred = createDeferred();
  const disabledStates = [];
  let bindCount = 0;
  let shortcutCount = 0;
  let saveWrites = 0;
  let saveClick = null;
  const initialize = options.createInitializationController();
  const dependencies = {
    setControlsDisabled(value) {
      disabledStates.push(value);
    },
    loadSettings: () => deferred.promise,
    loadShortcut() {
      shortcutCount += 1;
    },
    bindInteractions() {
      bindCount += 1;
      saveClick = () => {
        saveWrites += 1;
      };
    }
  };

  const first = initialize(dependencies);
  const second = initialize(dependencies);
  assert.equal(first, second);
  assert.deepEqual(disabledStates, [true]);
  assert.equal(bindCount, 0);
  assert.equal(shortcutCount, 1);
  if (saveClick) saveClick();
  assert.equal(saveWrites, 0);

  deferred.resolve(true);
  assert.equal(await first, true);
  assert.deepEqual(disabledStates, [true, false]);
  assert.equal(bindCount, 1);
  saveClick();
  assert.equal(saveWrites, 1);
});

test('initialization failure leaves controls disabled and never binds save interactions', async () => {
  const disabledStates = [];
  let bindCount = 0;
  const initialize = options.createInitializationController();
  const result = await initialize({
    setControlsDisabled(value) {
      disabledStates.push(value);
    },
    loadSettings: async () => false,
    loadShortcut() {},
    bindInteractions() {
      bindCount += 1;
    }
  });

  assert.equal(result, false);
  assert.deepEqual(disabledStates, [true]);
  assert.equal(bindCount, 0);
});
