# Translate Online 可靠性与可访问性改进实现计划

> **面向 AI 代理的工作者：** 使用测试驱动方式逐项实现并持续运行完整检查。

**目标：** 修复扩展权限、存储、翻译竞态与页面兼容问题，并改进界面可访问性和工程验证。

**架构：** 将可测试纯逻辑抽取至共享脚本，内容脚本采用独立运行对象管理整页翻译，后台服务线程统一处理取消、缓存和敏感存储。

**技术栈：** Manifest V3、原生 JavaScript、Chrome Extensions API、Node.js 内置测试运行器。

---

### 任务 1：建立失败测试

- [x] 创建 `package.json` 与 `tests/shared.test.js`
- [x] 创建 `tests/page-translation-core.test.js`
- [x] 运行 `npm test`，确认因缺少实现而失败

### 任务 2：实现共享纯逻辑

- [x] 创建 `src/shared.js`
- [x] 创建 `src/page-translation-core.js`
- [x] 运行 `npm test`，确认纯逻辑测试通过

### 任务 3：修复后台权限、存储和请求生命周期

- [x] 更新 `manifest.json` 的必需与可选主机权限
- [x] 更新 `src/service-worker.js`，实现 API Key 迁移、本地存储、请求取消、缓存和语言元数据
- [x] 运行 JavaScript 语法检查

### 任务 4：重构页面翻译与划词浮窗

- [x] 更新 `src/content-script.js`，使用块级任务与独立运行状态
- [x] 使用专属数据属性注入和清理译文
- [x] 为划词请求增加请求 ID 与取消处理
- [x] 运行测试与语法检查

### 任务 5：修复设置页和侧边栏

- [x] 更新设置页的 API 权限请求、API Key 本地存储、禁用站点列表和快捷键说明
- [x] 更新侧边栏加载、状态、复制和删除交互
- [x] 更新 HTML 与 CSS 的标签、焦点、响应式和低动态效果
- [x] 运行测试与语法检查

### 任务 6：更新文档与完整验证

- [x] 更新 README 的隐私、权限、开发和行为说明
- [x] 忽略未参与打包的原始背景截图副本
- [x] 运行 `npm test`
- [x] 运行 `npm run check`
- [x] 运行 `git diff --check`
