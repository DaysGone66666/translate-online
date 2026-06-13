const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const shared = require('../src/shared.js');
const providers = require('../src/providers.js');
const adapters = require('../src/provider-adapters.js');
const glossary = require('../src/glossary.js');

const serviceWorker = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'service-worker.js'),
  'utf8'
);

function selectStorageValues(storage, keys) {
  if (keys === null || keys === undefined) return { ...storage };
  const requested = Array.isArray(keys)
    ? keys
    : typeof keys === 'string'
      ? [keys]
      : Object.keys(keys);
  return Object.fromEntries(
    requested
      .filter(key => Object.prototype.hasOwnProperty.call(storage, key))
      .map(key => [key, storage[key]])
  );
}

function createStorageArea(initial, setCalls, removeCalls, behavior = {}) {
  const state = { ...initial };
  return {
    state,
    async get(keys) {
      if (behavior.getGate) await behavior.getGate;
      if (behavior.getError) throw behavior.getError;
      return selectStorageValues(state, keys);
    },
    async set(values) {
      if (behavior.setError) throw behavior.setError;
      setCalls.push(structuredClone(values));
      Object.assign(state, structuredClone(values));
    },
    async remove(keys) {
      if (behavior.removeError) throw behavior.removeError;
      const list = Array.isArray(keys) ? keys : [keys];
      removeCalls.push([...list]);
      list.forEach(key => delete state[key]);
    }
  };
}

function createHarness({
  sync = {},
  local = {},
  syncBehavior = {},
  localBehavior = {},
  fetchImpl
} = {}) {
  let installedListener;
  let messageListener;
  const consoleErrors = [];
  const syncSetCalls = [];
  const localSetCalls = [];
  const syncRemoveCalls = [];
  const localRemoveCalls = [];
  const syncArea = createStorageArea(
    sync,
    syncSetCalls,
    syncRemoveCalls,
    syncBehavior
  );
  const localArea = createStorageArea(
    local,
    localSetCalls,
    localRemoveCalls,
    localBehavior
  );
  localArea.setAccessLevel = async () => {};
  const event = register => ({
    addListener(callback) {
      register(callback);
    }
  });
  const chrome = {
    commands: { onCommand: event(() => {}) },
    contextMenus: {
      create() {},
      remove(_id, callback) { callback(); },
      onClicked: event(() => {})
    },
    permissions: {
      contains(_permissions, callback) { callback(true); }
    },
    runtime: {
      lastError: null,
      onInstalled: event(listener => { installedListener = listener; }),
      onMessage: event(listener => { messageListener = listener; }),
      openOptionsPage() {}
    },
    sidePanel: { open() {} },
    storage: {
      local: localArea,
      onChanged: event(() => {}),
      sync: syncArea
    },
    tabs: {
      create() {},
      query() {},
      sendMessage() {}
    }
  };
  const context = vm.createContext({
    AbortController,
    URL,
    TranslateOnlineGlossary: glossary,
    TranslateOnlineProviderAdapters: adapters,
    TranslateOnlineProviders: providers,
    TranslateOnlineShared: shared,
    chrome,
    console: {
      ...console,
      error(...args) {
        consoleErrors.push(args);
      }
    },
    fetch: fetchImpl || (async () => {
      throw new Error('migration tests must not fetch');
    }),
    importScripts() {},
    structuredClone
  });

  vm.runInContext(serviceWorker, context);

  return {
    consoleErrors,
    installedListener,
    localRemoveCalls,
    localSetCalls,
    localState: localArea.state,
    messageListener,
    syncRemoveCalls,
    syncSetCalls,
    syncState: syncArea.state,
    async send(request) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Service Worker did not respond to ${request.type}`));
        }, 100);
        messageListener(request, {}, response => {
          clearTimeout(timer);
          resolve(response);
        });
      });
    }
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('migrates a legacy DeepSeek local key and removes every legacy key', async () => {
  const harness = createHarness({
    sync: {
      translation_engine: 'deepseek',
      deepseek_model: 'deepseek-reasoner',
      deepseek_api_url: 'https://legacy.deepseek.example/v1'
    },
    local: {
      deepseek_api_key: 'local-secret'
    }
  });

  await settle();

  assert.equal(harness.syncState.active_provider, 'deepseek');
  assert.deepEqual(harness.syncState.provider_configs.deepseek, {
    model: 'deepseek-reasoner',
    apiUrl: 'https://legacy.deepseek.example/v1',
    connectionStatus: 'untested'
  });
  assert.equal(harness.localState.provider_api_keys.deepseek, 'local-secret');
  for (const key of [
    'translation_engine',
    'deepseek_model',
    'deepseek_api_url',
    'deepseek_api_key'
  ]) {
    assert.equal(Object.hasOwn(harness.syncState, key), false);
  }
  assert.equal(Object.hasOwn(harness.localState, 'deepseek_api_key'), false);
});

test('uses the legacy sync key only when the local legacy key is absent', async () => {
  const harness = createHarness({
    sync: {
      translation_engine: 'deepseek',
      deepseek_api_key: 'sync-secret'
    }
  });

  await settle();

  assert.equal(harness.localState.provider_api_keys.deepseek, 'sync-secret');
  assert.equal(Object.hasOwn(harness.syncState, 'deepseek_api_key'), false);
});

test('maps a legacy free engine to MyMemory and fills the DeepSeek defaults', async () => {
  const harness = createHarness({
    sync: {
      translation_engine: 'free'
    }
  });

  await settle();

  assert.equal(harness.syncState.active_provider, 'mymemory');
  assert.deepEqual(
    harness.syncState.provider_configs.deepseek,
    providers.getDefaultProviderConfig('deepseek')
  );
});

test('preserves all existing new values and other provider entries', async () => {
  const existingDeepSeek = {
    model: 'saved-model',
    apiUrl: 'https://saved.example/v1',
    connectionStatus: 'success'
  };
  const harness = createHarness({
    sync: {
      active_provider: 'claude',
      provider_configs: {
        claude: {
          model: 'claude-sonnet-4-6',
          apiUrl: 'https://api.anthropic.com/v1',
          connectionStatus: 'success'
        },
        deepseek: existingDeepSeek
      },
      translation_engine: 'deepseek',
      deepseek_model: 'legacy-model',
      deepseek_api_url: 'https://legacy.example'
    },
    local: {
      provider_api_keys: {
        claude: 'claude-secret',
        deepseek: 'saved-secret'
      },
      deepseek_api_key: 'legacy-secret'
    }
  });

  await settle();

  assert.equal(harness.syncState.active_provider, 'claude');
  assert.deepEqual(harness.syncState.provider_configs, {
    claude: {
      model: 'claude-sonnet-4-6',
      apiUrl: 'https://api.anthropic.com/v1',
      connectionStatus: 'success'
    },
    deepseek: existingDeepSeek
  });
  assert.deepEqual(harness.localState.provider_api_keys, {
    claude: 'claude-secret',
    deepseek: 'saved-secret'
  });
});

test('migration is idempotent after the new structure has been written', async () => {
  const first = createHarness({
    sync: {
      translation_engine: 'deepseek',
      deepseek_model: 'deepseek-chat'
    },
    local: {
      deepseek_api_key: 'secret'
    }
  });
  await settle();

  const second = createHarness({
    sync: first.syncState,
    local: first.localState
  });
  await settle();

  assert.deepEqual(second.syncState, first.syncState);
  assert.deepEqual(second.localState, first.localState);
  assert.equal(second.syncSetCalls.length, 0);
  assert.equal(second.localSetCalls.length, 0);
});

test('install defaults use only the new provider settings and keep non-translation defaults', async () => {
  const harness = createHarness({
    sync: {
      active_provider: 'mymemory',
      provider_configs: {}
    }
  });
  await settle();
  harness.syncSetCalls.length = 0;

  harness.installedListener({ reason: 'install' });
  await settle();

  const installWrite = harness.syncSetCalls.find(values =>
    Object.hasOwn(values, 'source_language')
  );
  assert.ok(installWrite);
  assert.equal(Object.hasOwn(installWrite, 'active_provider'), false);
  assert.equal(Object.hasOwn(installWrite, 'provider_configs'), false);
  assert.equal(installWrite.source_language, 'auto');
  assert.equal(installWrite.target_language, 'zh-CN');
  assert.equal(installWrite.trigger_auto_translate, true);
  assert.equal(installWrite.trigger_context_menu, true);
  assert.equal(installWrite.custom_glossary_entries, '');
  assert.deepEqual(installWrite.disabled_sites, []);
  assert.equal(Object.hasOwn(installWrite, 'translation_engine'), false);
  assert.equal(Object.hasOwn(installWrite, 'deepseek_model'), false);
  assert.equal(Object.hasOwn(installWrite, 'deepseek_api_url'), false);
  assert.equal(harness.syncState.active_provider, 'mymemory');
  assert.deepEqual(harness.syncState.provider_configs, {});
});

test('fails closed when migration storage reads fail', async () => {
  let fetchCount = 0;
  const rawError = new Error('sync storage unavailable: secret-value');
  const harness = createHarness({
    syncBehavior: {
      getError: rawError
    },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('migration failure must prevent fetch');
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello',
    requestId: 'migration-read-failure'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.success, false);
  assert.equal(response.error, 'migration_failed');
  assert.match(response.message, /设置迁移失败/);
  assert.doesNotMatch(response.message, /secret-value/);
  assert.equal(harness.consoleErrors.length, 1);
  assert.equal(harness.consoleErrors[0][1], rawError);
});

test('does not delete legacy keys when migration writes fail', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: {
      translation_engine: 'deepseek',
      deepseek_model: 'deepseek-chat',
      deepseek_api_url: 'https://api.deepseek.com',
      deepseek_api_key: 'sync-secret'
    },
    local: {
      deepseek_api_key: 'local-secret'
    },
    localBehavior: {
      setError: new Error('local write failed')
    },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('migration write failure must prevent fetch');
    }
  });

  await settle();
  const response = await harness.send({
    type: 'translate',
    text: 'Hello',
    requestId: 'migration-write-failure'
  });

  assert.equal(harness.syncRemoveCalls.length, 0);
  assert.equal(harness.localRemoveCalls.length, 0);
  assert.equal(harness.syncState.translation_engine, 'deepseek');
  assert.equal(harness.syncState.deepseek_api_key, 'sync-secret');
  assert.equal(harness.localState.deepseek_api_key, 'local-secret');
  assert.equal(fetchCount, 0);
  assert.equal(response.success, false);
  assert.equal(response.error, 'migration_failed');
});

test('preserves delayed legacy DeepSeek migration results during install', async () => {
  let releaseMigrationRead;
  const migrationReadGate = new Promise(resolve => {
    releaseMigrationRead = resolve;
  });
  const harness = createHarness({
    sync: {
      translation_engine: 'deepseek',
      deepseek_model: 'deepseek-reasoner',
      deepseek_api_url: 'https://legacy.example'
    },
    local: {
      deepseek_api_key: 'legacy-secret'
    },
    syncBehavior: {
      getGate: migrationReadGate
    },
    localBehavior: {
      getGate: migrationReadGate
    }
  });

  harness.installedListener({ reason: 'install' });
  releaseMigrationRead();
  await settle();

  assert.equal(harness.syncState.active_provider, 'deepseek');
  assert.deepEqual(harness.syncState.provider_configs.deepseek, {
    model: 'deepseek-reasoner',
    apiUrl: 'https://legacy.example',
    connectionStatus: 'untested'
  });
  assert.equal(harness.syncState.source_language, 'auto');
  assert.equal(harness.syncState.target_language, 'zh-CN');
});

test('fills exact provider defaults for a truly empty concurrent install', async () => {
  let releaseMigrationRead;
  const migrationReadGate = new Promise(resolve => {
    releaseMigrationRead = resolve;
  });
  const harness = createHarness({
    syncBehavior: {
      getGate: migrationReadGate
    },
    localBehavior: {
      getGate: migrationReadGate
    }
  });

  harness.installedListener({ reason: 'install' });
  releaseMigrationRead();
  await settle();

  assert.equal(harness.syncState.active_provider, 'mymemory');
  assert.deepEqual(harness.syncState.provider_configs, {});
  assert.equal(harness.syncState.source_language, 'auto');
  assert.equal(harness.syncState.target_language, 'zh-CN');
});

test('install preserves existing provider, language, and non-translation settings', async () => {
  const harness = createHarness({
    sync: {
      active_provider: 'claude',
      provider_configs: {
        claude: {
          model: 'claude-sonnet-4-6',
          apiUrl: 'https://api.anthropic.com/v1',
          connectionStatus: 'success'
        },
        custom_openai: {
          model: 'private-model',
          apiUrl: 'https://private.example/v1',
          displayName: 'Private',
          connectionStatus: 'success'
        }
      },
      source_language: 'ja',
      target_language: 'en',
      trigger_auto_translate: false,
      trigger_context_menu: false,
      custom_glossary_entries: 'A=B',
      disabled_sites: ['example.com']
    }
  });
  await settle();
  const stateBeforeInstall = structuredClone(harness.syncState);

  harness.installedListener({ reason: 'install' });
  await settle();

  assert.deepEqual(harness.syncState, stateBeforeInstall);
});

test('install does not write defaults when migration fails and logs both lifecycle failures', async () => {
  const rawError = new Error('storage read failed with secret-value');
  const harness = createHarness({
    sync: {
      active_provider: 'claude',
      provider_configs: {
        claude: {
          model: 'claude-sonnet-4-6',
          apiUrl: 'https://api.anthropic.com/v1',
          connectionStatus: 'success'
        }
      }
    },
    syncBehavior: {
      getError: rawError
    }
  });

  harness.installedListener({ reason: 'install' });
  await settle();

  assert.equal(harness.syncSetCalls.length, 0);
  assert.equal(harness.syncState.active_provider, 'claude');
  assert.equal(harness.consoleErrors.length, 2);
  assert.equal(harness.consoleErrors[0][1], rawError);
  assert.match(String(harness.consoleErrors[0][0]), /migration/i);
  assert.match(String(harness.consoleErrors[1][0]), /install/i);
});
