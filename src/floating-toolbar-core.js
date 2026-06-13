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

  const api = {
    clampToolbarTop,
    hasDragDistance
  };

  globalScope.TranslateOnlineFloatingToolbarCore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
