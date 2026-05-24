// Translate Online - 后台服务线程

// ==================== 存储 Key 常量 ====================
const STORAGE_KEYS = {
  DEEPSEEK_KEY: 'deepseek_api_key',
  ENGINE: 'translation_engine', // 'free' | 'deepseek'
  TARGET_LANG: 'target_language',
  MODEL: 'deepseek_model',
  HISTORY: 'translation_history',
  API_URL: 'deepseek_api_url',
  CONTEXT_MENU: 'trigger_context_menu',
  AUTO_TRANSLATE: 'trigger_auto_translate'
};

// ==================== 安装事件处理 ====================
chrome.runtime.onInstalled.addListener((details) => {
  // 初始化默认存储
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      [STORAGE_KEYS.ENGINE]: 'free',
      [STORAGE_KEYS.TARGET_LANG]: 'zh-CN',
      [STORAGE_KEYS.MODEL]: 'deepseek-chat'
    });
    // 首次安装提示
    chrome.tabs.create({ url: 'src/options.html' });
  }

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '翻译选中文本',
    contexts: ['selection']
  });
});

// ==================== 翻译引擎 ====================
const ENGINES = {
  async translateFree(text, targetLang) {
    const sourceLang = 'auto'; // 自动检测
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    try {
      const response = await fetch(url);
      // 先检查 HTTP 状态码，避免在错误响应上调用 .json()
      if (!response.ok) {
        if (response.status === 429) {
          return { success: false, error: 'rate_limited', message: '免费引擎请求频繁，请稍后重试或切换为 DeepSeek' };
        }
        const errorText = await response.text().catch(() => '');
        return { success: false, error: 'api_error', message: `HTTP ${response.status}: ${errorText || '请求失败'}` };
      }
      const data = await response.json();
      if (data.responseStatus === 200) {
        return { success: true, text: data.responseData.translatedText };
      }
      // 429 限频处理
      if (data.responseStatus === 429) {
        return { success: false, error: 'rate_limited', message: '免费引擎请求频繁，请稍后重试或切换为 DeepSeek' };
      }
      return { success: false, error: 'api_error', message: data.responseDetails || '翻译失败' };
    } catch (err) {
      return { success: false, error: 'network_error', message: `网络请求失败: ${err.message}` };
    }
  },

  async translateDeepSeek(text, targetLang, apiKey, model, apiUrl) {
    const url = apiUrl ? `${apiUrl.replace(/\/$/, '')}/v1/chat/completions` : 'https://api.deepseek.com/v1/chat/completions';
    const systemPrompt = `Translate the following text to ${targetLang}. Respond with only the translation, no explanations.`;

    try {
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
      const translatedText = data.choices?.[0]?.message?.content?.trim() ?? '';
      return { success: true, text: translatedText };
    } catch (err) {
      return { success: false, error: 'network_error', message: `网络请求失败: ${err.message}` };
    }
  }
};

// ==================== 统一翻译函数 ====================
async function translate(text, targetLang) {
  const MAX_LENGTH = 2000;
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH);
  }

  const storage = await chrome.storage.sync.get([
    STORAGE_KEYS.ENGINE,
    STORAGE_KEYS.DEEPSEEK_KEY,
    STORAGE_KEYS.MODEL,
    STORAGE_KEYS.API_URL
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
    return await ENGINES.translateDeepSeek(text, targetLang, apiKey, storage[STORAGE_KEYS.MODEL], storage[STORAGE_KEYS.API_URL]);
  }

  return await ENGINES.translateFree(text, targetLang);
}

// ==================== 消息处理器 ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'translate':
      (async () => {
        const storage = await chrome.storage.sync.get([STORAGE_KEYS.TARGET_LANG]);
        const result = await translate(request.text, storage[STORAGE_KEYS.TARGET_LANG] || 'zh-CN');
        sendResponse(result);
      })().catch(err => {
        sendResponse({ success: false, error: 'internal_error', message: err.message });
      });
      return true;

    case 'open-sidebar':
      chrome.sidePanel.open({ tabId: sender.tab.id });
      return false;

    case 'get-history':
      (async () => {
        const storage = await chrome.storage.local.get([STORAGE_KEYS.HISTORY]);
        sendResponse(storage[STORAGE_KEYS.HISTORY] || []);
      })().catch(err => {
        sendResponse({ success: false, error: 'internal_error', message: err.message });
      });
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
        if (history.length > 100) history.length = 100;
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
        sendResponse({ success: true });
      })().catch(err => {
        sendResponse({ success: false, error: 'internal_error', message: err.message });
      });
      return true;

    case 'clear-history':
      (async () => {
        await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
        sendResponse({ success: true });
      })().catch(err => {
        sendResponse({ success: false, error: 'internal_error', message: err.message });
      });
      return true;

    case 'open-options':
      chrome.runtime.openOptionsPage();
      return false;

    case 'get-settings':
      (async () => {
        const storage = await chrome.storage.sync.get([
          STORAGE_KEYS.AUTO_TRANSLATE,
          STORAGE_KEYS.CONTEXT_MENU
        ]);
        sendResponse(storage);
      })().catch(err => {
        sendResponse({});
      });
      return true;
  }
});

// ==================== 右键菜单事件 ====================
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'translate-selection',
      text: info.selectionText
    });
  }
});

// ==================== 快捷键命令 ====================
chrome.commands.onCommand.addListener((command) => {
  if (command === 'translate-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'translate-selection-command' });
    });
  }
});

// ==================== 监听配置变更，刷新上下文菜单 ====================
chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.CONTEXT_MENU]) {
    if (changes[STORAGE_KEYS.CONTEXT_MENU].newValue) {
      try {
        chrome.contextMenus.create({
          id: 'translate-selection',
          title: '翻译选中文本',
          contexts: ['selection']
        });
      } catch (e) {
        // 菜单可能已存在，忽略
      }
    } else {
      try {
        chrome.contextMenus.remove('translate-selection');
      } catch (e) {
        // 菜单可能已被移除，忽略
      }
    }
  }
});
