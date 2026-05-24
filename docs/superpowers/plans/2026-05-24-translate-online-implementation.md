# Translate Online 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现一个 Edge（Chromium MV3）划词翻译扩展，默认使用免费公共翻译 API（MyMemory），用户可配置 DeepSeek API Key 获得更高质量翻译。支持浮窗和侧边栏双展示模式。

**架构：** Service Worker 中继架构。内容脚本只负责 UI 交互和划词检测，所有 API 调用通过 Service Worker 转发。引擎选择逻辑在 Service Worker 中，检测到 DeepSeek Key 时优先使用，否则回退到免费 API。

**技术栈：** 原生 JavaScript（无框架）、Chrome Extension MV3 API、MyMemory API（免费引擎）、DeepSeek API（可选升级）、chrome.storage

---

## 文件清单

| 文件 | 职责 |
|------|------|
| `manifest.json` | 扩展清单，声明权限、注册 Service Worker、内容脚本、侧边栏、设置页 |
| `icons/icon16.png`, `icon48.png`, `icon128.png` | 扩展图标（简单纯色 SVG 转 PNG） |
| `src/service-worker.js` | 后台服务线程：API 转发、引擎选择、右键菜单、快捷键 |
| `src/content-script.js` | 内容脚本：划词检测、浮窗生命周期管理 |
| `src/popup.js` | 浮窗 UI 逻辑：渲染翻译结果、按钮交互 |
| `src/popup.css` | 浮窗样式 |
| `src/sidebar.html` | 侧边栏 HTML 入口 |
| `src/sidebar.js` | 侧边栏 UI 逻辑：对话列表、历史加载、手动输入 |
| `src/sidebar.css` | 侧边栏样式 |
| `src/options.html` | 设置页 HTML |
| `src/options.js` | 设置页逻辑：引擎切换、API Key 管理、偏好设置 |
| `src/options.css` | 设置页样式 |

---

### 任务 1：项目脚手架 + manifest + 图标

**文件：**
- 创建：`manifest.json`
- 创建：`icons/icon16.png`
- 创建：`icons/icon48.png`
- 创建：`icons/icon128.png`

- [ ] **步骤 1：创建 manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Translate Online",
  "version": "1.0.0",
  "description": "划词翻译工具，支持 DeepSeek API 和免费翻译引擎",
  "permissions": ["storage", "sidePanel", "contextMenus", "activeTab"],
  "background": {
    "service_worker": "src/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content-script.js"],
      "css": ["src/popup.css"]
    }
  ],
  "side_panel": {
    "default_path": "src/sidebar.html"
  },
  "options_page": "src/options.html",
  "commands": {
    "translate-selection": {
      "suggested_key": { "default": "Alt+T" },
      "description": "翻译选中文本"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **步骤 2：生成图标文件**

创建一个简单的蓝色圆形 T 字图标。使用一个脚本生成三个尺寸的 PNG：

```bash
# 需要安装 ImageMagick 或使用 base64 内联的 1x1 PNG
# 作为最小可行方案，创建一个 16x16 蓝色 PNG base64
# 实际开发中应替换为设计好的图标
mkdir -p icons
# 使用以下命令生成简单图标（需要安装 convert/ImageMagick）
# convert -size 16x16 xc:#4A90D9 -fill white -gravity center -pointsize 10 -annotate 0 "T" icons/icon16.png
# convert -size 48x48 xc:#4A90D9 -fill white -gravity center -pointsize 30 -annotate 0 "T" icons/icon48.png
# convert -size 128x128 xc:#4A90D9 -fill white -gravity center -pointsize 80 -annotate 0 "T" icons/icon128.png
```

作为替代，可以直接创建简单的 PNG 文件（base64 编码的最小蓝色方块，后续可替换）。

- [ ] **步骤 3：创建 src 目录结构**

```bash
mkdir -p src
```

- [ ] **步骤 4：验证 manifest 可用**

在 Edge 浏览器中加载解压缩的扩展，确认扩展图标出现，无错误。

---

### 任务 2：Service Worker — 免费翻译引擎（MyMemory）

**文件：**
- 创建：`src/service-worker.js`

- [ ] **步骤 1：创建 Service Worker 骨架**

```javascript
// src/service-worker.js
// Translate Online - 后台服务线程

// 存储 Key 常量
const STORAGE_KEYS = {
  DEEPSEEK_KEY: 'deepseek_api_key',
  ENGINE: 'translation_engine', // 'free' | 'deepseek'
  TARGET_LANG: 'target_language',
  MODEL: 'deepseek_model',
  HISTORY: 'translation_history'
};

// 安装时初始化
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      [STORAGE_KEYS.ENGINE]: 'free',
      [STORAGE_KEYS.TARGET_LANG]: 'zh-CN',
      [STORAGE_KEYS.MODEL]: 'deepseek-chat'
    });
    // 首次安装提示
    chrome.tabs.create({ url: 'src/options.html' });
  }
});
```

- [ ] **步骤 2：实现 MyMemory 免费翻译**

```javascript
const ENGINES = {
  async translateFree(text, targetLang) {
    const sourceLang = 'auto'; // 自动检测
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.responseStatus === 200) {
      return { success: true, text: data.responseData.translatedText };
    }
    // 429 限频处理
    if (response.status === 429 || data.responseStatus === 429) {
      return { success: false, error: 'rate_limited', message: '免费引擎请求频繁，请稍后重试或切换为 DeepSeek' };
    }
    return { success: false, error: 'api_error', message: data.responseDetails || '翻译失败' };
  }
};
```

- [ ] **步骤 3：实现 DeepSeek 翻译**

```javascript
const ENGINES = {
  // ... (保留上一步的 translateFree)

  async translateDeepSeek(text, targetLang, apiKey, model) {
    const url = 'https://api.deepseek.com/v1/chat/completions';
    const systemPrompt = `Translate the following text to ${targetLang}. Respond with only the translation, no explanations.`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'unauthorized', message: 'API Key 无效，请检查设置' };
      }
      if (response.status === 429) {
        return { success: false, error: 'rate_limited', message: 'DeepSeek API 请求过于频繁，请稍后重试' };
      }
      return { success: false, error: 'api_error', message: `DeepSeek API 错误 (${response.status})` };
    }

    const data = await response.json();
    const translatedText = data.choices[0].message.content.trim();
    return { success: true, text: translatedText };
  }
};
```

- [ ] **步骤 4：实现统一的 translate 函数（引擎选择逻辑）**

```javascript
async function translate(text, targetLang) {
  // 长文本截断
  const MAX_LENGTH = 2000;
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH);
  }

  const storage = await chrome.storage.sync.get([
    STORAGE_KEYS.ENGINE,
    STORAGE_KEYS.DEEPSEEK_KEY,
    STORAGE_KEYS.MODEL
  ]);

  const engine = storage[STORAGE_KEYS.ENGINE] || 'free';

  if (engine === 'deepseek') {
    const apiKey = storage[STORAGE_KEYS.DEEPSEEK_KEY];
    if (!apiKey) {
      return { success: false, error: 'no_key', message: '未配置 API Key，请在设置中配置或切换为免费引擎', needsConfig: true };
    }
    return await ENGINES.translateDeepSeek(text, targetLang, apiKey, storage[STORAGE_KEYS.MODEL]);
  }

  return await ENGINES.translateFree(text, targetLang);
}
```

- [ ] **步骤 5：实现消息处理器**

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'translate':
      (async () => {
        const storage = await chrome.storage.sync.get([STORAGE_KEYS.TARGET_LANG]);
        const result = await translate(request.text, storage[STORAGE_KEYS.TARGET_LANG] || 'zh-CN');
        sendResponse(result);
      })();
      return true; // 保持消息通道打开

    case 'open-sidebar':
      chrome.sidePanel.open({ tabId: sender.tab.id });
      return false;

    case 'get-history':
      (async () => {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
        sendResponse(storage[STORAGE_KEYS.HISTORY] || []);
      })();
      return true;

    case 'save-to-history':
      (async () => {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
        const history = storage[STORAGE_KEYS.HISTORY] || [];
        history.unshift({
          id: Date.now(),
          original: request.text,
          translation: request.translation,
          sourceLang: request.sourceLang || 'auto',
          targetLang: request.targetLang || 'zh-CN',
          timestamp: Date.now()
        });
        // 最多保留 100 条
        if (history.length > 100) history.length = 100;
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
        sendResponse({ success: true });
      })();
      return true;

    case 'clear-history':
      (async () => {
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
        sendResponse({ success: true });
      })();
      return true;
  }
});
```

- [ ] **步骤 6：实现右键菜单和快捷键**

```javascript
// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '翻译选中文本',
    contexts: ['selection']
  });
});

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'translate-selection',
      text: info.selectionText
    });
  }
});

// 快捷键命令
chrome.commands.onCommand.addListener((command) => {
  if (command === 'translate-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'translate-selection-command' });
    });
  }
});
```

- [ ] **步骤 7：Commit**

```bash
git add manifest.json src/service-worker.js icons/
git commit -m "feat: add service worker with free and DeepSeek translation engines"
```

---

### 任务 3：内容脚本 — 划词检测 + 浮窗管理

**文件：**
- 创建：`src/content-script.js`
- 创建：`src/popup.css`

- [ ] **步骤 1：创建划词检测逻辑**

```javascript
// src/content-script.js
let popupContainer = null;
let debounceTimer = null;

document.addEventListener('mouseup', (event) => {
  const selection = window.getSelection();
  const text = selection.toString().trim();

  if (!text) {
    closePopup();
    return;
  }

  // 检测是否为有效文本（非空、非纯空白）
  if (/^\s*$/.test(text)) return;

  // 0.3s 防误触
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    createPopup(text, rect);
  }, 300);
});

// 按 ESC 关闭
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePopup();
  }
});

// 点击页面其他地方关闭
document.addEventListener('mousedown', (event) => {
  if (popupContainer && !popupContainer.contains(event.target)) {
    // 检查点击是否发生在选中文本区域内
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
      closePopup();
    }
  }
});
```

- [ ] **步骤 2：实现浮窗定位逻辑**

```javascript
function positionPopup(rect) {
  const popup = popupContainer.querySelector('.to-popup-card');
  const popupWidth = 300;
  const popupHeight = popup.scrollHeight || 180;

  let top, left;

  // 默认在选区下方
  top = rect.bottom + window.scrollY + 6;
  left = rect.left + window.scrollX;

  // 水平边界检测
  if (left + popupWidth > window.innerWidth + window.scrollX - 10) {
    left = window.innerWidth + window.scrollX - popupWidth - 10;
  }
  if (left < window.scrollX + 10) {
    left = window.scrollX + 10;
  }

  // 下方空间不足时显示在上方
  if (rect.bottom + popupHeight + 10 > window.innerHeight) {
    top = rect.top + window.scrollY - popupHeight - 6;
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
```

- [ ] **步骤 3：实现浮窗创建和关闭**

```javascript
function createPopup(text, rect) {
  closePopup(); // 关闭已有的

  popupContainer = document.createElement('div');
  popupContainer.className = 'to-popup-container';
  popupContainer.innerHTML = `
    <div class="to-popup-card">
      <div class="to-popup-section">
        <div class="to-popup-label">原文</div>
        <div class="to-popup-original">${escapeHtml(text)}</div>
      </div>
      <div class="to-popup-divider"></div>
      <div class="to-popup-section">
        <div class="to-popup-label">译文</div>
        <div class="to-popup-translation" id="to-translation-text">
          <span class="to-popup-loading">翻译中...</span>
        </div>
      </div>
      <div class="to-popup-actions">
        <button class="to-popup-btn" id="to-btn-speak" title="朗读">🔊</button>
        <button class="to-popup-btn" id="to-btn-sidebar" title="打开侧边栏">☰</button>
      </div>
    </div>
  `;

  document.body.appendChild(popupContainer);
  positionPopup(rect);

  // 绑定按钮事件
  document.getElementById('to-btn-speak').addEventListener('click', () => {
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
  });

  document.getElementById('to-btn-sidebar').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-sidebar' });
  });

  // 发送翻译请求
  chrome.runtime.sendMessage({ type: 'translate', text }, (response) => {
    const translationEl = document.getElementById('to-translation-text');
    if (response.success) {
      translationEl.textContent = response.text;
      // 保存到历史
      chrome.runtime.sendMessage({ type: 'save-to-history', text, translation: response.text });
    } else {
      if (response.needsConfig) {
        translationEl.innerHTML = `<span class="to-popup-error">${escapeHtml(response.message)}</span> <a href="#" class="to-popup-link" id="to-goto-settings">去设置</a>`;
        document.getElementById('to-goto-settings').addEventListener('click', (e) => {
          e.preventDefault();
          chrome.runtime.sendMessage({ type: 'open-options' });
          closePopup();
        });
      } else {
        translationEl.innerHTML = `<span class="to-popup-error">${escapeHtml(response.message)}</span>`;
      }
    }
  });
}

function closePopup() {
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **步骤 4：处理来自 Service Worker 的消息（右键菜单/快捷键触发）**

```javascript
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'translate-selection' || request.type === 'translate-selection-command') {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      createPopup(text, rect);
    }
  }
  if (request.type === 'close-popup') {
    closePopup();
  }
});
```

- [ ] **步骤 5：创建 popup.css**

```css
/* src/popup.css */
.to-popup-container {
  position: absolute;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  pointer-events: none;
}

.to-popup-card {
  pointer-events: auto;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  min-width: 240px;
  max-width: 360px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
}

.to-popup-label {
  font-size: 11px;
  color: #999;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.to-popup-original {
  font-weight: 500;
  color: #333;
  word-break: break-word;
}

.to-popup-divider {
  height: 1px;
  background: #f0f0f0;
  margin: 8px 0;
}

.to-popup-translation {
  color: #333;
  word-break: break-word;
}

.to-popup-loading {
  color: #999;
  font-style: italic;
}

.to-popup-error {
  color: #d32f2f;
  font-size: 13px;
}

.to-popup-link {
  color: #4A90D9;
  text-decoration: underline;
  cursor: pointer;
}

.to-popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.to-popup-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
}

.to-popup-btn:hover {
  background: #f5f5f5;
}
```

- [ ] **步骤 6：Commit**

```bash
git add src/content-script.js src/popup.css
git commit -m "feat: add content script with selection detection and popup"
```

---

### 任务 4：浮窗 UI（popup.js）— 非内容脚本弹窗，已包含在内容脚本中

**注意：** 任务 3 中的 content-script.js 已包含所有浮窗 UI 逻辑和 popup.css。此扩展不使用 `action.popup`，而是通过内容脚本注入 DOM 浮窗。popup.js 在本次设计中作为内容脚本的一部分实现。

- [ ] **步骤 1：验证浮窗交互完整性**

手动测试流程：
1. 打开任意网页
2. 选中任意文本
3. 确认浮窗 0.3s 后出现
4. 确认浮窗展示翻译进度（"翻译中..." → 显示结果）
5. 确认 🔊 按钮朗读原文
6. 确认 ☰ 按钮打开侧边栏
7. 按 ESC 确认关闭
8. 点击页面其他处确认关闭

---

### 任务 5：侧边栏

**文件：**
- 创建：`src/sidebar.html`
- 创建：`src/sidebar.js`
- 创建：`src/sidebar.css`

- [ ] **步骤 1：创建 sidebar.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="sidebar.css">
</head>
<body>
  <div id="app">
    <div class="sb-header">
      <h1 class="sb-title">Translate</h1>
      <div class="sb-header-actions">
        <button id="sb-btn-settings" class="sb-icon-btn" title="设置">⚙</button>
        <button id="sb-btn-clear" class="sb-icon-btn" title="清除历史">🗑</button>
      </div>
    </div>
    <div id="sb-history" class="sb-history"></div>
    <div class="sb-input-area">
      <textarea id="sb-input" class="sb-input" placeholder="输入文本翻译..." rows="2"></textarea>
      <button id="sb-btn-translate" class="sb-btn-primary">翻译</button>
    </div>
  </div>
  <script src="sidebar.js"></script>
</body>
</html>
```

- [ ] **步骤 2：创建 sidebar.css**

```css
/* src/sidebar.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background: #fafafa;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.sb-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
}

.sb-title {
  font-size: 16px;
  font-weight: 600;
}

.sb-header-actions { display: flex; gap: 4px; }

.sb-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 16px;
}
.sb-icon-btn:hover { background: #f0f0f0; }

.sb-history {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.sb-entry {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}

.sb-entry-original {
  margin-bottom: 6px;
}

.sb-entry-lang-tag {
  display: inline-block;
  font-size: 10px;
  background: #4A90D9;
  color: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  margin-right: 6px;
  vertical-align: middle;
}

.sb-entry-text {
  vertical-align: middle;
  font-weight: 500;
}

.sb-entry-translation {
  padding-left: 28px;
  color: #555;
}

.sb-entry-time {
  font-size: 11px;
  color: #bbb;
  margin-top: 4px;
  text-align: right;
}

.sb-empty {
  text-align: center;
  color: #999;
  margin-top: 40px;
}

.sb-input-area {
  padding: 12px 16px;
  border-top: 1px solid #e0e0e0;
  background: #fff;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.sb-input {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
}
.sb-input:focus { outline: none; border-color: #4A90D9; }

.sb-btn-primary {
  padding: 8px 16px;
  background: #4A90D9;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}
.sb-btn-primary:hover { background: #357ABD; }
```

- [ ] **步骤 3：创建 sidebar.js**

```javascript
// src/sidebar.js
const HISTORY_KEY = 'translation_history';

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();

  // 设置按钮
  document.getElementById('sb-btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 清除历史
  document.getElementById('sb-btn-clear').addEventListener('click', () => {
    if (confirm('确定清除所有翻译历史？')) {
      chrome.runtime.sendMessage({ type: 'clear-history' }, () => {
        document.getElementById('sb-history').innerHTML =
          '<div class="sb-empty">暂无翻译记录</div>';
      });
    }
  });

  // 手动输入翻译
  const input = document.getElementById('sb-input');
  const btnTranslate = document.getElementById('sb-btn-translate');

  function manualTranslate() {
    const text = input.value.trim();
    if (!text) return;

    chrome.runtime.sendMessage({ type: 'translate', text }, (response) => {
      if (response.success) {
        chrome.runtime.sendMessage({
          type: 'save-to-history',
          text,
          translation: response.text
        }, () => {
          loadHistory();
          input.value = '';
        });
      } else {
        alert(response.message);
      }
    });
  }

  btnTranslate.addEventListener('click', manualTranslate);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      manualTranslate();
    }
  });
});

function loadHistory() {
  chrome.runtime.sendMessage({ type: 'get-history' }, (history) => {
    const container = document.getElementById('sb-history');
    if (!history || history.length === 0) {
      container.innerHTML = '<div class="sb-empty">暂无翻译记录</div>';
      return;
    }

    container.innerHTML = history.map(entry => `
      <div class="sb-entry">
        <div class="sb-entry-original">
          <span class="sb-entry-lang-tag">${entry.sourceLang || 'auto'}</span>
          <span class="sb-entry-text">${escapeHtml(entry.original)}</span>
        </div>
        <div class="sb-entry-translation">${escapeHtml(entry.translation)}</div>
        <div class="sb-entry-time">${formatTime(entry.timestamp)}</div>
      </div>
    `).join('');
  });
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
```

- [ ] **步骤 4：Commit**

```bash
git add src/sidebar.html src/sidebar.js src/sidebar.css
git commit -m "feat: add sidebar with translation history and manual input"
```

---

### 任务 6：设置页

**文件：**
- 创建：`src/options.html`
- 创建：`src/options.js`
- 创建：`src/options.css`

- [ ] **步骤 1：创建 options.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div class="container">
    <h1 class="page-title">Translate Online 设置</h1>

    <section class="section">
      <h2 class="section-title">翻译引擎</h2>
      <div class="form-group">
        <label class="radio-label">
          <input type="radio" name="engine" value="free">
          <span class="radio-text">免费引擎（无需配置，开箱即用）</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="engine" value="deepseek">
          <span class="radio-text">DeepSeek（需 API Key，翻译质量更高）</span>
        </label>
      </div>
    </section>

    <section class="section" id="deepseek-config">
      <h2 class="section-title">DeepSeek 配置</h2>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input type="password" id="api-key" class="form-input" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
      </div>
      <div class="form-group">
        <label class="form-label">模型</label>
        <select id="model" class="form-select">
          <option value="deepseek-chat">deepseek-chat</option>
          <option value="deepseek-reasoner">deepseek-reasoner</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">API 地址</label>
        <input type="text" id="api-url" class="form-input" value="https://api.deepseek.com" placeholder="https://api.deepseek.com">
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">翻译偏好</h2>
      <div class="form-group">
        <label class="form-label">目标语言</label>
        <select id="target-lang" class="form-select">
          <option value="zh-CN">中文（简体）</option>
          <option value="zh-TW">中文（繁体）</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">触发方式</label>
        <label class="checkbox-label">
          <input type="checkbox" id="trigger-select" checked>
          <span>划词自动翻译</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="trigger-shortcut" checked disabled>
          <span>快捷键 Alt+T（始终可用）</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="trigger-contextmenu" checked>
          <span>右键菜单</span>
        </label>
      </div>
    </section>

    <div class="actions">
      <button id="btn-save" class="btn btn-primary">保存设置</button>
      <button id="btn-test" class="btn btn-secondary">测试连接</button>
    </div>

    <div id="status-message" class="status-message"></div>
  </div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **步骤 2：创建 options.css**

```css
/* src/options.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background: #f5f5f5;
  padding: 40px 20px;
}

.container {
  max-width: 560px;
  margin: 0 auto;
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
}

.page-title {
  font-size: 22px;
  margin-bottom: 24px;
}

.section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #eee;
}
.section:last-of-type { border-bottom: none; }

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #555;
}

.form-group { margin-bottom: 14px; }

.form-label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 4px;
}

.form-input, .form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}
.form-input:focus, .form-select:focus {
  outline: none;
  border-color: #4A90D9;
}

.radio-label, .checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  cursor: pointer;
}

.radio-text { font-size: 14px; }

.actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn {
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #4A90D9;
  color: #fff;
}
.btn-primary:hover { background: #357ABD; }

.btn-secondary {
  background: #f0f0f0;
  color: #333;
}
.btn-secondary:hover { background: #e0e0e0; }

.status-message {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  display: none;
}
.status-message.success { display: block; background: #e8f5e9; color: #2e7d32; }
.status-message.error { display: block; background: #ffebee; color: #c62828; }
.status-message.info { display: block; background: #e3f2fd; color: #1565c0; }
```

- [ ] **步骤 3：创建 options.js**

```javascript
// src/options.js
const STORAGE_KEYS = {
  DEEPSEEK_KEY: 'deepseek_api_key',
  ENGINE: 'translation_engine',
  TARGET_LANG: 'target_language',
  MODEL: 'deepseek_model',
  API_URL: 'deepseek_api_url',
  AUTO_TRANSLATE: 'trigger_auto_translate',
  CONTEXT_MENU: 'trigger_context_menu'
};

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // 引擎切换显示/隐藏 DeepSeek 配置
  document.querySelectorAll('input[name="engine"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('deepseek-config').style.display =
        radio.value === 'deepseek' ? 'block' : 'none';
    });
  });

  // 保存设置
  document.getElementById('btn-save').addEventListener('click', saveSettings);

  // 测试连接
  document.getElementById('btn-test').addEventListener('click', testConnection);
});

function loadSettings() {
  chrome.storage.sync.get([
    STORAGE_KEYS.ENGINE,
    STORAGE_KEYS.DEEPSEEK_KEY,
    STORAGE_KEYS.MODEL,
    STORAGE_KEYS.API_URL,
    STORAGE_KEYS.TARGET_LANG,
    STORAGE_KEYS.AUTO_TRANSLATE,
    STORAGE_KEYS.CONTEXT_MENU
  ], (items) => {
    // 翻译引擎
    const engine = items[STORAGE_KEYS.ENGINE] || 'free';
    document.querySelector(`input[name="engine"][value="${engine}"]`).checked = true;
    document.getElementById('deepseek-config').style.display =
      engine === 'deepseek' ? 'block' : 'none';

    // DeepSeek 配置
    if (items[STORAGE_KEYS.DEEPSEEK_KEY]) {
      document.getElementById('api-key').value = items[STORAGE_KEYS.DEEPSEEK_KEY];
    }
    document.getElementById('model').value = items[STORAGE_KEYS.MODEL] || 'deepseek-chat';
    document.getElementById('api-url').value = items[STORAGE_KEYS.API_URL] || 'https://api.deepseek.com';

    // 目标语言
    document.getElementById('target-lang').value = items[STORAGE_KEYS.TARGET_LANG] || 'zh-CN';

    // 触发方式
    document.getElementById('trigger-select').checked =
      items[STORAGE_KEYS.AUTO_TRANSLATE] !== false;
    document.getElementById('trigger-contextmenu').checked =
      items[STORAGE_KEYS.CONTEXT_MENU] !== false;
  });
}

function saveSettings() {
  const engine = document.querySelector('input[name="engine"]:checked').value;
  const data = {
    [STORAGE_KEYS.ENGINE]: engine,
    [STORAGE_KEYS.DEEPSEEK_KEY]: document.getElementById('api-key').value.trim(),
    [STORAGE_KEYS.MODEL]: document.getElementById('model').value,
    [STORAGE_KEYS.API_URL]: document.getElementById('api-url').value.trim(),
    [STORAGE_KEYS.TARGET_LANG]: document.getElementById('target-lang').value,
    [STORAGE_KEYS.AUTO_TRANSLATE]: document.getElementById('trigger-select').checked,
    [STORAGE_KEYS.CONTEXT_MENU]: document.getElementById('trigger-contextmenu').checked
  };

  chrome.storage.sync.set(data, () => {
    showStatus('设置已保存', 'success');
  });
}

async function testConnection() {
  const engine = document.querySelector('input[name="engine"]:checked').value;

  if (engine === 'free') {
    // 测试免费引擎
    try {
      const response = await fetch('https://api.mymemory.translated.net/get?q=hello&langpair=auto|zh-CN');
      if (response.ok) {
        showStatus('免费引擎连接正常', 'success');
      } else {
        showStatus('免费引擎暂时不可用', 'error');
      }
    } catch {
      showStatus('无法连接到免费翻译服务', 'error');
    }
    return;
  }

  // 测试 DeepSeek
  const apiKey = document.getElementById('api-key').value.trim();
  if (!apiKey) {
    showStatus('请先输入 API Key', 'error');
    return;
  }

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: document.getElementById('model').value,
        messages: [{ role: 'user', content: 'translate hello to Chinese' }],
        max_tokens: 50
      })
    });

    if (response.ok) {
      showStatus('DeepSeek 连接成功', 'success');
    } else if (response.status === 401) {
      showStatus('API Key 无效，请检查', 'error');
    } else {
      showStatus(`DeepSeek API 返回错误 (${response.status})`, 'error');
    }
  } catch {
    showStatus('无法连接到 DeepSeek API', 'error');
  }
}

function showStatus(message, type) {
  const el = document.getElementById('status-message');
  el.textContent = message;
  el.className = `status-message ${type}`;
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
```

- [ ] **步骤 4：验证引擎切换逻辑一致性**

确保 content-script.js 中的 `chrome.runtime.sendMessage({ type: 'open-options' })` 有对应的 handler 在 service-worker.js 中：

在 `src/service-worker.js` 的消息处理器中添加：
```javascript
case 'open-options':
  chrome.runtime.openOptionsPage();
  return false;
```

- [ ] **步骤 5：Commit**

```bash
git add src/options.html src/options.js src/options.css
git commit -m "feat: add options page with engine selection and API key management"
```

---

### 任务 7：Service Worker 补充（open-options handler + 缺失的消息类型）

**文件：**
- 修改：`src/service-worker.js`

- [ ] **步骤 1：确认所有消息类型都已处理**

检查 content-script.js 和 sidebar.js 中发出的所有 `chrome.runtime.sendMessage` 类型，确保 service-worker.js 中都有对应的 case。

已覆盖的：`translate`, `open-sidebar`, `get-history`, `save-to-history`, `clear-history`
需要补充的：`open-options`

```javascript
case 'open-options':
  chrome.runtime.openOptionsPage();
  return false;
```

- [ ] **步骤 2：Commit**

```bash
git add src/service-worker.js
git commit -m "fix: add open-options message handler"
```

---

### 任务 8：翻译引擎自动切换逻辑

**文件：**
- 修改：`src/service-worker.js`

当前 translate() 函数的引擎选择逻辑：根据用户设置选择。需要增加一个智能检测：即使用户在设置页选择了 DeepSeek，但未配置 Key，也应自动 fallback 到免费引擎并提示。

- [ ] **步骤 1：优化引擎选择和配置变更监听**

```javascript
// 在 translate() 中添加 auto-fallback
async function translate(text, targetLang) {
  const MAX_LENGTH = 2000;
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH);
  }

  const storage = await chrome.storage.sync.get([
    STORAGE_KEYS.ENGINE,
    STORAGE_KEYS.DEEPSEEK_KEY,
    STORAGE_KEYS.MODEL
  ]);

  const engine = storage[STORAGE_KEYS.ENGINE] || 'free';

  if (engine === 'deepseek') {
    const apiKey = storage[STORAGE_KEYS.DEEPSEEK_KEY];
    if (!apiKey) {
      // 自动回退到免费引擎
      const result = await ENGINES.translateFree(text, targetLang);
      if (result.success) {
        result._note = '使用免费引擎（未配置 DeepSeek Key）';
      }
      return result;
    }
    return await ENGINES.translateDeepSeek(text, targetLang, apiKey, storage[STORAGE_KEYS.MODEL]);
  }

  return await ENGINES.translateFree(text, targetLang);
}

// 监听配置变更，刷新上下文菜单
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.CONTEXT_MENU]) {
    if (changes[STORAGE_KEYS.CONTEXT_MENU].newValue) {
      chrome.contextMenus.create({
        id: 'translate-selection',
        title: '翻译选中文本',
        contexts: ['selection']
      });
    } else {
      chrome.contextMenus.remove('translate-selection');
    }
  }
});
```

- [ ] **步骤 2：Commit**

```bash
git add src/service-worker.js
git commit -m "feat: auto-fallback to free engine when DeepSeek key missing"
```

---

### 任务 9：端到端验证

**文件：**
- 修改：所有文件

- [ ] **步骤 1：在 Edge 中加载扩展并验证完整流程**

1. 打开 edge://extensions 开启"开发人员模式"
2. 加载已解压的扩展，选择项目根目录
3. 验证扩展图标出现
4. 打开任意网页，选中文本 → 确认浮窗出现并显示翻译
5. 点击 🔊 → 确认朗读
6. 点击 ☰ → 确认侧边栏打开
7. 在侧边栏确认看到翻译历史
8. 右键选中文本 → 点击"翻译选中文本" → 确认浮窗出现
9. 按 Alt+T → 确认翻译浮窗出现
10. 打开设置页 → 切换引擎 → 验证功能正常

- [ ] **步骤 2：验证错误处理**

1. 在设置中选择 DeepSeek 但不填 Key → 划词 → 确认显示提示并回退到免费引擎
2. 断网 → 划词 → 确认显示翻译失败提示
3. 选中超长文本 → 确认只翻译前 2000 字符
4. 按 ESC → 确认浮窗关闭

- [ ] **步骤 3：Commit 最终版本**

```bash
git add .
git commit -m "chore: finalize v1.0.0"
```
