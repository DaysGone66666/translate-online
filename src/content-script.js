let popupContainer = null;
let debounceTimer = null;

// ====== Helper ======

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ====== Popup lifecycle ======

function closePopup() {
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

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
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

// ====== Event listeners ======

// 划词检测 —— mouseup
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
  if (request.type === 'close-popup') {
    closePopup();
  }
});
