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

const COMMAND_NAME = 'translate-selection';

let recordedKeys = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
let isRecording = false;

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadShortcut();

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

  // 快捷键录制
  document.getElementById('btn-record-shortcut').addEventListener('click', startRecording);
  document.getElementById('btn-reset-shortcut').addEventListener('click', resetShortcut);
  document.getElementById('btn-save-shortcut').addEventListener('click', saveShortcut);
  document.getElementById('btn-cancel-shortcut').addEventListener('click', stopRecording);
});

// ==================== 快捷键管理 ====================

function loadShortcut() {
  chrome.commands.getAll((commands) => {
    const cmd = commands.find(c => c.name === COMMAND_NAME);
    if (cmd) {
      const display = cmd.shortcut || '未设置';
      document.getElementById('shortcut-display').textContent = display;
    }
  });
}

function shortcutToDisplay(keys) {
  const parts = [];
  if (keys.ctrl) parts.push('Ctrl');
  if (keys.alt) parts.push('Alt');
  if (keys.shift) parts.push('Shift');
  if (keys.meta) parts.push('Command');
  if (keys.key) parts.push(keys.key.toUpperCase());
  return parts.join('+');
}

function startRecording() {
  isRecording = true;
  recordedKeys = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  document.getElementById('shortcut-recorder').style.display = 'block';
  document.getElementById('shortcut-keys').textContent = '等待输入...';
  document.getElementById('btn-record-shortcut').style.display = 'none';

  // 移除旧的监听器（防止重复绑定）
  document.removeEventListener('keydown', onRecordKeydown);
  document.addEventListener('keydown', onRecordKeydown);
}

function stopRecording() {
  isRecording = false;
  document.getElementById('shortcut-recorder').style.display = 'none';
  document.getElementById('btn-record-shortcut').style.display = '';
  document.removeEventListener('keydown', onRecordKeydown);
}

function onRecordKeydown(event) {
  if (!isRecording) return;
  event.preventDefault();
  event.stopPropagation();

  recordedKeys.ctrl = event.ctrlKey;
  recordedKeys.alt = event.altKey;
  recordedKeys.shift = event.shiftKey;
  recordedKeys.meta = event.metaKey;

  // 忽略仅有修饰键的情况
  const modifiers = ['Control', 'Alt', 'Shift', 'Meta'];
  if (modifiers.includes(event.key)) {
    recordedKeys.key = '';
  } else {
    let key = event.key;
    // 标准化键名
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    recordedKeys.key = key;
  }

  document.getElementById('shortcut-keys').textContent = shortcutToDisplay(recordedKeys);
}

function saveShortcut() {
  if (!recordedKeys.ctrl && !recordedKeys.alt && !recordedKeys.shift && !recordedKeys.meta) {
    showStatus('快捷键必须包含至少一个修饰键（Ctrl/Alt/Shift）', 'error');
    return;
  }
  if (!recordedKeys.key) {
    showStatus('请按下一个完整的快捷键组合', 'error');
    return;
  }

  const shortcut = shortcutToDisplay(recordedKeys);

  chrome.commands.update({
    name: COMMAND_NAME,
    shortcut: shortcut
  }, () => {
    if (chrome.runtime.lastError) {
      showStatus(`快捷键无效: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      document.getElementById('shortcut-display').textContent = shortcut;
      showStatus(`快捷键已设置为 ${shortcut}`, 'success');
      stopRecording();
    }
  });
}

function resetShortcut() {
  chrome.commands.reset(COMMAND_NAME, () => {
    if (chrome.runtime.lastError) {
      showStatus(`重置失败: ${chrome.runtime.lastError.message}`, 'error');
    } else {
      // 重新读取当前的快捷键（重置后为 manifest 中的默认值）
      loadShortcut();
      showStatus('快捷键已重置为默认值', 'success');
    }
  });
}

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
  el.style.display = ''; // 清除内联样式，让 CSS class 生效
  if (el._hideTimer) clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.className = 'status-message';
  }, 5000);
}
