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
  clampToolbarLeft,
  clampToolbarTop,
  getDockedToolbarLeft,
  getPetPresentation,
  getToolbarDockSide,
  hasDragDistance
} = TranslateOnlineFloatingToolbarCore;

const BALL_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  DONE: 'done',
  ERROR: 'error'
});
const PET_RIG_BASE_SIZE = Object.freeze({
  width: 1024,
  height: 1536
});
const PET_RIG_PARTS = Object.freeze([
  Object.freeze({
    name: 'body',
    path: 'images/pet/rem-rig-body.png',
    x: 292,
    y: 618,
    width: 484,
    height: 794
  }),
  Object.freeze({
    name: 'head-back',
    path: 'images/pet/rem-rig-head-back.png',
    x: 197,
    y: 98,
    width: 634,
    height: 599
  }),
  Object.freeze({
    name: 'face-base',
    path: 'images/pet/rem-rig-face-base.png',
    x: 345,
    y: 313,
    width: 405,
    height: 390
  }),
  Object.freeze({
    name: 'front-hair',
    path: 'images/pet/rem-rig-front-hair.png',
    x: 197,
    y: 105,
    width: 517,
    height: 614
  }),
  Object.freeze({
    name: 'hair-accessory',
    path: 'images/pet/rem-rig-hair-accessory.png',
    x: 523,
    y: 256,
    width: 308,
    height: 381
  }),
  Object.freeze({
    name: 'eye-closed',
    path: 'images/pet/rem-rig-eye-closed.png',
    x: 459,
    y: 374,
    width: 249,
    height: 227
  }),
  Object.freeze({
    name: 'mouth-open',
    path: 'images/pet/rem-rig-mouth-open.png',
    x: 380,
    y: 507,
    width: 220,
    height: 196
  })
]);
const ORIGINAL_ATTR = 'data-translate-online-original';
const RESULT_ATTR = 'data-translate-online-result';
const STATE_ATTR = 'data-translate-online-state';
const MAX_CONCURRENT_BATCHES = 2;
const MAX_BATCH_ITEMS = 12;
const MAX_BATCH_CHARACTERS = 1600;
const MAX_RATE_LIMIT_RETRIES = 1;
const RATE_LIMIT_RETRY_DELAY = 1500;
const TOOLBAR_WIDTH = 72;
const TOOLBAR_PET_HEIGHT = 96;
const TOOLBAR_ACTION_SIZE = 40;
const TOOLBAR_ACTION_GAP = 8;
const TOOLBAR_PET_TOP = TOOLBAR_ACTION_SIZE + TOOLBAR_ACTION_GAP;
const TOOLBAR_SETTINGS_TOP = TOOLBAR_PET_TOP + TOOLBAR_PET_HEIGHT + TOOLBAR_ACTION_GAP;
const TOOLBAR_HEIGHT = TOOLBAR_SETTINGS_TOP + TOOLBAR_ACTION_SIZE;
const TOOLBAR_VIEWPORT_MARGIN = 12;
const TOOLBAR_DOCK_VISIBLE_WIDTH = 40;
const TOOLBAR_DOCK_TRIGGER_DISTANCE = 80;
const TOOLBAR_DOCK_REVEAL_OFFSET =
  TOOLBAR_VIEWPORT_MARGIN + (TOOLBAR_WIDTH - TOOLBAR_DOCK_VISIBLE_WIDTH);
const TOOLBAR_CLOSE_DELAY = 220;
const PET_BLINK_DELAY = 12000;
const PET_BLINK_FRAME_DURATION = 90;
const PET_TALK_INITIAL_DELAY = 1200;
const PET_TALK_FRAME_DURATION = 320;
const PET_DRAG_MAX_ROTATION = 12;
const PET_DRAG_MAX_SHIFT_X = 6;
const PET_DRAG_MAX_SHIFT_Y = 7;
const PET_DRAG_BASE_SCALE = 1.06;
const PET_DRAG_EXTRA_SCALE = 0.04;
const PET_STATE_MOTION_PRESETS = Object.freeze({
  idle: Object.freeze({ rotate: 0, shiftX: 0, shiftY: 0, scale: 1 }),
  'hover-lite': Object.freeze({ rotate: -1.6, shiftX: 0, shiftY: -3.2, scale: 1.026 }),
  loading: Object.freeze({ rotate: -1.2, shiftX: 0.5, shiftY: -3.5, scale: 1.05 }),
  success: Object.freeze({ rotate: -3.5, shiftX: 0, shiftY: -6, scale: 1.095 }),
  error: Object.freeze({ rotate: 4.4, shiftX: 2.6, shiftY: -1.2, scale: 1.02 }),
  sleep: Object.freeze({ rotate: 6.2, shiftX: -1.4, shiftY: 4.2, scale: 0.985 }),
  'tap-react': Object.freeze({ rotate: -5.4, shiftX: 3.2, shiftY: -4.4, scale: 1.09 })
});
const PET_TALK_MOTION_PRESETS = Object.freeze({
  'talk-01': Object.freeze({ rotate: -0.6, shiftX: 0, shiftY: -0.8, scale: 1.025 }),
  'talk-02': Object.freeze({ rotate: -1.1, shiftX: 0.2, shiftY: -1.8, scale: 1.038 }),
  'talk-03': Object.freeze({ rotate: -1.8, shiftX: 0.4, shiftY: -3.2, scale: 1.055 }),
  'talk-04': Object.freeze({ rotate: -1.2, shiftX: 0.2, shiftY: -2.1, scale: 1.04 }),
  'talk-05': Object.freeze({ rotate: -0.5, shiftX: 0, shiftY: -1, scale: 1.026 })
});
const PET_BLINK_MOTION_PRESETS = Object.freeze({
  'blink-01': Object.freeze({ rotate: 0, shiftX: 0, shiftY: 0, scale: 1 }),
  'blink-02': Object.freeze({ rotate: 0.5, shiftX: 0, shiftY: 0.5, scale: 0.996 }),
  'blink-03': Object.freeze({ rotate: 0.9, shiftX: 0, shiftY: 1.4, scale: 0.992 }),
  'blink-04': Object.freeze({ rotate: 0.4, shiftX: 0, shiftY: 0.7, scale: 0.996 }),
  'blink-05': Object.freeze({ rotate: 0, shiftX: 0, shiftY: 0.1, scale: 1 })
});
const PET_TAP_REACTION_DURATION = 720;
const PET_SLEEP_DELAY = 45000;
const PET_FEEDBACK_DURATION = 3600;
const PET_BLINK_SEQUENCE = Object.freeze([
  'blink-01',
  'blink-02',
  'blink-03',
  'blink-04',
  'blink-05'
]);
const PET_TALK_SEQUENCE = Object.freeze([
  'talk-01',
  'talk-02',
  'talk-03',
  'talk-04',
  'talk-05'
]);
const PET_BLINK_EXPRESSION_PRESETS = Object.freeze({
  'blink-01': Object.freeze({ eyeClosedOpacity: 0, eyeClosedScaleY: 0.98 }),
  'blink-02': Object.freeze({ eyeClosedOpacity: 0.42, eyeClosedScaleY: 0.99 }),
  'blink-03': Object.freeze({ eyeClosedOpacity: 1, eyeClosedScaleY: 1 }),
  'blink-04': Object.freeze({ eyeClosedOpacity: 0.42, eyeClosedScaleY: 0.99 }),
  'blink-05': Object.freeze({ eyeClosedOpacity: 0, eyeClosedScaleY: 0.98 })
});
const PET_TALK_EXPRESSION_PRESETS = Object.freeze({
  'talk-01': Object.freeze({ mouthOpenOpacity: 0.18, mouthOpenScale: 0.9, mouthOpenShiftY: 1.2 }),
  'talk-02': Object.freeze({ mouthOpenOpacity: 0.52, mouthOpenScale: 0.96, mouthOpenShiftY: 0.4 }),
  'talk-03': Object.freeze({ mouthOpenOpacity: 0.96, mouthOpenScale: 1, mouthOpenShiftY: 0 }),
  'talk-04': Object.freeze({ mouthOpenOpacity: 0.62, mouthOpenScale: 0.97, mouthOpenShiftY: 0.3 }),
  'talk-05': Object.freeze({ mouthOpenOpacity: 0.24, mouthOpenScale: 0.92, mouthOpenShiftY: 0.9 })
});
const PET_IDLE_EXPRESSION_PRESET = Object.freeze({
  eyeClosedOpacity: 0,
  eyeClosedScaleY: 0.98,
  mouthOpenOpacity: 0,
  mouthOpenScale: 0.9,
  mouthOpenShiftY: 1.2
});
const PET_SLEEP_EXPRESSION_PRESET = Object.freeze({
  eyeClosedOpacity: 1,
  eyeClosedScaleY: 1,
  mouthOpenOpacity: 0,
  mouthOpenScale: 0.9,
  mouthOpenShiftY: 1.2
});
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
let petErrorMessage = '';
let petBlinking = false;
let petBlinkFrame = '';
let petBlinkDelayTimer = null;
let petBlinkTimer = null;
let petTalkInitialTimer = null;
let petTalkFrameTimer = null;
let petSpeakingFrame = '';
let petSleepy = false;
let petSleepTimer = null;
let petTapReacting = false;
let petTapReactionTimer = null;
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
  clearPetTimers();
  toolbarCloseTimer = null;
  toolbarDrag = null;
  suppressAvatarClick = false;
  ballEl?.remove();
  ballEl = null;
}

function clearPetTimers() {
  clearTimeout(petBlinkDelayTimer);
  clearTimeout(petBlinkTimer);
  clearTimeout(petTalkInitialTimer);
  clearTimeout(petTalkFrameTimer);
  clearTimeout(petSleepTimer);
  clearTimeout(petTapReactionTimer);
  clearTimeout(petFeedbackTimer);
  petBlinkDelayTimer = null;
  petBlinkTimer = null;
  petTalkInitialTimer = null;
  petTalkFrameTimer = null;
  petSleepTimer = null;
  petTapReactionTimer = null;
  petFeedbackTimer = null;
  petBlinking = false;
  petBlinkFrame = '';
  petSpeakingFrame = '';
  petSleepy = false;
  petTapReacting = false;
}

function resetPetBlinkState() {
  clearTimeout(petBlinkDelayTimer);
  clearTimeout(petBlinkTimer);
  petBlinkDelayTimer = null;
  petBlinkTimer = null;
  petBlinking = false;
  petBlinkFrame = '';
}

function resetPetTalkState() {
  clearTimeout(petTalkInitialTimer);
  clearTimeout(petTalkFrameTimer);
  petTalkInitialTimer = null;
  petTalkFrameTimer = null;
  petSpeakingFrame = '';
}

function resetPetSleepState() {
  clearTimeout(petSleepTimer);
  petSleepTimer = null;
  petSleepy = false;
}

function resetPetTapReactionState() {
  clearTimeout(petTapReactionTimer);
  petTapReactionTimer = null;
  petTapReacting = false;
}

function canRunPetAmbientAnimation() {
  return !!ballEl &&
    ballState !== BALL_STATES.LOADING &&
    !petFeedbackState &&
    !petTapReacting;
}

function canRunCollapsedPetAmbientAnimation() {
  return canRunPetAmbientAnimation() &&
    ballEl.dataset.open !== 'true' &&
    ballEl.dataset.dragging !== 'true';
}

function canRunExpandedPetAmbientAnimation() {
  return canRunPetAmbientAnimation() &&
    ballEl.dataset.open === 'true' &&
    ballEl.dataset.dragging !== 'true';
}

function clampPetDragValue(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function setPetDragMotion(dragOffsetX, dragOffsetY) {
  if (!ballEl) return;
  const normalizedX = clampPetDragValue(dragOffsetX / 48, -1, 1);
  const normalizedY = clampPetDragValue(dragOffsetY / 72, -1, 1);
  const rotate = clampPetDragValue(
    normalizedX * PET_DRAG_MAX_ROTATION + normalizedY * 2.5,
    -PET_DRAG_MAX_ROTATION,
    PET_DRAG_MAX_ROTATION
  );
  const shiftX = clampPetDragValue(
    normalizedX * PET_DRAG_MAX_SHIFT_X,
    -PET_DRAG_MAX_SHIFT_X,
    PET_DRAG_MAX_SHIFT_X
  );
  const shiftY = clampPetDragValue(
    Math.abs(normalizedX) * 2 + Math.max(normalizedY, 0) * PET_DRAG_MAX_SHIFT_Y,
    -2,
    PET_DRAG_MAX_SHIFT_Y
  );
  const scale = PET_DRAG_BASE_SCALE + Math.abs(normalizedX) * PET_DRAG_EXTRA_SCALE;

  ballEl.style.setProperty('--pet-drag-rotate', `${rotate.toFixed(2)}deg`);
  ballEl.style.setProperty('--pet-drag-shift-x', `${shiftX.toFixed(2)}px`);
  ballEl.style.setProperty('--pet-drag-shift-y', `${shiftY.toFixed(2)}px`);
  ballEl.style.setProperty('--pet-drag-scale', scale.toFixed(3));
}

function resetPetDragMotion() {
  if (!ballEl) return;
  ballEl.style.setProperty('--pet-drag-rotate', '0deg');
  ballEl.style.setProperty('--pet-drag-shift-x', '0px');
  ballEl.style.setProperty('--pet-drag-shift-y', '0px');
  ballEl.style.setProperty('--pet-drag-scale', '1');
}

function setPetStateMotion(motion) {
  if (!ballEl) return;
  const stateMotion = motion || PET_STATE_MOTION_PRESETS.idle;
  ballEl.style.setProperty('--pet-state-rotate', `${Number(stateMotion.rotate || 0).toFixed(2)}deg`);
  ballEl.style.setProperty('--pet-state-shift-x', `${Number(stateMotion.shiftX || 0).toFixed(2)}px`);
  ballEl.style.setProperty('--pet-state-shift-y', `${Number(stateMotion.shiftY || 0).toFixed(2)}px`);
  ballEl.style.setProperty('--pet-state-scale', `${Number(stateMotion.scale || 1).toFixed(3)}`);
}

function resetPetStateMotion() {
  if (!ballEl) return;
  ballEl.style.setProperty('--pet-state-rotate', '0deg');
  ballEl.style.setProperty('--pet-state-shift-x', '0px');
  ballEl.style.setProperty('--pet-state-shift-y', '0px');
  ballEl.style.setProperty('--pet-state-scale', '1');
}

function getPetStateMotionPreset(visualState) {
  const value = String(visualState || '');
  if (value.startsWith('talk-')) {
    return PET_TALK_MOTION_PRESETS[value] || PET_TALK_MOTION_PRESETS['talk-01'];
  }
  if (value.startsWith('blink-')) {
    return PET_BLINK_MOTION_PRESETS[value] || PET_BLINK_MOTION_PRESETS['blink-01'];
  }
  if (value === 'hover-lite') return PET_STATE_MOTION_PRESETS['hover-lite'];
  if (value === 'tap-react') return PET_STATE_MOTION_PRESETS['tap-react'];
  if (value === 'loading') return PET_STATE_MOTION_PRESETS.loading;
  if (value === 'success') return PET_STATE_MOTION_PRESETS.success;
  if (value === 'error') return PET_STATE_MOTION_PRESETS.error;
  if (value === 'sleep') return PET_STATE_MOTION_PRESETS.sleep;
  return PET_STATE_MOTION_PRESETS.idle;
}

function applyPetStateMotion(visualState) {
  setPetStateMotion(getPetStateMotionPreset(visualState));
}

function getPetExpressionPreset(visualState) {
  const value = String(visualState || '');
  if (value.startsWith('blink-')) {
    return {
      ...PET_IDLE_EXPRESSION_PRESET,
      ...PET_BLINK_EXPRESSION_PRESETS[value]
    };
  }
  if (value.startsWith('talk-')) {
    return {
      ...PET_IDLE_EXPRESSION_PRESET,
      ...PET_TALK_EXPRESSION_PRESETS[value]
    };
  }
  if (value === 'sleep') return PET_SLEEP_EXPRESSION_PRESET;
  return PET_IDLE_EXPRESSION_PRESET;
}

function setPetRigExpression(expression) {
  if (!ballEl) return;
  const eyeClosedOpacity = Number(expression.eyeClosedOpacity || 0);
  const eyeClosedScaleY = Number(expression.eyeClosedScaleY || 1);
  const mouthOpenOpacity = Number(expression.mouthOpenOpacity || 0);
  const mouthOpenScale = Number(expression.mouthOpenScale || 1);
  const mouthOpenShiftY = Number(expression.mouthOpenShiftY || 0);

  ballEl.style.setProperty('--pet-eye-closed-opacity', eyeClosedOpacity.toFixed(3));
  ballEl.style.setProperty('--pet-eye-closed-scale-y', eyeClosedScaleY.toFixed(3));
  ballEl.style.setProperty('--pet-mouth-open-opacity', mouthOpenOpacity.toFixed(3));
  ballEl.style.setProperty('--pet-mouth-open-scale', mouthOpenScale.toFixed(3));
  ballEl.style.setProperty('--pet-mouth-open-shift-y', `${mouthOpenShiftY.toFixed(2)}px`);
}

function resetPetRigExpression() {
  setPetRigExpression(PET_IDLE_EXPRESSION_PRESET);
}

function applyPetRigExpression(visualState) {
  setPetRigExpression(getPetExpressionPreset(visualState));
}

function runPetBlinkSequence(index = 0) {
  if (!canRunCollapsedPetAmbientAnimation() || petSleepy) {
    resetPetBlinkState();
    refreshPetPresentation();
    return;
  }
  if (index >= PET_BLINK_SEQUENCE.length) {
    petBlinking = false;
    petBlinkFrame = '';
    refreshPetPresentation();
    schedulePetBlinkCycle();
    return;
  }
  petBlinking = true;
  petBlinkFrame = PET_BLINK_SEQUENCE[index];
  refreshPetPresentation();
  petBlinkTimer = setTimeout(() => {
    petBlinkTimer = null;
    runPetBlinkSequence(index + 1);
  }, PET_BLINK_FRAME_DURATION);
}

function schedulePetBlinkCycle() {
  resetPetBlinkState();
  if (!canRunCollapsedPetAmbientAnimation()) return;
  petBlinkDelayTimer = setTimeout(() => {
    petBlinkDelayTimer = null;
    if (!canRunCollapsedPetAmbientAnimation() || petSleepy) return;
    runPetBlinkSequence();
  }, PET_BLINK_DELAY);
}

function schedulePetSleepCycle() {
  resetPetSleepState();
  if (!canRunCollapsedPetAmbientAnimation()) return;
  petSleepTimer = setTimeout(() => {
    petSleepTimer = null;
    if (!canRunCollapsedPetAmbientAnimation()) return;
    resetPetBlinkState();
    petSleepy = true;
    refreshPetPresentation();
  }, PET_SLEEP_DELAY);
}

function runPetTalkSequence(index = 0) {
  if (!canRunExpandedPetAmbientAnimation()) {
    resetPetTalkState();
    refreshPetPresentation();
    return;
  }
  if (index >= PET_TALK_SEQUENCE.length) {
    petSpeakingFrame = '';
    refreshPetPresentation();
    return;
  }
  petSpeakingFrame = PET_TALK_SEQUENCE[index];
  refreshPetPresentation();
  petTalkFrameTimer = setTimeout(() => {
    petTalkFrameTimer = null;
    runPetTalkSequence(index + 1);
  }, PET_TALK_FRAME_DURATION);
}

function schedulePetTalkLoop(delay = PET_TALK_INITIAL_DELAY) {
  resetPetTalkState();
  if (!canRunExpandedPetAmbientAnimation()) return;
  petTalkInitialTimer = setTimeout(() => {
    petTalkInitialTimer = null;
    runPetTalkSequence();
  }, delay);
}

function syncPetAmbientTimers() {
  resetPetBlinkState();
  resetPetTalkState();
  resetPetSleepState();
  if (canRunExpandedPetAmbientAnimation()) {
    return;
  }
  if (canRunCollapsedPetAmbientAnimation()) {
    schedulePetBlinkCycle();
    schedulePetSleepCycle();
  }
}

function triggerPetTapReaction() {
  if (!ballEl || ballState === BALL_STATES.LOADING || petFeedbackState) return;
  resetPetTapReactionState();
  petTapReacting = true;
  refreshPetPresentation();
  petTapReactionTimer = setTimeout(() => {
    petTapReactionTimer = null;
    petTapReacting = false;
    syncPetAmbientTimers();
    refreshPetPresentation();
  }, PET_TAP_REACTION_DURATION);
}

function preloadPetImages() {
  for (const { path: relativePath } of PET_RIG_PARTS) {
    const image = new Image();
    image.decoding = 'async';
    image.src = chrome.runtime.getURL(relativePath);
  }
}

function buildPetRigMarkup() {
  return PET_RIG_PARTS.map(part => {
    const left = (part.x / PET_RIG_BASE_SIZE.width) * 100;
    const top = (part.y / PET_RIG_BASE_SIZE.height) * 100;
    const width = (part.width / PET_RIG_BASE_SIZE.width) * 100;
    const height = (part.height / PET_RIG_BASE_SIZE.height) * 100;
    const source = chrome.runtime.getURL(part.path);
    return `
        <img
          class="to-toolbar-pet-part"
          data-pet-part="${part.name}"
          src="${source}"
          style="left:${left.toFixed(6)}%;top:${top.toFixed(6)}%;width:${width.toFixed(6)}%;height:${height.toFixed(6)}%;"
          alt="">
    `;
  }).join('');
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
  --pet-drag-rotate: 0deg;
  --pet-drag-shift-x: 0px;
  --pet-drag-shift-y: 0px;
  --pet-drag-scale: 1;
  --pet-state-rotate: 0deg;
  --pet-state-shift-x: 0px;
  --pet-state-shift-y: 0px;
  --pet-state-scale: 1;
  --pet-float-duration: 4.2s;
  --pet-float-lift: 3px;
  --pet-float-lift-half: 1.5px;
  --pet-float-sway: 0px;
  --pet-float-sway-half: 0px;
  left: calc(100vw - 84px);
  top: calc(50% - 96px);
  width: 72px;
  height: 192px;
  z-index: 2147483646;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
  transition: transform 0.22s ease;
}
[data-translate-online-ui="floating-toolbar"][data-visual-state="hover-lite"] {
  --pet-float-duration: 2.6s;
  --pet-float-lift: 7px;
  --pet-float-lift-half: 4px;
  --pet-float-sway: 1.2px;
  --pet-float-sway-half: 0.6px;
}
[data-translate-online-ui="floating-toolbar"][data-dock="left"][data-open="true"],
[data-translate-online-ui="floating-toolbar"][data-dock="left"]:focus-within {
  transform: translateX(${TOOLBAR_DOCK_REVEAL_OFFSET}px);
}
[data-translate-online-ui="floating-toolbar"][data-dock="right"][data-open="true"],
[data-translate-online-ui="floating-toolbar"][data-dock="right"]:focus-within {
  transform: translateX(-${TOOLBAR_DOCK_REVEAL_OFFSET}px);
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-action {
  box-sizing: border-box;
  appearance: none;
  position: absolute;
  left: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
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
  top: 0;
  color: #dcecff;
  transform: translateY(8px) scale(0.84);
}
[data-translate-online-ui="floating-toolbar"] [data-toolbar-action="sidebar"] {
  top: 48px;
  left: 0;
  width: 72px;
  height: 96px;
  border: 0;
  border-radius: 0;
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
  top: 152px;
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
  overflow: visible;
  width: 72px;
  height: 96px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform-origin: center bottom;
  transform: translate3d(calc(var(--pet-drag-shift-x, 0px) + var(--pet-state-shift-x, 0px)), calc(var(--pet-drag-shift-y, 0px) + var(--pet-state-shift-y, 0px)), 0) rotate(calc(var(--pet-drag-rotate, 0deg) + var(--pet-state-rotate, 0deg))) scale(var(--pet-drag-scale, 1)) scale(var(--pet-state-scale, 1));
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
  animation: translate-online-pet-float var(--pet-float-duration, 4.2s) ease-in-out infinite;
}
[data-translate-online-ui="floating-toolbar"][data-dragging="true"] .to-toolbar-pet-card {
  animation: none;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-stage {
  position: absolute;
  inset: 5px 5px 4px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  filter: drop-shadow(0 3px 8px rgba(15,23,42,0.32));
  transform: scale(1.02);
  transition: transform 0.3s ease, filter 0.25s ease;
}
[data-translate-online-ui="floating-toolbar"][data-open="true"] .to-toolbar-pet-stage,
[data-translate-online-ui="floating-toolbar"]:focus-within .to-toolbar-pet-stage {
  transform: scale(1.05);
}
[data-translate-online-ui="floating-toolbar"][data-visual-state="hover-lite"] .to-toolbar-pet-stage {
  animation: translate-online-pet-hover-breathe var(--pet-float-duration, 2.6s) ease-in-out infinite;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-rig {
  position: relative;
  display: block;
  height: 100%;
  max-width: 100%;
  aspect-ratio: 1024 / 1536;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-part {
  position: absolute;
  display: block;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-part[data-pet-part="eye-closed"] {
  opacity: var(--pet-eye-closed-opacity, 0);
  transform-origin: center center;
  transform: scaleY(var(--pet-eye-closed-scale-y, 1));
  transition: opacity 0.11s ease, transform 0.11s ease;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-part[data-pet-part="mouth-open"] {
  opacity: var(--pet-mouth-open-opacity, 0);
  transform-origin: center center;
  transform: translate3d(0, var(--pet-mouth-open-shift-y, 0px), 0) scale(var(--pet-mouth-open-scale, 1));
  transition: opacity 0.11s ease, transform 0.11s ease;
}
[data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-shine {
  display: none;
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
[data-translate-online-ui="floating-toolbar"][data-dock="left"] .to-toolbar-bubble {
  left: calc(100% + 10px);
  right: auto;
  border-radius: 12px 12px 12px 3px;
  transform: translateX(-8px);
}
[data-translate-online-ui="floating-toolbar"][data-visual-state="loading"] .to-toolbar-pet-stage {
  filter: drop-shadow(0 3px 8px rgba(15,23,42,0.32)) drop-shadow(0 0 12px rgba(125,211,252,0.55));
  animation: translate-online-rem-pulse 1s ease-in-out infinite alternate;
}
[data-translate-online-ui="floating-toolbar"][data-visual-state="error"] .to-toolbar-pet-stage {
  filter: drop-shadow(0 3px 8px rgba(15,23,42,0.32)) drop-shadow(0 0 10px rgba(244,63,94,0.42));
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
  0%, 100% {
    transform: translate3d(calc(var(--pet-drag-shift-x, 0px) + var(--pet-state-shift-x, 0px)), calc(var(--pet-drag-shift-y, 0px) + var(--pet-state-shift-y, 0px)), 0) rotate(calc(var(--pet-drag-rotate, 0deg) + var(--pet-state-rotate, 0deg))) scale(var(--pet-drag-scale, 1)) scale(var(--pet-state-scale, 1));
  }
  25% {
    transform: translate3d(calc(var(--pet-drag-shift-x, 0px) + var(--pet-state-shift-x, 0px) + var(--pet-float-sway-half, 0px)), calc(var(--pet-drag-shift-y, 0px) + var(--pet-state-shift-y, 0px) - var(--pet-float-lift-half, 0px)), 0) rotate(calc(var(--pet-drag-rotate, 0deg) + var(--pet-state-rotate, 0deg))) scale(var(--pet-drag-scale, 1)) scale(var(--pet-state-scale, 1));
  }
  50% {
    transform: translate3d(calc(var(--pet-drag-shift-x, 0px) + var(--pet-state-shift-x, 0px) + var(--pet-float-sway, 0px)), calc(var(--pet-drag-shift-y, 0px) + var(--pet-state-shift-y, 0px) - var(--pet-float-lift, 0px)), 0) rotate(calc(var(--pet-drag-rotate, 0deg) + var(--pet-state-rotate, 0deg))) scale(var(--pet-drag-scale, 1)) scale(var(--pet-state-scale, 1));
  }
  75% {
    transform: translate3d(calc(var(--pet-drag-shift-x, 0px) + var(--pet-state-shift-x, 0px) - var(--pet-float-sway-half, 0px)), calc(var(--pet-drag-shift-y, 0px) + var(--pet-state-shift-y, 0px) - var(--pet-float-lift-half, 0px)), 0) rotate(calc(var(--pet-drag-rotate, 0deg) + var(--pet-state-rotate, 0deg))) scale(var(--pet-drag-scale, 1)) scale(var(--pet-state-scale, 1));
  }
}
@keyframes translate-online-pet-hover-breathe {
  0%, 100% {
    transform: scale(1.05);
  }
  50% {
    transform: scale(1.075);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-translate-online-ui="floating-toolbar"],
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-action,
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-card,
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-stage,
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-part,
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-bubble { transition: none; }
  [data-translate-online-ui="floating-toolbar"] .to-toolbar-pet-card,
  [data-translate-online-ui="floating-toolbar"][data-visual-state="loading"] .to-toolbar-pet-stage { animation: none; }
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
  preloadPetImages();
  ballEl = document.createElement('div');
  ballEl.setAttribute('data-translate-online-ui', 'floating-toolbar');
  ballEl.setAttribute('aria-label', '翻译悬浮工具条');
  const petRigMarkup = buildPetRigMarkup();
  ballEl.innerHTML = `
    <button class="to-toolbar-action" data-toolbar-action="translate" type="button">
      <span aria-hidden="true">译</span>
    </button>
    <div class="to-toolbar-bubble" role="status" aria-live="polite"></div>
    <button class="to-toolbar-action" data-toolbar-action="sidebar" type="button" aria-label="打开翻译记录">
      <span class="to-toolbar-pet-card" aria-hidden="true">
        <span class="to-toolbar-pet-stage">
          <span class="to-toolbar-pet-rig">${petRigMarkup}</span>
        </span>
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
  const petParts = ballEl.querySelectorAll('.to-toolbar-pet-part');

  petErrorMessage = '';
  petBlinking = false;
  petBlinkFrame = '';
  petSpeakingFrame = '';
  petSleepy = false;
  petTapReacting = false;
  petFeedbackState = '';
  resetPetDragMotion();
  resetPetStateMotion();
  resetPetRigExpression();
  petParts.forEach(image => {
    image.addEventListener('error', () => {
      image.remove();
    });
  });

  avatarButton.addEventListener('pointerenter', openToolbarMenu);
  translateButton.addEventListener('pointerenter', cancelToolbarClose);
  settingsButton.addEventListener('pointerenter', cancelToolbarClose);
  avatarButton.addEventListener('pointerleave', scheduleToolbarClose);
  translateButton.addEventListener('pointerleave', scheduleToolbarClose);
  settingsButton.addEventListener('pointerleave', scheduleToolbarClose);
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
    triggerPetTapReaction();
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
  loadToolbarPosition();
  setBallState(BALL_STATES.IDLE);
}

function refreshPetPresentation() {
  if (!ballEl) return;
  const businessState = ballState === BALL_STATES.LOADING
    ? BALL_STATES.LOADING
    : petFeedbackState || BALL_STATES.IDLE;
  const presentation = getPetPresentation({
    businessState,
    expanded: ballEl.dataset.open === 'true',
    blinking: petBlinking,
    blinkFrame: petBlinkFrame,
    dragging: ballEl.dataset.dragging === 'true',
    tapping: petTapReacting,
    sleepy: petSleepy,
    speakingFrame: petSpeakingFrame,
    errorMessage: petErrorMessage
  });
  const bubble = ballEl.querySelector('.to-toolbar-bubble');

  ballEl.dataset.visualState = presentation.visualState;
  bubble.textContent = presentation.bubble;
  bubble.dataset.visible = String(!!presentation.bubble);
  applyPetStateMotion(presentation.visualState);
  applyPetRigExpression(presentation.visualState);
}

function resetPetBlinkTimer() {
  syncPetAmbientTimers();
}

function cancelToolbarClose() {
  clearTimeout(toolbarCloseTimer);
  toolbarCloseTimer = null;
}

function openToolbarMenu() {
  cancelToolbarClose();
  if (!ballEl) return;
  ballEl.dataset.open = 'true';
  resetPetBlinkTimer();
  refreshPetPresentation();
}

function scheduleToolbarClose() {
  cancelToolbarClose();
  toolbarCloseTimer = setTimeout(() => {
    toolbarCloseTimer = null;
    if (!ballEl || ballEl.dataset.dragging === 'true' || ballEl.matches(':focus-within')) return;
    delete ballEl.dataset.open;
    refreshPetPresentation();
    resetPetBlinkTimer();
  }, TOOLBAR_CLOSE_DELAY);
}

function blurMouseActivatedButton(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

function setBallState(state, errorMessage = '', showFeedback = true) {
  ballState = state;
  if (!ballEl) return;
  resetPetBlinkState();
  resetPetTalkState();
  resetPetSleepState();
  resetPetTapReactionState();
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
      syncPetAmbientTimers();
    }, PET_FEEDBACK_DURATION);
  } else {
    syncPetAmbientTimers();
  }
}

function setToolbarDock(dockSide) {
  if (!ballEl) return '';
  if (dockSide === 'left' || dockSide === 'right') {
    ballEl.dataset.dock = dockSide;
    return dockSide;
  }
  delete ballEl.dataset.dock;
  return '';
}

function detectStoredToolbarDockSide(left) {
  if (!Number.isFinite(left)) return '';
  const maxLeft = window.innerWidth - TOOLBAR_WIDTH - TOOLBAR_VIEWPORT_MARGIN;
  if (left < TOOLBAR_VIEWPORT_MARGIN) return 'left';
  if (left > maxLeft) return 'right';
  return '';
}

function setToolbarLeft(left, dockSide = '') {
  if (!ballEl) return 0;
  if (dockSide === 'left' || dockSide === 'right') {
    const dockedLeft = getDockedToolbarLeft(
      dockSide,
      window.innerWidth,
      TOOLBAR_WIDTH,
      TOOLBAR_DOCK_VISIBLE_WIDTH
    );
    ballEl.style.left = `${dockedLeft}px`;
    return dockedLeft;
  }
  const clampedLeft = clampToolbarLeft(
    left,
    window.innerWidth,
    TOOLBAR_WIDTH,
    TOOLBAR_VIEWPORT_MARGIN
  );
  ballEl.style.left = `${clampedLeft}px`;
  return clampedLeft;
}

function setToolbarTop(top) {
  if (!ballEl) return 0;
  const clampedTop = clampToolbarTop(
    top,
    window.innerHeight,
    TOOLBAR_HEIGHT,
    TOOLBAR_VIEWPORT_MARGIN
  );
  ballEl.style.top = `${clampedTop}px`;
  return clampedTop;
}

function loadToolbarPosition() {
  chrome.storage.local.get([
    STORAGE_KEYS.FLOATING_TOOLBAR_LEFT,
    STORAGE_KEYS.FLOATING_TOOLBAR_TOP
  ], items => {
    if (!ballEl || chrome.runtime.lastError) return;
    const savedLeft = Number(items[STORAGE_KEYS.FLOATING_TOOLBAR_LEFT]);
    const savedTop = Number(items[STORAGE_KEYS.FLOATING_TOOLBAR_TOP]);
    const defaultLeft = window.innerWidth - TOOLBAR_WIDTH - TOOLBAR_VIEWPORT_MARGIN;
    const defaultTop = (window.innerHeight - TOOLBAR_HEIGHT) / 2;
    const dockSide = detectStoredToolbarDockSide(savedLeft);
    setToolbarDock(dockSide);
    setToolbarLeft(Number.isFinite(savedLeft) ? savedLeft : defaultLeft, dockSide);
    setToolbarTop(Number.isFinite(savedTop) ? savedTop : defaultTop);
  });
}

function saveToolbarPosition() {
  if (!ballEl) return;
  const dockSide = ballEl.dataset.dock || '';
  const left = setToolbarLeft(Number.parseFloat(ballEl.style.left), dockSide);
  const top = setToolbarTop(Number.parseFloat(ballEl.style.top));
  chrome.storage.local.set({
    [STORAGE_KEYS.FLOATING_TOOLBAR_LEFT]: left,
    [STORAGE_KEYS.FLOATING_TOOLBAR_TOP]: top
  });
}

function setupToolbarDragging(handle) {
  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !ballEl) return;
    event.preventDefault();
    cancelToolbarClose();
    openToolbarMenu();
    suppressAvatarClick = false;
    const rect = ballEl.getBoundingClientRect();
    toolbarDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false
    };
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
    if (ballEl.dataset.dragging !== 'true') {
      ballEl.dataset.dragging = 'true';
      syncPetAmbientTimers();
      refreshPetPresentation();
    }
    setPetDragMotion(event.clientX - toolbarDrag.startX, event.clientY - toolbarDrag.startY);
    delete ballEl.dataset.dock;
    suppressAvatarClick = true;
    setToolbarLeft(toolbarDrag.startLeft + event.clientX - toolbarDrag.startX);
    setToolbarTop(toolbarDrag.startTop + event.clientY - toolbarDrag.startY);
    event.preventDefault();
  });

  const finishDrag = event => {
    if (!toolbarDrag || event.pointerId !== toolbarDrag.pointerId) return;
    const moved = toolbarDrag.moved;
    if (moved && ballEl) {
      const currentLeft = Number.parseFloat(ballEl.style.left);
      const dockSide = getToolbarDockSide(
        currentLeft,
        window.innerWidth,
        TOOLBAR_WIDTH,
        TOOLBAR_VIEWPORT_MARGIN,
        TOOLBAR_DOCK_TRIGGER_DISTANCE
      );
      setToolbarDock(dockSide);
      setToolbarLeft(currentLeft, dockSide);
      saveToolbarPosition();
    }
    toolbarDrag = null;
    if (ballEl) {
      delete ballEl.dataset.dragging;
      resetPetDragMotion();
      refreshPetPresentation();
      syncPetAmbientTimers();
    }
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
  const dockSide = ballEl.dataset.dock || '';
  setToolbarLeft(
    Number.parseFloat(ballEl.style.left) || ballEl.getBoundingClientRect().left,
    dockSide
  );
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
