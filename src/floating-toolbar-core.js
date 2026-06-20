(function initTranslateOnlineFloatingToolbarCore(globalScope) {
  const BUBBLE_TRANSLATING = '\u6b63\u5728\u7ffb\u8bd1...';
  const BUBBLE_ERROR_FALLBACK =
    '\u7ffb\u8bd1\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u8bbe\u7f6e';
  const BUBBLE_DONE = '\u7ffb\u8bd1\u5b8c\u6210';
  const BUBBLE_EXPANDED = '\u9700\u8981\u7ffb\u8bd1\u5417\uff1f';

  function clampToolbarLeft(left, viewportWidth, toolbarWidth, margin = 12) {
    const safeMargin = Math.max(0, Number(margin) || 0);
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeToolbarWidth = Math.max(0, Number(toolbarWidth) || 0);
    const maxLeft = Math.max(safeMargin, safeViewportWidth - safeToolbarWidth - safeMargin);
    return Math.min(Math.max(Number(left) || 0, safeMargin), maxLeft);
  }

  function clampToolbarTop(top, viewportHeight, toolbarHeight, margin = 12) {
    const safeMargin = Math.max(0, Number(margin) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const safeToolbarHeight = Math.max(0, Number(toolbarHeight) || 0);
    const maxTop = Math.max(safeMargin, safeViewportHeight - safeToolbarHeight - safeMargin);
    return Math.min(Math.max(Number(top) || 0, safeMargin), maxTop);
  }

  function getToolbarDockSide(
    left,
    viewportWidth,
    toolbarWidth,
    margin = 12,
    triggerDistance = 80
  ) {
    const safeLeft = Number(left) || 0;
    const safeMargin = Math.max(0, Number(margin) || 0);
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeToolbarWidth = Math.max(0, Number(toolbarWidth) || 0);
    const safeTriggerDistance = Math.max(0, Number(triggerDistance) || 0);
    const rightSpace = safeViewportWidth - (safeLeft + safeToolbarWidth);

    if (safeLeft <= safeMargin + safeTriggerDistance) return 'left';
    if (rightSpace <= safeMargin + safeTriggerDistance) return 'right';
    return '';
  }

  function getDockedToolbarLeft(
    dockSide,
    viewportWidth,
    toolbarWidth,
    visibleWidth = 40
  ) {
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeToolbarWidth = Math.max(0, Number(toolbarWidth) || 0);
    const safeVisibleWidth = Math.max(0, Number(visibleWidth) || 0);

    if (dockSide === 'left') {
      return safeVisibleWidth - safeToolbarWidth;
    }
    if (dockSide === 'right') {
      return safeViewportWidth - safeVisibleWidth;
    }
    return null;
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
    if (safeMaxLength === 1) return '\u2026';
    return `${text.slice(0, safeMaxLength - 1)}\u2026`;
  }

  function pickFrame(frame, prefix, fallbackFrame) {
    const value = String(frame || '');
    return value.startsWith(`${prefix}-`) ? value : fallbackFrame;
  }

  function getPetPresentation({
    businessState = 'idle',
    expanded = false,
    blinking = false,
    blinkFrame = '',
    dragging = false,
    tapping = false,
    sleepy = false,
    speakingFrame = '',
    errorMessage = ''
  } = {}) {
    if (businessState === 'loading') {
      return { visualState: 'loading', bubble: BUBBLE_TRANSLATING };
    }
    if (businessState === 'error') {
      return {
        visualState: 'error',
        bubble: truncatePetMessage(errorMessage) || BUBBLE_ERROR_FALLBACK
      };
    }
    if (businessState === 'done') {
      return { visualState: 'success', bubble: BUBBLE_DONE };
    }
    if (dragging) {
      return { visualState: 'idle', bubble: '' };
    }
    if (tapping) {
      return { visualState: 'tap-react', bubble: '' };
    }
    if (expanded) {
      return { visualState: 'hover-lite', bubble: BUBBLE_EXPANDED };
    }
    if (sleepy) {
      return { visualState: 'sleep', bubble: '' };
    }
    if (blinking) {
      return { visualState: pickFrame(blinkFrame, 'blink', 'blink-01'), bubble: '' };
    }
    return { visualState: 'idle', bubble: '' };
  }

  const api = {
    clampToolbarLeft,
    clampToolbarTop,
    getDockedToolbarLeft,
    getPetPresentation,
    getToolbarDockSide,
    truncatePetMessage,
    hasDragDistance
  };

  globalScope.TranslateOnlineFloatingToolbarCore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
