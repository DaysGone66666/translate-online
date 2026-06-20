const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampToolbarLeft,
  clampToolbarTop,
  getDockedToolbarLeft,
  getPetPresentation,
  getToolbarDockSide,
  hasDragDistance,
  truncatePetMessage
} = require('../src/floating-toolbar-core.js');

const ASK_TO_TRANSLATE = '\u9700\u8981\u7ffb\u8bd1\u5417\uff1f';
const TRANSLATING = '\u6b63\u5728\u7ffb\u8bd1...';
const TRANSLATION_DONE = '\u7ffb\u8bd1\u5b8c\u6210';
const INVALID_API_KEY = 'API Key \u65e0\u6548';
const NETWORK_ERROR = '\u7f51\u7edc\u9519\u8bef';
const LONG_ERROR_MESSAGE =
  '\u7ffb\u8bd1\u670d\u52a1\u8fd4\u56de\u4e86\u4e00\u4e2a\u975e\u5e38\u957f\u5e76\u4e14\u4e0d\u9002\u5408\u653e\u8fdb\u6c14\u6ce1\u4e2d\u7684\u9519\u8bef\u6d88\u606f';
const LONG_ERROR_MESSAGE_TRUNCATED =
  '\u7ffb\u8bd1\u670d\u52a1\u8fd4\u56de\u4e86\u4e00\u4e2a\u975e\u5e38\u2026';

test('keeps the floating toolbar inside the viewport', () => {
  assert.equal(clampToolbarLeft(-20, 1280, 64), 12);
  assert.equal(clampToolbarLeft(300, 1280, 64), 300);
  assert.equal(clampToolbarLeft(1240, 1280, 64), 1204);
  assert.equal(clampToolbarTop(-30, 800, 220), 12);
  assert.equal(clampToolbarTop(300, 800, 220), 300);
  assert.equal(clampToolbarTop(760, 800, 220), 568);
  assert.equal(clampToolbarTop(50, 180, 220), 12);
});

test('starts dragging only after the pointer clears the movement threshold', () => {
  assert.equal(hasDragDistance(10, 10, 13, 13), false);
  assert.equal(hasDragDistance(10, 10, 16, 10), true);
});

test('detects near-edge docking and computes exact half-hidden positions', () => {
  assert.equal(getToolbarDockSide(12, 1280, 72), 'left');
  assert.equal(getToolbarDockSide(48, 1280, 72), 'left');
  assert.equal(getToolbarDockSide(604, 1280, 72), '');
  assert.equal(getToolbarDockSide(1196, 1280, 72), 'right');
  assert.equal(getToolbarDockSide(1120, 1280, 72), 'right');
  assert.equal(getDockedToolbarLeft('left', 1280, 72), -32);
  assert.equal(getDockedToolbarLeft('right', 1280, 72), 1240);
  assert.equal(getDockedToolbarLeft('', 1280, 72), null);
});

test('maps toolbar business and interaction states to exact pet presentations', () => {
  assert.deepEqual(
    getPetPresentation({ businessState: 'idle' }),
    { visualState: 'idle', bubble: '' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      expanded: true
    }),
    { visualState: 'hover-lite', bubble: ASK_TO_TRANSLATE }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      expanded: true,
      speakingFrame: 'talk-03'
    }),
    { visualState: 'hover-lite', bubble: ASK_TO_TRANSLATE }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      expanded: true,
      speakingFrame: 'talk-05'
    }),
    { visualState: 'hover-lite', bubble: ASK_TO_TRANSLATE }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      dragging: true,
      dragFrame: 'drag-03'
    }),
    { visualState: 'idle', bubble: '' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      tapping: true
    }),
    { visualState: 'tap-react', bubble: '' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      sleepy: true
    }),
    { visualState: 'sleep', bubble: '' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      blinking: true,
      blinkFrame: 'blink-03'
    }),
    { visualState: 'blink-03', bubble: '' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'loading',
      expanded: true,
      blinking: true,
      dragging: true,
      tapping: true,
      speakingFrame: 'talk-open',
      sleepy: true
    }),
    { visualState: 'loading', bubble: TRANSLATING }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'done',
      expanded: true
    }),
    { visualState: 'success', bubble: TRANSLATION_DONE }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'error',
      errorMessage: INVALID_API_KEY
    }),
    { visualState: 'error', bubble: INVALID_API_KEY }
  );
});

test('limits pet error messages without changing short messages', () => {
  assert.equal(truncatePetMessage(NETWORK_ERROR, 12), NETWORK_ERROR);
  assert.equal(
    truncatePetMessage(LONG_ERROR_MESSAGE, 12),
    LONG_ERROR_MESSAGE_TRUNCATED
  );
});
