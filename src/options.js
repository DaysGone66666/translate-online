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
