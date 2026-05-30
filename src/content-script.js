let popupContainer = null;
let debounceTimer = null;
let autoTranslateEnabled = true;

// ====== 加载设置 ======
chrome.storage.sync.get(['trigger_auto_translate'], (items) => {
  autoTranslateEnabled = items.trigger_auto_translate !== false;
});
// 监听设置变更
chrome.storage.onChanged.addListener((changes) => {
  if (changes.trigger_auto_translate) {
    autoTranslateEnabled = changes.trigger_auto_translate.newValue !== false;
  }
});

// ====== Helper ======

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ====== Popup lifecycle ======

function closePopup() {
  clearTimeout(debounceTimer);
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
  }
}

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

  popupContainer.style.left = `${left}px`;
  popupContainer.style.top = `${top}px`;
}

function createPopup(text, rect) {
  closePopup(); // 关闭已有的

  popupContainer = document.createElement('div');
  popupContainer.className = 'to-popup-container';
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

  document.body.appendChild(popupContainer);
  positionPopup(rect);

  // 绑定按钮事件
  popupContainer.querySelector('#to-btn-speak').addEventListener('click', () => {
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
  });

  popupContainer.querySelector('#to-btn-sidebar').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-sidebar' });
  });

  // 发送翻译请求
  chrome.runtime.sendMessage({ type: 'translate', text }, (response) => {
    if (chrome.runtime.lastError) {
      return;
    }
    const translationEl = popupContainer.querySelector('#to-translation-text');
    if (!translationEl) return;
    if (response && response.success) {
      translationEl.textContent = response.text;
      if (response._note) {
        const note = document.createElement('div');
        note.className = 'to-popup-note';
        note.textContent = response._note;
        translationEl.appendChild(note);
      }
      // 保存到历史
      chrome.runtime.sendMessage({ type: 'save-to-history', text, translation: response.text });
    } else if (response) {
      if (response.needsConfig) {
        translationEl.innerHTML = `<span class="to-popup-error">${escapeHtml(response.message)}</span> <a href="#" class="to-popup-link" id="to-goto-settings">去设置</a>`;
        popupContainer.querySelector('#to-goto-settings').addEventListener('click', (e) => {
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

// ====== Event listeners ======

// 划词检测 —— mouseup
document.addEventListener('mouseup', (event) => {
  if (!autoTranslateEnabled) return;

  // 点击浮窗内按钮时不关闭浮窗（按钮点击会清除文本选区）
  if (popupContainer && popupContainer.contains(event.target)) {
    return;
  }

  const selection = window.getSelection();
  const text = selection.toString().trim();

  if (!text) {
    closePopup();
    return;
  }

  // 检测是否为有效文本（非空、非纯空白）

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
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
      closePopup();
    }
  }
});

// ====== Message listener (Service Worker 通信) ======

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
});

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

/* 译文段落（后续任务使用，现在先定义） */
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

// --- 小球状态 ---
const BALL_STATES = { IDLE: 'idle', LOADING: 'loading', DONE: 'done' };
let ballState = BALL_STATES.IDLE;
let ballEl = null;

// 占位函数，任务 5 中实现完整点击逻辑
function onBallClick() {}

function createBall() {
  if (ballEl) return;
  ballEl = document.createElement('div');
  ballEl.className = 'to-ball to-ball--idle';
  ballEl.textContent = '译';
  ballEl.setAttribute('role', 'button');
  ballEl.setAttribute('tabindex', '0');
  ballEl.setAttribute('aria-label', '翻译页面');
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
if (document.readyState !== 'loading') {
  createBall();
} else {
  window.addEventListener('DOMContentLoaded', createBall);
}

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
