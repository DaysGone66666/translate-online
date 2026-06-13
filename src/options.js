(function initTranslateOnlineOptions(globalScope) {
  const shared = globalScope.TranslateOnlineShared ||
    (typeof require === 'function' ? require('./shared.js') : null);
  const providerRegistry = globalScope.TranslateOnlineProviders ||
    (typeof require === 'function' ? require('./providers.js') : null);

  const {
    STORAGE_KEYS,
    normalizeApiBaseUrl,
    parseDisabledSites,
    toOriginPattern
  } = shared;
  const {
    PROVIDER_IDS,
    PROVIDERS,
    getProvider,
    getDefaultProviderConfig,
    mergeProviderConfig,
    resolveProviderModel,
    isProviderConfigured,
    getProviderDisplayName
  } = providerRegistry;

  const COMMAND_NAME = 'translate-selection';
  const CUSTOM_MODEL_VALUE = '__custom__';
  const LEGACY_SYNC_KEYS = [
    STORAGE_KEYS.ENGINE,
    STORAGE_KEYS.MODEL,
    STORAGE_KEYS.API_URL,
    STORAGE_KEYS.DEEPSEEK_KEY
  ];

  let activeProviderId = 'mymemory';
  let selectedProviderId = 'mymemory';
  let providerConfigs = {};
  let providerApiKeys = {};
  let statusTimer = null;
  let saveInProgress = false;

  function createProviderDrafts(storedConfigs) {
    const source = storedConfigs && typeof storedConfigs === 'object'
      ? storedConfigs
      : {};
    return Object.fromEntries(PROVIDER_IDS.map(providerId => [
      providerId,
      mergeProviderConfig(providerId, source[providerId])
    ]));
  }

  function filterProviderIds(query, configs) {
    const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
    if (!normalizedQuery) return [...PROVIDER_IDS];

    return PROVIDER_IDS.filter(providerId => {
      const provider = getProvider(providerId);
      const displayName = getProviderDisplayName(providerId, configs[providerId]);
      return [provider.name, provider.id, displayName].some(value =>
        String(value).toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }

  function getProviderTabStopId(visibleIds, selectedId) {
    if (!visibleIds.length) return null;
    return visibleIds.includes(selectedId) ? selectedId : visibleIds[0];
  }

  function getNextProviderId(visibleIds, currentId, key) {
    if (!visibleIds.length) return null;
    if (key === 'Home') return visibleIds[0];
    if (key === 'End') return visibleIds[visibleIds.length - 1];

    const direction = ['ArrowDown', 'ArrowRight'].includes(key)
      ? 1
      : ['ArrowUp', 'ArrowLeft'].includes(key)
        ? -1
        : 0;
    if (!direction) return currentId;

    const currentIndex = visibleIds.indexOf(currentId);
    if (currentIndex === -1) {
      return direction > 0 ? visibleIds[0] : visibleIds[visibleIds.length - 1];
    }
    return visibleIds[
      (currentIndex + direction + visibleIds.length) % visibleIds.length
    ];
  }

  function getCardStatus(providerId, config, apiKey) {
    if (config.connectionStatus === 'success') return 'success';
    if (config.connectionStatus === 'failed') return 'failed';
    if (isProviderConfigured(providerId, config, apiKey)) return 'configured';
    return 'unconfigured';
  }

  function buildProviderCardData(configs, apiKeys, selectedId) {
    return PROVIDER_IDS.map(providerId => {
      const provider = getProvider(providerId);
      const config = mergeProviderConfig(providerId, configs[providerId]);
      return {
        id: providerId,
        displayName: getProviderDisplayName(providerId, config),
        icon: provider.icon,
        detail: provider.protocol === 'mymemory'
          ? '无需配置'
          : config.model || '未设置模型',
        statusClass: getCardStatus(providerId, config, apiKeys[providerId]),
        selected: providerId === selectedId
      };
    });
  }

  function getProviderFormState(providerId, configValue) {
    const provider = getProvider(providerId);
    const config = mergeProviderConfig(providerId, configValue);
    const isPreset = provider.models.includes(config.model);
    const modelOptions = [
      ...provider.models.map(model => ({ value: model, label: model })),
      { value: CUSTOM_MODEL_VALUE, label: '手动输入模型 ID' }
    ];
    return {
      provider,
      config,
      free: provider.protocol === 'mymemory',
      freeNote: '无需配置',
      showConfigFields: provider.protocol !== 'mymemory',
      showDisplayName: Boolean(provider.allowsDisplayName),
      modelOptions,
      modelPreset: isPreset ? config.model : CUSTOM_MODEL_VALUE,
      customModel: isPreset ? '' : config.model
    };
  }

  function captureProviderValues(state, providerId, values) {
    const provider = getProvider(providerId);
    if (provider.protocol === 'mymemory') return state;

    const current = mergeProviderConfig(providerId, state.providerConfigs[providerId]);
    let model;
    if (values.modelPreset === CUSTOM_MODEL_VALUE) {
      const customModel = String(values.customModel || '').trim();
      model = customModel
        ? resolveProviderModel(providerId, CUSTOM_MODEL_VALUE, customModel)
        : '';
    } else {
      model = resolveProviderModel(providerId, values.modelPreset, '');
    }

    const nextConfig = {
      ...current,
      model,
      apiUrl: String(values.apiUrl || '').trim()
    };
    if (provider.allowsDisplayName) {
      nextConfig.displayName = String(values.displayName || '').trim();
    }

    const previousApiKey = String(state.providerApiKeys[providerId] || '').trim();
    const nextApiKey = String(values.apiKey || '').trim();
    const changed = nextConfig.model !== current.model ||
      nextConfig.apiUrl !== current.apiUrl ||
      (
        provider.allowsDisplayName &&
        nextConfig.displayName !== current.displayName
      ) ||
      nextApiKey !== previousApiKey;
    if (changed) {
      nextConfig.connectionStatus = 'untested';
    }

    state.providerConfigs[providerId] = nextConfig;
    state.providerApiKeys[providerId] = nextApiKey;
    return state;
  }

  function isEditedProvider(providerId, configValue, apiKey) {
    const provider = getProvider(providerId);
    if (provider.protocol === 'mymemory') return false;
    const defaults = getDefaultProviderConfig(providerId);
    const config = mergeProviderConfig(providerId, configValue);
    return Boolean(
      String(apiKey || '').trim() ||
      config.model !== defaults.model ||
      config.apiUrl !== defaults.apiUrl ||
      (provider.allowsDisplayName && config.displayName !== defaults.displayName)
    );
  }

  function normalizeProviderForSave(providerId, configValue) {
    const provider = getProvider(providerId);
    const merged = mergeProviderConfig(providerId, configValue);
    if (provider.protocol === 'mymemory') return merged;
    if (!merged.model) {
      throw new Error(`${getProviderDisplayName(providerId, merged)} 模型 ID 不能为空`);
    }

    const normalized = {
      ...merged,
      model: resolveProviderModel(providerId, merged.model, ''),
      apiUrl: merged.apiUrl ? normalizeApiBaseUrl(merged.apiUrl) : ''
    };
    if (!provider.allowsDisplayName) delete normalized.displayName;
    return normalized;
  }

  function buildPreferenceStorage(preferences) {
    return {
      [STORAGE_KEYS.SOURCE_LANG]: preferences.sourceLang || 'auto',
      [STORAGE_KEYS.TARGET_LANG]: preferences.targetLang || 'zh-CN',
      [STORAGE_KEYS.AUTO_TRANSLATE]: preferences.autoTranslate !== false,
      [STORAGE_KEYS.CONTEXT_MENU]: preferences.contextMenu !== false,
      [STORAGE_KEYS.DISABLED_SITES]: parseDisabledSites(preferences.disabledSites || []),
      [STORAGE_KEYS.CUSTOM_GLOSSARY]: String(preferences.customGlossary || '').trim()
    };
  }

  async function saveProviderSettings({
    chromeApi,
    state,
    preferences,
    ensurePermission
  }) {
    const normalizedConfigs = {};
    const normalizedKeys = {};
    const providersNeedingPermission = [];

    for (const providerId of PROVIDER_IDS) {
      const provider = getProvider(providerId);
      const apiKey = String(state.providerApiKeys[providerId] || '').trim();
      const relevant = providerId === state.activeProviderId ||
        isEditedProvider(providerId, state.providerConfigs[providerId], apiKey);
      const config = relevant
        ? normalizeProviderForSave(providerId, state.providerConfigs[providerId])
        : mergeProviderConfig(providerId, state.providerConfigs[providerId]);
      normalizedConfigs[providerId] = config;
      if (apiKey) normalizedKeys[providerId] = apiKey;

      if (provider.protocol === 'mymemory' || !relevant) continue;
      if (!isProviderConfigured(providerId, config, apiKey)) {
        throw new Error(`${getProviderDisplayName(providerId, config)} 配置不完整`);
      }
      providersNeedingPermission.push({ providerId, apiUrl: config.apiUrl });
    }

    for (const item of providersNeedingPermission) {
      if (!await ensurePermission(item.apiUrl)) {
        throw new Error(`${getProviderDisplayName(
          item.providerId,
          normalizedConfigs[item.providerId]
        )} API 地址未获得访问权限`);
      }
    }

    const syncValue = {
      [STORAGE_KEYS.ACTIVE_PROVIDER]: state.activeProviderId,
      [STORAGE_KEYS.PROVIDER_CONFIGS]: normalizedConfigs,
      ...buildPreferenceStorage(preferences || {})
    };
    const localValue = {
      [STORAGE_KEYS.PROVIDER_API_KEYS]: normalizedKeys
    };

    const previousLocal = await chromeApi.storage.local.get([
      STORAGE_KEYS.PROVIDER_API_KEYS
    ]);
    const hadPreviousKeys = Object.prototype.hasOwnProperty.call(
      previousLocal,
      STORAGE_KEYS.PROVIDER_API_KEYS
    );
    const previousKeys = previousLocal[STORAGE_KEYS.PROVIDER_API_KEYS];
    const rollbackValue = {
      [STORAGE_KEYS.PROVIDER_API_KEYS]:
        previousKeys && typeof previousKeys === 'object'
          ? previousKeys
          : {}
    };

    await chromeApi.storage.local.set(localValue);
    try {
      await chromeApi.storage.sync.set(syncValue);
    } catch (saveError) {
      try {
        if (hadPreviousKeys) {
          await chromeApi.storage.local.set(rollbackValue);
        } else {
          await chromeApi.storage.local.remove(STORAGE_KEYS.PROVIDER_API_KEYS);
        }
      } catch {
        throw new Error('保存失败且本地密钥回滚失败');
      }
      throw saveError;
    }
    const cleanupResults = await Promise.allSettled([
      chromeApi.storage.sync.remove(LEGACY_SYNC_KEYS),
      chromeApi.storage.local.remove(STORAGE_KEYS.DEEPSEEK_KEY)
    ]);
    const cleanupErrors = cleanupResults
      .map((result, index) => result.status === 'rejected'
        ? (index === 0 ? 'sync' : 'local')
        : null)
      .filter(Boolean);
    return {
      normalizedConfigs,
      normalizedKeys,
      cleanupWarning: cleanupErrors.length > 0,
      cleanupErrors
    };
  }

  function buildConnectionMessage(providerId, configValue, apiKeyValue) {
    const provider = getProvider(providerId);
    const config = normalizeProviderForSave(providerId, configValue);
    const messageConfig = {
      model: config.model,
      apiUrl: config.apiUrl
    };
    if (provider.allowsDisplayName) {
      messageConfig.displayName = config.displayName;
    }
    return {
      type: 'test-provider-connection',
      providerId,
      config: messageConfig,
      apiKey: provider.protocol === 'mymemory'
        ? ''
        : String(apiKeyValue || '').trim()
    };
  }

  function createConnectionSnapshot(providerId, configValue, apiKeyValue) {
    const provider = getProvider(providerId);
    const config = mergeProviderConfig(providerId, configValue);
    const snapshot = {
      model: config.model,
      apiUrl: config.apiUrl
    };
    if (provider.allowsDisplayName) {
      snapshot.displayName = config.displayName;
    }
    snapshot.apiKey = String(apiKeyValue || '').trim();
    return snapshot;
  }

  function isConnectionSnapshotCurrent(state, providerId, testedSnapshot) {
    const currentSnapshot = createConnectionSnapshot(
      providerId,
      state.providerConfigs[providerId],
      state.providerApiKeys[providerId]
    );
    return Object.keys(testedSnapshot).every(
      key => currentSnapshot[key] === testedSnapshot[key]
    );
  }

  function updateConnectionStatusIfCurrent(
    state,
    providerId,
    testedSnapshot,
    connectionStatus
  ) {
    if (!isConnectionSnapshotCurrent(state, providerId, testedSnapshot)) {
      return false;
    }
    state.providerConfigs[providerId] = {
      ...(state.providerConfigs[providerId] || {}),
      connectionStatus
    };
    return true;
  }

  async function testProviderConnection({
    state,
    providerId,
    ensurePermission,
    sendMessage,
    testedSnapshot
  }) {
    const provider = getProvider(providerId);
    const connectionSnapshot = testedSnapshot || createConnectionSnapshot(
      providerId,
      state.providerConfigs[providerId],
      state.providerApiKeys[providerId]
    );
    const apiKey = connectionSnapshot.apiKey;
    const config = normalizeProviderForSave(
      providerId,
      connectionSnapshot
    );

    if (
      provider.protocol !== 'mymemory' &&
      !isProviderConfigured(providerId, config, apiKey)
    ) {
      throw new Error(`${getProviderDisplayName(providerId, config)} 配置不完整`);
    }
    if (
      provider.protocol !== 'mymemory' &&
      !await ensurePermission(config.apiUrl)
    ) {
      throw new Error(`${getProviderDisplayName(providerId, config)} API 地址未获得访问权限`);
    }

    const response = await sendMessage(
      buildConnectionMessage(providerId, config, apiKey)
    );
    updateConnectionStatusIfCurrent(
      state,
      providerId,
      connectionSnapshot,
      response?.success ? 'success' : 'failed'
    );
    return response;
  }

  async function runProviderConnectionTest({
    state,
    providerId,
    ensurePermission,
    sendMessage
  }) {
    const testedSnapshot = createConnectionSnapshot(
      providerId,
      state.providerConfigs[providerId],
      state.providerApiKeys[providerId]
    );
    const displayName = getProviderDisplayName(
      providerId,
      state.providerConfigs[providerId]
    );
    try {
      const response = await testProviderConnection({
        state,
        providerId,
        ensurePermission,
        sendMessage,
        testedSnapshot
      });
      return {
        providerId,
        displayName,
        ok: Boolean(response?.success),
        message: response?.message || response?.error || '',
        response
      };
    } catch (error) {
      updateConnectionStatusIfCurrent(
        state,
        providerId,
        testedSnapshot,
        'failed'
      );
      return {
        providerId,
        displayName,
        ok: false,
        message: error.message,
        error
      };
    }
  }

  function createInitializationController() {
    let initializationPromise = null;
    return function initializeOnce({
      setControlsDisabled,
      loadSettings: loadSettingsTask,
      loadShortcut: loadShortcutTask,
      bindInteractions
    }) {
      if (initializationPromise) return initializationPromise;
      setControlsDisabled(true);
      let settingsTask;
      try {
        settingsTask = loadSettingsTask();
      } catch (error) {
        settingsTask = Promise.reject(error);
      }
      loadShortcutTask();
      initializationPromise = Promise.resolve(settingsTask)
        .then(loaded => {
          if (!loaded) return false;
          bindInteractions();
          setControlsDisabled(false);
          return true;
        });
      return initializationPromise;
    };
  }

  function containsOriginPermission(chromeApi, originPattern) {
    return new Promise((resolve, reject) => {
      chromeApi.permissions.contains({ origins: [originPattern] }, granted => {
        if (chromeApi.runtime.lastError) {
          reject(new Error(chromeApi.runtime.lastError.message));
          return;
        }
        resolve(Boolean(granted));
      });
    });
  }

  function requestOriginPermission(chromeApi, originPattern) {
    return new Promise((resolve, reject) => {
      chromeApi.permissions.request({ origins: [originPattern] }, granted => {
        if (chromeApi.runtime.lastError) {
          reject(new Error(chromeApi.runtime.lastError.message));
          return;
        }
        resolve(Boolean(granted));
      });
    });
  }

  async function ensureApiPermission(chromeApi, apiUrl) {
    const originPattern = toOriginPattern(apiUrl);
    if (await containsOriginPermission(chromeApi, originPattern)) return true;
    return requestOriginPermission(chromeApi, originPattern);
  }

  function getBrowserState() {
    return { activeProviderId, providerConfigs, providerApiKeys };
  }

  function getElement(id) {
    return globalScope.document.getElementById(id);
  }

  function renderProviderGrid(query = '') {
    const grid = getElement('provider-grid');
    const visibleIds = filterProviderIds(query, providerConfigs);
    const filteredIds = new Set(visibleIds);
    const tabStopId = getProviderTabStopId(visibleIds, selectedProviderId);
    const cards = buildProviderCardData(
      providerConfigs,
      providerApiKeys,
      selectedProviderId
    ).filter(card => filteredIds.has(card.id));
    grid.replaceChildren();

    if (!cards.length) {
      const empty = globalScope.document.createElement('div');
      empty.className = 'provider-empty';
      empty.textContent = '未找到匹配的供应商';
      grid.append(empty);
      return visibleIds;
    }

    for (const card of cards) {
      const button = globalScope.document.createElement('button');
      button.type = 'button';
      button.className = 'provider-card';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(card.selected));
      button.tabIndex = card.id === tabStopId ? 0 : -1;
      button.dataset.providerId = card.id;

      const icon = globalScope.document.createElement('img');
      icon.className = 'provider-logo';
      icon.src = card.icon;
      icon.alt = '';
      icon.loading = 'eager';
      icon.decoding = 'async';
      icon.width = 32;
      icon.height = 32;

      const copy = globalScope.document.createElement('span');
      copy.className = 'provider-card-copy';
      const name = globalScope.document.createElement('span');
      name.className = 'provider-card-name';
      name.textContent = card.displayName;
      const detail = globalScope.document.createElement('span');
      detail.className = 'provider-card-detail';
      detail.textContent = card.detail;
      copy.append(name, detail);

      const status = globalScope.document.createElement('span');
      status.className = `provider-status ${card.statusClass}`;
      status.setAttribute('aria-label', card.statusClass);
      button.append(icon, copy, status);
      button.addEventListener('click', () => {
        selectProvider(card.id, true);
      });
      grid.append(button);
    }
    return visibleIds;
  }

  function focusProviderCard(providerId) {
    const cards = getElement('provider-grid').querySelectorAll('.provider-card');
    const card = [...cards].find(item => item.dataset.providerId === providerId);
    if (card) card.focus();
  }

  function selectProvider(providerId, restoreFocus) {
    captureActiveProviderForm();
    selectedProviderId = providerId;
    renderProviderGrid(getElement('provider-search').value);
    renderProviderForm(providerId);
    if (restoreFocus) focusProviderCard(providerId);
  }

  function setLink(element, url) {
    element.hidden = !url;
    if (url) {
      element.href = url;
    } else {
      element.removeAttribute('href');
    }
  }

  function updateCustomModelState() {
    const preset = getElement('provider-model-preset');
    const custom = getElement('provider-custom-model');
    const isCustom = preset.value === CUSTOM_MODEL_VALUE;
    custom.hidden = !isCustom;
    custom.required = isCustom;
  }

  function renderProviderForm(providerId) {
    const state = getProviderFormState(providerId, providerConfigs[providerId]);
    const provider = state.provider;

    getElement('provider-config-title').textContent =
      `${getProviderDisplayName(providerId, state.config)} 配置`;
    getElement('provider-config-summary').textContent = state.free
      ? '使用 MyMemory 免费翻译服务。'
      : `当前模型：${state.config.model || '未设置'}`;
    getElement('provider-free-note').hidden = !state.free;

    for (const groupId of [
      'provider-api-key-group',
      'provider-model-group',
      'provider-api-url-group'
    ]) {
      getElement(groupId).hidden = !state.showConfigFields;
    }
    getElement('provider-display-name-group').hidden =
      !state.showConfigFields || !state.showDisplayName;

    getElement('provider-display-name').value = state.config.displayName || '';
    getElement('provider-api-key').value = providerApiKeys[providerId] || '';
    getElement('provider-api-url').value = state.config.apiUrl;

    const preset = getElement('provider-model-preset');
    preset.replaceChildren();
    for (const item of state.modelOptions) {
      const option = globalScope.document.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      preset.append(option);
    }
    preset.value = state.modelPreset;
    getElement('provider-custom-model').value = state.customModel;
    updateCustomModelState();

    setLink(getElement('provider-console-link'), provider.consoleUrl);
    setLink(getElement('provider-docs-link'), provider.docsUrl);
    getElement('btn-test-provider').textContent =
      state.free ? '测试免费服务' : '测试连接';
  }

  function captureActiveProviderForm() {
    if (!selectedProviderId || !providerConfigs[selectedProviderId]) return;
    captureProviderValues(getBrowserState(), selectedProviderId, {
      displayName: getElement('provider-display-name').value,
      apiKey: getElement('provider-api-key').value,
      apiUrl: getElement('provider-api-url').value,
      modelPreset: getElement('provider-model-preset').value,
      customModel: getElement('provider-custom-model').value
    });
  }

  function updateChipStates() {
    globalScope.document.querySelectorAll('.chip input[type="checkbox"]').forEach(checkbox => {
      const chip = checkbox.closest('.chip');
      chip.classList.toggle('chip-active', checkbox.checked);
      chip.classList.toggle('chip-inactive', !checkbox.checked);
    });
  }

  function loadShortcut(chromeApi) {
    chromeApi.commands.getAll(commands => {
      const command = commands.find(item => item.name === COMMAND_NAME);
      getElement('shortcut-display').textContent = command?.shortcut || '未设置';
    });
  }

  async function loadSettings(chromeApi) {
    try {
      const [syncItems, localItems] = await Promise.all([
        chromeApi.storage.sync.get([
          STORAGE_KEYS.ACTIVE_PROVIDER,
          STORAGE_KEYS.PROVIDER_CONFIGS,
          STORAGE_KEYS.SOURCE_LANG,
          STORAGE_KEYS.TARGET_LANG,
          STORAGE_KEYS.AUTO_TRANSLATE,
          STORAGE_KEYS.CONTEXT_MENU,
          STORAGE_KEYS.DISABLED_SITES,
          STORAGE_KEYS.CUSTOM_GLOSSARY
        ]),
        chromeApi.storage.local.get([STORAGE_KEYS.PROVIDER_API_KEYS])
      ]);

      providerConfigs = createProviderDrafts(
        syncItems[STORAGE_KEYS.PROVIDER_CONFIGS]
      );
      const storedKeys = localItems[STORAGE_KEYS.PROVIDER_API_KEYS];
      providerApiKeys = storedKeys && typeof storedKeys === 'object'
        ? Object.fromEntries(PROVIDER_IDS
          .filter(providerId => Object.prototype.hasOwnProperty.call(storedKeys, providerId))
          .map(providerId => [providerId, String(storedKeys[providerId] || '')]))
        : {};
      activeProviderId = PROVIDERS[syncItems[STORAGE_KEYS.ACTIVE_PROVIDER]]
        ? syncItems[STORAGE_KEYS.ACTIVE_PROVIDER]
        : 'mymemory';
      selectedProviderId = activeProviderId;

      getElement('source-lang').value =
        syncItems[STORAGE_KEYS.SOURCE_LANG] || 'auto';
      getElement('target-lang').value =
        syncItems[STORAGE_KEYS.TARGET_LANG] || 'zh-CN';
      getElement('trigger-select').checked =
        syncItems[STORAGE_KEYS.AUTO_TRANSLATE] !== false;
      getElement('trigger-contextmenu').checked =
        syncItems[STORAGE_KEYS.CONTEXT_MENU] !== false;
      getElement('disabled-sites').value =
        (syncItems[STORAGE_KEYS.DISABLED_SITES] || []).join('\n');
      getElement('custom-glossary').value =
        syncItems[STORAGE_KEYS.CUSTOM_GLOSSARY] || '';

      updateChipStates();
      renderProviderGrid();
      renderProviderForm(selectedProviderId);
      return true;
    } catch (error) {
      showStatus(`读取设置失败：${error.message}`, 'error');
      return false;
    }
  }

  function readPreferences() {
    return {
      sourceLang: getElement('source-lang').value,
      targetLang: getElement('target-lang').value,
      autoTranslate: getElement('trigger-select').checked,
      contextMenu: getElement('trigger-contextmenu').checked,
      disabledSites: getElement('disabled-sites').value,
      customGlossary: getElement('custom-glossary').value
    };
  }

  async function saveSettings(chromeApi) {
    if (saveInProgress) return;
    const button = getElement('btn-save');
    saveInProgress = true;
    button.disabled = true;
    try {
      captureActiveProviderForm();
      const result = await saveProviderSettings({
        chromeApi,
        state: {
          ...getBrowserState(),
          activeProviderId: selectedProviderId
        },
        preferences: readPreferences(),
        ensurePermission: apiUrl => ensureApiPermission(chromeApi, apiUrl)
      });
      activeProviderId = selectedProviderId;
      providerConfigs = result.normalizedConfigs;
      providerApiKeys = result.normalizedKeys;
      renderProviderGrid(getElement('provider-search').value);
      renderProviderForm(selectedProviderId);
      if (result.cleanupWarning) {
        showStatus(
          '设置已保存，但旧配置清理失败，请再次保存重试',
          'info'
        );
      } else {
        showStatus('设置已保存', 'success');
      }
    } catch (error) {
      showStatus(error.message, 'error');
    } finally {
      saveInProgress = false;
      button.disabled = false;
    }
  }

  async function testConnection(chromeApi) {
    const testedProviderId = selectedProviderId;
    const button = getElement('btn-test-provider');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '测试中...';
    captureActiveProviderForm();
    const testedDisplayName = getProviderDisplayName(
      testedProviderId,
      providerConfigs[testedProviderId]
    );
    try {
      const result = await runProviderConnectionTest({
        state: getBrowserState(),
        providerId: testedProviderId,
        ensurePermission: apiUrl => ensureApiPermission(chromeApi, apiUrl),
        sendMessage: message => chromeApi.runtime.sendMessage(message)
      });
      renderProviderGrid(getElement('provider-search').value);
      showStatus(
        result.ok
          ? `${testedDisplayName} 连接成功`
          : result.message || '连接测试失败',
        result.ok ? 'success' : 'error'
      );
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      if (selectedProviderId !== testedProviderId) {
        renderProviderForm(selectedProviderId);
      }
    }
  }

  function showStatus(message, type) {
    const element = getElement('status-message');
    element.textContent = message;
    element.className = `status-message ${type}`;
    if (statusTimer) globalScope.clearTimeout(statusTimer);
    statusTimer = globalScope.setTimeout(() => {
      element.className = 'status-message';
      element.textContent = '';
    }, 6000);
  }

  function setPrimaryControlsDisabled(disabled) {
    getElement('btn-save').disabled = disabled;
    getElement('btn-test-provider').disabled = disabled;
  }

  function bindInteractions(chromeApi) {
    getElement('provider-search').addEventListener('input', event => {
      renderProviderGrid(event.target.value);
    });
    const providerGrid = getElement('provider-grid');
    providerGrid.addEventListener('keydown', event => {
      const option = event.target.closest('.provider-card');
      if (!option) return;
      const visibleIds = filterProviderIds(
        getElement('provider-search').value,
        providerConfigs
      );
      const nextProviderId = getNextProviderId(
        visibleIds,
        option.dataset.providerId,
        event.key
      );
      if (
        !nextProviderId ||
        !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End']
          .includes(event.key)
      ) {
        return;
      }
      event.preventDefault();
      selectProvider(nextProviderId, true);
    });
    getElement('provider-model-preset').addEventListener('change', () => {
      updateCustomModelState();
      captureActiveProviderForm();
      renderProviderGrid(getElement('provider-search').value);
    });
    for (const id of [
      'provider-display-name',
      'provider-api-key',
      'provider-custom-model',
      'provider-api-url'
    ]) {
      getElement(id).addEventListener('input', () => {
        captureActiveProviderForm();
        renderProviderGrid(getElement('provider-search').value);
      });
    }
    globalScope.document.querySelectorAll('.chip input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', updateChipStates);
    });
    getElement('btn-save').addEventListener('click', () => saveSettings(chromeApi));
    getElement('btn-test-provider').addEventListener('click', () => testConnection(chromeApi));
    getElement('btn-shortcut-help').addEventListener('click', () => {
      showStatus(
        '请在地址栏输入 edge://extensions/shortcuts 或 chrome://extensions/shortcuts 修改快捷键',
        'info'
      );
    });
  }

  const initializePage = createInitializationController();

  function initialize(chromeApi) {
    return initializePage({
      setControlsDisabled: setPrimaryControlsDisabled,
      loadSettings: () => {
        providerConfigs = createProviderDrafts({});
        return loadSettings(chromeApi);
      },
      loadShortcut: () => loadShortcut(chromeApi),
      bindInteractions: () => bindInteractions(chromeApi)
    });
  }

  const api = {
    buildConnectionMessage,
    buildProviderCardData,
    captureProviderValues,
    createConnectionSnapshot,
    createInitializationController,
    createProviderDrafts,
    filterProviderIds,
    getNextProviderId,
    getProviderFormState,
    getProviderTabStopId,
    isEditedProvider,
    normalizeProviderForSave,
    runProviderConnectionTest,
    saveProviderSettings,
    testProviderConnection
  };

  globalScope.TranslateOnlineOptions = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (
    globalScope.document &&
    typeof globalScope.chrome?.storage?.sync?.get === 'function' &&
    typeof globalScope.chrome.storage.sync.set === 'function' &&
    typeof globalScope.chrome.storage.local.get === 'function' &&
    typeof globalScope.chrome.storage.local.set === 'function' &&
    typeof globalScope.chrome.permissions?.contains === 'function' &&
    typeof globalScope.chrome.permissions.request === 'function' &&
    typeof globalScope.chrome.runtime?.sendMessage === 'function' &&
    typeof globalScope.chrome.commands?.getAll === 'function'
  ) {
    globalScope.document.addEventListener('DOMContentLoaded', () => {
      initialize(globalScope.chrome);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
