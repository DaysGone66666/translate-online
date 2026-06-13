# 雷姆主题视觉优化实施计划

**目标：** 使用用户提供的雷姆图片统一优化扩展图标、设置页、侧边栏和划词弹窗。

**架构：** 保留现有 HTML 与 JavaScript 行为，仅整理图片资源、生成图标并更新 CSS。验证继续使用现有 Node 测试和项目检查脚本。

**技术栈：** Chrome Extension Manifest V3、HTML、CSS、Pillow、Node.js

---

### 任务 1：整理视觉资源

**文件：**
- 重命名：`images/options-background.jpgjpg.jpg` -> `images/options-background.jpg`
- 生成：`icons/icon16.png`
- 生成：`icons/icon48.png`
- 生成：`icons/icon128.png`

- [ ] 修正设置页背景文件名。
- [ ] 从 `images/icon-source.jpg` 中央头像区域裁切方形图标。
- [ ] 生成 16、48、128 像素 PNG 图标。
- [ ] 检查生成图标尺寸与内容。

### 任务 2：统一界面主题

**文件：**
- 修改：`src/options.css`
- 修改：`src/sidebar.css`
- 修改：`src/popup.css`

- [ ] 设置页引用 `images/options-background.jpg`，改为深蓝玻璃面板。
- [ ] 侧边栏引用 `images/sidebar-background.jpg`，改为深蓝玻璃卡片。
- [ ] 划词弹窗统一冰蓝高亮、深色玻璃卡片和焦点样式。
- [ ] 使用生成后的图标装饰设置页和侧边栏标题。
- [ ] 将网页一键翻译按钮改为可展开的极简雷姆头像按钮。
- [ ] 为按钮翻译中状态增加冰蓝光环，并统一页面译文块与提示消息。
- [ ] 移除页面译文块的卡片化样式，使译文以弱装饰文本融入原页面。

### 任务 3：验证

**文件：**
- 验证：`manifest.json`
- 验证：`src/*.css`
- 验证：`icons/*.png`

- [ ] 运行 `npm.cmd test`。
- [ ] 运行 `npm.cmd run check`。
- [ ] 运行 `git diff --check`。
- [ ] 检查资源路径、图标尺寸和 CSS 引用。
