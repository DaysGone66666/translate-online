(function initPageTranslationCore(globalScope) {
  const SKIP_TAGS = new Set([
    'CODE', 'INPUT', 'KBD', 'MATH', 'NOSCRIPT', 'OPTION', 'PRE', 'SCRIPT',
    'SELECT', 'STYLE', 'SVG', 'TEXTAREA'
  ]);

  const SKIP_ROLES = new Set(['textbox']);
  const INLINE_CONTEXT_TAGS = new Set(['A', 'BUTTON', 'NAV']);
  const BLOCK_CONTEXT_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'DD', 'DT',
    'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SECTION'
  ]);

  function isMeaningfulText(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) return false;
    if (!/[A-Za-z\u00c0-\u024f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text)) return false;
    if (/^(?:https?:\/\/|www\.|[\w.+-]+@)/i.test(text)) return false;
    if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d._-]{2,4}$/.test(text)) return false;
    return true;
  }

  function isBlockedElement(element) {
    if (!element) return false;
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element.hasAttribute && (
      element.hasAttribute('data-translate-online-ui') ||
      element.hasAttribute('data-translate-online-result')
    )) {
      return true;
    }
    if (element.getAttribute) {
      if (element.getAttribute('translate') === 'no') return true;
      const contentEditable = element.getAttribute('contenteditable');
      if (contentEditable !== null && contentEditable !== 'false') return true;
      if (SKIP_ROLES.has((element.getAttribute('role') || '').toLowerCase())) return true;
    }
    return false;
  }

  function findTranslationTarget(textNode, root) {
    if (!textNode || !isMeaningfulText(textNode.textContent)) return null;
    let element = textNode && textNode.parentElement;

    while (element) {
      if (isBlockedElement(element)) return null;
      if (element === root) break;
      element = element.parentElement;
    }

    return textNode;
  }

  function collectTranslatableTextNodes(textNodes, root) {
    const targets = [];
    const seen = new Set();

    for (const textNode of textNodes) {
      const target = findTranslationTarget(textNode, root);
      if (target && !seen.has(target)) {
        seen.add(target);
        targets.push(target);
      }
    }
    return targets;
  }

  function getTranslationMode(textNode) {
    const text = String(textNode && textNode.textContent || '').replace(/\s+/g, ' ').trim();
    let element = textNode && textNode.parentElement;

    while (element) {
      if (INLINE_CONTEXT_TAGS.has(element.tagName)) return 'inline';
      if (BLOCK_CONTEXT_TAGS.has(element.tagName)) return 'block';
      element = element.parentElement;
    }

    return text.length > 28 ? 'block' : 'inline';
  }

  function createPageRun(items, generation) {
    return {
      generation,
      queue: [...items],
      activeRequestIds: new Set(),
      pendingRetryCount: 0,
      successCount: 0,
      skippedCount: 0,
      completed: false,
      cancelled: false
    };
  }

  function takeTranslationBatch(queue, maxItems, maxCharacters) {
    const itemLimit = Math.max(1, Math.floor(Number(maxItems) || 1));
    const characterLimit = Math.max(1, Math.floor(Number(maxCharacters) || 1));
    const batch = [];
    let characterCount = 0;

    while (queue.length > 0 && batch.length < itemLimit) {
      const nextItem = queue[0];
      const nextLength = String(nextItem && nextItem.text || '').length;
      if (batch.length > 0 && characterCount + nextLength > characterLimit) break;
      batch.push(queue.shift());
      characterCount += nextLength;
    }

    return batch;
  }

  function cancelPageRun(run) {
    if (!run) return [];
    const requestIds = [...run.activeRequestIds];
    run.cancelled = true;
    run.queue = [];
    run.activeRequestIds.clear();
    return requestIds;
  }

  function isCurrentPageRun(currentRun, run) {
    return currentRun === run && !!run && !run.cancelled;
  }

  function getPageBallPresentation(state, showTranslations) {
    if (state === 'loading') {
      return { label: '取消', ariaLabel: '取消页面翻译' };
    }
    if (state === 'done') {
      return showTranslations
        ? { label: '原文', ariaLabel: '隐藏译文' }
        : { label: '译文', ariaLabel: '显示译文' };
    }
    return { label: '翻译页面', ariaLabel: '翻译当前页面' };
  }

  const api = {
    SKIP_TAGS,
    cancelPageRun,
    collectTranslatableTextNodes,
    createPageRun,
    findTranslationTarget,
    getPageBallPresentation,
    getTranslationMode,
    isCurrentPageRun,
    isMeaningfulText,
    takeTranslationBatch
  };

  globalScope.TranslateOnlinePageCore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
