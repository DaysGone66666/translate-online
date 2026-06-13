const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'src', 'toolbar-popup.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'toolbar-popup.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'src', 'toolbar-popup.js'), 'utf8');
const { PROVIDER_IDS } = require('../src/providers.js');
const { STORAGE_KEYS } = require('../src/shared.js');

function loadPopupModule() {
  delete require.cache[require.resolve('../src/toolbar-popup.js')];
  return require('../src/toolbar-popup.js');
}

test('registers a custom toolbar popup instead of relying on the browser menu', () => {
  assert.equal(manifest.action.default_popup, 'src/toolbar-popup.html');
  assert.equal(manifest.action.default_title, 'Translate Online');
});

test('toolbar popup exposes the exact branded provider picker structure', () => {
  assert.doesNotMatch(html, /id="engine"/);
  assert.match(html, /class="provider-picker"/);
  assert.match(
    html,
    /<button id="provider-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" disabled>/
  );
  assert.match(
    html,
    /<img id="provider-icon" class="provider-logo" src="\.\.\/images\/providers\/mymemory\.svg" alt="MyMemory 图标" loading="eager" decoding="async">/
  );
  assert.match(html, /<span class="provider-trigger-copy">/);
  assert.match(html, /<strong id="provider-name"><\/strong>/);
  assert.match(html, /<small id="provider-model"><\/small>/);
  assert.match(html, /<span aria-hidden="true">⌄<\/span>/);
  assert.match(
    html,
    /<div id="provider-menu" role="listbox" aria-label="翻译服务" hidden><\/div>/
  );
});

test('toolbar popup retains translation controls, shortcuts, and exact script order', () => {
  for (const id of [
    'source-lang',
    'target-lang',
    'translate-page',
    'disable-site',
    'auto-translate',
    'context-menu',
    'open-sidebar',
    'open-options'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  const sharedIndex = html.indexOf('<script src="shared.js"></script>');
  const providersIndex = html.indexOf('<script src="providers.js"></script>');
  const popupIndex = html.indexOf('<script src="toolbar-popup.js"></script>');
  assert.ok(sharedIndex >= 0);
  assert.ok(providersIndex > sharedIndex);
  assert.ok(popupIndex > providersIndex);
});

test('toolbar popup initially locks every control that writes settings', () => {
  for (const id of [
    'source-lang',
    'target-lang',
    'disable-site',
    'auto-translate',
    'context-menu',
    'translate-page'
  ]) {
    assert.match(
      html,
      new RegExp(`<[^>]+id="${id}"[^>]*\\sdisabled(?:\\s|>|=)`)
    );
  }
  assert.doesNotMatch(html, /<button id="open-options"[^>]*disabled/);
});

test('provider picker styling stays compact and accessible', () => {
  assert.match(css, /\.provider-picker\s*\{[\s\S]*position:\s*relative/);
  assert.match(css, /#provider-trigger[\s\S]*display:\s*flex/);
  assert.match(css, /#provider-trigger[\s\S]*img[\s\S]*width:\s*24px/);
  assert.match(css, /#provider-menu\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /#provider-menu\s*\{[\s\S]*width:\s*(?:250px|100%)/);
  assert.match(css, /#provider-menu\s*\{[\s\S]*max-height:/);
  assert.match(css, /#provider-menu\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /#provider-menu\s*\{[\s\S]*z-index:/);
  assert.match(css, /\.provider-option/);
  assert.match(css, /\.provider-option[\s\S]*img[\s\S]*width:\s*24px/);
  assert.match(
    css,
    /\.provider-logo\s*\{[^}]*padding:\s*3px;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.94\);/s
  );
  assert.match(css, /\.provider-option\[aria-selected="true"\]/);
  assert.match(css, /\.provider-status[\s\S]*\.unconfigured/);
  assert.match(css, /:focus-visible/);
});

test('popup module reads only the new provider storage structure', () => {
  assert.match(script, /STORAGE_KEYS\.ACTIVE_PROVIDER/);
  assert.match(script, /STORAGE_KEYS\.PROVIDER_CONFIGS/);
  assert.match(script, /STORAGE_KEYS\.PROVIDER_API_KEYS/);
  assert.doesNotMatch(script, /STORAGE_KEYS\.(?:ENGINE|MODEL|API_URL|DEEPSEEK_KEY)/);
  assert.match(script, /start-page-translation-command/);
  assert.match(script, /chromeApi\.runtime\.openOptionsPage/);
  assert.match(script, /globalScope\.chrome\?\.storage\?\.sync/);
  assert.match(script, /icon\.className = 'provider-logo'/);
  assert.match(script, /icon\.loading = 'eager'/);
  assert.match(script, /icon\.decoding = 'async'/);
});

test('buildProviderEntries returns all providers in registry order with local safe labels', () => {
  const { buildProviderEntries } = loadPopupModule();
  const entries = buildProviderEntries({
    custom_openai: {
      displayName: '<img src=x onerror=alert(1)>',
      model: 'custom-model',
      apiUrl: 'https://example.com'
    }
  }, {
    custom_openai: 'secret'
  }, 'custom_openai');

  assert.deepEqual(entries.map(entry => entry.id), PROVIDER_IDS);
  assert.equal(entries.length, 12);
  assert.ok(entries.every(entry =>
    entry.icon.startsWith('../images/providers/') &&
    !/^https?:/i.test(entry.icon)
  ));
  assert.equal(
    entries.find(entry => entry.id === 'custom_openai').displayName,
    '<img src=x onerror=alert(1)>'
  );
  assert.match(script, /\.textContent\s*=/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('provider entries expose model, configuration state, selection, and MyMemory free detail', () => {
  const { buildProviderEntries } = loadPopupModule();
  const entries = buildProviderEntries({
    deepseek: { model: 'deepseek-chat' }
  }, {}, 'deepseek');
  const myMemory = entries.find(entry => entry.id === 'mymemory');
  const deepSeek = entries.find(entry => entry.id === 'deepseek');

  assert.equal(myMemory.configured, true);
  assert.equal(myMemory.detail, '无需配置');
  assert.equal(deepSeek.configured, false);
  assert.equal(deepSeek.model, 'deepseek-chat');
  assert.equal(deepSeek.selected, true);
});

test('translate availability prioritizes provider configuration, page access, then site disablement', () => {
  const { getTranslateAvailability } = loadPopupModule();
  assert.deepEqual(getTranslateAvailability({
    configured: false,
    hasActiveTab: false,
    hostname: '',
    siteDisabled: true
  }), {
    enabled: false,
    reason: '当前服务需要配置'
  });
  assert.equal(getTranslateAvailability({
    configured: true,
    hasActiveTab: false,
    hostname: '',
    siteDisabled: false
  }).reason, '当前页面不可访问');
  assert.equal(getTranslateAvailability({
    configured: true,
    hasActiveTab: true,
    hostname: 'example.com',
    siteDisabled: true
  }).reason, '当前网站已禁用');
  assert.equal(getTranslateAvailability({
    configured: true,
    hasActiveTab: true,
    hostname: 'example.com',
    siteDisabled: false
  }).enabled, true);
});

test('provider navigation wraps and supports Home, End, and trigger opening focus', () => {
  const {
    getProviderNavigationTarget,
    getProviderOpenFocus
  } = loadPopupModule();
  const ids = ['mymemory', 'deepseek', 'mimo'];

  assert.equal(getProviderNavigationTarget(ids, 'mymemory', 'ArrowUp'), 'mimo');
  assert.equal(getProviderNavigationTarget(ids, 'mimo', 'ArrowDown'), 'mymemory');
  assert.equal(getProviderNavigationTarget(ids, 'deepseek', 'Home'), 'mymemory');
  assert.equal(getProviderNavigationTarget(ids, 'deepseek', 'End'), 'mimo');
  assert.equal(getProviderOpenFocus(ids, 'deepseek', 'ArrowDown'), 'deepseek');
  assert.equal(getProviderOpenFocus(ids, 'deepseek', 'ArrowUp'), 'mimo');
  assert.equal(getProviderOpenFocus(ids, 'missing', 'ArrowDown'), 'mymemory');
});

test('provider selection writes only ACTIVE_PROVIDER and rolls UI back on failure', async () => {
  const { commitProviderSelection } = loadPopupModule();
  const applied = [];
  const writes = [];
  const chromeApi = {
    storage: {
      sync: {
        set(value) {
          writes.push(value);
          return Promise.reject(new Error('write failed'));
        }
      }
    }
  };

  await assert.rejects(
    commitProviderSelection({
      chromeApi,
      previousProviderId: 'mymemory',
      providerId: 'deepseek',
      operationVersion: 0,
      getStateVersion: () => 0,
      getActiveProviderId: () => applied.at(-1),
      applyProviderId: providerId => applied.push(providerId)
    }),
    /write failed/
  );
  assert.deepEqual(writes, [{ active_provider: 'deepseek' }]);
  assert.deepEqual(applied, ['deepseek', 'mymemory']);
});

test('provider selection failure does not overwrite a newer external provider change', async () => {
  const { commitProviderSelection } = loadPopupModule();
  let rejectWrite;
  let activeId = 'mymemory';
  let stateVersion = 0;
  const write = commitProviderSelection({
    chromeApi: {
      storage: {
        sync: {
          set() {
            return new Promise((resolve, reject) => {
              rejectWrite = reject;
            });
          }
        }
      }
    },
    previousProviderId: 'mymemory',
    providerId: 'deepseek',
    operationVersion: stateVersion,
    getStateVersion: () => stateVersion,
    getActiveProviderId: () => activeId,
    applyProviderId(providerId) {
      activeId = providerId;
    }
  });

  activeId = 'openai';
  stateVersion += 1;
  rejectWrite(new Error('write failed'));
  await assert.rejects(write, /write failed/);
  assert.equal(activeId, 'openai');
});

test('translation waits for settings and provider writes before sending', async () => {
  const { waitForPendingWrites } = loadPopupModule();
  const order = [];
  let resolveSettings;
  let resolveProvider;
  const settingsWrite = new Promise(resolve => { resolveSettings = resolve; });
  const providerWrite = new Promise(resolve => { resolveProvider = resolve; });
  const task = waitForPendingWrites(settingsWrite, providerWrite)
    .then(() => order.push('translate'));

  await Promise.resolve();
  assert.deepEqual(order, []);
  resolveProvider();
  await Promise.resolve();
  assert.deepEqual(order, []);
  resolveSettings();
  await task;
  assert.deepEqual(order, ['translate']);
});

test('failed provider write prevents translation from sending', async () => {
  const { performTranslationAfterWrites } = loadPopupModule();
  let sent = false;
  await assert.rejects(
    performTranslationAfterWrites({
      settingsWrite: Promise.resolve(),
      providerWrite: Promise.reject(new Error('provider failed')),
      send: async () => { sent = true; }
    }),
    error => error.code === 'settings_write_failed'
  );
  assert.equal(sent, false);
});

test('failed language write prevents translation from sending', async () => {
  const { performTranslationAfterWrites } = loadPopupModule();
  let sent = false;
  await assert.rejects(
    performTranslationAfterWrites({
      settingsWrite: Promise.reject(new Error('language failed')),
      providerWrite: Promise.resolve(),
      send: async () => { sent = true; }
    }),
    error => error.code === 'settings_write_failed'
  );
  assert.equal(sent, false);
});

test('a successful write after a failure restores translation readiness', async () => {
  const { createSerializedWriteQueue, performTranslationAfterWrites } =
    loadPopupModule();
  const errors = [];
  const queue = createSerializedWriteQueue(error => errors.push(error.message));

  const failed = queue.enqueue(() => Promise.reject(new Error('first failed')));
  await assert.rejects(failed, /first failed/);
  await assert.rejects(queue.latest(), /first failed/);

  const succeeded = queue.enqueue(() => Promise.resolve('saved'));
  assert.equal(await succeeded, 'saved');
  assert.equal(await queue.latest(), 'saved');
  let sent = false;
  await performTranslationAfterWrites({
    settingsWrite: queue.latest(),
    providerWrite: Promise.resolve(),
    send: async () => { sent = true; }
  });
  assert.equal(sent, true);
  assert.deepEqual(errors, ['first failed']);
});

test('target failure remains blocking after an unrelated auto setting succeeds', async () => {
  const {
    createKeyedSettingWriteQueue,
    performTranslationAfterWrites
  } = loadPopupModule();
  const queue = createKeyedSettingWriteQueue();

  await assert.rejects(
    queue.enqueue(
      STORAGE_KEYS.TARGET_LANG,
      () => Promise.reject(new Error('target failed'))
    ),
    /target failed/
  );
  await queue.enqueue(
    STORAGE_KEYS.AUTO_TRANSLATE,
    () => Promise.resolve(true)
  );

  assert.deepEqual(
    [...queue.failedSettingKeys],
    [STORAGE_KEYS.TARGET_LANG]
  );
  let sent = false;
  await assert.rejects(
    performTranslationAfterWrites({
      settingsWrite: queue.latest(),
      providerWrite: Promise.resolve(),
      failedSettingKeys: queue.failedSettingKeys,
      send: async () => { sent = true; }
    }),
    error => error.code === 'settings_write_failed'
  );
  assert.equal(sent, false);
});

test('retrying the failed target key successfully restores translation', async () => {
  const {
    createKeyedSettingWriteQueue,
    performTranslationAfterWrites
  } = loadPopupModule();
  const queue = createKeyedSettingWriteQueue();

  await assert.rejects(
    queue.enqueue(
      STORAGE_KEYS.TARGET_LANG,
      () => Promise.reject(new Error('target failed'))
    ),
    /target failed/
  );
  await queue.enqueue(
    STORAGE_KEYS.TARGET_LANG,
    () => Promise.resolve('zh-CN')
  );

  assert.equal(queue.failedSettingKeys.size, 0);
  let sent = false;
  await performTranslationAfterWrites({
    settingsWrite: queue.latest(),
    providerWrite: Promise.resolve(),
    failedSettingKeys: queue.failedSettingKeys,
    send: async () => { sent = true; }
  });
  assert.equal(sent, true);
});

test('an external target change clears only the confirmed target failure', async () => {
  const {
    clearConfirmedSettingFailures,
    createKeyedSettingWriteQueue,
    performTranslationAfterWrites
  } = loadPopupModule();
  const queue = createKeyedSettingWriteQueue();

  await assert.rejects(
    queue.enqueue(
      STORAGE_KEYS.TARGET_LANG,
      () => Promise.reject(new Error('target failed'))
    ),
    /target failed/
  );
  clearConfirmedSettingFailures(queue.failedSettingKeys, {
    [STORAGE_KEYS.PROVIDER_CONFIGS]: { newValue: {} }
  }, 'sync');
  assert.equal(queue.failedSettingKeys.has(STORAGE_KEYS.TARGET_LANG), true);

  clearConfirmedSettingFailures(queue.failedSettingKeys, {
    [STORAGE_KEYS.TARGET_LANG]: { newValue: 'zh-CN' }
  }, 'sync');
  assert.equal(queue.failedSettingKeys.size, 0);

  let sent = false;
  await performTranslationAfterWrites({
    settingsWrite: Promise.resolve(),
    providerWrite: Promise.resolve(),
    failedSettingKeys: queue.failedSettingKeys,
    send: async () => { sent = true; }
  });
  assert.equal(sent, true);
});

test('multiple failed setting keys must all recover before translation', async () => {
  const {
    createKeyedSettingWriteQueue,
    performTranslationAfterWrites
  } = loadPopupModule();
  const queue = createKeyedSettingWriteQueue();

  await assert.rejects(
    queue.enqueue(
      STORAGE_KEYS.TARGET_LANG,
      () => Promise.reject(new Error('target failed'))
    ),
    /target failed/
  );
  await assert.rejects(
    queue.enqueue(
      STORAGE_KEYS.AUTO_TRANSLATE,
      () => Promise.reject(new Error('auto failed'))
    ),
    /auto failed/
  );
  await queue.enqueue(
    STORAGE_KEYS.TARGET_LANG,
    () => Promise.resolve('zh-CN')
  );

  assert.deepEqual(
    [...queue.failedSettingKeys],
    [STORAGE_KEYS.AUTO_TRANSLATE]
  );
  let sent = false;
  await assert.rejects(
    performTranslationAfterWrites({
      settingsWrite: queue.latest(),
      providerWrite: Promise.resolve(),
      failedSettingKeys: queue.failedSettingKeys,
      send: async () => { sent = true; }
    }),
    error => error.code === 'settings_write_failed'
  );
  assert.equal(sent, false);

  await queue.enqueue(
    STORAGE_KEYS.AUTO_TRANSLATE,
    () => Promise.resolve(true)
  );
  await performTranslationAfterWrites({
    settingsWrite: queue.latest(),
    providerWrite: Promise.resolve(),
    failedSettingKeys: queue.failedSettingKeys,
    send: async () => { sent = true; }
  });
  assert.equal(sent, true);
});

test('write controls stay locked through loading failure and unlock only after success', () => {
  const { setWriteControlsDisabled } = loadPopupModule();
  const elements = Object.fromEntries([
    'source-lang',
    'target-lang',
    'disable-site',
    'auto-translate',
    'context-menu',
    'provider-trigger',
    'translate-page',
    'open-options'
  ].map(id => [id, { disabled: false }]));
  const documentLike = {
    getElementById(id) {
      return elements[id];
    }
  };

  setWriteControlsDisabled(documentLike, true, true);
  for (const id of [
    'source-lang',
    'target-lang',
    'disable-site',
    'auto-translate',
    'context-menu',
    'provider-trigger',
    'translate-page'
  ]) {
    assert.equal(elements[id].disabled, true);
  }
  assert.equal(elements['open-options'].disabled, false);

  setWriteControlsDisabled(documentLike, false, true);
  for (const id of [
    'source-lang',
    'target-lang',
    'disable-site',
    'auto-translate',
    'context-menu',
    'provider-trigger'
  ]) {
    assert.equal(elements[id].disabled, false);
  }
  assert.equal(elements['open-options'].disabled, false);
});

test('external provider storage changes update only the relevant state slice', () => {
  const { applyProviderStorageChanges } = loadPopupModule();
  const initial = {
    activeProviderId: 'mymemory',
    providerConfigs: { deepseek: { model: 'old' } },
    providerApiKeys: { deepseek: 'old-key' }
  };
  const afterSync = applyProviderStorageChanges(initial, {
    active_provider: { newValue: 'deepseek' },
    provider_configs: { newValue: { deepseek: { model: 'new' } } }
  }, 'sync');
  assert.equal(afterSync.activeProviderId, 'deepseek');
  assert.equal(afterSync.providerConfigs.deepseek.model, 'new');
  assert.equal(afterSync.providerApiKeys.deepseek, 'old-key');

  const afterLocal = applyProviderStorageChanges(afterSync, {
    provider_api_keys: { newValue: { deepseek: 'new-key' } }
  }, 'local');
  assert.equal(afterLocal.providerApiKeys.deepseek, 'new-key');
  assert.equal(afterLocal.providerConfigs.deepseek.model, 'new');
});

test('popup binds keyboard closing, outside click, storage updates, and always exposes options', () => {
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /event\.key === 'Tab'/);
  assert.match(script, /document\.addEventListener\('click'/);
  assert.match(script, /chromeApi\.storage\.onChanged\.addListener/);
  assert.match(
    script,
    /settingsWriteQueue\.enqueue\(STORAGE_KEYS\.DISABLED_SITES/
  );
  assert.doesNotMatch(script, /settingsWriteFailed/);
  assert.match(script, /getElement\('open-options'\)\.addEventListener/);
  assert.match(script, /settings_write_failed/);
  assert.match(script, /设置尚未保存，未开始翻译/);
  assert.doesNotMatch(html, /<button id="open-options"[^>]*disabled/);
});

test('options page exposes a custom glossary editor', () => {
  const optionsHtml = fs.readFileSync(path.join(root, 'src', 'options.html'), 'utf8');
  const optionsScript = fs.readFileSync(path.join(root, 'src', 'options.js'), 'utf8');

  assert.match(optionsHtml, /id="custom-glossary"/);
  assert.match(optionsScript, /STORAGE_KEYS\.CUSTOM_GLOSSARY/);
});
