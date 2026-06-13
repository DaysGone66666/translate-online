# 多供应商翻译 API 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在现有 Chrome MV3 翻译扩展中加入 12 个翻译服务入口、独立供应商配置、本地品牌图标和统一协议适配器，并无损迁移现有 DeepSeek 配置。

**架构：** 新建 `src/providers.js` 作为供应商 ID、公开元数据、配置默认值和配置规范化的唯一来源；新建 `src/provider-adapters.js` 处理 MyMemory、OpenAI Chat Completions 和 Claude Messages 三种协议。`src/service-worker.js` 负责存储迁移、权限检查、缓存、术语和适配器编排；设置页使用可搜索品牌网格，工具栏弹窗使用带图标的紧凑自定义选择器。

**技术栈：** Chrome MV3、原生 JavaScript、Fetch API、Pointer/Keyboard Events、SVG 品牌资源、Node.js `node:test`

---

## 文件结构

### 新建

- `src/providers.js`：供应商注册表、供应商 ID、默认配置、配置合并和配置状态判断。
- `src/provider-adapters.js`：端点拼接、认证头、请求体、响应解析和统一错误映射。
- `tests/providers.test.js`：注册表、默认配置、模型解析和图标完整性测试。
- `tests/provider-adapters.test.js`：三类协议适配器的请求与响应测试。
- `tests/provider-migration.test.js`：旧 DeepSeek/免费引擎配置迁移测试。
- `tests/options-providers.test.js`：设置页品牌网格、独立字段和本地资源测试。
- `images/providers/mymemory.svg`
- `images/providers/deepseek.svg`
- `images/providers/mimo.svg`
- `images/providers/minimax.svg`
- `images/providers/gemini.svg`
- `images/providers/openai.svg`
- `images/providers/xai.svg`
- `images/providers/qwen.svg`
- `images/providers/kimi.svg`
- `images/providers/glm.svg`
- `images/providers/claude.svg`
- `images/providers/custom-openai.svg`
- `images/providers/SOURCES.md`：每个品牌素材的来源 URL 和许可说明。

### 修改

- `src/shared.js`：新增精确存储键和配置状态常量，保留旧 DeepSeek 键供迁移。
- `src/service-worker.js`：引入供应商模块和适配器，迁移配置，改造翻译编排和测试连接消息。
- `src/options.html`：将两项单选引擎替换为搜索框、供应商网格和动态配置面板。
- `src/options.css`：实现两列品牌卡片、搜索、状态点和动态配置面板。
- `src/options.js`：渲染注册表、维护每家草稿、保存独立配置、申请权限和测试连接。
- `src/toolbar-popup.html`：将原生引擎下拉框替换为带品牌图标的按钮与列表框。
- `src/toolbar-popup.css`：实现紧凑品牌选择器和未配置状态。
- `src/toolbar-popup.js`：加载注册表和配置，切换当前供应商，阻止未配置供应商翻译。
- `manifest.json`：加载新增脚本、移除固定 DeepSeek 主机权限并保留按需主机权限。
- `scripts/check-project.js`：检查供应商脚本和所有本地图标。
- `tests/service-worker-performance.test.js`：改用新存储结构并验证统一适配器批量请求。
- `tests/shared.test.js`：验证新存储键。
- `tests/toolbar-popup.test.js`：验证带图标的供应商列表框。
- `package.json`：将新增 JavaScript 文件加入语法检查。
- `README.md`：更新供应商、隐私、权限和项目结构说明。

---

### 任务 1：建立供应商注册表和精确配置结构

**文件：**
- 创建：`src/providers.js`
- 创建：`tests/providers.test.js`
- 修改：`src/shared.js`
- 修改：`tests/shared.test.js`

- [ ] **步骤 1：为存储键和供应商 ID 编写失败测试**

在 `tests/shared.test.js` 增加：

```js
assert.equal(STORAGE_KEYS.ACTIVE_PROVIDER, 'active_provider');
assert.equal(STORAGE_KEYS.PROVIDER_CONFIGS, 'provider_configs');
assert.equal(STORAGE_KEYS.PROVIDER_API_KEYS, 'provider_api_keys');
```

在 `tests/providers.test.js` 固定精确 ID：

```js
const {
  PROVIDER_IDS,
  PROVIDERS,
  getProvider,
  getDefaultProviderConfig,
  resolveProviderModel
} = require('../src/providers.js');

test('defines the complete provider order', () => {
  assert.deepEqual(PROVIDER_IDS, [
    'mymemory',
    'deepseek',
    'mimo',
    'minimax',
    'gemini',
    'openai',
    'xai',
    'qwen',
    'kimi',
    'glm',
    'claude',
    'custom_openai'
  ]);
});
```

- [ ] **步骤 2：运行测试并确认因模块和存储键不存在而失败**

运行：

```powershell
node --test tests/shared.test.js tests/providers.test.js
```

预期：FAIL，包含 `Cannot find module '../src/providers.js'` 或新存储键为 `undefined`。

- [ ] **步骤 3：在共享模块中定义精确存储键**

向 `STORAGE_KEYS` 添加：

```js
ACTIVE_PROVIDER: 'active_provider',
PROVIDER_CONFIGS: 'provider_configs',
PROVIDER_API_KEYS: 'provider_api_keys'
```

保留 `DEEPSEEK_KEY`、`ENGINE`、`MODEL` 和 `API_URL`，仅供迁移读取，不能用于新配置写入。

- [ ] **步骤 4：创建供应商注册表**

`src/providers.js` 使用现有 UMD 模式，同时支持扩展全局和 Node.js 测试。注册表固定为：

```js
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
    models: []
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
    models: ['deepseek-chat', 'deepseek-reasoner']
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
    models: ['mimo-v2.5-pro']
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
    models: ['MiniMax-M3', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed']
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
    models: ['gemini-2.5-flash', 'gemini-2.5-pro']
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
    models: ['gpt-4.1-mini', 'gpt-4.1']
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
    models: ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-reasoning']
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
    models: ['qwen-flash', 'qwen-plus', 'qwen3-max']
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
    models: ['kimi-k2.5']
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
    models: ['glm-4.7-flash', 'glm-4.7', 'glm-5']
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
    models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6']
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
    allowsDisplayName: true
  }
];
```

同时实现并导出：

```js
PROVIDER_IDS
PROVIDERS
getProvider(providerId)
getDefaultProviderConfig(providerId)
mergeProviderConfig(providerId, value)
resolveProviderModel(providerId, presetValue, customValue)
isProviderConfigured(providerId, config, apiKey)
getProviderDisplayName(providerId, config)
```

`connectionStatus` 缺省为 `untested`，只接受 `untested`、`success`、`failed`。

每个非自定义供应商还必须包含精确 `consoleUrl` 和 `docsUrl`。首批链接固定为：

| ID | `consoleUrl` | `docsUrl` |
|---|---|---|
| `mymemory` | 空字符串 | `https://mymemory.translated.net/doc/spec.php` |
| `deepseek` | `https://platform.deepseek.com/api_keys` | `https://api-docs.deepseek.com/` |
| `mimo` | `https://platform.xiaomimimo.com/` | `https://platform.xiaomimimo.com/#/docs/api/text-generation` |
| `minimax` | `https://platform.minimax.io/` | `https://platform.minimax.io/docs/api-reference/text-openai-api` |
| `gemini` | `https://aistudio.google.com/apikey` | `https://ai.google.dev/gemini-api/docs/openai` |
| `openai` | `https://platform.openai.com/api-keys` | `https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create` |
| `xai` | `https://console.x.ai/` | `https://docs.x.ai/developers/rest-api-reference/inference/chat` |
| `qwen` | `https://bailian.console.aliyun.com/` | `https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope` |
| `kimi` | `https://platform.moonshot.cn/console/api-keys` | `https://platform.moonshot.cn/docs/guide/migrating-from-openai-to-kimi` |
| `glm` | `https://bigmodel.cn/usercenter/proj-mgmt/apikeys` | `https://docs.bigmodel.cn/cn/guide/develop/openai/introduction` |
| `claude` | `https://console.anthropic.com/settings/keys` | `https://docs.anthropic.com/en/api/messages` |
| `custom_openai` | 空字符串 | 空字符串 |

- [ ] **步骤 5：补充注册表完整性和模型解析测试**

测试要求：

```js
test('keeps provider metadata complete', () => {
  for (const providerId of PROVIDER_IDS) {
    const provider = getProvider(providerId);
    assert.equal(provider.id, providerId);
    assert.match(provider.icon, /^\.\.\/images\/providers\/[a-z0-9-]+\.svg$/);
    assert.ok(['mymemory', 'openai-chat', 'anthropic-messages'].includes(provider.protocol));
  }
});

test('uses a custom model only when the preset is custom', () => {
  assert.equal(resolveProviderModel('openai', 'gpt-4.1-mini', 'other'), 'gpt-4.1-mini');
  assert.equal(resolveProviderModel('openai', '__custom__', 'gpt-private'), 'gpt-private');
  assert.throws(() => resolveProviderModel('openai', '__custom__', ''), /模型/);
});
```

- [ ] **步骤 6：运行注册表测试**

运行：

```powershell
node --test tests/shared.test.js tests/providers.test.js
```

预期：PASS。

- [ ] **步骤 7：提交注册表**

```powershell
git add src/shared.js src/providers.js tests/shared.test.js tests/providers.test.js
git commit -m "feat: add translation provider registry"
```

---

### 任务 2：加入本地供应商品牌资源

**文件：**
- 创建：`images/providers/*.svg`
- 创建：`images/providers/SOURCES.md`
- 修改：`tests/providers.test.js`
- 修改：`scripts/check-project.js`

- [ ] **步骤 1：先让图标存在性测试失败**

在 `tests/providers.test.js` 使用注册表的相对路径解析到项目根目录：

```js
test('ships every provider icon as a local asset', () => {
  for (const provider of Object.values(PROVIDERS)) {
    assert.doesNotMatch(provider.icon, /^https?:/);
    const iconPath = path.resolve(__dirname, '..', 'src', provider.icon);
    assert.equal(fs.existsSync(iconPath), true, `${provider.id} icon is missing`);
  }
});
```

运行：

```powershell
node --test tests/providers.test.js
```

预期：FAIL，报告首个缺失图标。

- [ ] **步骤 2：添加 12 个本地 SVG**

图标文件名必须与任务 1 注册表完全一致。品牌素材来源记录到 `images/providers/SOURCES.md`：

- DeepSeek：DeepSeek 官方品牌素材或 Simple Icons `deepseek`。
- MiMo：小米官方品牌素材，用于标识小米 MiMo。
- MiniMax：MiniMax 官方品牌素材。
- Gemini：Google Gemini 官方品牌素材或 Simple Icons `googlegemini`。
- OpenAI：OpenAI 官方品牌素材或 Simple Icons `openai`。
- xAI：xAI 官方品牌素材或 Simple Icons `x`。
- 通义千问：阿里云/通义官方品牌素材。
- Kimi：Moonshot/Kimi 官方品牌素材。
- GLM：智谱官方品牌素材。
- Claude：Anthropic/Claude 官方品牌素材或 Simple Icons `anthropic`。
- MyMemory：MyMemory 官方品牌素材。
- 自定义兼容服务：项目自有的非品牌连接图标。

每个 SVG 必须有 `viewBox`，不得包含脚本、外链图片、远程字体或远程 URL。

- [ ] **步骤 3：扩展项目检查**

在 `scripts/check-project.js` 引入 `src/providers.js`，把注册表图标加入 `referencedPaths`，并拒绝远程图标：

```js
const { PROVIDERS } = require(path.join(root, 'src', 'providers.js'));
const providerIcons = Object.values(PROVIDERS).map(provider =>
  path.normalize(path.join('src', provider.icon))
);
```

`providerIcons` 应解析为 `images/providers/*.svg`。

- [ ] **步骤 4：运行资源测试**

运行：

```powershell
node --test tests/providers.test.js
node scripts/check-project.js
```

预期：全部 PASS，项目检查统计包含 12 个供应商图标。

- [ ] **步骤 5：提交资源**

```powershell
git add images/providers src/providers.js tests/providers.test.js scripts/check-project.js
git commit -m "feat: add local provider brand assets"
```

---

### 任务 3：实现三类协议适配器

**文件：**
- 创建：`src/provider-adapters.js`
- 创建：`tests/provider-adapters.test.js`
- 修改：`package.json`

- [ ] **步骤 1：编写端点和认证头失败测试**

```js
const {
  buildProviderEndpoint,
  buildProviderHeaders
} = require('../src/provider-adapters.js');

test('builds exact provider endpoints', () => {
  assert.equal(
    buildProviderEndpoint(getProvider('deepseek'), 'https://api.deepseek.com'),
    'https://api.deepseek.com/v1/chat/completions'
  );
  assert.equal(
    buildProviderEndpoint(getProvider('gemini'), 'https://generativelanguage.googleapis.com/v1beta/openai'),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  );
  assert.equal(
    buildProviderEndpoint(getProvider('claude'), 'https://api.anthropic.com/v1'),
    'https://api.anthropic.com/v1/messages'
  );
});

test('uses the registered authentication scheme', () => {
  assert.equal(buildProviderHeaders(getProvider('deepseek'), 'secret').Authorization, 'Bearer secret');
  assert.equal(buildProviderHeaders(getProvider('mimo'), 'secret')['api-key'], 'secret');
  assert.equal(buildProviderHeaders(getProvider('claude'), 'secret')['x-api-key'], 'secret');
  assert.equal(buildProviderHeaders(getProvider('claude'), 'secret')['anthropic-version'], '2023-06-01');
});
```

- [ ] **步骤 2：运行测试确认模块不存在**

运行：

```powershell
node --test tests/provider-adapters.test.js
```

预期：FAIL，包含 `Cannot find module '../src/provider-adapters.js'`。

- [ ] **步骤 3：实现纯构建和解析函数**

`src/provider-adapters.js` 导出：

```js
buildProviderEndpoint(provider, apiUrl)
buildProviderHeaders(provider, apiKey)
buildOpenAiRequestBody({ model, text, texts, sourceLang, targetLang, glossaryInstruction })
buildAnthropicRequestBody({ model, text, texts, sourceLang, targetLang, glossaryInstruction })
parseOpenAiText(data)
parseAnthropicText(data)
mapProviderHttpError(providerName, status)
requestProviderTranslation(options)
requestProviderBatchTranslation(options)
```

端点使用标准化后的 `apiUrl` 与注册表 `chatPath` 拼接，必须避免双斜杠，不得猜测或自动添加其他版本路径。

- [ ] **步骤 4：固定请求体差异**

OpenAI 兼容请求：

```js
{
  model,
  messages: [
    { role: 'system', content: prompt },
    { role: 'user', content: textOrJson }
  ],
  temperature: 0.1,
  max_tokens: 8192
}
```

Claude Messages 请求：

```js
{
  model,
  system: prompt,
  messages: [{ role: 'user', content: textOrJson }],
  temperature: 0.1,
  max_tokens: 8192
}
```

Claude 文本从 `data.content` 中第一个 `type === 'text'` 的块读取。

- [ ] **步骤 5：覆盖统一错误映射**

测试精确错误类型：

```js
assert.equal(mapProviderHttpError('Gemini', 401).error, 'unauthorized');
assert.equal(mapProviderHttpError('Gemini', 403).error, 'forbidden');
assert.equal(mapProviderHttpError('Gemini', 429).error, 'rate_limited');
assert.equal(mapProviderHttpError('Gemini', 503).error, 'service_unavailable');
```

错误消息包含供应商名称，不包含密钥或请求正文。

- [ ] **步骤 6：为单条、批量和取消编写 Fetch 测试**

使用注入的 `fetchImpl` 验证：

- DeepSeek 请求使用 Bearer。
- MiMo 请求使用 `api-key`。
- Claude 请求使用 `x-api-key` 和 `anthropic-version`。
- 批量响应严格通过 `parseTranslationBatchContent`。
- `AbortError` 返回 `cancelled`。
- 空响应返回 `empty_response`。

- [ ] **步骤 7：运行适配器测试和语法检查**

运行：

```powershell
node --test tests/provider-adapters.test.js
node --check src/provider-adapters.js
```

预期：PASS。

- [ ] **步骤 8：将新增模块加入项目检查**

在 `package.json` 的 `check` 命令中，把：

```text
node --check src/providers.js
node --check src/provider-adapters.js
```

放在 `src/service-worker.js` 之前。

- [ ] **步骤 9：提交适配器**

```powershell
git add src/provider-adapters.js tests/provider-adapters.test.js package.json
git commit -m "feat: add provider protocol adapters"
```

---

### 任务 4：迁移旧配置并改造服务工作线程

**文件：**
- 创建：`tests/provider-migration.test.js`
- 修改：`src/service-worker.js`
- 修改：`tests/service-worker-performance.test.js`

- [ ] **步骤 1：为无损迁移编写失败测试**

构造精确旧存储：

```js
const syncStorage = {
  translation_engine: 'deepseek',
  deepseek_model: 'deepseek-reasoner',
  deepseek_api_url: 'https://api.deepseek.com'
};
const localStorage = {
  deepseek_api_key: 'legacy-secret'
};
```

迁移后断言：

```js
assert.equal(syncStorage.active_provider, 'deepseek');
assert.deepEqual(syncStorage.provider_configs.deepseek, {
  model: 'deepseek-reasoner',
  apiUrl: 'https://api.deepseek.com',
  connectionStatus: 'untested'
});
assert.equal(localStorage.provider_api_keys.deepseek, 'legacy-secret');
```

同时验证已有 `provider_configs.deepseek` 和 `provider_api_keys.deepseek` 不被旧值覆盖。

- [ ] **步骤 2：运行迁移测试确认失败**

运行：

```powershell
node --test tests/provider-migration.test.js
```

预期：FAIL，迁移函数不存在。

- [ ] **步骤 3：改造 Service Worker 导入和迁移**

首行修改为：

```js
importScripts('shared.js', 'providers.js', 'provider-adapters.js', 'glossary.js');
```

用 `migrateProviderSettings()` 替换 `migrateDeepSeekKey()`。迁移算法：

1. 同时读取新旧同步配置和新旧本地密钥。
2. 新 `active_provider` 缺失时，根据旧 `translation_engine` 映射为 `deepseek` 或 `mymemory`。
3. `provider_configs.deepseek` 缺失时写入旧模型和地址。
4. `provider_api_keys.deepseek` 缺失时写入旧密钥。
5. 新值成功写入后删除 `translation_engine`、`deepseek_model`、`deepseek_api_url` 和 `deepseek_api_key`。
6. 重复执行不修改已有新配置。

迁移成功后同时执行：

```js
chrome.storage.sync.remove([
  STORAGE_KEYS.ENGINE,
  STORAGE_KEYS.MODEL,
  STORAGE_KEYS.API_URL,
  STORAGE_KEYS.DEEPSEEK_KEY
]);
chrome.storage.local.remove(STORAGE_KEYS.DEEPSEEK_KEY);
```

安装默认设置改为：

```js
{
  [STORAGE_KEYS.ACTIVE_PROVIDER]: 'mymemory',
  [STORAGE_KEYS.PROVIDER_CONFIGS]: {},
  [STORAGE_KEYS.SOURCE_LANG]: 'auto',
  [STORAGE_KEYS.TARGET_LANG]: 'zh-CN'
}
```

不得再写入 `translation_engine`、`deepseek_model` 或 `deepseek_api_url`。

- [ ] **步骤 4：重写配置加载**

`loadTranslationConfig()` 返回：

```js
{
  providerId,
  provider,
  providerConfig,
  apiKey,
  sourceLang,
  targetLang,
  customGlossary
}
```

当 `provider.requiresApiKey` 且密钥为空时，返回明确配置错误，不构造 MyMemory 回退。

Service Worker 在网络请求前调用 `chrome.permissions.contains` 检查 `toOriginPattern(providerConfig.apiUrl)`。缺少权限时返回：

```js
{
  success: false,
  error: 'missing_permission',
  message: `${providerName} API 地址尚未授权，请打开设置保存或测试连接`,
  needsConfig: true
}
```

不得在没有用户手势的 Service Worker 中调用 `chrome.permissions.request`。

- [ ] **步骤 5：把缓存键改为供应商维度**

`makeCacheKey` 参数改为：

```js
makeCacheKey(providerId, text, sourceLang, targetLang, model, apiUrl, hostname)
```

存储变更监听器监听：

```js
STORAGE_KEYS.ACTIVE_PROVIDER
STORAGE_KEYS.PROVIDER_CONFIGS
STORAGE_KEYS.PROVIDER_API_KEYS
```

任一变化时清空配置 Promise 和内存缓存。

- [ ] **步骤 6：用统一适配器替换 DeepSeek 专用函数**

删除：

```js
translateDeepSeek
translateDeepSeekBatch
```

翻译编排根据 `provider.protocol` 调用：

```js
requestProviderTranslation(...)
requestProviderBatchTranslation(...)
```

MyMemory 仍走现有免费引擎函数。批量响应无效时，使用现有 `mapWithConcurrency` 对同一供应商逐条重试。

- [ ] **步骤 7：增加测试连接消息**

新增消息：

```js
case 'test-provider-connection':
```

请求字段固定为：

```js
{
  type: 'test-provider-connection',
  providerId,
  config: { model, apiUrl, displayName },
  apiKey
}
```

Service Worker 使用同一注册表和适配器翻译 `hello` 到简体中文；返回统一结果，不保存密钥。

- [ ] **步骤 8：更新性能测试到新存储结构**

把 DeepSeek 测试配置改为：

```js
const syncStorage = {
  active_provider: 'deepseek',
  provider_configs: {
    deepseek: {
      model: 'deepseek-chat',
      apiUrl: 'https://api.deepseek.com',
      connectionStatus: 'untested'
    }
  },
  target_language: 'zh-CN'
};
const localStorage = {
  provider_api_keys: { deepseek: 'test-key' }
};
```

保留“一次批量网络请求、去重并恢复顺序、术语修正”的现有断言。

VM 上下文显式注入：

```js
TranslateOnlineProviders: require('../src/providers.js'),
TranslateOnlineProviderAdapters: require('../src/provider-adapters.js')
```

Chrome mock 增加：

```js
permissions: {
  contains(_request, callback) { callback(true); }
}
```

另加一个权限拒绝测试，断言 `fetchCount === 0` 且错误为 `missing_permission`。

- [ ] **步骤 9：运行服务工作线程测试**

运行：

```powershell
node --test tests/provider-migration.test.js tests/service-worker-performance.test.js
```

预期：PASS。

- [ ] **步骤 10：提交服务层改造**

```powershell
git add src/service-worker.js tests/provider-migration.test.js tests/service-worker-performance.test.js
git commit -m "feat: route translations through selected provider"
```

---

### 任务 5：实现设置页可搜索品牌网格

**文件：**
- 创建：`tests/options-providers.test.js`
- 修改：`src/options.html`
- 修改：`src/options.css`
- 修改：`src/options.js`

- [ ] **步骤 1：编写设置页结构失败测试**

测试必须匹配：

```js
assert.match(html, /id="provider-search"/);
assert.match(html, /id="provider-grid"/);
assert.match(html, /id="provider-config"/);
assert.match(html, /id="provider-api-key"/);
assert.match(html, /id="provider-model-preset"/);
assert.match(html, /id="provider-custom-model"/);
assert.match(html, /id="provider-api-url"/);
assert.match(html, /id="btn-test-provider"/);
assert.doesNotMatch(html, /name="engine"/);
assert.doesNotMatch(html, /id="deepseek-config"/);
assert.match(script, /TranslateOnlineProviders/);
```

- [ ] **步骤 2：运行测试确认旧界面失败**

运行：

```powershell
node --test tests/options-providers.test.js
```

预期：FAIL，品牌网格字段不存在。

- [ ] **步骤 3：重写设置页供应商区**

`options.html` 按顺序加载：

```html
<script src="shared.js"></script>
<script src="providers.js"></script>
<script src="options.js"></script>
```

供应商区域包含：

```html
<input id="provider-search" type="search" autocomplete="off" placeholder="搜索供应商">
<div id="provider-grid" class="provider-grid" role="listbox" aria-label="翻译服务"></div>
<section id="provider-config" class="provider-config" aria-live="polite">
  <input id="provider-display-name" type="text">
  <input id="provider-api-key" type="password" autocomplete="off">
  <select id="provider-model-preset"></select>
  <input id="provider-custom-model" type="text">
  <input id="provider-api-url" type="url">
  <button id="btn-test-provider" type="button">测试连接</button>
  <a id="provider-console-link" target="_blank" rel="noreferrer">控制台</a>
  <a id="provider-docs-link" target="_blank" rel="noreferrer">API 文档</a>
</section>
```

MyMemory 选中时隐藏 API Key、模型和地址字段，显示“无需配置”。

- [ ] **步骤 4：实现两列卡片视觉**

CSS 明确包含：

```css
.provider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.provider-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
}

.provider-card[aria-selected="true"] {
  border-color: #7dd3fc;
}
```

卡片图标使用 `img`，尺寸 32px，`object-fit: contain`。状态点使用蓝色表示已配置、绿色表示最近测试成功。

- [ ] **步骤 5：实现独立草稿和卡片切换**

`options.js` 维护：

```js
let activeProviderId = 'mymemory';
let providerConfigs = {};
let providerApiKeys = {};
```

切换卡片前调用 `captureActiveProviderForm()` 把当前字段写回内存；再用 `renderProviderForm(providerId)` 加载另一家配置。切换不立即写存储。

- [ ] **步骤 6：实现模型预设和自定义模型**

预设列表末尾固定增加：

```html
<option value="__custom__">手动输入模型 ID</option>
```

当前模型不在注册表预设中时，预设选中 `__custom__` 并把精确模型 ID 放入 `provider-custom-model`。保存时调用 `resolveProviderModel`，只写最终 `model`。

- [ ] **步骤 7：实现权限、保存和测试**

保存当前全部草稿前：

1. 调用 `normalizeApiBaseUrl`。
2. 对所有需要 API 的已编辑供应商调用现有 `ensureApiPermission`。
3. 权限拒绝时停止保存并保留原存储值。
4. 同步写入 `active_provider` 和 `provider_configs`。
5. 本地写入 `provider_api_keys`。
6. 删除旧 DeepSeek 存储键。

测试连接：

1. 只读取当前表单。
2. 申请当前地址权限。
3. 发送 `test-provider-connection`。
4. 成功时将 `connectionStatus` 改为 `success`，失败改为 `failed`。
5. 测试不自动保存 API Key。

MyMemory 免费引擎的限流提示改为“免费引擎请求频繁，请稍后重试或切换其他服务”，不再硬编码 DeepSeek。

- [ ] **步骤 8：运行设置页测试**

运行：

```powershell
node --test tests/options-providers.test.js tests/providers.test.js
node --check src/options.js
```

预期：PASS。

- [ ] **步骤 9：提交设置页**

```powershell
git add src/options.html src/options.css src/options.js tests/options-providers.test.js
git commit -m "feat: add searchable provider settings grid"
```

---

### 任务 6：实现工具栏带图标的紧凑供应商选择器

**文件：**
- 修改：`src/toolbar-popup.html`
- 修改：`src/toolbar-popup.css`
- 修改：`src/toolbar-popup.js`
- 修改：`tests/toolbar-popup.test.js`

- [ ] **步骤 1：把旧原生下拉断言改为新列表框失败测试**

测试结构：

```js
assert.match(html, /id="provider-trigger"/);
assert.match(html, /id="provider-menu"/);
assert.match(html, /role="listbox"/);
assert.match(html, /id="provider-icon"/);
assert.match(html, /id="provider-name"/);
assert.match(html, /id="provider-model"/);
assert.doesNotMatch(html, /id="engine"/);
assert.match(script, /STORAGE_KEYS\.ACTIVE_PROVIDER/);
assert.match(script, /STORAGE_KEYS\.PROVIDER_CONFIGS/);
assert.match(script, /STORAGE_KEYS\.PROVIDER_API_KEYS/);
```

- [ ] **步骤 2：运行测试确认失败**

运行：

```powershell
node --test tests/toolbar-popup.test.js
```

预期：FAIL，仍存在 `id="engine"`。

- [ ] **步骤 3：建立按钮和列表框**

HTML：

```html
<button id="provider-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
  <img id="provider-icon" alt="">
  <span>
    <strong id="provider-name"></strong>
    <small id="provider-model"></small>
  </span>
  <span aria-hidden="true">⌄</span>
</button>
<div id="provider-menu" role="listbox" hidden></div>
```

列表项使用 `button`，包含本地图标、供应商名、当前模型和配置状态。

页面脚本按顺序加载：

```html
<script src="shared.js"></script>
<script src="providers.js"></script>
<script src="toolbar-popup.js"></script>
```

- [ ] **步骤 4：实现键盘和选择行为**

必须支持：

- 点击触发器打开或关闭。
- `Escape` 关闭并把焦点还给触发器。
- `ArrowDown`、`ArrowUp` 在可见选项中移动。
- `Enter` 选择当前选项。
- 点击弹窗外关闭。

选择后只写：

```js
chrome.storage.sync.set({
  [STORAGE_KEYS.ACTIVE_PROVIDER]: providerId
});
```

不得修改该供应商配置。

- [ ] **步骤 5：阻止未配置供应商翻译**

加载同步配置和本地密钥后调用 `isProviderConfigured`。未配置时：

- `translate-page.disabled = true`
- 状态显示“当前服务需要配置”
- `open-options` 按钮仍可用

MyMemory 始终视为已配置。

- [ ] **步骤 6：运行弹窗测试**

运行：

```powershell
node --test tests/toolbar-popup.test.js
node --check src/toolbar-popup.js
```

预期：PASS。

- [ ] **步骤 7：提交快速选择器**

```powershell
git add src/toolbar-popup.html src/toolbar-popup.css src/toolbar-popup.js tests/toolbar-popup.test.js
git commit -m "feat: add branded provider quick switcher"
```

---

### 任务 7：更新清单、权限和文档

**文件：**
- 修改：`manifest.json`
- 修改：`scripts/check-project.js`
- 修改：`README.md`
- 修改：`package.json`

- [ ] **步骤 1：更新脚本加载顺序**

设置页和弹窗已在各自 HTML 中加载 `providers.js`。Service Worker 通过 `importScripts` 加载 `providers.js` 和 `provider-adapters.js`。

`manifest.json`：

- 保留 `https://api.mymemory.translated.net/*`。
- 从固定 `host_permissions` 移除 `https://api.deepseek.com/*`。
- 保留 `optional_host_permissions` 的 HTTP/HTTPS 通配来源，使用户手势可按实际地址授权。
- 描述改为“支持多种大模型 API 和免费翻译引擎”。

- [ ] **步骤 2：扩展项目引用检查**

`scripts/check-project.js` 检查：

- `src/providers.js`
- `src/provider-adapters.js`
- 12 个本地图标
- `images/providers/SOURCES.md`

并断言供应商图标不以 `http://` 或 `https://` 开头。

- [ ] **步骤 3：更新 README**

翻译引擎表列出 12 个入口，并说明：

- 每家独立保存密钥、模型和地址。
- 密钥只存本机。
- 不会自动回退到其他供应商。
- 已知和自定义 API 地址都按需请求主机权限。
- 品牌图标均为本地资源。

- [ ] **步骤 4：运行结构检查**

运行：

```powershell
npm.cmd run check
```

预期：语法检查全部通过，项目检查报告所有新增脚本和图标均存在。

- [ ] **步骤 5：提交清单和文档**

```powershell
git add manifest.json scripts/check-project.js package.json README.md
git commit -m "docs: document multi-provider translation support"
```

---

### 任务 8：完整回归与浏览器验收

**文件：**
- 修改：仅修复验证阶段发现的本功能问题

- [ ] **步骤 1：运行完整自动化测试**

运行：

```powershell
npm.cmd test
```

预期：所有测试 PASS，无跳过和失败。

- [ ] **步骤 2：运行语法与引用检查**

运行：

```powershell
npm.cmd run check
```

预期：所有 JavaScript 语法检查通过，Manifest 与供应商资源引用完整。

- [ ] **步骤 3：检查差异格式**

运行：

```powershell
git diff --check
```

预期：无空白错误；允许 Git 输出既有 LF/CRLF 转换警告。

- [ ] **步骤 4：在扩展管理页重新加载**

重新加载未打包扩展并刷新普通网页。确认旧 DeepSeek 用户的配置出现在 DeepSeek 卡片；若固定主机权限已被移除，打开 DeepSeek 设置并通过测试或保存完成按需授权。

- [ ] **步骤 5：验证设置页**

依次验证：

1. 搜索 `Gemini` 只保留 Gemini 卡片。
2. DeepSeek、Gemini、OpenAI、Claude 配置互不覆盖。
3. 模型预设和手动模型 ID 切换后只保存一个最终 `model`。
4. 错误密钥显示供应商名称和未授权提示。
5. 拒绝主机权限后原配置不被覆盖。
6. 断网后所有品牌图标仍显示。

- [ ] **步骤 6：验证翻译协议**

使用可用密钥完成：

- DeepSeek：短文本和整页批量翻译。
- Gemini：短文本和整页批量翻译。
- OpenAI：短文本和整页批量翻译。
- Claude：短文本和整页批量翻译。

在浏览器开发者工具中确认请求只发送给当前供应商，未出现 MyMemory 静默回退。

- [ ] **步骤 7：验证既有功能**

确认：

- 划词翻译
- 页面翻译与取消
- HLTV 术语库
- 自定义术语
- 历史记录
- 站点禁用
- 右侧头像拖动和悬停菜单

均保持可用。

- [ ] **步骤 8：提交验证修复**

若验证阶段修改了文件：

```powershell
git add src/providers.js src/provider-adapters.js src/service-worker.js src/options.html src/options.css src/options.js src/toolbar-popup.html src/toolbar-popup.css src/toolbar-popup.js tests/providers.test.js tests/provider-adapters.test.js tests/provider-migration.test.js tests/options-providers.test.js tests/service-worker-performance.test.js tests/toolbar-popup.test.js manifest.json scripts/check-project.js package.json README.md images/providers
git commit -m "fix: complete multi-provider integration"
```

若没有修改，不创建空提交。

---

## 官方接口依据

- DeepSeek：<https://api-docs.deepseek.com/>
- MiMo：<https://platform.xiaomimimo.com/#/docs/api/text-generation>
- MiniMax：<https://platform.minimax.io/docs/api-reference/text-openai-api>
- Gemini OpenAI 兼容：<https://ai.google.dev/gemini-api/docs/openai>
- OpenAI 模型：<https://developers.openai.com/api/docs/models/all>
- xAI 模型：<https://docs.x.ai/developers/models>
- 通义千问 OpenAI 兼容：<https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope>
- Kimi OpenAI 迁移：<https://platform.moonshot.cn/docs/guide/migrating-from-openai-to-kimi>
- 智谱 OpenAI SDK：<https://docs.bigmodel.cn/cn/guide/develop/openai/introduction>
- Claude 模型：<https://docs.anthropic.com/en/docs/about-claude/models/overview>
- Chrome Storage：<https://developer.chrome.com/docs/extensions/reference/api/storage>
- Chrome Permissions：<https://developer.chrome.com/docs/extensions/reference/api/permissions>
