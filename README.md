# Translate Online

Edge / Chrome 划词与整页翻译扩展，支持免费 MyMemory 服务和多种用户自备密钥的大模型 API。

## 功能

- **划词翻译**：选中文本后自动显示翻译浮窗，支持朗读与打开侧边栏
- **工具栏控制面板**：点击扩展图标即可切换目标语言、翻译服务和常用开关
- **多供应商配置**：设置页提供可搜索的供应商卡片、独立模型、API 地址和连接测试
- **页面一键翻译**：点击右侧浮动按钮，以双语对照形式翻译页面正文
- **雷姆网页宠物**：右侧宠物卡片平时半隐藏，悬停后显示翻译与设置入口，可上下拖动，并用不同图片反馈翻译中、完成和失败状态
- **视口优先**：整页翻译优先处理当前可见内容，最多同时处理两个翻译任务
- **智能过滤**：跳过导航、页眉页脚、按钮、表单、代码块、编辑区和 `translate="no"` 内容
- **站点术语库**：HLTV 高频短语使用固定 CS 译法，完整短语命中时无需网络请求
- **自定义术语**：设置页支持按 `源词 = 译文` 添加固定翻译，并覆盖内置术语
- **翻译历史**：侧边栏支持手动翻译、复制译文、删除单条记录和清空历史
- **站点禁用列表**：可按主机名停用扩展，并同时应用于其子域名
- **快捷键**：默认使用 `Ctrl+Shift+E` 翻译选中文本，可在浏览器扩展快捷键页面修改

## 翻译服务

| 服务 | 配置 |
|------|------|
| MyMemory | 无需 API Key |
| DeepSeek、MiMo、MiniMax、Gemini、OpenAI、Grok / xAI | 用户自行配置 API Key |
| 通义千问、Kimi、智谱 GLM、Claude | 用户自行配置 API Key |
| 自定义兼容服务 | 配置 OpenAI 兼容 API 地址、模型和 API Key |

每家服务独立保存模型、API 地址和连接状态。API Key 仅保存在 `chrome.storage.local`，不会参与浏览器同步。已知和自定义 API 地址都会在保存或测试时请求对应来源的访问权限。

## 隐私说明

翻译时，选中的文本或页面正文只会发送给当前选择的翻译服务。配置错误或请求失败时不会静默切换到其他供应商。

扩展不会主动上传翻译历史。翻译历史和各供应商 API Key 保存在本机扩展存储中。对于不应发送到第三方服务的页面，请在设置页的“禁用站点”中添加对应主机名。

## 权限说明

- `storage`：保存偏好、API Key 和翻译历史
- `sidePanel`：显示翻译历史与手动翻译界面
- `contextMenus`：提供“翻译选中文本”右键菜单
- `activeTab`：向当前标签页发送快捷键和右键菜单翻译请求
- MyMemory 官方域名：提供无需配置的免费翻译
- 可选网站权限：保存或测试其他供应商及自定义 API 地址时，按实际来源请求

## 安装

1. 打开 Edge/Chrome 的扩展管理页面
2. 开启“开发人员模式”
3. 选择“加载解压缩的扩展”，然后选择本项目根目录

## 使用

### 划词翻译

选中文本后等待约 0.3 秒即可显示翻译浮窗。按 `Esc` 可关闭浮窗。

### 页面翻译

1. 点击网页右侧的“译”按钮开始翻译
2. 翻译过程中点击“取消”可停止请求并移除已生成译文
3. 完成后点击“原文”或“译文”切换双语显示

### 自定义术语

在设置页的“自定义术语”中，每行填写一个 `源词 = 译文`。首版自定义术语适用于英文到简体中文；空行和以 `#` 开头的行会被忽略。

### 快捷键

默认快捷键为 `Ctrl+Shift+E`。浏览器不允许扩展直接修改快捷键，请前往：

- Edge：`edge://extensions/shortcuts`
- Chrome：`chrome://extensions/shortcuts`

## 项目结构

```text
src/
  shared.js                 # 存储键、语言、API 地址和站点规则
  providers.js              # 供应商注册表、默认模型和配置规范化
  provider-adapters.js      # OpenAI 兼容与 Claude Messages 协议适配
  glossary.js               # HLTV 内置术语、自定义术语解析与完整词匹配
  page-translation-core.js  # 可测试的页面翻译块识别与运行状态
  content-script.js         # 划词浮窗、页面翻译和页面交互
  service-worker.js         # API 请求、取消、缓存、历史与存储迁移
  sidebar.html/js/css       # 翻译历史与手动翻译
  options.html/js/css       # 设置页
  toolbar-popup.html/js/css # 工具栏控制面板
  popup.css                 # 划词浮窗样式
tests/
  glossary.test.js
  providers.test.js
  provider-adapters.test.js
  provider-migration.test.js
  options-providers.test.js
  shared.test.js
  page-translation-core.test.js
manifest.json
```

## 开发与验证

需要安装 Node.js，无需安装第三方依赖。

```bash
npm test
npm run check
node generate-icons.js
```

发布或分发扩展前，请确认 `images/` 中背景图片拥有适用的使用与分发权限。

## 当前设计文档

- [可靠性与可访问性设计](docs/superpowers/specs/2026-06-07-reliability-accessibility-design.md)
- [可靠性与可访问性实现计划](docs/superpowers/plans/2026-06-07-reliability-accessibility-implementation.md)
