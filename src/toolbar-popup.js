(function initTranslateOnlineToolbarPopup(globalScope) {
  const shared = globalScope.TranslateOnlineShared ||
    (typeof require === 'function' ? require('./shared.js') : null);
  const providerRegistry = globalScope.TranslateOnlineProviders ||
    (typeof require === 'function' ? require('./providers.js') : null);

  const {
    STORAGE_KEYS,
    isSiteDisabled,
    parseDisabledSites
  } = shared;
  const {
    PROVIDER_IDS,
    getProvider,
    mergeProviderConfig,
    isProviderConfigured,
    getProviderDisplayName
  } = providerRegistry;

  const PROVIDER_ID_SET = new Set(PROVIDER_IDS);
  const MANAGED_SETTING_KEYS = new Set([
    STORAGE_KEYS.SOURCE_LANG,
    STORAGE_KEYS.TARGET_LANG,
    STORAGE_KEYS.AUTO_TRANSLATE,
    STORAGE_KEYS.CONTEXT_MENU,
    STORAGE_KEYS.DISABLED_SITES
  ]);
  let chromeApi = null;
  let activeTab = null;
  let activeHostname = '';
  let disabledSites = [];
  let activeProviderId = 'mymemory';
  let providerConfigs = {};
  let providerApiKeys = {};
  let providerEntries = [];
  let providerStateVersion = 0;
  let providerWriteFailed = false;
  let settingsLoaded = false;
  let controlsBound = false;
  let storageListenerBound = false;

  function createSerializedWriteQueue(onError) {
    let tail = Promise.resolve();
    let latestWrite = Promise.resolve();
    return {
      enqueue(task) {
        const operation = tail.then(task);
        latestWrite = operation;
        operation.catch(error => {
          if (onError) onError(error);
        });
        tail = operation.catch(() => undefined);
        return operation;
      },
      latest() {
        return latestWrite;
      }
    };
  }

  function createKeyedSettingWriteQueue(onError, onStateChange) {
    const queue = createSerializedWriteQueue();
    const failedSettingKeys = new Set();
    return {
      failedSettingKeys,
      enqueue(key, task) {
        const operation = queue.enqueue(task);
        operation.then(
          () => {
            failedSettingKeys.delete(key);
            if (onStateChange) onStateChange();
          },
          error => {
            failedSettingKeys.add(key);
            if (onError) onError(error, key);
            if (onStateChange) onStateChange();
          }
        );
        return operation;
      },
      latest() {
        return queue.latest();
      }
    };
  }

  function clearConfirmedSettingFailures(
    failedSettingKeys,
    changes,
    areaName
  ) {
    if (areaName !== 'sync') return false;
    let changed = false;
    for (const key of MANAGED_SETTING_KEYS) {
      if (changes[key] && failedSettingKeys.delete(key)) {
        changed = true;
      }
    }
    return changed;
  }

  const settingsWriteQueue = createKeyedSettingWriteQueue(
    error => {
      showStatus(error.message, 'error');
    },
    () => {
      updateTranslateAvailability();
    }
  );
  const providerWriteQueue = createSerializedWriteQueue(() => {
    providerWriteFailed = true;
    updateTranslateAvailability();
  });

  function buildProviderEntries(configs, apiKeys, selectedProviderId) {
    const storedConfigs = configs && typeof configs === 'object' ? configs : {};
    const storedApiKeys = apiKeys && typeof apiKeys === 'object' ? apiKeys : {};
    return PROVIDER_IDS.map(providerId => {
      const provider = getProvider(providerId);
      const config = mergeProviderConfig(providerId, storedConfigs[providerId]);
      const configured = isProviderConfigured(
        providerId,
        config,
        storedApiKeys[providerId]
      );
      return {
        id: providerId,
        displayName: getProviderDisplayName(providerId, config),
        icon: provider.icon,
        model: config.model,
        detail: provider.protocol === 'mymemory'
          ? '无需配置'
          : config.model || '未设置模型',
        configured,
        selected: providerId === selectedProviderId
      };
    });
  }

  function getTranslateAvailability({
    configured,
    hasActiveTab,
    hostname,
    siteDisabled
  }) {
    if (!configured) {
      return { enabled: false, reason: '当前服务需要配置' };
    }
    if (!hasActiveTab || !hostname) {
      return { enabled: false, reason: '当前页面不可访问' };
    }
    if (siteDisabled) {
      return { enabled: false, reason: '当前网站已禁用' };
    }
    return { enabled: true, reason: '' };
  }

  function getProviderNavigationTarget(providerIds, currentProviderId, key) {
    if (!providerIds.length) return null;
    if (key === 'Home') return providerIds[0];
    if (key === 'End') return providerIds[providerIds.length - 1];
    const direction = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
    if (!direction) return currentProviderId;
    const currentIndex = providerIds.indexOf(currentProviderId);
    if (currentIndex === -1) {
      return direction > 0 ? providerIds[0] : providerIds[providerIds.length - 1];
    }
    return providerIds[
      (currentIndex + direction + providerIds.length) % providerIds.length
    ];
  }

  function getProviderOpenFocus(providerIds, selectedProviderId, key) {
    if (!providerIds.length) return null;
    if (key === 'ArrowUp') return providerIds[providerIds.length - 1];
    return providerIds.includes(selectedProviderId)
      ? selectedProviderId
      : providerIds[0];
  }

  async function commitProviderSelection({
    chromeApi: storageChrome,
    previousProviderId,
    providerId,
    operationVersion,
    getStateVersion,
    getActiveProviderId,
    applyProviderId
  }) {
    applyProviderId(providerId);
    try {
      await storageChrome.storage.sync.set({
        [STORAGE_KEYS.ACTIVE_PROVIDER]: providerId
      });
      return providerId;
    } catch (error) {
      if (
        getStateVersion() === operationVersion &&
        getActiveProviderId() === providerId
      ) {
        applyProviderId(previousProviderId);
      }
      throw error;
    }
  }

  function waitForPendingWrites(settingsWrite, providerWrite) {
    return Promise.all([settingsWrite, providerWrite]);
  }

  async function performTranslationAfterWrites({
    settingsWrite,
    providerWrite,
    failedSettingKeys,
    send
  }) {
    try {
      await waitForPendingWrites(settingsWrite, providerWrite);
    } catch (cause) {
      const error = new Error('设置尚未保存，未开始翻译');
      error.code = 'settings_write_failed';
      error.cause = cause;
      throw error;
    }
    if (failedSettingKeys?.size) {
      const error = new Error('设置尚未保存，未开始翻译');
      error.code = 'settings_write_failed';
      throw error;
    }
    return send();
  }

  function setWriteControlsDisabled(documentLike, disabled, hasHostname) {
    for (const id of [
      'source-lang',
      'target-lang',
      'auto-translate',
      'context-menu',
      'provider-trigger'
    ]) {
      documentLike.getElementById(id).disabled = disabled;
    }
    documentLike.getElementById('disable-site').disabled =
      disabled || !hasHostname;
    if (disabled) {
      documentLike.getElementById('translate-page').disabled = true;
    }
  }

  function applyProviderStorageChanges(state, changes, areaName) {
    const next = {
      activeProviderId: state.activeProviderId,
      providerConfigs: state.providerConfigs,
      providerApiKeys: state.providerApiKeys
    };
    if (areaName === 'sync') {
      if (changes[STORAGE_KEYS.ACTIVE_PROVIDER]) {
        const storedId = changes[STORAGE_KEYS.ACTIVE_PROVIDER].newValue;
        next.activeProviderId = PROVIDER_ID_SET.has(storedId)
          ? storedId
          : 'mymemory';
      }
      if (changes[STORAGE_KEYS.PROVIDER_CONFIGS]) {
        const configs = changes[STORAGE_KEYS.PROVIDER_CONFIGS].newValue;
        next.providerConfigs = configs && typeof configs === 'object'
          ? configs
          : {};
      }
    }
    if (
      areaName === 'local' &&
      changes[STORAGE_KEYS.PROVIDER_API_KEYS]
    ) {
      const apiKeys = changes[STORAGE_KEYS.PROVIDER_API_KEYS].newValue;
      next.providerApiKeys = apiKeys && typeof apiKeys === 'object'
        ? apiKeys
        : {};
    }
    return next;
  }

  function getElement(id) {
    return globalScope.document.getElementById(id);
  }

  function getCurrentEntry() {
    return providerEntries.find(entry => entry.id === activeProviderId) ||
      providerEntries.find(entry => entry.id === 'mymemory') ||
      null;
  }

  function rebuildProviderEntries() {
    providerEntries = buildProviderEntries(
      providerConfigs,
      providerApiKeys,
      activeProviderId
    );
  }

  function renderCurrentProvider() {
    const entry = getCurrentEntry();
    if (!entry) return;
    const icon = getElement('provider-icon');
    icon.className = 'provider-logo';
    icon.src = entry.icon;
    icon.alt = `${entry.displayName} 图标`;
    icon.loading = 'eager';
    icon.decoding = 'async';
    getElement('provider-name').textContent = entry.displayName;
    getElement('provider-model').textContent = entry.detail;
  }

  function renderProviderMenu() {
    const menu = getElement('provider-menu');
    menu.replaceChildren();
    const tabStopId = PROVIDER_ID_SET.has(activeProviderId)
      ? activeProviderId
      : providerEntries[0]?.id;

    for (const entry of providerEntries) {
      const button = globalScope.document.createElement('button');
      button.type = 'button';
      button.className = `provider-option${entry.configured ? '' : ' unconfigured'}`;
      button.dataset.providerId = entry.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(entry.selected));
      button.tabIndex = entry.id === tabStopId ? 0 : -1;

      const icon = globalScope.document.createElement('img');
      icon.className = 'provider-logo';
      icon.src = entry.icon;
      icon.alt = '';
      icon.loading = 'eager';
      icon.decoding = 'async';
      icon.width = 24;
      icon.height = 24;

      const copy = globalScope.document.createElement('span');
      copy.className = 'provider-option-copy';
      const name = globalScope.document.createElement('strong');
      name.textContent = entry.displayName;
      const detail = globalScope.document.createElement('small');
      detail.textContent = entry.detail;
      copy.append(name, detail);

      const status = globalScope.document.createElement('span');
      status.className = `provider-status${entry.configured ? '' : ' unconfigured'}`;
      status.setAttribute(
        'aria-label',
        entry.configured ? '已配置' : '需要配置'
      );

      button.append(icon, copy, status);
      button.addEventListener('click', () => {
        void selectProvider(entry.id);
      });
      menu.append(button);
    }
  }

  function getProviderOptions() {
    return [...getElement('provider-menu').querySelectorAll('.provider-option')];
  }

  function focusProviderOption(providerId) {
    const options = getProviderOptions();
    const option = options.find(item => item.dataset.providerId === providerId) ||
      options[0];
    for (const item of options) {
      item.tabIndex = item === option ? 0 : -1;
    }
    option?.focus();
  }

  function openProviderMenu(focusProviderId) {
    const menu = getElement('provider-menu');
    menu.hidden = false;
    getElement('provider-trigger').setAttribute('aria-expanded', 'true');
    focusProviderOption(focusProviderId);
  }

  function closeProviderMenu(restoreTriggerFocus = false) {
    getElement('provider-menu').hidden = true;
    getElement('provider-trigger').setAttribute('aria-expanded', 'false');
    if (restoreTriggerFocus) getElement('provider-trigger').focus();
  }

  function updateTranslateAvailability(showReason = false) {
    const entry = getCurrentEntry();
    const availability = getTranslateAvailability({
      configured: Boolean(entry?.configured),
      hasActiveTab: Boolean(activeTab?.id),
      hostname: activeHostname,
      siteDisabled: isSiteDisabled(activeHostname, disabledSites)
    });
    const button = getElement('translate-page');
    button.disabled = !settingsLoaded ||
      settingsWriteQueue.failedSettingKeys.size > 0 ||
      providerWriteFailed ||
      !availability.enabled;
    if (showReason && availability.reason) {
      const suffix = availability.reason === '当前服务需要配置'
        ? '，请在扩展设置中完成配置'
        : '';
      showStatus(`${availability.reason}${suffix}`, 'error');
    }
    return availability;
  }

  function applyActiveProviderId(providerId) {
    activeProviderId = PROVIDER_ID_SET.has(providerId)
      ? providerId
      : 'mymemory';
    rebuildProviderEntries();
    renderCurrentProvider();
    renderProviderMenu();
    updateTranslateAvailability();
  }

  async function selectProvider(providerId) {
    if (!PROVIDER_ID_SET.has(providerId)) {
      closeProviderMenu(true);
      return;
    }
    if (providerId === activeProviderId && !providerWriteFailed) {
      closeProviderMenu(true);
      return;
    }

    const previousProviderId = activeProviderId;
    const operationVersion = providerStateVersion;
    const trigger = getElement('provider-trigger');
    trigger.disabled = true;
    const operation = providerWriteQueue.enqueue(() =>
      commitProviderSelection({
        chromeApi,
        previousProviderId,
        providerId,
        operationVersion,
        getStateVersion: () => providerStateVersion,
        getActiveProviderId: () => activeProviderId,
        applyProviderId: applyActiveProviderId
      })
    );
    try {
      await operation;
      providerWriteFailed = false;
      const current = getCurrentEntry();
      showStatus(
        current?.configured
          ? `已切换到 ${current.displayName}`
          : '当前服务需要配置，请在扩展设置中完成配置',
        current?.configured ? 'success' : 'error'
      );
    } catch (error) {
      showStatus(`切换翻译服务失败：${error.message}`, 'error');
    } finally {
      trigger.disabled = !settingsLoaded;
      closeProviderMenu(true);
      updateTranslateAvailability();
    }
  }

  function queueSettingWrite(key, value, message = '') {
    return settingsWriteQueue.enqueue(key, async () => {
      await chromeApi.storage.sync.set({ [key]: value });
      if (message) showStatus(message, 'success');
      return value;
    });
  }

  function queueSiteDisabledWrite(disabled) {
    if (!activeHostname) return Promise.resolve();
    const previousSites = disabledSites;
    const nextSites = disabled
      ? parseDisabledSites([...disabledSites, activeHostname])
      : disabledSites.filter(site =>
        activeHostname !== site && !activeHostname.endsWith(`.${site}`)
      );
    disabledSites = nextSites;
    updateTranslateAvailability();
    return settingsWriteQueue.enqueue(STORAGE_KEYS.DISABLED_SITES, async () => {
      try {
        await chromeApi.storage.sync.set({
          [STORAGE_KEYS.DISABLED_SITES]: nextSites
        });
        showStatus(
          disabled ? '已在当前网站禁用' : '已在当前网站启用',
          'success'
        );
        updateTranslateAvailability();
        return nextSites;
      } catch (error) {
        disabledSites = previousSites;
        getElement('disable-site').checked =
          isSiteDisabled(activeHostname, disabledSites);
        updateTranslateAvailability();
        throw error;
      }
    });
  }

  function getActiveTab() {
    return new Promise((resolve, reject) => {
      chromeApi.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (chromeApi.runtime.lastError) {
          reject(new Error(chromeApi.runtime.lastError.message));
          return;
        }
        resolve(tabs[0] || null);
      });
    });
  }

  function hostnameFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  async function loadSettings() {
    const [syncItems, localItems] = await Promise.all([
      chromeApi.storage.sync.get([
        STORAGE_KEYS.ACTIVE_PROVIDER,
        STORAGE_KEYS.PROVIDER_CONFIGS,
        STORAGE_KEYS.SOURCE_LANG,
        STORAGE_KEYS.TARGET_LANG,
        STORAGE_KEYS.AUTO_TRANSLATE,
        STORAGE_KEYS.CONTEXT_MENU,
        STORAGE_KEYS.DISABLED_SITES
      ]),
      chromeApi.storage.local.get([STORAGE_KEYS.PROVIDER_API_KEYS])
    ]);

    providerConfigs = syncItems[STORAGE_KEYS.PROVIDER_CONFIGS] &&
      typeof syncItems[STORAGE_KEYS.PROVIDER_CONFIGS] === 'object'
      ? syncItems[STORAGE_KEYS.PROVIDER_CONFIGS]
      : {};
    providerApiKeys = localItems[STORAGE_KEYS.PROVIDER_API_KEYS] &&
      typeof localItems[STORAGE_KEYS.PROVIDER_API_KEYS] === 'object'
      ? localItems[STORAGE_KEYS.PROVIDER_API_KEYS]
      : {};
    const storedProviderId = syncItems[STORAGE_KEYS.ACTIVE_PROVIDER];
    activeProviderId = PROVIDER_ID_SET.has(storedProviderId)
      ? storedProviderId
      : 'mymemory';
    disabledSites = parseDisabledSites(
      syncItems[STORAGE_KEYS.DISABLED_SITES] || []
    );

    getElement('source-lang').value =
      syncItems[STORAGE_KEYS.SOURCE_LANG] || 'auto';
    getElement('target-lang').value =
      syncItems[STORAGE_KEYS.TARGET_LANG] || 'zh-CN';
    getElement('auto-translate').checked =
      syncItems[STORAGE_KEYS.AUTO_TRANSLATE] !== false;
    getElement('context-menu').checked =
      syncItems[STORAGE_KEYS.CONTEXT_MENU] !== false;
    getElement('disable-site').checked =
      Boolean(activeHostname) && isSiteDisabled(activeHostname, disabledSites);

    settingsLoaded = true;
    rebuildProviderEntries();
    renderCurrentProvider();
    renderProviderMenu();
    setWriteControlsDisabled(
      globalScope.document,
      false,
      Boolean(activeHostname)
    );
    updateTranslateAvailability(true);
  }

  function handleStorageChanges(changes, areaName) {
    if (areaName === 'sync' && changes[STORAGE_KEYS.ACTIVE_PROVIDER]) {
      providerStateVersion += 1;
    }
    clearConfirmedSettingFailures(
      settingsWriteQueue.failedSettingKeys,
      changes,
      areaName
    );
    const next = applyProviderStorageChanges({
      activeProviderId,
      providerConfigs,
      providerApiKeys
    }, changes, areaName);
    activeProviderId = next.activeProviderId;
    providerConfigs = next.providerConfigs;
    providerApiKeys = next.providerApiKeys;
    rebuildProviderEntries();
    renderCurrentProvider();
    renderProviderMenu();
    updateTranslateAvailability(true);
  }

  function bindStorageListener() {
    if (storageListenerBound) return;
    chromeApi.storage.onChanged.addListener((changes, areaName) => {
      try {
        handleStorageChanges(changes, areaName);
      } catch (error) {
        showStatus(`更新翻译服务失败：${error.message}`, 'error');
      }
    });
    storageListenerBound = true;
  }

  function handleProviderTriggerKeydown(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    openProviderMenu(getProviderOpenFocus(
      providerEntries.map(entry => entry.id),
      activeProviderId,
      event.key
    ));
  }

  function handleProviderMenuKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeProviderMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      closeProviderMenu();
      return;
    }

    const option = event.target.closest('.provider-option');
    if (!option) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void selectProvider(option.dataset.providerId);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextProviderId = getProviderNavigationTarget(
      providerEntries.map(entry => entry.id),
      option.dataset.providerId,
      event.key
    );
    focusProviderOption(nextProviderId);
  }

  async function translateCurrentPage() {
    try {
      await performTranslationAfterWrites({
        settingsWrite: settingsWriteQueue.latest(),
        providerWrite: providerWriteQueue.latest(),
        failedSettingKeys: settingsWriteQueue.failedSettingKeys,
        send: async () => {
          const availability = updateTranslateAvailability(true);
          if (!availability.enabled) return;

          const button = getElement('translate-page');
          button.disabled = true;
          await new Promise((resolve, reject) => {
            chromeApi.tabs.sendMessage(
              activeTab.id,
              { type: 'start-page-translation-command' },
              response => {
                if (chromeApi.runtime.lastError) {
                  reject(new Error(chromeApi.runtime.lastError.message));
                  return;
                }
                showStatus(
                  response?.message || '已开始翻译当前页面',
                  'success'
                );
                resolve();
              }
            );
          });
        }
      });
    } catch (error) {
      if (error.code === 'settings_write_failed') {
        showStatus('设置尚未保存，未开始翻译', 'error');
      } else {
        showStatus('无法访问当前页面，请刷新页面后重试', 'error');
      }
    } finally {
      updateTranslateAvailability();
    }
  }

  function openSidebar() {
    if (!activeTab?.id) {
      showStatus('当前页面无法打开侧边栏', 'error');
      return;
    }
    chromeApi.sidePanel.open({ tabId: activeTab.id }).catch(error => {
      showStatus(error.message, 'error');
    });
  }

  function showStatus(message, type) {
    const element = getElement('status-message');
    element.textContent = message;
    element.className = `status-message ${type}`;
  }

  function bindControls() {
    if (controlsBound) return;
    getElement('source-lang').addEventListener('change', event => {
      queueSettingWrite(
        STORAGE_KEYS.SOURCE_LANG,
        event.target.value,
        '源语言已更新'
      );
    });
    getElement('target-lang').addEventListener('change', event => {
      queueSettingWrite(
        STORAGE_KEYS.TARGET_LANG,
        event.target.value,
        '目标语言已更新'
      );
    });
    getElement('disable-site').addEventListener('change', event => {
      void queueSiteDisabledWrite(event.target.checked);
    });
    getElement('auto-translate').addEventListener('change', event => {
      queueSettingWrite(STORAGE_KEYS.AUTO_TRANSLATE, event.target.checked);
    });
    getElement('context-menu').addEventListener('change', event => {
      queueSettingWrite(STORAGE_KEYS.CONTEXT_MENU, event.target.checked);
    });
    getElement('translate-page').addEventListener('click', () => {
      void translateCurrentPage();
    });
    getElement('open-options').addEventListener('click', () => {
      chromeApi.runtime.openOptionsPage();
    });
    getElement('open-sidebar').addEventListener('click', openSidebar);

    const trigger = getElement('provider-trigger');
    trigger.addEventListener('click', () => {
      const menu = getElement('provider-menu');
      if (menu.hidden) {
        openProviderMenu(getProviderOpenFocus(
          providerEntries.map(entry => entry.id),
          activeProviderId,
          'ArrowDown'
        ));
      } else {
        closeProviderMenu();
      }
    });
    trigger.addEventListener('keydown', handleProviderTriggerKeydown);
    getElement('provider-menu').addEventListener(
      'keydown',
      handleProviderMenuKeydown
    );
    globalScope.document.addEventListener('click', event => {
      const picker = event.target.closest('.provider-picker');
      if (!picker) closeProviderMenu();
    });
    bindStorageListener();
    controlsBound = true;
  }

  async function initialize(browserChrome) {
    chromeApi = browserChrome;
    setWriteControlsDisabled(globalScope.document, true, false);
    bindControls();
    try {
      activeTab = await getActiveTab();
      activeHostname = hostnameFromUrl(activeTab?.url);
      getElement('site-name').textContent =
        activeHostname || '当前页面不可访问';
      await loadSettings();
    } catch (error) {
      settingsLoaded = false;
      setWriteControlsDisabled(
        globalScope.document,
        true,
        Boolean(activeHostname)
      );
      showStatus(`读取设置失败：${error.message}`, 'error');
    }
  }

  const api = {
    applyProviderStorageChanges,
    buildProviderEntries,
    clearConfirmedSettingFailures,
    commitProviderSelection,
    createKeyedSettingWriteQueue,
    createSerializedWriteQueue,
    getProviderNavigationTarget,
    getProviderOpenFocus,
    getTranslateAvailability,
    performTranslationAfterWrites,
    setWriteControlsDisabled,
    waitForPendingWrites
  };

  globalScope.TranslateOnlineToolbarPopup = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (
    globalScope.document &&
    globalScope.chrome?.storage?.sync &&
    globalScope.chrome.storage.local &&
    globalScope.chrome.storage.onChanged &&
    globalScope.chrome.tabs &&
    globalScope.chrome.runtime
  ) {
    globalScope.document.addEventListener('DOMContentLoaded', () => {
      void initialize(globalScope.chrome);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
