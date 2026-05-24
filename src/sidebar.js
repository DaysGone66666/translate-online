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
        if (chrome.runtime.lastError) return;
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
      if (chrome.runtime.lastError) return;
      if (response && response.success) {
        chrome.runtime.sendMessage({
          type: 'save-to-history',
          text,
          translation: response.text
        }, () => {
          if (chrome.runtime.lastError) return;
          loadHistory();
          input.value = '';
        });
      } else if (response) {
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
    if (chrome.runtime.lastError) return;
    const container = document.getElementById('sb-history');
    if (!history || history.length === 0) {
      container.innerHTML = '<div class="sb-empty">暂无翻译记录</div>';
      return;
    }

    container.innerHTML = history.map(entry => `
      <div class="sb-entry">
        <div class="sb-entry-original">
          <span class="sb-entry-lang-tag">${escapeHtml(entry.sourceLang || 'auto')}</span>
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
