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

function createStorageArea(initial, setCalls, getImpl) {
  const state = { ...initial };
  let getCount = 0;
  return {
    state,
    async get(keys) {
      getCount += 1;
      if (getImpl) {
        return getImpl({
          count: getCount,
          keys,
          state,
          select: () => selectStorageValues(state, keys)
        });
      }
      return selectStorageValues(state, keys);
    },
    async set(values) {
      setCalls.push(structuredClone(values));
      Object.assign(state, structuredClone(values));
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach(key => delete state[key]);
    }
  };
}

function defaultSyncStorage(overrides = {}) {
  return {
    active_provider: 'mymemory',
    provider_configs: {},
    source_language: 'auto',
    target_language: 'zh-CN',
    custom_glossary_entries: '',
    ...overrides
  };
}

function createHarness({
  sync = defaultSyncStorage(),
  local = { provider_api_keys: {} },
  permissionGranted = true,
  permissionImpl,
  syncGet,
  localGet,
  fetchImpl
} = {}) {
  let messageListener;
  let storageChangedListener;
  const permissionChecks = [];
  const syncSetCalls = [];
  const localSetCalls = [];
  const syncArea = createStorageArea(sync, syncSetCalls, syncGet);
  const localArea = createStorageArea(local, localSetCalls, localGet);
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
      contains(permission, callback) {
        permissionChecks.push(structuredClone(permission));
        if (permissionImpl) {
          return permissionImpl({ chrome, permission, callback });
        }
        callback(permissionGranted);
      }
    },
    runtime: {
      lastError: null,
      onInstalled: event(() => {}),
      onMessage: event(listener => { messageListener = listener; }),
      openOptionsPage() {}
    },
    sidePanel: { open() {} },
    storage: {
      local: localArea,
      onChanged: event(listener => { storageChangedListener = listener; }),
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
    console,
    fetch: fetchImpl || (async () => {
      throw new Error('unexpected fetch');
    }),
    importScripts() {},
    structuredClone
  });

  vm.runInContext(serviceWorker, context);

  async function send(request) {
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

  return {
    localSetCalls,
    localState: localArea.state,
    permissionChecks,
    send,
    storageChangedListener,
    syncSetCalls,
    syncState: syncArea.state
  };
}

async function settle() {
  for (let index = 0; index < 8; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('imports and uses the provider registry and unified adapters', () => {
  assert.match(
    serviceWorker,
    /importScripts\('shared\.js', 'providers\.js', 'provider-adapters\.js', 'glossary\.js'\)/
  );
  assert.match(serviceWorker, /requestProviderTranslation/);
  assert.match(serviceWorker, /requestProviderBatchTranslation/);
  assert.doesNotMatch(serviceWorker, /translateDeepSeek/);
});

test('deduplicates a provider page batch into one request and restores order with glossary corrections', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'deepseek',
      provider_configs: {
        deepseek: {
          model: 'deepseek-chat',
          apiUrl: 'https://api.deepseek.com',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { deepseek: 'test-key' }
    },
    fetchImpl: async (_url, options) => {
      fetchCount += 1;
      const body = JSON.parse(options.body);
      assert.match(body.messages[0].content, /Stats =>/);
      assert.match(body.messages[0].content, /Live =>/);
      assert.equal(body.messages[1].content, '["Stats remain visible","Live coverage"]');
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: '["Stats remain visible translated","Live coverage translated"]'
              }
            }]
          };
        }
      };
    }
  });

  const response = await harness.send({
    type: 'translate-batch',
    texts: ['Stats remain visible', 'Live coverage', 'Stats remain visible'],
    hostname: 'www.hltv.org',
    requestId: 'batch-test'
  });

  assert.equal(fetchCount, 1);
  assert.deepEqual(
    response.results.map(result => result.text),
    [
      '数据统计 remain visible translated',
      '直播 coverage translated',
      '数据统计 remain visible translated'
    ]
  );
  assert.equal(response.results[0].glossary, true);
  assert.equal(response.results[1].glossary, true);
  assert.deepEqual(harness.permissionChecks, [{
    origins: ['https://api.deepseek.com/*']
  }]);
});

test('marks same-language text as skipped without a request', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      target_language: 'en'
    }),
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('same-language text must not reach the network');
    }
  });

  const response = await harness.send({
    type: 'translate-batch',
    texts: ['News'],
    requestId: 'same-language-test'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.results[0].success, true);
  assert.equal(response.results[0].skipped, true);
  assert.equal(response.results[0].text, '');
});

test('uses the selected source language for MyMemory without optional permission checks', async () => {
  let requestedUrl = '';
  const harness = createHarness({
    sync: defaultSyncStorage({
      source_language: 'ja'
    }),
    fetchImpl: async url => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            responseStatus: 200,
            responseData: { translatedText: '你好' }
          };
        }
      };
    }
  });

  await harness.send({
    type: 'translate',
    text: 'Hello',
    requestId: 'source-language-test'
  });

  assert.match(requestedUrl, /langpair=ja\|zh-CN/);
  assert.deepEqual(harness.permissionChecks, []);
});

test('returns an exact HLTV glossary phrase without a request', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      source_language: 'en'
    }),
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('exact glossary phrases must not reach the network');
    }
  });

  const response = await harness.send({
    type: 'translate-batch',
    texts: ['Player of the week'],
    hostname: 'www.hltv.org',
    requestId: 'glossary-test'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.results[0].text, '本周最佳选手');
  assert.equal(response.results[0].glossary, true);
});

test('rejects missing provider permission before fetch', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'untested'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    },
    permissionGranted: false,
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('permission rejection must prevent fetch');
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello',
    requestId: 'permission-test'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.success, false);
  assert.equal(response.error, 'missing_permission');
  assert.equal(
    response.message,
    'OpenAI API 地址尚未授权，请打开设置保存或测试连接'
  );
  assert.equal(response.needsConfig, true);
});

test('rejects a missing provider key before permission checks and fetch', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'untested'
        }
      }
    }),
    local: {
      provider_api_keys: {}
    },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('invalid config must prevent fetch');
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello',
    requestId: 'missing-key-test'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.success, false);
  assert.equal(response.error, 'invalid_config');
  assert.match(response.message, /OpenAI/);
  assert.equal(response.needsConfig, true);
  assert.deepEqual(harness.permissionChecks, []);
});

test('routes Claude through the Anthropic adapter and keeps auto source language', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'claude',
      provider_configs: {
        claude: {
          model: 'claude-sonnet-4-6',
          apiUrl: 'https://api.anthropic.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { claude: 'claude-secret' }
    },
    fetchImpl: async (url, options) => {
      fetchCount += 1;
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      assert.equal(options.headers['x-api-key'], 'claude-secret');
      const body = JSON.parse(options.body);
      assert.match(body.system, /Detect the source language automatically/);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            content: [{ type: 'text', text: '你好' }]
          };
        }
      };
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello',
    requestId: 'claude-test'
  });

  assert.equal(fetchCount, 1);
  assert.equal(response.success, true);
  assert.equal(response.text, '你好');
});

test('tests a temporary provider connection without persisting config or key', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage(),
    local: { provider_api_keys: {} },
    fetchImpl: async (url, options) => {
      fetchCount += 1;
      assert.equal(url, 'https://proxy.example/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer temporary-secret');
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: '你好' } }]
          };
        }
      };
    }
  });
  await settle();
  harness.syncSetCalls.length = 0;
  harness.localSetCalls.length = 0;

  const response = await harness.send({
    type: 'test-provider-connection',
    providerId: 'custom_openai',
    config: {
      model: 'custom-model',
      apiUrl: 'https://proxy.example/v1',
      displayName: 'Private Gateway'
    },
    apiKey: 'temporary-secret'
  });

  assert.equal(fetchCount, 1);
  assert.equal(response.success, true);
  assert.equal(response.text, '你好');
  assert.deepEqual(harness.syncSetCalls, []);
  assert.deepEqual(harness.localSetCalls, []);
});

test('validates missing model, missing API URL, and invalid API URL before shortcuts', async () => {
  const cases = [
    {
      name: 'missing model before exact glossary',
      config: {
        model: '',
        apiUrl: 'https://proxy.example/v1',
        connectionStatus: 'untested'
      },
      text: 'Player of the week',
      hostname: 'www.hltv.org'
    },
    {
      name: 'missing URL before same-language shortcut',
      config: {
        model: 'custom-model',
        apiUrl: '',
        connectionStatus: 'untested'
      },
      text: 'News',
      targetLanguage: 'en'
    },
    {
      name: 'invalid URL before exact glossary',
      config: {
        model: 'custom-model',
        apiUrl: 'not-a-url',
        connectionStatus: 'untested'
      },
      text: 'Player of the week',
      hostname: 'www.hltv.org'
    }
  ];

  for (const item of cases) {
    let fetchCount = 0;
    const harness = createHarness({
      sync: defaultSyncStorage({
        active_provider: 'custom_openai',
        target_language: item.targetLanguage || 'zh-CN',
        source_language: 'en',
        provider_configs: {
          custom_openai: item.config
        }
      }),
      local: {
        provider_api_keys: { custom_openai: 'secret' }
      },
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error(`${item.name} must not fetch`);
      }
    });

    const response = await harness.send({
      type: 'translate',
      text: item.text,
      hostname: item.hostname,
      requestId: item.name
    });

    assert.equal(response.success, false, item.name);
    assert.equal(response.error, 'invalid_config', item.name);
    assert.equal(response.needsConfig, true, item.name);
    assert.equal(fetchCount, 0, item.name);
    assert.deepEqual(harness.permissionChecks, [], item.name);
  }
});

test('does not check permission for valid exact glossary and same-language shortcuts', async () => {
  const exactHarness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      source_language: 'en',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    }
  });
  const exact = await exactHarness.send({
    type: 'translate',
    text: 'Player of the week',
    hostname: 'www.hltv.org'
  });
  assert.equal(exact.success, true);
  assert.deepEqual(exactHarness.permissionChecks, []);

  const sameLanguageHarness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      target_language: 'en',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    }
  });
  const sameLanguage = await sameLanguageHarness.send({
    type: 'translate',
    text: 'News'
  });
  assert.equal(sameLanguage.success, true);
  assert.deepEqual(sameLanguageHarness.permissionChecks, []);
});

test('tests the MyMemory connection with the free engine', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    fetchImpl: async url => {
      fetchCount += 1;
      assert.match(url, /q=hello/);
      assert.match(url, /langpair=en\|zh-CN/);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            responseStatus: 200,
            responseData: { translatedText: '你好' }
          };
        }
      };
    }
  });

  const response = await harness.send({
    type: 'test-provider-connection',
    providerId: 'mymemory',
    config: {
      model: '',
      apiUrl: 'https://api.mymemory.translated.net',
      displayName: ''
    },
    apiKey: ''
  });

  assert.equal(fetchCount, 1);
  assert.equal(response.success, true);
  assert.equal(response.text, '你好');
  assert.deepEqual(harness.permissionChecks, []);
});

test('routes a normal OpenAI translation through the unified adapter', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'openai-secret' }
    },
    fetchImpl: async (url, options) => {
      fetchCount += 1;
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer openai-secret');
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: '你好' } }]
          };
        }
      };
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello'
  });

  assert.equal(fetchCount, 1);
  assert.equal(response.success, true);
  assert.equal(response.text, '你好');
});

test('retries an invalid provider batch item-by-item using the same provider and order', async () => {
  const requestedTexts = [];
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      source_language: 'en',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(options.body);
      requestedTexts.push(body.messages[1].content);
      if (requestedTexts.length === 1) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [{ message: { content: '["only one"]' } }]
            };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{
              message: {
                content: body.messages[1].content === 'First' ? '第一' : '第二'
              }
            }]
          };
        }
      };
    }
  });

  const response = await harness.send({
    type: 'translate-batch',
    texts: ['First', 'Second']
  });

  assert.deepEqual(requestedTexts, ['["First","Second"]', 'First', 'Second']);
  assert.equal(requestedTexts.length, 3);
  assert.deepEqual(
    response.results.map(result => result.text),
    ['第一', '第二']
  );
});

test('returns stable errors for unknown providers without fetch or hanging', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'unknown-provider'
    }),
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('unknown providers must not fetch');
    }
  });

  const translateResponse = await harness.send({
    type: 'translate',
    text: 'Hello'
  });
  const connectionResponse = await harness.send({
    type: 'test-provider-connection',
    providerId: 'unknown-provider',
    config: {
      model: 'model',
      apiUrl: 'https://example.com'
    },
    apiKey: 'secret'
  });

  assert.equal(fetchCount, 0);
  assert.equal(translateResponse.success, false);
  assert.equal(translateResponse.error, 'unknown_provider');
  assert.equal(connectionResponse.success, false);
  assert.equal(connectionResponse.error, 'unknown_provider');
});

test('reloads provider config when storage changes during an in-flight read', async () => {
  let releaseSyncRead;
  let releaseLocalRead;
  let syncReadStarted;
  let localReadStarted;
  const syncGate = new Promise(resolve => { releaseSyncRead = resolve; });
  const localGate = new Promise(resolve => { releaseLocalRead = resolve; });
  const syncStarted = new Promise(resolve => { syncReadStarted = resolve; });
  const localStarted = new Promise(resolve => { localReadStarted = resolve; });
  const requested = [];
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'openai-key' }
    },
    syncGet: async ({ count, select }) => {
      const snapshot = structuredClone(select());
      if (count === 2) {
        syncReadStarted();
        await syncGate;
      }
      return snapshot;
    },
    localGet: async ({ count, select }) => {
      const snapshot = structuredClone(select());
      if (count === 2) {
        localReadStarted();
        await localGate;
      }
      return snapshot;
    },
    fetchImpl: async (url, options) => {
      requested.push({
        url,
        authorization: options.headers.Authorization
      });
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '你好' } }] };
        }
      };
    }
  });
  await settle();

  const responsePromise = harness.send({
    type: 'translate',
    text: 'Hello'
  });
  await Promise.all([syncStarted, localStarted]);

  harness.syncState.active_provider = 'deepseek';
  harness.syncState.provider_configs = {
    deepseek: {
      model: 'deepseek-chat',
      apiUrl: 'https://api.deepseek.com',
      connectionStatus: 'success'
    }
  };
  harness.localState.provider_api_keys = {
    deepseek: 'deepseek-key'
  };
  harness.storageChangedListener({
    active_provider: {
      oldValue: 'openai',
      newValue: 'deepseek'
    },
    provider_configs: {
      oldValue: {},
      newValue: harness.syncState.provider_configs
    }
  }, 'sync');
  harness.storageChangedListener({
    provider_api_keys: {
      oldValue: {},
      newValue: harness.localState.provider_api_keys
    }
  }, 'local');
  releaseSyncRead();
  releaseLocalRead();

  const response = await responsePromise;
  assert.equal(response.success, true);
  assert.deepEqual(requested, [{
    url: 'https://api.deepseek.com/v1/chat/completions',
    authorization: 'Bearer deepseek-key'
  }]);
});

for (const batchFailure of ['empty_response', 'invalid_response']) {
  test(`retries ${batchFailure} batches item-by-item using the same provider`, async () => {
    const requestedTexts = [];
    const harness = createHarness({
      sync: defaultSyncStorage({
        active_provider: 'openai',
        source_language: 'en',
        provider_configs: {
          openai: {
            model: 'gpt-4.1-mini',
            apiUrl: 'https://api.openai.com/v1',
            connectionStatus: 'success'
          }
        }
      }),
      local: {
        provider_api_keys: { openai: 'secret' }
      },
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        requestedTexts.push(body.messages[1].content);
        if (requestedTexts.length === 1) {
          if (batchFailure === 'empty_response') {
            return {
              ok: true,
              status: 200,
              async json() {
                return { choices: [{ message: { content: '' } }] };
              }
            };
          }
          return {
            ok: true,
            status: 200,
            async json() {
              throw new SyntaxError('invalid JSON');
            }
          };
        }
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [{
                message: {
                  content: body.messages[1].content === 'First' ? '第一' : '第二'
                }
              }]
            };
          }
        };
      }
    });

    const response = await harness.send({
      type: 'translate-batch',
      texts: ['First', 'Second']
    });

    assert.deepEqual(requestedTexts, ['["First","Second"]', 'First', 'Second']);
    assert.deepEqual(
      response.results.map(result => result.text),
      ['第一', '第二']
    );
  });
}

test('does not retry unauthorized provider batches item-by-item', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    },
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: false,
        status: 401,
        async json() {
          return {};
        }
      };
    }
  });

  const response = await harness.send({
    type: 'translate-batch',
    texts: ['First', 'Second']
  });

  assert.equal(fetchCount, 1);
  assert.deepEqual(
    response.results.map(result => result.error),
    ['unauthorized', 'unauthorized']
  );
});

test('returns a stable permission error when callback lastError is set', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    },
    permissionImpl: ({ chrome, callback }) => {
      chrome.runtime.lastError = { message: 'permission API unavailable' };
      callback(false);
      chrome.runtime.lastError = null;
    },
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('permission errors must prevent fetch');
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.success, false);
  assert.equal(response.error, 'permission_check_failed');
});

test('returns a stable permission error when the Promise path rejects', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    },
    permissionImpl: () => Promise.reject(new Error('permission rejected')),
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('permission errors must prevent fetch');
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello'
  });

  assert.equal(fetchCount, 0);
  assert.equal(response.success, false);
  assert.equal(response.error, 'permission_check_failed');
});

test('settles permission checks once when callback and Promise are both used', async () => {
  let fetchCount = 0;
  const harness = createHarness({
    sync: defaultSyncStorage({
      active_provider: 'openai',
      provider_configs: {
        openai: {
          model: 'gpt-4.1-mini',
          apiUrl: 'https://api.openai.com/v1',
          connectionStatus: 'success'
        }
      }
    }),
    local: {
      provider_api_keys: { openai: 'secret' }
    },
    permissionImpl: ({ callback }) => {
      callback(true);
      return Promise.reject(new Error('late rejection'));
    },
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: '你好' } }] };
        }
      };
    }
  });

  const response = await harness.send({
    type: 'translate',
    text: 'Hello'
  });
  await settle();

  assert.equal(fetchCount, 1);
  assert.equal(response.success, true);
  assert.equal(response.text, '你好');
});
