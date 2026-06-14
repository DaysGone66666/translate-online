(function initTranslateOnlineFloatingToolbarCore(globalScope) {
  function clampToolbarTop(top, viewportHeight, toolbarHeight, margin = 12) {
    const safeMargin = Math.max(0, Number(margin) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const safeToolbarHeight = Math.max(0, Number(toolbarHeight) || 0);
    const maxTop = Math.max(safeMargin, safeViewportHeight - safeToolbarHeight - safeMargin);
    return Math.min(Math.max(Number(top) || 0, safeMargin), maxTop);
  }

  function hasDragDistance(startX, startY, currentX, currentY, threshold = 5) {
    const deltaX = Number(currentX) - Number(startX);
    const deltaY = Number(currentY) - Number(startY);
    return Math.hypot(deltaX, deltaY) >= threshold;
  }

  function truncatePetMessage(message, maxLength = 48) {
    const text = String(message || '').trim();
    const safeMaxLength = Math.max(1, Number(maxLength) || 48);
    if (text.length <= safeMaxLength) return text;
    if (safeMaxLength === 1) return '…';
    return `${text.slice(0, safeMaxLength - 1)}…`;
  }

  function getPetPresentation({
    businessState = 'idle',
    expanded = false,
    idleAlt = false,
    errorMessage = ''
  } = {}) {
    if (businessState === 'loading') {
      return { visualState: 'loading', bubble: '正在翻译...' };
    }
    if (businessState === 'error') {
      return {
        visualState: 'error',
        bubble: truncatePetMessage(errorMessage) || '翻译失败，请检查设置'
      };
    }
    if (businessState === 'done') {
      return { visualState: 'success', bubble: '翻译完成' };
    }
    if (expanded) {
      return { visualState: 'hover', bubble: '需要翻译吗？' };
    }
    if (idleAlt) {
      return { visualState: 'idle-alt', bubble: '' };
    }
    return { visualState: 'idle', bubble: '' };
  }

  const api = {
    clampToolbarTop,
    getPetPresentation,
    truncatePetMessage,
    hasDragDistance
  };

  globalScope.TranslateOnlineFloatingToolbarCore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
