const {
  STORAGE_KEYS,
  formatLanguagePair,
  isSiteDisabled
} = TranslateOnlineShared;

const {
  cancelPageRun,
  collectTranslatableTextNodes,
  createPageRun,
  getPageBallPresentation,
  getTranslationMode,
  isCurrentPageRun,
  isMeaningfulText,
  takeTranslationBatch
} = TranslateOnlinePageCore;

const {
  clampToolbarTop,
  getPetPresentation,
  hasDragDistance
} = TranslateOnlineFloatingToolbarCore;

const BALL_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  DONE: 'done',
  ERROR: 'error'
});
const PET_IMAGE_PATHS = Object.freeze({
  idle: 'images/pet/rem-idle.webp',
  'idle-alt': 'images/pet/rem-idle-alt.webp',
  hover: 'images/pet/rem-hover.webp',
  loading: 'images/pet/rem-loading.webp',
  success: 'images/pet/rem-success.webp',
  error: 'images/pet/rem-error.webp'
});
const ORIGINAL_ATTR = 'data-translate-online-original';
const RESULT_ATTR = 'data-translate-online-result';
const STATE_ATTR = 'data-translate-online-state';
const MAX_CONCURRENT_BATCHES = 2;
const MAX_BATCH_ITEMS = 12;
const MAX_BATCH_CHARACTERS = 1600;
const MAX_RATE_LIMIT_RETRIES = 1;
const RATE_LIMIT_RETRY_DELAY = 1500;
const TOOLBAR_PET_HEIGHT = 84;
const TOOLBAR_MENU_CLEARANCE = 54;
const TOOLBAR_CLOSE_DELAY = 220;
const PET_IDLE_ALT_DELAY = 30000;
const PET_FEEDBACK_DURATION = 3600;
const isHltvSite = location.hostname === 'hltv.org' || location.hostname.endsWith('.hltv.org');

let autoTranslateEnabled = true;
let disabledSites = [];
let popupContainer = null;
let popupRequestId = '';
let debounceTimer = null;
let ballEl = null;
let ballState = BALL_STATES.IDLE;
let showPageTranslations = true;
let pageRun = null;
let pageRunGeneration = 0;
let requestSequence = 0;
let lastBallClick = 0;
let lastUrl = location.href;
let processedTextNodes = new WeakSet();
let translationResultByNode = new WeakMap();
let pageMutationObserver = null;
let mutationScanTimer = null;
let pageTranslationEnabled = false;
let toolbarDrag = null;
let toolbarCloseTimer = null;
let suppressAvatarClick = false;
let petCurrentLayer = 0;
let petVisualState = '';
let petErrorMessage = '';
let petIdleAlt = false;
let petIdleTimer = null;
let petFeedbackTimer = null;
let petFeedbackState = '';

function nextRequestId(prefix, generation = 0) {
  requestSequence += 1;
  return `${prefix}-${generation}-${Date.now()}-${requestSequence}`;
}

function sendCancelRequests(requestIds) {
  if (!requestIds.length) return;
  try {
    chrome.runtime.sendMessage({ type: 'cancel-translations', requestIds }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // The extension may have been reloaded while the page remained open.
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}

function extensionEnabledForCurrentSite() {
  return !isSiteDisabled(location.hostname, disabledSites);
}

chrome.storage.sync.get([
  STORAGE_KEYS.AUTO_TRANSLATE,
  STORAGE_KEYS.DISABLED_SITES
], items => {
  autoTranslateEnabled = items[STORAGE_KEYS.AUTO_TRANSLATE] !== false;
  disabledSites = items[STORAGE_KEYS.DISABLED_SITES] || [];
  updateSiteAvailability();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (changes[STORAGE_KEYS.AUTO_TRANSLATE]) {
    autoTranslateEnabled = changes[STORAGE_KEYS.AUTO_TRANSLATE].newValue !== false;
  }
  if (changes[STORAGE_KEYS.DISABLED_SITES]) {
    disabledSites = changes[STORAGE_KEYS.DISABLED_SITES].newValue || [];
    updateSiteAvailability();
  }
});

function updateSiteAvailability() {
  if (extensionEnabledForCurrentSite()) {
    createBall();
    return;
  }
  closePopup();
  cancelPageTranslation(true);
  clearTimeout(toolbarCloseTimer);
  clearTimeout(petIdleTimer);
  clearTimeout(petFeedbackTimer);
  toolbarCloseTimer = null;
  petIdleTimer = null;
  petFeedbackTimer = null;
  toolbarDrag = null;
  suppressAvatarClick = false;
  ballEl?.remove();
  ballEl = null;
}

// ==================== 划词翻译浮窗 ====================

function closePopup() {
  clearTimeout(debounceTimer);
  if (popupRequestId) {
    sendCancelRequests([popupRequestId]);
    popupRequestId = '';
  }
  popupContainer?.remove();
  popupContainer = null;
}

function positionPopup(container, rect) {
  const bounds = container.getBoundingClientRect();
  const popupWidth = bounds.width || 300;
  const popupHeight = bounds.height || 180;
  const minLeft = window.scrollX + 10;
  const maxLeft = window.scrollX + window.innerWidth - popupWidth - 10;

  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  if (rect.bottom + popupHeight + 10 > window.innerHeight) {
    top = rect.top + window.scrollY - popupHeight - 6;
  }
  top = Math.max(window.scrollY + 10, top);

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;
}

function createPopup(text, rect) {
  closePopup();
  if (!extensionEnabledForCurrentSite()) return;

  const container = document.createElement('div');
  const requestId = nextRequestId('selection');
  popupContainer = container;
  popupRequestId = requestId;

  container.className = 'to-popup-container';
  container.setAttribute('data-translate-online-ui', 'selection-popup');
  container.innerHTML = `
    <div class="to-popup-card" role="dialog" aria-label="翻译结果">
      <div class="to-popup-header">
        <span class="to-popup-lang-tag">自动检测 → 目标语言</span>
        <div class="to-popup-header-actions">
          <button type="button" class="to-popup-header-btn" data-action="speak" aria-label="朗读原文">🔊</button>
          <button type="button" class="to-popup-header-btn" data-action="sidebar" aria-label="打开侧边栏">☰</button>
        </div>
      </div>
      <div class="to-popup-label">原文</div>
      <div class="to-popup-original">${escapeHtml(text)}</div>
      <div class="to-popup-divider"></div>
      <div class="to-popup-label">译文</div>
      <div class="to-popup-translation-wrap">
        <div class="to-popup-translation" aria-live="polite">
          <span class="to-popup-loading">翻译中...</span>
        </div>
      </div>
    </div>
  `;
  container.style.backgroundImage = `url('${chrome.runtime.getURL('images/popup-bg.png')}')`;
  document.body.appendChild(container);
  positionPopup(container, rect);

  container.querySelector('[data-action="speak"]').addEventListener('click', () => {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  });
  container.querySelector('[data-action="sidebar"]').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'open-sidebar' });
  });

  chrome.runtime.sendMessage({
    type: 'translate',
    text,
    hostname: location.hostname,
    requestId
  }, response => {
    if (chrome.runtime.lastError || popupContainer !== container || !container.isConnected) return;
    if (popupRequestId === requestId) popupRequestId = '';

    const translationEl = container.querySelector('.to-popup-translation');
    const languageEl = container.querySelector('.to-popup-lang-tag');
    if (!translationEl || !languageEl) return;

    if (response?.sourceLang && response?.targetLang) {
      languageEl.textContent = formatLanguagePair(response.sourceLang, response.targetLang);
    }

    if (response?.success) {
      translationEl.textContent = response.text;
      if (response._note) {
        const note = document.createElement('div');
        note.className = 'to-popup-note';
        note.textContent = response._note;
        translationEl.appendChild(note);
      }
      chrome.runtime.sendMessage({
        type: 'save-to-history',
        text,
        translation: response.text,
        sourceLang: response.sourceLang,
        targetLang: response.targetLang
      });
    } else if (response && response.error !== 'cancelled') {
      translationEl.innerHTML = `<span class="to-popup-error">${escapeHtml(response.message)}</span>`;
      if (response.needsConfig) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'to-popup-link';
        link.textContent = '去设置';
        link.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'open-options' });
          closePopup();
        });
        translationEl.append(' ', link);
      }
    }
    positionPopup(container, rect);
  });
}

function selectionRectOrFallback(selection) {
  if (selection && selection.rangeCount > 0) {
    return selection.getRangeAt(0).getBoundingClientRect();
  }
  const centerY = window.innerHeight / 2;
  return { top: centerY, bottom: centerY, left: window.innerWidth / 2 };
}

document.addEventListener('mouseup', event => {
  if (!autoTranslateEnabled || !extensionEnabledForCurrentSite()) return;
  if (popupContainer?.contains(event.target)) return;

  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (!text) {
    closePopup();
    return;
  }

  const rect = selectionRectOrFallback(selection);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => createPopup(text, rect), 300);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closePopup();
});

document.addEventListener('mousedown', event => {
  if (popupContainer && !popupContainer.contains(event.target) && !window.getSelection().toString().trim()) {
    closePopup();
  }
});

chrome.runtime.onMessage.addListener(request => {
  if (!extensionEnabledForCurrentSite()) return;
  if (request.type === 'start-page-translation-command') {
    startPageTranslation();
    return;
  }
  if (request.type !== 'translate-selection' && request.type !== 'translate-selection-command') return;

  const selection = window.getSelection();
  const text = request.text || selection.toString().trim();
  if (text) createPopup(text, selectionRectOrFallback(selection));
});

// ==================== 页面一键翻译 ====================

(function injectPageTranslateStyles() {
  const style = document.createElement('style');
  style.setAttribute('data-translate-online-ui', 'page-styles');
  if (isHltvSite) {
    document.documentElement.setAttribute('data-translate-online-site-theme', 'hltv');
  }
  style.textContent = `
[data-translate-online-ui="floating-toolbar"] {
  box-sizing: border-box;
  position: fixed;
  right: -32px;
  top: calc(50% - 42px);
  width: 64px;
  height: 84px;
  z-index: 2147483646;
  user-select: none;
  touch-action: none;
  transition: right 0.24s cubic-bezier(0.2, 0.82, 0.25, 1);
}
[data-translate-online-ui="floating-toolbar"][data-open="true"],
[data-translate-online-ui="floating-toolbar"]:focus-within,
[data-translate-online-ui="floating-toolbar"][data-dragging="true"] {
  right: 10px;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-action {
  box-sizing: border-box;
  appearance: none;
  position: absolute;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.13);
  border-radius: 50%;
  color: #d8dadd;
  background: rgba(20,21,24,0.96);
  box-shadow: 0 4px 16px rgba(0,0,0,0.24), inset 0 1px rgba(255,255,255,0.05);
  cursor: pointer;
  font: 700 16px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.2s ease, border-color 0.18s, background 0.18s;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-action:hover,
[data-translate-online-ui="floating-toolbar"] .to-toolbar-action:focus-visible {
  border-color: rgba(125,211,252,0.62);
  background: rgba(35,38,44,0.98);
  outline: none;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-action:focus-visible {
  box-shadow: 0 0 0 3px rgba(125,211,252,0.26), 0 4px 16px rgba(0,0,0,0.24);
}
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="translate"] {
  bottom: calc(100% + 8px);
  color: #dcecff;
  transform: translateY(8px) scale(0.84);
}
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="sidebar"] {
  top: 0;
  width: 64px;
  height: 84px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  box-shadow: none;
  opacity: 1;
  pointer-events: auto;
  transform: none;
  cursor: grab;
}
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="sidebar"]:hover,
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="sidebar"]:focus-visible {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="sidebar"]:active {
  cursor: grabbing;
}
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="settings"] {
  top: calc(100% + 8px);
  transform: translateY(-8px) scale(0.84);
}
[data-translate-online-ui="floating-toolbar"][data-open="true"] [data-toolbar-action="translate"],
[data-translate-online-ui="floating-toolbar"][data-open="true"] [data-toolbar-action="settings"],
[data-translate-online-ui="floating-toolbar"]:focus-within [data-toolbar-action="translate"],
[data-translate-online-ui="floating-toolbar"]:focus-within [data-toolbar-action="settings"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-card {
  box-sizing: border-box;
  position: absolute;
  inset: 0;
  overflow: hidden;
  width: 64px;
  height: 84px;
  border: 1px solid rgba(186,230,253,0.76);
  border-radius: 18px;
  background: #101827;
  box-shadow:
    0 10px 28px rgba(2,6,23,0.38),
    0 0 18px rgba(56,189,248,0.18),
    inset 0 1px rgba(255,255,255,0.18);
  animation: translate-online-pet-float 4.2s ease-in-out infinite;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.02);
  transition: opacity 0.22s ease, transform 0.3s ease;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-image[data-active="true"] {
  opacity: 1;
}
[data-translate-online-ui="floating-toolbar"][data-open="true"] .to-toolbar-pet-image[data-active="true"],
[data-translate-online-ui="floating-toolbar"]:focus-within .to-toolbar-pet-image[data-active="true"] {
  transform: scale(1.08);
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-shine {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(145deg, rgba(255,255,255,0.18), transparent 34%, transparent 74%, rgba(56,189,248,0.12));
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-bubble {
  box-sizing: border-box;
  position: absolute;
  top: 14px;
  right: calc(100% + 10px);
  width: max-content;
  max-width: min(210px, calc(100vw - 96px));
  padding: 8px 11px;
  border: 1px solid rgba(186,230,253,0.3);
  border-radius: 12px 12px 3px 12px;
  color: #eef9ff;
  background: rgba(8,22,42,0.96);
  box-shadow: 0 9px 24px rgba(2,6,23,0.32);
  font: 600 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  opacity: 0;
  pointer-events: none;
  transform: translateX(8px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-bubble[data-visible="true"] {
  opacity: 1;
  transform: translateX(0);
}
[data-translate-online-ui="floating-toolbar"][data-visual-state="loading"] .to-toolbar-pet-card {
  border-color: #7dd3fc;
  animation: translate-online-rem-pulse 1s ease-in-out infinite alternate;
}
[data-translate-online-ui="floating-toolbar"][data-visual-state="error"] .to-toolbar-pet-card {
  border-color: rgba(251,113,133,0.82);
  box-shadow: 0 10px 28px rgba(2,6,23,0.38), 0 0 20px rgba(244,63,94,0.22);
}
[data-translate-online-result] {
  box-sizing: border-box;
  max-width: 100%;
  font: inherit;
  font-size: 0.96em;
  font-weight: inherit;
  line-height: inherit;
  color: inherit;
  opacity: 0.82;
  border: 0;
}
[data-translate-online-site-theme="hltv"] [data-translate-online-result] {
  color: #00c896 !important;
  opacity: 1;
}
[data-translate-online-result][data-translate-online-mode="block"] {
  display: block;
  padding: 0;
  margin: 0.14em 0 0;
}
[data-translate-online-result][data-translate-online-mode="inline"] {
  display: inline;
  margin-left: 0.32em;
  padding: 0;
}
[data-translate-online-result][hidden] { display: none !important; }
[data-translate-online-ui="page-toast"] {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2147483647;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid rgba(186,230,253,0.28);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(8,24,56,0.96), rgba(5,14,38,0.94));
  color: #fff;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  box-shadow: 0 10px 32px rgba(2,6,23,0.38), 0 0 20px rgba(56,189,248,0.12);
  backdrop-filter: blur(16px);
}
@keyframes translate-online-rem-pulse {
  to { box-shadow: 0 0 0 4px rgba(125,211,252,0.16), 0 10px 28px rgba(2,6,23,0.38); }
}
@keyframes translate-online-pet-float {
  50% { transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  [data-translate-online-ui="floating-toolbar"],
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-action,
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-image,
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-bubble { transition: none; }
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-card { animation: none; }
}
`;
  document.head.appendChild(style);
})();

function showPageToast(message) {
  document.querySelector('[data-translate-online-ui="page-toast"]')?.remove();
  const toast = document.createElement('div');
  toast.setAttribute('data-translate-online-ui', 'page-toast');
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function createBall() {
  if (ballEl || !document.body || !extensionEnabledForCurrentSite()) return;
  ballEl = document.createElement('div');
  ballEl.setAttribute('data-translate-online-ui', 'floating-toolbar');
  ballEl.setAttribute('aria-label', '翻译悬浮工具条');
  const idleImageUrl = chrome.runtime.getURL(PET_IMAGE_PATHS.idle);
  ballEl.innerHTML = `
    <button class="to-toolbar-action" data-toolbar-action="translate" type="button">
      <span aria-hidden="true">译</span>
    </button>
    <div class="to-toolbar-bubble" role="status" aria-live="polite"></div>
    <button class="to-toolbar-action" data-toolbar-action="sidebar" type="button" aria-label="打开翻译记录">
      <span class="to-toolbar-pet-card" aria-hidden="true">
        <img class="to-toolbar-pet-image" data-pet-layer="primary" data-active="true" src="${idleImageUrl}" alt="">
        <img class="to-toolbar-pet-image" data-pet-layer="secondary" data-active="false" alt="">
        <span class="to-toolbar-pet-shine"></span>
      </span>
    </button>
    <button class="to-toolbar-action" data-toolbar-action="settings" type="button" aria-label="打开翻译设置">
      <span aria-hidden="true">⚙</span>
    </button>
  `;
  const translateButton = ballEl.querySelector('[data-toolbar-action="translate"]');
  const avatarButton = ballEl.querySelector('[data-toolbar-action="sidebar"]');
  const settingsButton = ballEl.querySelector('[data-toolbar-action="settings"]');
  const petImages = ballEl.querySelectorAll('.to-toolbar-pet-image');

  petCurrentLayer = 0;
  petVisualState = 'idle';
  petErrorMessage = '';
  petIdleAlt = false;
  petFeedbackState = '';
  petImages.forEach(image => {
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied === 'true') return;
      image.dataset.fallbackApplied = 'true';
      image.src = chrome.runtime.getURL('images/page-ball-avatar.png');
    });
  });

  avatarButton.addEventListener('pointerenter', openToolbarMenu);
  translateButton.addEventListener('pointerenter', cancelToolbarClose);
  settingsButton.addEventListener('pointerenter', cancelToolbarClose);
  ballEl.addEventListener('pointerenter', cancelToolbarClose);
  ballEl.addEventListener('pointerleave', scheduleToolbarClose);
  ballEl.addEventListener('focusin', openToolbarMenu);
  ballEl.addEventListener('focusout', event => {
    if (!ballEl.contains(event.relatedTarget)) scheduleToolbarClose();
  });
  translateButton.addEventListener('click', event => {
    onBallClick();
    blurMouseActivatedButton(event);
    scheduleToolbarClose();
  });
  avatarButton.addEventListener('click', event => {
    if (suppressAvatarClick) {
      suppressAvatarClick = false;
      event.preventDefault();
      blurMouseActivatedButton(event);
      return;
    }
    chrome.runtime.sendMessage({ type: 'open-sidebar' });
    blurMouseActivatedButton(event);
  });
  settingsButton.addEventListener('click', event => {
    chrome.runtime.sendMessage({ type: 'open-options' });
    blurMouseActivatedButton(event);
    scheduleToolbarClose();
  });
  setupToolbarDragging(avatarButton);
  document.body.appendChild(ballEl);
  loadToolbarTop();
  setBallState(BALL_STATES.IDLE);
}

function setPetImage(visualState) {
  if (!ballEl || visualState === petVisualState) return;
  const layers = ballEl.querySelectorAll('.to-toolbar-pet-image');
  if (layers.length !== 2) return;

  const nextLayerIndex = petCurrentLayer === 0 ? 1 : 0;
  const currentLayer = layers[petCurrentLayer];
  const nextLayer = layers[nextLayerIndex];
  nextLayer.dataset.fallbackApplied = 'false';
  nextLayer.dataset.pendingState = visualState;

  const activateLayer = () => {
    if (
      !ballEl ||
      nextLayer.dataset.pendingState !== visualState ||
      ballEl.dataset.visualState !== visualState
    ) {
      return;
    }
    currentLayer.dataset.active = 'false';
    nextLayer.dataset.active = 'true';
    petCurrentLayer = nextLayerIndex;
  };

  nextLayer.addEventListener('load', activateLayer, { once: true });
  nextLayer.src = chrome.runtime.getURL(
    PET_IMAGE_PATHS[visualState] || PET_IMAGE_PATHS.idle
  );
  if (nextLayer.complete && nextLayer.naturalWidth > 0) activateLayer();
  petVisualState = visualState;
}

function refreshPetPresentation() {
  if (!ballEl) return;
  const businessState = ballState === BALL_STATES.LOADING
    ? BALL_STATES.LOADING
    : petFeedbackState || BALL_STATES.IDLE;
  const presentation = getPetPresentation({
    businessState,
    expanded: ballEl.dataset.open === 'true',
    idleAlt: petIdleAlt,
    errorMessage: petErrorMessage
  });
  const bubble = ballEl.querySelector('.to-toolbar-bubble');

  ballEl.dataset.visualState = presentation.visualState;
  bubble.textContent = presentation.bubble;
  bubble.dataset.visible = String(!!presentation.bubble);
  setPetImage(presentation.visualState);
}

function resetPetIdleTimer() {
  clearTimeout(petIdleTimer);
  petIdleTimer = null;
  petIdleAlt = false;
  if (!ballEl || ballState === BALL_STATES.LOADING || petFeedbackState) return;
  petIdleTimer = setTimeout(() => {
    petIdleTimer = null;
    if (!ballEl || ballEl.dataset.open === 'true' || petFeedbackState) return;
    petIdleAlt = true;
    refreshPetPresentation();
  }, PET_IDLE_ALT_DELAY);
}

function cancelToolbarClose() {
  clearTimeout(toolbarCloseTimer);
  toolbarCloseTimer = null;
}

function openToolbarMenu() {
  cancelToolbarClose();
  if (!ballEl) return;
  ballEl.dataset.open = 'true';
  resetPetIdleTimer();
  refreshPetPresentation();
}

function scheduleToolbarClose() {
  cancelToolbarClose();
  toolbarCloseTimer = setTimeout(() => {
    toolbarCloseTimer = null;
    if (!ballEl || ballEl.dataset.dragging === 'true' || ballEl.matches(':focus-within')) return;
    delete ballEl.dataset.open;
    refreshPetPresentation();
    resetPetIdleTimer();
  }, TOOLBAR_CLOSE_DELAY);
}

function blurMouseActivatedButton(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

function setBallState(state, errorMessage = '', showFeedback = true) {
  ballState = state;
  if (!ballEl) return;
  clearTimeout(petFeedbackTimer);
  petFeedbackTimer = null;
  petErrorMessage = state === BALL_STATES.ERROR ? String(errorMessage || '') : '';
  petFeedbackState = showFeedback &&
    (state === BALL_STATES.DONE || state === BALL_STATES.ERROR)
    ? state
    : '';
  ballEl.dataset.state = state;
  const presentation = getPageBallPresentation(state, showPageTranslations);
  const translateButton = ballEl.querySelector('[data-toolbar-action="translate"]');
  translateButton.setAttribute('aria-label', presentation.ariaLabel);
  translateButton.title = presentation.label;
  refreshPetPresentation();

  if (petFeedbackState) {
    petFeedbackTimer = setTimeout(() => {
      petFeedbackTimer = null;
      petFeedbackState = '';
      petErrorMessage = '';
      if (ballState === BALL_STATES.ERROR) {
        ballState = BALL_STATES.IDLE;
        ballEl.dataset.state = BALL_STATES.IDLE;
      }
      refreshPetPresentation();
      resetPetIdleTimer();
    }, PET_FEEDBACK_DURATION);
  } else {
    resetPetIdleTimer();
  }
}

function setToolbarTop(top) {
  if (!ballEl) return 0;
  const clampedTop = clampToolbarTop(
    top,
    window.innerHeight,
    TOOLBAR_PET_HEIGHT,
    TOOLBAR_MENU_CLEARANCE
  );
  ballEl.style.top = `${clampedTop}px`;
  return clampedTop;
}

function loadToolbarTop() {
  chrome.storage.local.get([STORAGE_KEYS.FLOATING_TOOLBAR_TOP], items => {
    if (!ballEl || chrome.runtime.lastError) return;
    const savedTop = Number(items[STORAGE_KEYS.FLOATING_TOOLBAR_TOP]);
    const defaultTop = (window.innerHeight - TOOLBAR_PET_HEIGHT) / 2;
    setToolbarTop(Number.isFinite(savedTop) ? savedTop : defaultTop);
  });
}

function saveToolbarTop() {
  if (!ballEl) return;
  const top = setToolbarTop(Number.parseFloat(ballEl.style.top));
  chrome.storage.local.set({ [STORAGE_KEYS.FLOATING_TOOLBAR_TOP]: top });
}

function setupToolbarDragging(handle) {
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !ballEl) return;
    cancelToolbarClose();
    openToolbarMenu();
    suppressAvatarClick = false;
    toolbarDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: ballEl.getBoundingClientRect().top,
      moved: false
    };
    ballEl.dataset.dragging = 'true';
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', event => {
    if (!toolbarDrag || event.pointerId !== toolbarDrag.pointerId) return;
    if (!toolbarDrag.moved) {
      toolbarDrag.moved = hasDragDistance(
        toolbarDrag.startX,
        toolbarDrag.startY,
        event.clientX,
        event.clientY
      );
    }
    if (!toolbarDrag.moved) return;
    suppressAvatarClick = true;
    setToolbarTop(toolbarDrag.startTop + event.clientY - toolbarDrag.startY);
    event.preventDefault();
  });

  const finishDrag = event => {
    if (!toolbarDrag || event.pointerId !== toolbarDrag.pointerId) return;
    const moved = toolbarDrag.moved;
    if (moved) saveToolbarTop();
    toolbarDrag = null;
    if (ballEl) delete ballEl.dataset.dragging;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    if (moved) {
      suppressAvatarClick = event.type === 'pointerup';
      setTimeout(() => {
        suppressAvatarClick = false;
      }, 0);
    }
    scheduleToolbarClose();
  };
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
}

function onBallClick() {
  const now = Date.now();
  if (now - lastBallClick < 500) return;
  lastBallClick = now;

  if (ballState === BALL_STATES.IDLE || ballState === BALL_STATES.ERROR) {
    startPageTranslation();
  } else if (ballState === BALL_STATES.LOADING) {
    cancelPageTranslation(true);
  } else {
    toggleAllTranslations();
  }
}

window.addEventListener('resize', () => {
  if (!ballEl) return;
  setToolbarTop(ballEl.getBoundingClientRect().top);
});

if (document.readyState !== 'loading') {
  createBall();
} else {
  window.addEventListener('DOMContentLoaded', createBall, { once: true });
}

function collectTextNodes(root = document.body) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function isVisibleTextNode(textNode) {
  let element = textNode.parentElement;
  while (element) {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      style.contentVisibility === 'hidden'
    ) {
      return false;
    }
    if (element === document.body) break;
    element = element.parentElement;
  }
  return !!textNode.parentElement?.getClientRects().length;
}

function collectTranslationItems() {
  const textNodes = collectTranslatableTextNodes(collectTextNodes(), document.body);
  return textNodes
    .filter(textNode => !processedTextNodes.has(textNode) && isVisibleTextNode(textNode))
    .map(textNode => ({
      textNode,
      text: textNode.textContent.replace(/\s+/g, ' ').trim(),
      mode: getTranslationMode(textNode)
    }))
    .filter(item => isMeaningfulText(item.text));
}

function isInViewport(textNode) {
  const rect = textNode.parentElement.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom > 0;
}

function sortQueueByViewport(run) {
  run.queue.sort((a, b) => Number(isInViewport(b.textNode)) - Number(isInViewport(a.textNode)));
}

function translateBatch(items, requestId) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'translate-batch',
      texts: items.map(item => item.text),
      hostname: location.hostname,
      requestId
    }, response => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: 'runtime_error', message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function injectTranslation(item, translation) {
  const { textNode, mode } = item;
  if (!textNode.isConnected || !textNode.parentNode) return false;

  const id = `t${pageRunGeneration}-${requestSequence}`;
  translationResultByNode.get(textNode)?.remove();

  const result = document.createElement('span');
  result.setAttribute(RESULT_ATTR, id);
  result.setAttribute('data-translate-online-mode', mode);
  result.setAttribute('translate', 'no');
  result.textContent = translation;
  if (!isHltvSite) {
    const sourceColor = getComputedStyle(textNode.parentElement).color;
    result.style.setProperty('color', sourceColor, 'important');
  }
  textNode.parentNode.insertBefore(result, textNode.nextSibling);
  translationResultByNode.set(textNode, result);
  return true;
}

function processPageRun(run) {
  if (!isCurrentPageRun(pageRun, run)) return;
  sortQueueByViewport(run);

  while (run.activeRequestIds.size < MAX_CONCURRENT_BATCHES && run.queue.length > 0) {
    const batch = takeTranslationBatch(run.queue, MAX_BATCH_ITEMS, MAX_BATCH_CHARACTERS);
    const requestId = nextRequestId('page', run.generation);
    run.activeRequestIds.add(requestId);
    processPageBatch(run, batch, requestId);
  }

  if (
    run.activeRequestIds.size === 0 &&
    run.pendingRetryCount === 0 &&
    run.queue.length === 0 &&
    !run.completed
  ) {
    run.completed = true;
    if (run.successCount > 0) {
      setBallState(BALL_STATES.DONE);
    } else if (run.skippedCount > 0) {
      setBallState(BALL_STATES.IDLE);
      showPageToast('当前页面内容已是目标语言，无需重复翻译');
    } else {
      const message = '页面内容未能完成翻译，请检查网络或翻译设置';
      setBallState(BALL_STATES.ERROR, message);
      showPageToast(message);
    }
  }
}

function scheduleRateLimitRetries(run, items) {
  if (!items.length) return;
  run.pendingRetryCount += items.length;
  setTimeout(() => {
    if (!isCurrentPageRun(pageRun, run)) return;
    run.pendingRetryCount -= items.length;
    run.queue.unshift(...items);
    processPageRun(run);
  }, RATE_LIMIT_RETRY_DELAY);
}

async function processPageBatch(run, batch, requestId) {
  const retryItems = [];
  try {
    const response = await translateBatch(batch, requestId);
    if (!isCurrentPageRun(pageRun, run)) return;

    const results = response?.success && Array.isArray(response.results)
      ? response.results
      : batch.map(() => response);

    for (let index = 0; index < batch.length; index += 1) {
      const item = batch[index];
      const result = results[index] || {
        success: false,
        error: 'missing_result',
        message: '翻译服务未返回对应结果'
      };

      if (result.success && result.skipped) {
        run.skippedCount += 1;
      } else if (result.success) {
        if (injectTranslation(item, result.text)) run.successCount += 1;
      } else if (
        result.error === 'rate_limited' &&
        (item.rateLimitRetries || 0) < MAX_RATE_LIMIT_RETRIES
      ) {
        item.rateLimitRetries = (item.rateLimitRetries || 0) + 1;
        retryItems.push(item);
      } else if (result.error === 'unauthorized') {
        const message = 'API Key 无效，请检查设置';
        showPageToast(message);
        cancelPageTranslation(true);
        setBallState(BALL_STATES.ERROR, message);
        return;
      } else if (result.error !== 'cancelled') {
        processedTextNodes.delete(item.textNode);
      }
    }
  } catch (error) {
    if (!error.message?.includes('context invalidated')) {
      console.warn('[Translate Online] 翻译页面内容时出错:', error);
    }
    batch.forEach(item => processedTextNodes.delete(item.textNode));
  } finally {
    if (!isCurrentPageRun(pageRun, run)) return;
    run.activeRequestIds.delete(requestId);
    scheduleRateLimitRetries(run, retryItems);
    processPageRun(run);
  }
}

function clearPageTranslations() {
  stopPageMutationObserver();
  document.querySelectorAll(`[${RESULT_ATTR}]`).forEach(element => element.remove());
  document.querySelectorAll(`[${ORIGINAL_ATTR}]`).forEach(element => element.removeAttribute(ORIGINAL_ATTR));
  document.querySelectorAll(`[${STATE_ATTR}]`).forEach(element => element.removeAttribute(STATE_ATTR));
  processedTextNodes = new WeakSet();
  translationResultByNode = new WeakMap();
  pageTranslationEnabled = false;
  showPageTranslations = true;
}

function cancelPageTranslation(removeResults) {
  if (pageRun) {
    sendCancelRequests(cancelPageRun(pageRun));
    pageRun = null;
  }
  if (removeResults) clearPageTranslations();
  setBallState(BALL_STATES.IDLE);
}

function startPageTranslation() {
  clearPageTranslations();
  const items = collectTranslationItems();
  if (!items.length) {
    showPageToast('当前页面没有可翻译的正文内容');
    return;
  }

  pageTranslationEnabled = true;
  showPageTranslations = true;
  startPageMutationObserver();
  setBallState(BALL_STATES.LOADING);
  queueTranslationItems(items);
}

function toggleAllTranslations() {
  showPageTranslations = !showPageTranslations;
  document.querySelectorAll(`[${RESULT_ATTR}]`).forEach(element => {
    element.hidden = !showPageTranslations;
  });
  setBallState(BALL_STATES.DONE, '', false);
}

function queueTranslationItems(items) {
  const pending = items.filter(item => !processedTextNodes.has(item.textNode));
  if (!pending.length) return false;
  pending.forEach(item => processedTextNodes.add(item.textNode));

  if (!pageRun || pageRun.cancelled || pageRun.completed) {
    pageRunGeneration += 1;
    pageRun = createPageRun(pending, pageRunGeneration);
  } else {
    pageRun.queue.push(...pending);
    pageRun.completed = false;
  }

  setBallState(BALL_STATES.LOADING);
  processPageRun(pageRun);
  return true;
}

function isExtensionMutationNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  return node.hasAttribute(RESULT_ATTR) ||
    node.hasAttribute('data-translate-online-ui') ||
    !!node.closest(`[${RESULT_ATTR}], [data-translate-online-ui]`);
}

function scheduleIncrementalTranslation() {
  clearTimeout(mutationScanTimer);
  mutationScanTimer = setTimeout(() => {
    if (!pageTranslationEnabled) return;
    queueTranslationItems(collectTranslationItems());
  }, 300);
}

function startPageMutationObserver() {
  stopPageMutationObserver();
  pageMutationObserver = new MutationObserver(mutations => {
    let shouldScan = false;

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const textNode = mutation.target;
        translationResultByNode.get(textNode)?.remove();
        translationResultByNode.delete(textNode);
        processedTextNodes.delete(textNode);
        shouldScan = true;
        continue;
      }

      if ([...mutation.addedNodes].some(node => !isExtensionMutationNode(node))) {
        shouldScan = true;
      }
    }

    if (shouldScan) scheduleIncrementalTranslation();
  });
  pageMutationObserver.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function stopPageMutationObserver() {
  clearTimeout(mutationScanTimer);
  mutationScanTimer = null;
  pageMutationObserver?.disconnect();
  pageMutationObserver = null;
}

function checkUrlChange() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  closePopup();
  cancelPageTranslation(true);
}

window.addEventListener('popstate', checkUrlChange);
window.addEventListener('hashchange', checkUrlChange);
setInterval(checkUrlChange, 1000);
