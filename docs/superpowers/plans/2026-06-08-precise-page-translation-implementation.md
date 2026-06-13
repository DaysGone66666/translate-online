# 页面翻译精确定位实施计划

**目标：** 解决页面翻译漏译、文本合并和译文错位问题。

**架构：** 核心模块负责文本过滤和行内/块级模式判断；内容脚本负责可见性判断、精确插入、队列处理和动态内容监听。

**技术栈：** Chrome Extension Manifest V3、JavaScript、DOM MutationObserver、Node.js 测试

---

### 任务 1：文本节点规则

**文件：**
- 修改：`src/page-translation-core.js`
- 修改：`tests/page-translation-core.test.js`

- [x] 导航、按钮和短标签允许翻译。
- [x] 过滤纯数字、时间和短字母数字标识。
- [x] 每个叶文本节点成为独立目标。
- [x] 判断行内与块级译文模式。

### 任务 2：精确插入与增量翻译

**文件：**
- 修改：`src/content-script.js`
- 修改：`tests/content-style.test.js`

- [x] 将译文插入到源文本节点后方。
- [x] 为行内和块级译文提供不同样式。
- [x] 使用弱引用记录已处理文本和对应译文。
- [x] 使用 `MutationObserver` 翻译动态新增或变化内容。
- [x] 取消翻译时停止监听并清理状态。

### 任务 3：验证

- [x] 运行完整测试。
- [x] 运行项目检查。
- [x] 运行 `git diff --check`。
