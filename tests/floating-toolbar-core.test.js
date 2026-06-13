const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampToolbarTop,
  hasDragDistance
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
