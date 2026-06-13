# 多供应商翻译 API 设计

## 目标

在保留 MyMemory 免费引擎和现有 DeepSeek 配置的基础上，引入常见大模型供应商，并为每个供应商提供独立配置、品牌图标和快速切换能力。

首批服务入口：

1. `mymemory`：MyMemory 免费引擎
2. `deepseek`：DeepSeek
3. `mimo`：MiMo
4. `minimax`：MiniMax
5. `gemini`：Gemini
6. `openai`：OpenAI
7. `xai`：Grok / xAI
8. `qwen`：通义千问
9. `kimi`：Kimi
10. `glm`：智谱 GLM
11. `claude`：Claude
12. `custom_openai`：自定义 OpenAI 兼容服务

## 设计原则

- 用户明确选择哪个供应商，正文就只发送给该供应商。
- 不因缺少密钥、限流或服务故障而静默切换到其他供应商。
- 每个供应商独立保存 API Key、模型和 API 地址。
- 模型使用“常用预设 + 手动模型 ID”，不在运行时拉取模型列表。
- API Key 仅保存在 `chrome.storage.local`；非敏感配置保存在 `chrome.storage.sync`。
- 品牌图标全部随扩展本地打包，不使用在线 favicon。
- 新增供应商通过注册表描述，避免在界面和请求代码中重复硬编码。

## 供应商注册表

新增独立供应商注册模块，集中维护以下信息：

- 稳定供应商 ID
- 显示名称
- 本地图标路径
- 请求协议
- 默认 API 地址
- 常用模型预设
- 默认模型
- 认证方式
- 是否支持批量 JSON 翻译
- 官方控制台地址
- 官方 API 文档地址

供应商 ID 使用本规格“首批服务入口”中列出的精确值，不从显示名称推导，也不在其他模块重复声明。

注册表只保存公开元数据，不保存用户密钥。

## 请求适配器

### MyMemory

保留现有免费翻译适配器。仅当用户明确选择免费引擎时使用。

### OpenAI 兼容适配器

以下供应商通过统一的 Chat Completions 请求适配器处理：

- DeepSeek
- MiMo
- MiniMax
- Gemini
- OpenAI
- Grok / xAI
- 通义千问
- Kimi
- 智谱 GLM
- 自定义 OpenAI 兼容服务

注册表提供供应商自己的默认地址、模型和认证配置。适配器负责：

- 标准化 API 地址
- 构造认证头
- 构造单条和批量翻译提示
- 解析 `choices[0].message.content`
- 将 HTTP 状态映射为统一错误
- 在批量 JSON 结果无效时降级为同一供应商的限并发逐条翻译

### Claude Messages 适配器

Claude 使用独立 Messages API 适配器，负责：

- Anthropic 请求头
- Messages API 请求体
- 从内容块中提取文本
- 与其他适配器一致的单条、批量、取消和错误结果格式

### 统一结果

所有适配器返回现有翻译流程可消费的统一结果：

- 成功译文
- 批量译文
- 已取消
- 未授权
- 权限不足
- 请求限流
- 服务端故障
- 网络错误
- 响应格式无效

内容脚本、术语库、缓存和历史记录不感知具体供应商。

## 配置存储

新增精确存储键：

- `active_provider`：当前选择的供应商 ID，存入 `chrome.storage.sync`。
- `provider_configs`：按供应商 ID 保存模型、API 地址和非敏感配置，存入 `chrome.storage.sync`。
- `provider_api_keys`：按供应商 ID 保存 API Key，仅存入 `chrome.storage.local`。

逻辑结构：

```json
{
  "active_provider": "deepseek",
  "provider_configs": {
    "deepseek": {
      "model": "deepseek-chat",
      "apiUrl": "https://api.deepseek.com"
    }
  },
  "provider_api_keys": {
    "deepseek": "用户密钥"
  }
}
```

`provider_configs` 中的精确字段为：

- `model`：最终生效的模型 ID。
- `apiUrl`：供应商 API 基础地址。
- `displayName`：仅供 `custom_openai` 使用的自定义显示名称；其他供应商不写入该字段。
- `connectionStatus`：最后一次测试结果，只允许 `untested`、`success` 或 `failed`。

共享模块必须定义并导出上述存储键、供应商 ID 和配置读写函数，其他模块只调用共享接口。

## DeepSeek 迁移

升级时读取现有精确存储键：

- `translation_engine`
- `deepseek_api_key`
- `deepseek_model`
- `deepseek_api_url`

迁移规则：

- 原引擎为 `deepseek` 时，当前供应商迁移为 DeepSeek。
- 原引擎为 `free` 时，当前供应商迁移为 MyMemory。
- DeepSeek API Key 迁移至本地供应商密钥集合。
- 模型和 API 地址迁移至同步供应商配置集合。
- 新配置成功写入后删除旧 DeepSeek 配置字段。
- 迁移可重复执行，不覆盖已经存在的新配置。

## 设置页

采用已确认的 A 方案：可搜索品牌网格。

### 供应商选择

- 顶部提供按供应商名称搜索。
- 使用两列品牌卡片。
- 卡片显示本地图标、供应商名称、当前模型和配置状态。
- 已配置显示蓝色状态；连接测试成功显示绿色状态。
- 当前供应商具有清晰选中边框和键盘焦点。
- 自定义兼容服务使用通用连接图标，并允许用户填写显示名称。

### 配置面板

只展开当前卡片对应的配置，包含：

- API Key
- 常用模型预设
- 手动模型 ID
- API 地址
- 测试连接
- 官方控制台和文档链接

模型预设选择“自定义”后显示手动模型 ID。最终生效模型必须有单一、明确的读取规则，不能同时提交预设和手动值。

### 隐私说明

隐私说明改为通用表述：

- 翻译内容发送至当前选择的供应商。
- API Key 仅保存在本机扩展存储中。
- 扩展不会把密钥写入同步存储、日志或历史记录。

## 工具栏快速弹窗

- 保留紧凑布局，不在弹窗中展示完整品牌网格。
- 服务选择器每项显示品牌图标、供应商名称和当前模型。
- 切换到尚未配置的供应商时显示“需要配置”，并提供打开设置页入口。
- 快速切换只改变当前供应商，不修改该供应商已有配置。
- 当前供应商选择写入完成后，才能启动整页翻译。

## 品牌图标

- 优先使用供应商提供的官方品牌素材。
- 官方素材不适合直接打包时，使用许可允许再分发的 Simple Icons SVG。
- 图标保留原始比例和品牌颜色，不重新绘制品牌标志。
- 图标统一放在独立的供应商品牌资源目录。
- 每个注册表条目必须引用存在的本地资源。
- 构建检查禁止供应商图标使用远程 URL。

## 权限

- 保留 MyMemory 当前主机权限。
- 其他供应商在用户保存配置或测试连接时，通过 `optional_host_permissions` 请求实际 API 地址来源权限。
- 用户拒绝权限时，不写入无法使用的地址配置，并给出明确提示。
- 自定义地址沿用相同的地址标准化和来源权限流程。
- 测试连接和正式翻译共用同一适配器与权限检查。

## 数据流

1. 用户在设置页选择供应商卡片。
2. 设置页读取该供应商独立配置。
3. 用户保存时，先校验地址和模型，再请求来源权限。
4. 非敏感配置写入同步存储，API Key 写入本地存储。
5. 翻译请求加载当前供应商及其配置。
6. 服务工作线程根据注册表选择协议适配器。
7. 适配器返回统一结果。
8. 现有术语修正、缓存、历史记录和页面注入流程继续处理结果。

## 错误处理

- 未配置 API Key：提示打开该供应商配置，不回退到免费引擎。
- `401`：API Key 无效。
- `403`：账户或接口权限不足。
- `429`：供应商限流。
- `5xx`：供应商服务暂时不可用。
- 网络异常：显示网络请求失败。
- 响应结构不匹配：显示响应格式错误。
- 批量 JSON 解析失败：改用同一供应商逐条翻译。
- 用户取消：终止当前请求，不显示失败提示。

错误消息包含供应商显示名称，但不得包含 API Key、完整请求正文或敏感响应头。

## 缓存与隐私

- 缓存键加入供应商 ID、模型和 API 地址，避免跨供应商复用结果。
- 切换供应商或修改任一供应商配置时清空内存翻译缓存。
- 历史记录继续只保存原文、译文、语言与时间，不保存供应商密钥。
- 历史记录是否增加供应商 ID 不属于本次范围。

## 测试

### 注册表

- 12 个服务入口均存在。
- 每个供应商具有完整名称、协议和本地图标。
- 除 `mymemory` 与 `custom_openai` 外，每个供应商具有默认地址、默认模型和模型预设。
- `mymemory` 不要求模型或 API Key。
- `custom_openai` 要求用户填写 API 地址和模型 ID。
- 所有图标路径存在且不包含远程 URL。

### 适配器

- MyMemory、OpenAI 兼容和 Claude Messages 分别覆盖单条与批量请求。
- 验证认证头、请求路径、请求体和响应解析。
- 验证取消、未授权、权限不足、限流、服务端和网络错误。
- 验证批量解析失败后的同供应商逐条降级。

### 配置与迁移

- 每个供应商配置独立，切换后不互相覆盖。
- API Key 只进入本地存储。
- DeepSeek 和免费引擎旧配置无损迁移。
- 重复迁移不覆盖新配置。

### 界面

- 搜索、卡片选择、模型预设、手动模型、保存与测试连接可用。
- 工具栏选择器显示本地图标和当前模型。
- 未配置供应商不能直接发起翻译。
- 键盘操作和焦点样式完整。

### 回归

- 划词翻译、整页批量翻译、取消、术语库、缓存和历史记录保持现有行为。
- 悬浮头像工具条与站点禁用功能不受影响。
- `npm.cmd test`、`npm.cmd run check` 和 `git diff --check` 通过。

## 手工验收

- DeepSeek、Gemini、OpenAI、Claude 各完成一次短文本翻译。
- 上述四家各完成一次整页翻译。
- 至少验证一次权限拒绝、错误密钥和限流提示。
- 切换供应商后确认请求只发送至当前供应商。
- 断网时确认本地图标仍正常显示。

## 不在本次范围

- 自动根据价格、速度或故障切换供应商。
- 聚合多个供应商并比较译文。
- 自动拉取供应商模型列表。
- 账户登录、云端密钥托管或跨设备同步 API Key。
- 供应商用量、余额和账单查询。
- 修改历史记录的数据展示。

## 参考

- OpenAI Chat Completions：<https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create>
- Gemini OpenAI 兼容接口：<https://ai.google.dev/gemini-api/docs/openai>
- Claude Messages API：<https://docs.anthropic.com/en/api/messages>
- Chrome Storage API：<https://developer.chrome.com/docs/extensions/reference/api/storage>
- Chrome Permissions API：<https://developer.chrome.com/docs/extensions/reference/api/permissions>
- Simple Icons：<https://simpleicons.org/>
