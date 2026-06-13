(function initTranslateOnlineProviders(globalScope) {
  const providerList = [
    {
      id: 'mymemory',
      name: 'MyMemory',
      protocol: 'mymemory',
      icon: '../images/providers/mymemory.svg',
      requiresApiKey: false,
      defaultApiUrl: 'https://api.mymemory.translated.net',
      chatPath: '/get',
      defaultModel: '',
      models: [],
      consoleUrl: '',
      docsUrl: 'https://mymemory.translated.net/doc/spec.php'
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/deepseek.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.deepseek.com',
      chatPath: '/v1/chat/completions',
      defaultModel: 'deepseek-chat',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      consoleUrl: 'https://platform.deepseek.com/api_keys',
      docsUrl: 'https://api-docs.deepseek.com/'
    },
    {
      id: 'mimo',
      name: 'MiMo',
      protocol: 'openai-chat',
      auth: 'api-key',
      icon: '../images/providers/mimo.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.xiaomimimo.com/v1',
      chatPath: '/chat/completions',
      defaultModel: 'mimo-v2.5-pro',
      models: ['mimo-v2.5-pro'],
      consoleUrl: 'https://platform.xiaomimimo.com/',
      docsUrl: 'https://platform.xiaomimimo.com/#/docs/api/text-generation'
    },
    {
      id: 'minimax',
      name: 'MiniMax',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/minimax.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.minimax.io/v1',
      chatPath: '/chat/completions',
      defaultModel: 'MiniMax-M3',
      models: ['MiniMax-M3', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed'],
      consoleUrl: 'https://platform.minimax.io/',
      docsUrl: 'https://platform.minimax.io/docs/api-reference/text-openai-api'
    },
    {
      id: 'gemini',
      name: 'Gemini',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/gemini.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      chatPath: '/chat/completions',
      defaultModel: 'gemini-2.5-flash',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      consoleUrl: 'https://aistudio.google.com/apikey',
      docsUrl: 'https://ai.google.dev/gemini-api/docs/openai'
    },
    {
      id: 'openai',
      name: 'OpenAI',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/openai.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.openai.com/v1',
      chatPath: '/chat/completions',
      defaultModel: 'gpt-4.1-mini',
      models: ['gpt-4.1-mini', 'gpt-4.1'],
      consoleUrl: 'https://platform.openai.com/api-keys',
      docsUrl: 'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create'
    },
    {
      id: 'xai',
      name: 'Grok / xAI',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/xai.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.x.ai/v1',
      chatPath: '/chat/completions',
      defaultModel: 'grok-4-1-fast-non-reasoning',
      models: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning'],
      consoleUrl: 'https://console.x.ai/',
      docsUrl: 'https://docs.x.ai/developers/rest-api-reference/inference/chat'
    },
    {
      id: 'qwen',
      name: '通义千问',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/qwen.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      chatPath: '/chat/completions',
      defaultModel: 'qwen-flash',
      models: ['qwen-flash', 'qwen-plus', 'qwen3-max'],
      consoleUrl: 'https://bailian.console.aliyun.com/',
      docsUrl: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope'
    },
    {
      id: 'kimi',
      name: 'Kimi',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/kimi.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.moonshot.cn/v1',
      chatPath: '/chat/completions',
      defaultModel: 'kimi-k2.5',
      models: ['kimi-k2.5'],
      consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
      docsUrl: 'https://platform.moonshot.cn/docs/guide/migrating-from-openai-to-kimi'
    },
    {
      id: 'glm',
      name: '智谱 GLM',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/glm.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://open.bigmodel.cn/api/paas/v4',
      chatPath: '/chat/completions',
      defaultModel: 'glm-4.7-flash',
      models: ['glm-4.7-flash', 'glm-4.7', 'glm-5'],
      consoleUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
      docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction'
    },
    {
      id: 'claude',
      name: 'Claude',
      protocol: 'anthropic-messages',
      auth: 'x-api-key',
      icon: '../images/providers/claude.svg',
      requiresApiKey: true,
      defaultApiUrl: 'https://api.anthropic.com/v1',
      chatPath: '/messages',
      defaultModel: 'claude-sonnet-4-6',
      models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'],
      consoleUrl: 'https://console.anthropic.com/settings/keys',
      docsUrl: 'https://docs.anthropic.com/en/api/messages'
    },
    {
      id: 'custom_openai',
      name: '自定义兼容服务',
      protocol: 'openai-chat',
      auth: 'bearer',
      icon: '../images/providers/custom-openai.svg',
      requiresApiKey: true,
      defaultApiUrl: '',
      chatPath: '/chat/completions',
      defaultModel: '',
      models: [],
      allowsDisplayName: true,
      consoleUrl: '',
      docsUrl: ''
    }
  ];

  const frozenProviders = providerList.map(provider =>
    Object.freeze({
      ...provider,
      models: Object.freeze([...provider.models])
    })
  );
  const PROVIDER_IDS = Object.freeze(frozenProviders.map(provider => provider.id));
  const PROVIDERS = Object.freeze(Object.fromEntries(
    frozenProviders.map(provider => [provider.id, provider])
  ));
  const CONNECTION_STATUSES = new Set(['untested', 'success', 'failed']);

  function getProvider(providerId) {
    if (!Object.prototype.hasOwnProperty.call(PROVIDERS, providerId)) {
      throw new Error(`未知供应商：${providerId}`);
    }
    return PROVIDERS[providerId];
  }

  function getDefaultProviderConfig(providerId) {
    const provider = getProvider(providerId);
    const config = {
      model: provider.defaultModel,
      apiUrl: provider.defaultApiUrl,
      connectionStatus: 'untested'
    };
    if (provider.allowsDisplayName) {
      config.displayName = '';
    }
    return config;
  }

  function mergeProviderConfig(providerId, value) {
    const provider = getProvider(providerId);
    const source = value && typeof value === 'object' ? value : {};
    const config = {
      model: String(source.model ?? provider.defaultModel).trim(),
      apiUrl: String(source.apiUrl ?? provider.defaultApiUrl).trim(),
      connectionStatus: CONNECTION_STATUSES.has(source.connectionStatus)
        ? source.connectionStatus
        : 'untested'
    };
    if (provider.allowsDisplayName) {
      config.displayName = String(source.displayName ?? '').trim();
    }
    return config;
  }

  function resolveProviderModel(providerId, presetValue, customValue) {
    getProvider(providerId);
    const preset = String(presetValue ?? '').trim();
    if (preset !== '__custom__') {
      return preset;
    }

    const customModel = String(customValue ?? '').trim();
    if (!customModel) {
      throw new Error('模型 ID 不能为空');
    }
    return customModel;
  }

  function isProviderConfigured(providerId, config, apiKey) {
    const provider = getProvider(providerId);
    if (provider.protocol === 'mymemory') {
      return true;
    }

    const value = config && typeof config === 'object' ? config : {};
    return Boolean(
      String(apiKey ?? '').trim() &&
      String(value.model ?? '').trim() &&
      String(value.apiUrl ?? '').trim()
    );
  }

  function getProviderDisplayName(providerId, config) {
    const provider = getProvider(providerId);
    if (!provider.allowsDisplayName) {
      return provider.name;
    }

    const value = config && typeof config === 'object' ? config : {};
    return String(value.displayName ?? '').trim() || provider.name;
  }

  const api = {
    PROVIDER_IDS,
    PROVIDERS,
    getProvider,
    getDefaultProviderConfig,
    mergeProviderConfig,
    resolveProviderModel,
    isProviderConfigured,
    getProviderDisplayName
  };

  globalScope.TranslateOnlineProviders = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
