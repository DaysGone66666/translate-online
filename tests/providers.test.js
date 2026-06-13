const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PROVIDER_IDS,
  PROVIDERS,
  getProvider,
  getDefaultProviderConfig,
  mergeProviderConfig,
  resolveProviderModel,
  isProviderConfigured,
  getProviderDisplayName
} = require('../src/providers.js');

const EXPECTED_PROVIDERS = [
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

const FORBIDDEN_SVG_CONTENT = [
  { pattern: /<script\b/i, description: 'script element' },
  { pattern: /https?:\/\//i, description: 'remote URL' },
  { pattern: /(^|[^:])\/\/[^\s/]/i, description: 'protocol-relative URL' },
  { pattern: /@import/i, description: 'CSS import' },
  { pattern: /url\s*\(/i, description: 'CSS URL' },
  { pattern: /\son[a-z][\w:.-]*\s*=/i, description: 'event handler attribute' },
  { pattern: /<!DOCTYPE\b/i, description: 'DOCTYPE declaration' },
  { pattern: /<!ENTITY\b/i, description: 'ENTITY declaration' },
  { pattern: /<foreignObject\b/i, description: 'foreignObject element' },
  { pattern: /<(?:image|use)\b/i, description: 'external resource element' },
  { pattern: /\s(?:href|xlink:href)\s*=/i, description: 'resource reference attribute' }
];

function assertSafeProviderSvg(svg, providerId) {
  assert.match(svg, /<svg\b/, `${providerId} icon must contain <svg`);
  assert.match(
    svg,
    /<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
    `${providerId} icon must declare the SVG namespace`
  );
  assert.match(svg, /\bviewBox\s*=/, `${providerId} icon must contain viewBox`);
  const contentWithoutSvgNamespace = svg.replace(
    /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
    ''
  );
  for (const { pattern, description } of FORBIDDEN_SVG_CONTENT) {
    assert.doesNotMatch(
      contentWithoutSvgNamespace,
      pattern,
      `${providerId} icon contains unsafe ${description}`
    );
  }
}

function parseSourceSections(markdown) {
  const sections = new Map();
  const sectionPattern = (
    /^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## [^\r\n]+\r?$|(?![\s\S]))/gm
  );

  for (const match of markdown.matchAll(sectionPattern)) {
    sections.set(match[1], match[2]);
  }
  return sections;
}

function parseSourceFields(section) {
  return new Map(
    [...section.matchAll(/^- ([^:\r\n]+):\s*(\S.*)$/gm)]
      .map(match => [match[1], match[2]])
  );
}

test('defines the complete provider order', () => {
  assert.deepEqual(PROVIDER_IDS, [
    'mymemory', 'deepseek', 'mimo', 'minimax', 'gemini', 'openai',
    'xai', 'qwen', 'kimi', 'glm', 'claude', 'custom_openai'
  ]);
});

test('keeps the complete provider metadata exact', () => {
  assert.deepEqual(
    PROVIDER_IDS.map(providerId => getProvider(providerId)),
    EXPECTED_PROVIDERS
  );
  assert.deepEqual(Object.keys(PROVIDERS), PROVIDER_IDS);
});

test('ships every provider icon as a local asset', () => {
  for (const provider of Object.values(PROVIDERS)) {
    assert.doesNotMatch(provider.icon, /^https?:/);
    const iconPath = path.resolve(__dirname, '..', 'src', provider.icon);
    assert.equal(fs.existsSync(iconPath), true, `${provider.id} icon is missing`);
  }
});

test('ships safe standalone SVG provider icons', () => {
  for (const provider of Object.values(PROVIDERS)) {
    const iconPath = path.resolve(__dirname, '..', 'src', provider.icon);
    const svg = fs.readFileSync(iconPath, 'utf8');
    assertSafeProviderSvg(svg, provider.id);
  }
});

test('rejects active content and external references in provider SVGs', () => {
  const unsafeFragments = [
    '<script>alert(1)</script>',
    '<style>@import "theme.css"</style>',
    '<path fill="url(#paint)"/>',
    '<svg onload="alert(1)"/>',
    '<!DOCTYPE svg>',
    '<!ENTITY payload "unsafe">',
    '<foreignObject><div>unsafe</div></foreignObject>',
    '<image href="icon.png"/>',
    '<use href="#shape"/>',
    '<use xlink:href="#shape"/>',
    '<path href="icon.svg"/>',
    '<path data-source="//cdn.example/icon.svg"/>',
    '<path data-source="http://example.com/icon.svg"/>',
    '<path data-source="https://example.com/icon.svg"/>'
  ];

  for (const fragment of unsafeFragments) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${fragment}</svg>`;
    assert.throws(
      () => assertSafeProviderSvg(svg, 'fixture'),
      /contains unsafe/,
      `unsafe SVG fragment was accepted: ${fragment}`
    );
  }
});

test('documents the source of every provider icon', () => {
  const sourcesPath = path.resolve(__dirname, '..', 'images', 'providers', 'SOURCES.md');
  assert.equal(fs.existsSync(sourcesPath), true, 'provider icon SOURCES.md is missing');

  const sources = fs.readFileSync(sourcesPath, 'utf8');
  const sections = parseSourceSections(sources);
  const documentedIds = [...sources.matchAll(/^## ([^\r\n]+)$/gm)].map(match => match[1]);

  assert.deepEqual(
    documentedIds.sort(),
    [...PROVIDER_IDS].sort(),
    'SOURCES.md must document each exact provider ID once'
  );

  for (const provider of Object.values(PROVIDERS)) {
    const section = sections.get(provider.id);
    assert.ok(section, `${provider.id} source section is missing`);

    const fields = parseSourceFields(section);
    const expectedFile = path.basename(provider.icon);
    assert.equal(fields.get('File'), `\`${expectedFile}\``);
    for (const fieldName of ['Material type', 'Source', 'License/use']) {
      assert.match(
        fields.get(fieldName) || '',
        /\S/,
        `${provider.id} source section must contain ${fieldName}`
      );
    }
  }

  const preamble = sources.slice(0, sources.indexOf('## '));
  assert.match(
    preamble,
    /except where an icon's metadata declares a custom\s+license/i,
    'SOURCES.md must state the custom-license exception'
  );
  assert.doesNotMatch(
    preamble,
    /Its icon data is\s+distributed under CC0-1\.0/i,
    'SOURCES.md must not apply CC0-1.0 to every Simple Icons asset'
  );

  const minimaxSection = sections.get('minimax');
  const minimaxFields = parseSourceFields(minimaxSection);
  assert.equal(minimaxFields.get('Material type'), 'Simple Icons, custom license');
  assert.equal(
    minimaxFields.get('Source'),
    'https://github.com/MiniMax-AI/MiniMax-01/blob/57cf223b177e99636c7711a0f179e9fdc9c38e8a/figures/minimax.svg'
  );
  assert.match(
    minimaxFields.get('License/use'),
    /https:\/\/github\.com\/simple-icons\/simple-icons\/pull\/13982#issuecomment-3531627803/
  );
  assert.match(minimaxFields.get('License/use'), /custom license/i);
  assert.doesNotMatch(minimaxFields.get('License/use'), /CC0-1\.0/i);
});

test('uses only the supported provider protocols', () => {
  assert.deepEqual(
    [...new Set(PROVIDER_IDS.map(providerId => getProvider(providerId).protocol))],
    ['mymemory', 'openai-chat', 'anthropic-messages']
  );
});

test('freezes the registry, provider order, providers, and model lists', () => {
  assert.equal(Object.isFrozen(PROVIDER_IDS), true);
  assert.equal(Object.isFrozen(PROVIDERS), true);
  for (const providerId of PROVIDER_IDS) {
    assert.equal(Object.isFrozen(getProvider(providerId)), true);
    assert.equal(Object.isFrozen(getProvider(providerId).models), true);
  }
});

test('returns exact default provider configs', () => {
  for (const provider of EXPECTED_PROVIDERS) {
    const expected = {
      model: provider.defaultModel,
      apiUrl: provider.defaultApiUrl,
      connectionStatus: 'untested'
    };
    if (provider.id === 'custom_openai') {
      expected.displayName = '';
    }
    assert.deepEqual(getDefaultProviderConfig(provider.id), expected);
  }
  assert.deepEqual(getDefaultProviderConfig('custom_openai'), {
    model: '',
    apiUrl: '',
    connectionStatus: 'untested',
    displayName: ''
  });
});

test('merges only supported config fields and normalizes connection status', () => {
  assert.deepEqual(
    mergeProviderConfig('deepseek', {
      model: '  deepseek-reasoner  ',
      apiUrl: '  https://api.deepseek.com/v2  ',
      connectionStatus: 'success',
      displayName: 'ignored',
      extra: true
    }),
    {
      model: 'deepseek-reasoner',
      apiUrl: 'https://api.deepseek.com/v2',
      connectionStatus: 'success'
    }
  );
  assert.deepEqual(
    mergeProviderConfig('deepseek', {
      model: 123,
      apiUrl: 456,
      connectionStatus: 'pending'
    }),
    {
      model: '123',
      apiUrl: '456',
      connectionStatus: 'untested'
    }
  );
  assert.deepEqual(
    mergeProviderConfig('deepseek', {
      model: 'deepseek-chat',
      apiUrl: 'https://api.deepseek.com'
    }),
    {
      model: 'deepseek-chat',
      apiUrl: 'https://api.deepseek.com',
      connectionStatus: 'untested'
    }
  );
  assert.deepEqual(
    mergeProviderConfig('custom_openai', {
      model: ' custom-model ',
      apiUrl: ' https://example.com/v1 ',
      displayName: ' Private API ',
      connectionStatus: 'failed'
    }),
    {
      model: 'custom-model',
      apiUrl: 'https://example.com/v1',
      connectionStatus: 'failed',
      displayName: 'Private API'
    }
  );
});

test('uses a custom model only when the preset is custom', () => {
  assert.equal(resolveProviderModel('openai', ' gpt-4.1-mini ', 'other'), 'gpt-4.1-mini');
  assert.equal(resolveProviderModel('openai', '__custom__', ' gpt-private '), 'gpt-private');
  assert.throws(() => resolveProviderModel('openai', '__custom__', ''), /模型/);
});

test('reports whether each provider is configured', () => {
  assert.equal(isProviderConfigured('mymemory', {}, ''), true);
  assert.equal(
    isProviderConfigured(
      'openai',
      { model: ' gpt-4.1-mini ', apiUrl: ' https://api.openai.com/v1 ' },
      ' secret '
    ),
    true
  );
  assert.equal(
    isProviderConfigured('openai', { model: '', apiUrl: 'https://api.openai.com/v1' }, 'secret'),
    false
  );
  assert.equal(
    isProviderConfigured('openai', { model: 'gpt-4.1-mini', apiUrl: '' }, 'secret'),
    false
  );
  assert.equal(
    isProviderConfigured(
      'openai',
      { model: 'gpt-4.1-mini', apiUrl: 'https://api.openai.com/v1' },
      ' '
    ),
    false
  );
});

test('uses a custom display name only for the custom provider', () => {
  assert.equal(
    getProviderDisplayName('custom_openai', { displayName: ' Private API ' }),
    'Private API'
  );
  assert.equal(getProviderDisplayName('custom_openai', { displayName: ' ' }), '自定义兼容服务');
  assert.equal(getProviderDisplayName('openai', { displayName: 'Ignored' }), 'OpenAI');
});

test('rejects unknown provider IDs', () => {
  for (const operation of [
    () => getProvider('unknown'),
    () => getProvider('toString'),
    () => getProvider('__proto__'),
    () => getDefaultProviderConfig('unknown'),
    () => mergeProviderConfig('unknown', {}),
    () => resolveProviderModel('unknown', 'model', ''),
    () => isProviderConfigured('unknown', {}, ''),
    () => getProviderDisplayName('unknown', {})
  ]) {
    assert.throws(operation, /供应商/);
  }
});
