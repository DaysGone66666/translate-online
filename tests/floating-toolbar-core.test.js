const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampToolbarTop,
  getPetPresentation,
  hasDragDistance,
  truncatePetMessage
} = require('../src/floating-toolbar-core.js');

test('keeps the floating toolbar inside the viewport', () => {
  assert.equal(clampToolbarTop(-30, 800, 220), 12);
  assert.equal(clampToolbarTop(300, 800, 220), 300);
  assert.equal(clampToolbarTop(760, 800, 220), 568);
  assert.equal(clampToolbarTop(50, 180, 220), 12);
});

test('starts dragging only after the pointer clears the movement threshold', () => {
  assert.equal(hasDragDistance(10, 10, 13, 13), false);
  assert.equal(hasDragDistance(10, 10, 16, 10), true);
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
    { visualState: 'hover', bubble: '需要翻译吗？' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'idle',
      idleAlt: true
    }),
    { visualState: 'idle-alt', bubble: '' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'loading',
      expanded: true,
      idleAlt: true
    }),
    { visualState: 'loading', bubble: '正在翻译...' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'done',
      expanded: true
    }),
    { visualState: 'success', bubble: '翻译完成' }
  );
  assert.deepEqual(
    getPetPresentation({
      businessState: 'error',
      errorMessage: 'API Key 无效'
    }),
    { visualState: 'error', bubble: 'API Key 无效' }
  );
});

test('limits pet error messages without changing short messages', () => {
  assert.equal(truncatePetMessage('网络错误', 12), '网络错误');
  assert.equal(
    truncatePetMessage('翻译服务返回了一个非常长并且不适合放进气泡中的错误消息', 12),
    '翻译服务返回了一个非常…'
  );
});
