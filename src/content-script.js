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
