# 页面一键翻译 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在划词翻译插件中新增页面一键翻译功能——右侧吸附小球触发、双语对照展示、智能过滤、视口优先串行队列。

**架构：** 全部代码追加到现有 `content-script.js`。小球和译文样式通过动态注入 `<style>` 标签实现，不走 manifest。翻译调用复用已有 `chrome.runtime.sendMessage({type:"translate", text})` 通道。service-worker 和 manifest 均无改动。

**技术栈：** Chrome Extension MV3 / Vanilla JS / DOM API (TreeWalker, IntersectionObserver, MutationObserver)

---

## 文件结构

| 文件 | 职责 | 变化 |
|------|------|------|
| `src/content-script.js` | 划词翻译浮窗 + 页面一键翻译（小球、文本收集、翻译队列、DOM 注入、切换） | 追加 ~250 行 |
| `src/service-worker.js` | 翻译 API 中继 | **不改** |
| `manifest.json` | 扩展清单 | **不改** |

---

### 任务 1：创建浮动小球 UI 和样式注入

**文件：**
- 修改：`src/content-script.js` — 在末尾追加代码

- [ ] **步骤 1：注入小球 CSS 样式**

在 `content-script.js` 末尾追加以下代码块。这段代码在脚本加载时立即执行：注入样式到 `<head>`，创建小球 DOM 元素，并设置初始状态。

```js
// ==================== 页面一键翻译 ====================

// --- CSS 注入 ---
(function injectPageTranslateStyles() {
  const style = document.createElement('style');
  style.textContent = `
/* 浮动小球 */
.to-ball {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 60px;
  border-radius: 18px 0 0 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2147483646;
  transition: background 0.3s, opacity 0.2s;
  user-select: none;
  writing-mode: vertical-lr;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 2px 10px rgba(102,126,234,0.35);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.to-ball--idle { background: linear-gradient(180deg, #667eea, #764ba2); }
.to-ball--loading { background: linear-gradient(180deg, #f39c12, #e67e22); }
.to-ball--done { background: linear-gradient(180deg, #27ae60, #2ecc71); }

/* 译文段落 */
.to-tr {
  background: rgba(102,126,234,0.07);
  padding: 6px 10px;
  border-radius: 4px;
  margin: 4px 0 4px 0;
  font-size: inherit;
  line-height: inherit;
  color: #4a4a4a;
  border-left: 3px solid #667eea;
}
.to-tr-hidden { display: none; }
`;
  document.head.appendChild(style);
})();
```

- [ ] **步骤 2：创建小球 DOM 元素并初始化状态**

紧接上一步代码后面追加：

```js
// --- 小球状态 ---
const BALL_STATES = { IDLE: 'idle', LOADING: 'loading', DONE: 'done' };
let ballState = BALL_STATES.IDLE;
let ballEl = null;

function createBall() {
  if (ballEl) return;
  ballEl = document.createElement('div');
  ballEl.className = 'to-ball to-ball--idle';
  ballEl.textContent = '译';
  ballEl.addEventListener('click', onBallClick);
  document.body.appendChild(ballEl);
}

function setBallState(state) {
  ballState = state;
  if (!ballEl) return;
  ballEl.className = 'to-ball';
  switch (state) {
    case BALL_STATES.IDLE:
      ballEl.classList.add('to-ball--idle');
      ballEl.textContent = '译';
      break;
    case BALL_STATES.LOADING:
      ballEl.classList.add('to-ball--loading');
      ballEl.textContent = '⟳';
      break;
    case BALL_STATES.DONE:
      ballEl.classList.add('to-ball--done');
      ballEl.textContent = '原文';
      break;
  }
}

// 页面加载后创建小球
if (document.readyState === 'complete') {
  createBall();
} else {
  window.addEventListener('DOMContentLoaded', createBall);
}
```

- [ ] **步骤 3：验证小球显示**

手动加载扩展到 Chrome/Edge，打开任意网页。确认：
- 页面右侧中间出现紫色半圆标签，竖向显示"译"字
- 滚动页面时小球不位移
- 小球不遮挡页面原有内容

---

### 任务 2：文本节点收集 + 智能过滤

**文件：**
- 修改：`src/content-script.js` — 在小球代码后面追加

- [ ] **步骤 1：实现 `collectTextNodes()` 函数**

```js
// --- 文本节点收集 ---
const TRANSLATED_ATTR = 'data-to-translated';
const ORIGINAL_ATTR = 'data-to-original';

function collectTextNodes() {
  const nodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (textNode) => {
        // 跳过已翻译节点
        const parent = textNode.parentElement;
        if (!parent || parent.hasAttribute(TRANSLATED_ATTR)) {
          return NodeFilter.FILTER_REJECT;
        }

        // 跳过不可见元素
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }

        // 跳过 script/style/noscript
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }

        // 跳过代码块
        if (tag === 'CODE' || tag === 'PRE' || tag === 'KBD') {
          return NodeFilter.FILTER_REJECT;
        }

        // 跳过 translate="no" 祖先
        let el = parent;
        while (el) {
          if (el.getAttribute && el.getAttribute('translate') === 'no') {
            return NodeFilter.FILTER_REJECT;
          }
          el = el.parentElement;
        }

        // 跳过太短的文本（≤3字符）
        const text = textNode.textContent.trim();
        if (text.length <= 3) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  return nodes;
}
```

- [ ] **步骤 2：验证收集过滤效果**

在浏览器控制台执行：
```js
// 临时暴露到 window 测试
const nodes = collectTextNodes();
console.log('收集到', nodes.length, '个文本节点');
nodes.slice(0, 5).forEach(n => console.log(n.textContent.trim().slice(0, 50)));
```
确认：
- 不包含 `<script>` 内容
- 不包含只有 1-3 个字的短文本（如按钮 "OK"、"提交"）
- 不包含代码块内容
- 每个节点都是可见文本

---

### 任务 3：串行翻译队列 + 视口优先

**文件：**
- 修改：`src/content-script.js` — 在任务 2 代码后面追加

- [ ] **步骤 1：实现队列管理函数**

```js
// --- 翻译队列 ---
let translateQueue = [];
let isTranslating = false;
let observers = [];
let toggleShowTranslations = true; // 当前是否显示译文

function pushToQueue(textNode) {
  // 去重
  if (translateQueue.some(item => item.textNode === textNode)) return;
  translateQueue.push({ textNode, text: textNode.textContent.trim() });
}

function sortQueueByViewport() {
  translateQueue.sort((a, b) => {
    const aInView = isInViewport(a.textNode.parentElement);
    const bInView = isInViewport(b.textNode.parentElement);
    if (aInView && !bInView) return -1;
    if (!aInView && bInView) return 1;
    return 0;
  });
}

function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

async function processQueue() {
  if (isTranslating) return;
  if (translateQueue.length === 0) {
    // 队列空了 = 全部翻译完成
    setBallState(BALL_STATES.DONE);
    return;
  }

  isTranslating = true;
  sortQueueByViewport();

  const { textNode, text } = translateQueue.shift();
  const parent = textNode.parentElement;

  // 再次检查该节点是否已被翻译（避免竞态）
  if (parent && parent.hasAttribute(TRANSLATED_ATTR)) {
    isTranslating = false;
    processQueue();
    return;
  }

  try {
    const response = await translateText(text);
    if (response && response.success) {
      injectTranslation(textNode, response.text);
      if (parent) {
        parent.setAttribute(TRANSLATED_ATTR, '');
      }
    } else if (response && response.error === 'rate_limited') {
      // 429：放回队列头部，暂停 5 秒
      translateQueue.unshift({ textNode, text });
      isTranslating = false;
      await sleep(5000);
      processQueue();
      return;
    } else if (response && response.error === 'unauthorized') {
      // 401：停止所有翻译
      alert('Translate Online: API Key 无效，请检查设置');
      resetPageTranslation();
      return;
    }
    // 其他错误：跳过此节点，继续
  } catch (err) {
    // 网络错误：跳过，继续下一个
  }

  isTranslating = false;
  processQueue();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function translateText(text) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'translate', text }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: 'runtime_error', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}
```

- [ ] **步骤 2：实现 `injectTranslation()` 函数**

```js
// --- 双语 DOM 注入 ---
let idCounter = 0;

function injectTranslation(textNode, translation) {
  const parent = textNode.parentElement;
  if (!parent) return;

  const id = 't' + (++idCounter);

  // 给原文段落打标记
  parent.setAttribute(ORIGINAL_ATTR, id);

  // 创建译文段落
  const trEl = document.createElement('p');
  trEl.className = 'to-tr';
  trEl.setAttribute('data-to-src', id);
  trEl.textContent = translation;

  // 插入到原文段落后面
  parent.insertAdjacentElement('afterend', trEl);
}
```

- [ ] **步骤 3：验证队列逻辑**

在控制台临时模拟（加载插件后手动触发）：
```js
// 手动收集 3 个节点入队，观察 processQueue 串行调用
translateQueue = collectTextNodes().slice(0, 3).map(n => ({ textNode: n, text: n.textContent.trim() }));
processQueue();
// 观察 Network 面板：一次只有一个翻译请求 pending
// 观察小球：变为橙色旋转
// 观察 DOM：译文逐段追加到页面
```

---

### 任务 4：IntersectionObserver 视口优先

**文件：**
- 修改：`src/content-script.js` — 在任务 3 代码后面追加

- [ ] **步骤 1：实现 Observer 设置**

```js
// --- 视口观察 ---
function setupViewportObservers(textNodes) {
  // 清理旧 observer
  observers.forEach(obs => obs.disconnect());
  observers = [];

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const textNode = entry.target._toTextNode;
        if (textNode && !textNode.parentElement.hasAttribute(TRANSLATED_ATTR)) {
          pushToQueue(textNode);
          sortQueueByViewport();
          processQueue();
        }
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '100px' });

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (parent && !parent.hasAttribute(TRANSLATED_ATTR)) {
      // 判断是否已在视口内
      if (isInViewport(parent)) {
        pushToQueue(textNode);
      } else {
        // 未在视口内 → 用 observer 守候
        parent._toTextNode = textNode;
        observer.observe(parent);
      }
    }
  }
  observers.push(observer);

  // 即使全都在视口外，也触发队列处理（视口内的在上面）
  sortQueueByViewport();
  processQueue();
}
```

---

### 任务 5：小球点击逻辑 + 切换显示/隐藏

**文件：**
- 修改：`src/content-script.js` — 在任务 4 代码后面追加

- [ ] **步骤 1：实现 `onBallClick` 和切换函数**

```js
// --- 小球点击处理 ---
let lastBallClick = 0;

function onBallClick() {
  // 500ms 防抖
  const now = Date.now();
  if (now - lastBallClick < 500) return;
  lastBallClick = now;

  switch (ballState) {
    case BALL_STATES.IDLE:
      startPageTranslation();
      break;
    case BALL_STATES.DONE:
      toggleAllTranslations();
      break;
    case BALL_STATES.LOADING:
      // 翻译中，点击无操作
      break;
  }
}

function startPageTranslation() {
  const textNodes = collectTextNodes();
  if (textNodes.length === 0) return;

  setBallState(BALL_STATES.LOADING);
  toggleShowTranslations = true;
  translateQueue = [];
  isTranslating = false;
  idCounter = 0;
  observers.forEach(obs => obs.disconnect());
  observers = [];

  setupViewportObservers(textNodes);
}

function toggleAllTranslations() {
  toggleShowTranslations = !toggleShowTranslations;
  const trNodes = document.querySelectorAll('.to-tr');
  trNodes.forEach(el => {
    if (toggleShowTranslations) {
      el.classList.remove('to-tr-hidden');
    } else {
      el.classList.add('to-tr-hidden');
    }
  });
}
```

- [ ] **步骤 2：验证完整流程**

手动测试：
1. 打开任意英文网页
2. 点击右侧小球 → 小球变橙色旋转
3. 视口内文本下方逐段出现紫色左边框的译文
4. 小球变绿色，显示"原文"
5. 滚动页面 → 新出现的文本陆续被翻译
6. 点击小球 → 所有 `.to-tr` 元素隐藏
7. 再次点击小球 → 译文恢复显示，没有重复的 API 请求

---

### 任务 6：SPA 路由变化检测 + 重置

**文件：**
- 修改：`src/content-script.js` — 在任务 5 代码后面追加

- [ ] **步骤 1：实现 `resetPageTranslation` 和 SPA 监听**

```js
// --- SPA 路由检测 ---
let lastUrl = location.href;

function setupSpaObserver() {
  // 监听 URL 变化（pushState / replaceState）
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function () {
    origPushState.apply(this, arguments);
    checkUrlChange();
  };
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    checkUrlChange();
  };

  window.addEventListener('popstate', checkUrlChange);
  window.addEventListener('hashchange', checkUrlChange);
}

function checkUrlChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    resetPageTranslation();
  }
}

function resetPageTranslation() {
  // 移除所有译文 DOM
  document.querySelectorAll('.to-tr').forEach(el => el.remove());
  // 清除原文标记
  document.querySelectorAll(`[${ORIGINAL_ATTR}]`).forEach(el => {
    el.removeAttribute(ORIGINAL_ATTR);
  });
  document.querySelectorAll(`[${TRANSLATED_ATTR}]`).forEach(el => {
    el.removeAttribute(TRANSLATED_ATTR);
  });
  // 重置队列
  translateQueue = [];
  isTranslating = false;
  idCounter = 0;
  observers.forEach(obs => obs.disconnect());
  observers = [];
  // 重置小球
  setBallState(BALL_STATES.IDLE);
  toggleShowTranslations = true;
}

// 启动 SPA 监听
setupSpaObserver();
```

- [ ] **步骤 2：验证 SPA 切换**

手动测试（例如 GitHub/React 站点）：
1. 翻译当前页面
2. 点击站内导航链接，切换页面
3. 确认：译文被清除，小球恢复紫色"译"状态
4. 再次点击小球 → 正常翻译新页面内容

---

### 任务 7：端到端验证

**文件：** 无新代码，仅验证

- [ ] **步骤 1：完整功能验证清单**

在至少 3 种不同类型的网页上测试：

| 测试场景 | 预期行为 |
|----------|----------|
| 英文文章页（如 Wikipedia） | 正文逐段翻译，导航栏不翻译 |
| 含代码块的页面（如 GitHub README） | 代码块跳过，正文翻译 |
| SPA 站点（如 React 文档） | 路由切换后自动重置 |
| 点击小球翻译 → 隐藏 → 显示 | 无重复 API 请求 |
| 免费引擎 429 限频 | 小球保持橙色，5s 后自动继续 |
| DeepSeek 401 | 弹窗提示，小球恢复紫色 |
| 空页面 / 纯图片页面 | 小球点击无反应 |

- [ ] **步骤 2：回归检查**

确认原有划词翻译功能不受影响：
- 选中文本 → 浮窗弹出，翻译正常
- 快捷键 Ctrl+Shift+E → 浮窗弹出
- 右键菜单"翻译选中文本" → 浮窗弹出
- 侧边栏 → 历史记录正常

- [ ] **步骤 3：提交**

```bash
git add src/content-script.js
git commit -m "feat: add one-click page translation with floating ball and bilingual display"
```
