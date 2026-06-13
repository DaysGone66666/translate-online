# Translate Online 可靠性与可访问性改进设计

## 目标

在保留现有划词翻译、整页翻译、侧边栏、免费引擎、DeepSeek 与毛玻璃主题的前提下，修复跨域权限、异步竞态、页面 DOM 破坏、敏感信息存储和键盘可访问性问题，并建立可重复执行的自动化检查。

## 架构

- 新增 `src/shared.js`，集中保存存储键、语言显示、API 地址校验、站点禁用规则和文本长度处理等纯逻辑。
- 新增 `src/page-translation-core.js`，负责识别页面中的可翻译块级元素。整页翻译以块级元素作为唯一任务单位。
- `content-script.js` 只负责页面交互、任务调度和结果注入；每次翻译均携带唯一请求 ID。
- `service-worker.js` 负责翻译请求、请求取消、结果缓存、API Key 迁移与敏感存储访问限制。

## 权限与存储

- MyMemory 与 DeepSeek 官方地址使用精确 `host_permissions`。
- 自定义 API 地址使用 `optional_host_permissions`，仅在用户保存或测试该地址时请求对应来源权限。
- DeepSeek API Key 从 `chrome.storage.sync` 迁移到 `chrome.storage.local`，其余偏好继续同步。
- 设置页和 README 明确说明选中文本会发送给当前翻译服务。
- 设置页提供按主机名禁用扩展的列表。

## 整页翻译

- 从文本节点定位最近的可翻译块级元素，并对块级元素去重。
- 跳过脚本、样式、代码、表单、按钮、导航、页眉、页脚、扩展自身 UI 和 `translate="no"` 内容。
- 译文作为带专属数据属性的块内 `span` 注入，不使用可能与网页冲突的通用类名。
- 每个运行实例独立维护队列、活动请求和取消状态；旧响应不能修改新运行状态。
- 队列包含整页任务，并在每次取任务时优先处理当前视口内容。

## 界面

- 浮窗语言标签使用翻译响应中的真实源语言和目标语言。
- 浮动翻译按钮使用原生 `button`，支持 Enter、Space 和清晰焦点样式。
- 设置页使用可聚焦的视觉隐藏控件、正确的 `label for`、`aria-live` 状态区域和响应式布局。
- 移除无法通过 Chrome Commands API 实现的快捷键录制界面，改为提供浏览器快捷键设置入口说明。
- 侧边栏使用内联状态代替错误弹窗，并提供加载状态、复制译文与单条删除。

## 验证

- 使用 Node 内置测试运行器测试共享纯逻辑和块级元素识别逻辑。
- 所有 JavaScript 文件通过 `node --check`。
- `manifest.json` 可被 PowerShell JSON 解析。
- `git diff --check` 无空白错误。
