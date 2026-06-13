# Translate Online UI 美化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 Translate Online 扩展的三个核心组件（浮窗、侧边栏、设置页）进行视觉美化，使用二次元动漫背景图 + 毛玻璃（Frosted Glass）设计语言。

**架构：** 纯 CSS 样式重写 + 少量 HTML 结构调整 + 背景图片资源管理。不涉及 JavaScript 逻辑变更。

**技术栈：** CSS3（backdrop-filter, linear-gradient, box-shadow）、HTML5

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `images/` | 新建目录 | 存放背景图片 |
| `images/popup-bg.png` | 新建（复制） | 浮窗背景图（原图1冷色） |
| `images/sidebar-bg.png` | 新建（复制） | 侧边栏/设置页背景图（原图2暖色） |
| `src/sidebar.html` | 修改（第9-10行） | 侧边栏标题添加 T Logo |
| `src/sidebar.css` | 重写 | 毛玻璃+背景图设计 |
| `src/options.html` | 修改（第9行） | 设置页标题添加 T Logo |
| `src/options.css` | 重写 | 毛玻璃卡片+背景图设计 |
| `src/popup.css` | 重写 | 浮窗毛玻璃+背景氛围设计 |
| `src/content-script.js` | 修改 | 浮窗 HTML 结构更新 + 动态背景图注入 |

---

### 任务 1：资源准备 — 创建 images 目录并复制背景图片

**文件：**
- 创建：`images/popup-bg.png`（复制自 `icons/屏幕截图 2024-11-29 201507.png`）
- 创建：`images/sidebar-bg.png`（复制自 `icons/屏幕截图 2025-11-16 143020.png`）

- [ ] **步骤 1：创建 images 目录并复制图片**

```bash
mkdir -p images
cp "icons/屏幕截图 2024-11-29 201507.png" images/popup-bg.png
cp "icons/屏幕截图 2025-11-16 143020.png" images/sidebar-bg.png
```

- [ ] **步骤 2：验证图片文件**

```bash
ls -lh images/
# 预期输出：
# popup-bg.png (1.1M) 1204x1247
# sidebar-bg.png (1.1M) 2476x1141
```

- [ ] **步骤 3：提交**

```bash
git add images/ && git commit -m "feat: add background images for UI redesign"
```

---

### 任务 2：侧边栏 — 毛玻璃 + 背景图设计

**文件：**
- 修改：`src/sidebar.html`（第9-10行：标题添加 T Logo）
- 重写：`src/sidebar.css`

- [ ] **步骤 1：修改 sidebar.html 标题添加 T Logo**

原代码（第9-10行）：
```html
<h1 class="sb-title">Translate</h1>
```

改为：
```html
<div class="sb-title">
  <span class="sb-logo">T</span>
  <span>Translate</span>
</div>
```

- [ ] **步骤 2：重写 sidebar.css**

完整替换为：

```css
/* src/sidebar.css — 毛玻璃主题 */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  height: 100vh;
  display: flex;
  flex-direction: column;
  /* 背景图铺满 */
  background-image: url('../images/sidebar-bg.png');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

/* 半透明叠加层，增强文字对比度 */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%);
  pointer-events: none;
  z-index: 0;
}

#app {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.sb-header {
  padding: 16px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sb-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.sb-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: rgba(255,255,255,0.2);
  backdrop-filter: blur(8px);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.sb-header-actions { display: flex; gap: 4px; }

.sb-icon-btn {
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(4px);
  border: none;
  cursor: pointer;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 15px;
  color: rgba(255,255,255,0.8);
  transition: background 0.2s;
}
.sb-icon-btn:hover { background: rgba(255,255,255,0.2); }

.sb-history {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.sb-entry {
  margin-bottom: 8px;
  padding: 12px 14px;
  background: rgba(255,255,255,0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.3);
}

.sb-entry-original { margin-bottom: 6px; }

.sb-entry-lang-tag {
  display: inline-block;
  font-size: 10px;
  background: linear-gradient(135deg, #2563EB, #1D4ED8);
  color: #fff;
  padding: 1px 7px;
  border-radius: 5px;
  margin-right: 6px;
  vertical-align: middle;
}

.sb-entry-text {
  vertical-align: middle;
  font-weight: 600;
  font-size: 13px;
  color: #1a1a1a;
}

.sb-entry-translation {
  padding-left: 26px;
  font-size: 13px;
  color: #6B7280;
  margin-top: 3px;
}

.sb-entry-time {
  font-size: 11px;
  color: #bbb;
  margin-top: 4px;
  text-align: right;
}

.sb-empty {
  text-align: center;
  color: rgba(255,255,255,0.6);
  margin-top: 40px;
  font-size: 14px;
}

.sb-input-area {
  padding: 14px 16px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.sb-input {
  flex: 1;
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 12px;
  padding: 9px 14px;
  font-size: 13px;
  font-family: inherit;
  color: rgba(255,255,255,0.9);
  resize: none;
}
.sb-input:focus { outline: none; border-color: rgba(255,255,255,0.3); }
.sb-input::placeholder { color: rgba(255,255,255,0.5); }

.sb-btn-primary {
  padding: 9px 18px;
  background: linear-gradient(135deg, #2563EB, #1D4ED8);
  color: #fff;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(37,99,235,0.3);
  transition: box-shadow 0.2s;
}
.sb-btn-primary:hover { box-shadow: 0 6px 16px rgba(37,99,235,0.4); }
```

- [ ] **步骤 3：提交**

```bash
git add src/sidebar.html src/sidebar.css
git commit -m "feat: redesign sidebar with frosted glass and anime background"
```

---

### 任务 3：设置页 — 毛玻璃卡片 + 背景图设计

**文件：**
- 修改：`src/options.html`（第8-9行：标题添加 T Logo）
- 重写：`src/options.css`

- [ ] **步骤 1：修改 options.html 标题添加 T Logo**

原代码（第8-9行）：
```html
<div class="container">
  <h1 class="page-title">Translate Online 设置</h1>
```

改为：
```html
<div class="container">
  <div class="page-title">
    <span class="op-logo">T</span>
    <span>Translate Online 设置</span>
  </div>
```

- [ ] **步骤 2：重写 options.css**

完整替换为：

```css
/* src/options.css — 毛玻璃主题 */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-image: url('../images/sidebar-bg.png');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, rgba(37,99,235,0.08), transparent 50%);
  pointer-events: none;
  z-index: 0;
}

.container {
  position: relative;
  z-index: 1;
  max-width: 500px;
  width: 100%;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 18px;
  padding: 24px 28px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
  border: 1px solid rgba(255,255,255,0.3);
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.op-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #2563EB, #1D4ED8);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
}

.section {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.section:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #374151;
}

.form-group { margin-bottom: 14px; }

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #555;
  margin-bottom: 5px;
}

.form-input, .form-select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
  transition: border-color 0.2s;
}
.form-input:focus, .form-select:focus {
  outline: none;
  border-color: #2563EB;
  box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
}

.engine-group {
  display: flex;
  gap: 8px;
}

.radio-label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  cursor: pointer;
  border: 2px solid #E5E7EB;
  border-radius: 10px;
  transition: all 0.2s;
  text-align: center;
}

.radio-label:has(input:checked) {
  border-color: #2563EB;
  background: rgba(37,99,235,0.06);
}

.radio-label input { display: none; }

.radio-text { font-size: 13px; font-weight: 500; }
.radio-label:has(input:checked) .radio-text { color: #2563EB; }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
}

.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.chip-active {
  background: rgba(37,99,235,0.1);
  color: #2563EB;
}

.chip-inactive {
  background: #fff;
  color: #6B7280;
  border: 1px solid #E5E7EB;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  flex: 1;
  background: linear-gradient(135deg, #2563EB, #1D4ED8);
  color: #fff;
  box-shadow: 0 4px 12px rgba(37,99,235,0.25);
}
.btn-primary:hover { box-shadow: 0 6px 16px rgba(37,99,235,0.35); }

.btn-secondary {
  background: rgba(255,255,255,0.8);
  color: #374151;
  border: 1px solid #E5E7EB;
}
.btn-secondary:hover { background: #f9fafb; }

.status-message {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  display: none;
  font-size: 13px;
}
.status-message.success { display: block; background: rgba(22,163,74,0.1); color: #16A34A; }
.status-message.error { display: block; background: rgba(220,38,38,0.1); color: #DC2626; }
.status-message.info { display: block; background: rgba(37,99,235,0.08); color: #2563EB; }
```

- [ ] **步骤 3：提交**

```bash
git add src/options.html src/options.css
git commit -m "feat: redesign options page with frosted glass card and background"
```

---

### 任务 4：浮窗（Popup）— 毛玻璃 + 背景氛围设计

**注意：** Content Script 中 CSS 无法直接使用 `chrome-extension://` URL，因此 popup 背景图需通过 JavaScript 动态设置。

**文件：**
- 修改：`src/content-script.js`（在 createPopup 中添加背景图设置）
- 重写：`src/popup.css`

- [ ] **步骤 1：更新 content-script.js 浮窗 HTML 结构 + 背景图**

在 `createPopup()` 函数中，更新 `popupContainer.innerHTML` 使用新的 CSS class 名称，并设置背景图：

```javascript
// 在 createPopup 中原有 closePopup() 之后
// 更新 popupContainer.innerHTML 使用新 CSS 类名
popupContainer.innerHTML = `
  <div class="to-popup-card">
    <div class="to-popup-header">
      <span class="to-popup-lang-tag">EN → 中文</span>
      <div class="to-popup-header-actions">
        <button class="to-popup-header-btn" id="to-btn-speak" title="朗读">🔊</button>
        <button class="to-popup-header-btn" id="to-btn-sidebar" title="打开侧边栏">☰</button>
      </div>
    </div>
    <div class="to-popup-label">原文</div>
    <div class="to-popup-original">${escapeHtml(text)}</div>
    <div class="to-popup-divider"></div>
    <div class="to-popup-label">译文</div>
    <div class="to-popup-translation-wrap">
      <div class="to-popup-translation" id="to-translation-text">
        <span class="to-popup-loading">翻译中...</span>
      </div>
    </div>
  </div>
`;

// 设置 popup 背景图（通过 chrome.runtime.getURL 获取扩展内资源路径）
const bgUrl = chrome.runtime.getURL('images/popup-bg.png');
popupContainer.style.backgroundImage = `url('${bgUrl}')`;
popupContainer.style.backgroundSize = 'cover';
popupContainer.style.backgroundPosition = 'center';
```

- [ ] **步骤 2：重写 popup.css**

完整替换为：

```css
/* src/popup.css — 毛玻璃主题 */
.to-popup-container {
  position: absolute;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.5;
  pointer-events: none;
  /* background-image 由 JavaScript 动态设置 (chrome.runtime.getURL) */
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  min-width: 260px;
  min-height: 100px;
}

/* 背景亮度降低 + 蓝色渐变叠加 */
.to-popup-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(37,99,235,0.15), rgba(29,78,216,0.08));
  pointer-events: none;
  z-index: 0;
}

.to-popup-card {
  position: relative;
  z-index: 1;
  pointer-events: auto;
  background: rgba(255,255,255,0.78);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  padding: 14px 16px;
  margin: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  border: 1px solid rgba(255,255,255,0.4);
}

.to-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.to-popup-lang-tag {
  display: inline-block;
  background: linear-gradient(135deg, #2563EB, #1D4ED8);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 10px;
}

.to-popup-header-actions {
  display: flex;
  gap: 6px;
}

.to-popup-header-btn {
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 8px;
  background: rgba(0,0,0,0.04);
  font-size: 14px;
  transition: background 0.2s;
  border: none;
  line-height: 1;
}
.to-popup-header-btn:hover { background: rgba(0,0,0,0.08); }

.to-popup-label {
  font-size: 10px;
  color: #888;
  margin-bottom: 2px;
}

.to-popup-original {
  font-weight: 600;
  color: #1a1a1a;
  word-break: break-word;
  font-size: 13px;
}

.to-popup-divider {
  height: 1px;
  background: rgba(0,0,0,0.06);
  margin: 8px 0;
}

.to-popup-translation-wrap {
  padding: 8px 10px;
  background: rgba(37,99,235,0.06);
  border-radius: 10px;
}

.to-popup-translation {
  color: #374151;
  word-break: break-word;
  font-size: 13px;
}

.to-popup-loading {
  color: #999;
  font-style: italic;
  font-size: 13px;
}

.to-popup-error {
  color: #DC2626;
  font-size: 12px;
}

.to-popup-link {
  color: #2563EB;
  text-decoration: underline;
  cursor: pointer;
  font-size: 12px;
}

.to-popup-note {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}
```

- [ ] **步骤 2：提交**

```bash
git add src/popup.css src/content-script.js
git commit -m "feat: redesign popup with frosted glass card and background ambiance"
```

---

### 任务 5：集成验证

**文件：**
- 确认：所有修改的文件

- [ ] **步骤 1：检查文件完整性**

```bash
ls -la images/ src/popup.css src/sidebar.css src/sidebar.html src/options.css src/options.html
# 确认所有文件存在、有内容
```

- [ ] **步骤 2：在 Edge 中加载验证**

1. 打开 edge://extensions
2. 重新加载 Translate Online 扩展（点刷新按钮）
3. 打开设置页，确认毛玻璃效果和背景图显示正常
4. 打开侧边栏，确认背景图和毛玻璃卡片显示正常
5. 在网页中划词，确认浮窗显示正常

- [ ] **步骤 3：滚动测试**

- 侧边栏内容滚动时，确认背景图片不跟随滚动（视觉稳定）
- 确认毛玻璃效果在各种内容长度下正常工作

- [ ] **步骤 4：提交最终版本**

```bash
git add .
git commit -m "chore: finalize UI redesign v1"
```
