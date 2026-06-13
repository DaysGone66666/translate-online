const { formatLanguagePair } = TranslateOnlineShared;

let clearConfirmationTimer = null;
let requestSequence = 0;

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();

  document.getElementById('sb-btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('sb-btn-clear').addEventListener('click', handleClearHistory);
  document.getElementById('sb-btn-translate').addEventListener('click', manualTranslate);
  document.getElementById('sb-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      manualTranslate();
    }
  });
  document.getElementById('sb-history').addEventListener('click', handleHistoryAction);
});

function showSidebarStatus(message, type = 'info') {
  const status = document.getElementById('sb-status');
  status.textContent = message;
  status.className = `sb-status ${type}`;
}

function clearSidebarStatus() {
  const status = document.getElementById('sb-status');
  status.textContent = '';
  status.className = 'sb-status';
}

function handleClearHistory() {
  const button = document.getElementById('sb-btn-clear');
  if (!button.dataset.armed) {
    button.dataset.armed = 'true';
    button.textContent = '确认清空';
    showSidebarStatus('再次点击“确认清空”将删除全部翻译历史', 'warning');
    clearTimeout(clearConfirmationTimer);
    clearConfirmationTimer = setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = '清空';
      clearSidebarStatus();
    }, 5000);
    return;
  }

  chrome.runtime.sendMessage({ type: 'clear-history' }, response => {
    if (chrome.runtime.lastError || !response?.success) {
      showSidebarStatus('清除历史失败', 'error');
      return;
    }
    delete button.dataset.armed;
    button.textContent = '清空';
    clearTimeout(clearConfirmationTimer);
    showSidebarStatus('翻译历史已清空', 'success');
    renderHistory([]);
  });
}

function manualTranslate() {
  const input = document.getElementById('sb-input');
  const button = document.getElementById('sb-btn-translate');
  const text = input.value.trim();
  if (!text || button.disabled) return;

  requestSequence += 1;
  const requestId = `sidebar-${Date.now()}-${requestSequence}`;
  button.disabled = true;
  button.textContent = '翻译中...';
  clearSidebarStatus();

  chrome.runtime.sendMessage({ type: 'translate', text, requestId }, response => {
    button.disabled = false;
    button.textContent = '翻译';

    if (chrome.runtime.lastError) {
      showSidebarStatus('扩展连接已失效，请重新打开侧边栏', 'error');
      return;
    }
    if (!response?.success) {
      showSidebarStatus(response?.message || '翻译失败', 'error');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'save-to-history',
      text,
      translation: response.text,
      sourceLang: response.sourceLang,
      targetLang: response.targetLang
    }, saveResponse => {
      if (chrome.runtime.lastError || !saveResponse?.success) {
        showSidebarStatus('译文已生成，但保存历史失败', 'warning');
        return;
      }
      input.value = '';
      showSidebarStatus('翻译完成', 'success');
      loadHistory();
    });
  });
}

function loadHistory() {
  const container = document.getElementById('sb-history');
  container.innerHTML = '<div class="sb-empty">正在读取翻译历史...</div>';

  chrome.runtime.sendMessage({ type: 'get-history' }, history => {
    if (chrome.runtime.lastError) {
      container.innerHTML = '<div class="sb-empty">无法读取翻译历史</div>';
      return;
    }
    renderHistory(Array.isArray(history) ? history : []);
  });
}

function renderHistory(history) {
  const container = document.getElementById('sb-history');
  if (!history.length) {
    container.innerHTML = '<div class="sb-empty">暂无翻译记录</div>';
    return;
  }

  container.innerHTML = history.map(entry => `
    <article class="sb-entry" data-entry-id="${escapeHtml(entry.id)}">
      <div class="sb-entry-original">
        <span class="sb-entry-lang-tag">${escapeHtml(formatLanguagePair(entry.sourceLang || 'auto', entry.targetLang || 'zh-CN'))}</span>
        <span class="sb-entry-text">${escapeHtml(entry.original)}</span>
      </div>
      <div class="sb-entry-translation">${escapeHtml(entry.translation)}</div>
      <div class="sb-entry-footer">
        <time class="sb-entry-time">${formatTime(entry.timestamp)}</time>
        <div class="sb-entry-actions">
          <button type="button" data-action="copy">复制译文</button>
          <button type="button" data-action="delete">删除</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function handleHistoryAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const entry = button.closest('.sb-entry');
  if (!entry) return;

  if (button.dataset.action === 'copy') {
    try {
      await navigator.clipboard.writeText(entry.querySelector('.sb-entry-translation').textContent);
      showSidebarStatus('译文已复制', 'success');
    } catch {
      showSidebarStatus('浏览器未允许复制，请手动选择译文', 'error');
    }
    return;
  }

  button.disabled = true;
  chrome.runtime.sendMessage({ type: 'delete-history-item', id: entry.dataset.entryId }, response => {
    if (chrome.runtime.lastError || !response?.success) {
      button.disabled = false;
      showSidebarStatus('删除记录失败', 'error');
      return;
    }
    entry.remove();
    if (!document.querySelector('.sb-entry')) renderHistory([]);
    showSidebarStatus('记录已删除', 'success');
  });
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}
