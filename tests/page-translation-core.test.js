const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cancelPageRun,
  collectTranslatableTextNodes,
  createPageRun,
  findTranslationTarget,
  getPageBallPresentation,
  getTranslationMode,
  isCurrentPageRun,
  isMeaningfulText,
  takeTranslationBatch
} = require('../src/page-translation-core.js');

function makeElement(tagName, parentElement = null, attributes = {}) {
  return {
    tagName,
    parentElement,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    }
  };
}

function makeText(textContent, parentElement) {
  return { textContent, parentElement };
}

test('keeps separate leaf text nodes as separate translation targets', () => {
  const body = makeElement('BODY');
  const paragraph = makeElement('P', body);
  const strong = makeElement('STRONG', paragraph);
  const nodes = [
    makeText('Hello world', paragraph),
    makeText('world from a nested span', strong)
  ];

  assert.equal(findTranslationTarget(nodes[1], body), nodes[1]);
  assert.deepEqual(collectTranslatableTextNodes(nodes, body), nodes);
});

test('translates navigation and buttons while skipping code and extension UI', () => {
  const body = makeElement('BODY');
  const nav = makeElement('NAV', body);
  const button = makeElement('BUTTON', body);
  const code = makeElement('CODE', body);
  const noTranslate = makeElement('P', body, { translate: 'no' });
  const extensionUi = makeElement('DIV', body, { 'data-translate-online-ui': '' });

  const navText = makeText('Stats', nav);
  const buttonText = makeText('Live', button);
  assert.equal(findTranslationTarget(navText, body), navText);
  assert.equal(findTranslationTarget(buttonText, body), buttonText);
  assert.equal(findTranslationTarget(makeText('const value = 1', code), body), null);
  assert.equal(findTranslationTarget(makeText('Do not translate this', noTranslate), body), null);
  assert.equal(findTranslationTarget(makeText('Translate button', extensionUi), body), null);
});

test('recognizes direct article text and skips editable content', () => {
  const body = makeElement('BODY');
  const article = makeElement('ARTICLE', body);
  const editable = makeElement('DIV', body, { contenteditable: '' });
  const articleText = makeText('Direct article introduction', article);

  assert.equal(findTranslationTarget(articleText, body), articleText);
  assert.equal(findTranslationTarget(makeText('User is editing this text', editable), body), null);
});

test('accepts short labels while rejecting numeric and identifier-like text', () => {
  assert.equal(isMeaningfulText('Readable paragraph'), true);
  assert.equal(isMeaningfulText('Live'), true);
  assert.equal(isMeaningfulText('Stats'), true);
  assert.equal(isMeaningfulText('0.44'), false);
  assert.equal(isMeaningfulText('16:00'), false);
  assert.equal(isMeaningfulText('G2'), false);
  assert.equal(isMeaningfulText('   '), false);
});

test('uses inline translations for compact controls and block translations for long text', () => {
  const body = makeElement('BODY');
  const nav = makeElement('NAV', body);
  const link = makeElement('A', nav);
  const paragraph = makeElement('P', body);
  const shortDiv = makeElement('DIV', body);
  const longDiv = makeElement('DIV', body);

  assert.equal(getTranslationMode(makeText('Overview', link)), 'inline');
  assert.equal(getTranslationMode(makeText('Short label', shortDiv)), 'inline');
  assert.equal(getTranslationMode(makeText('A long news headline that needs its own translated line', longDiv)), 'block');
  assert.equal(getTranslationMode(makeText('Paragraph copy', paragraph)), 'block');
});

test('keeps page translation runs isolated and returns active requests when cancelled', () => {
  const oldRun = createPageRun([{ id: 'old' }], 1);
  const currentRun = createPageRun([{ id: 'new' }], 2);
  oldRun.activeRequestIds.add('page-1-1');
  oldRun.activeRequestIds.add('page-1-2');

  assert.equal(isCurrentPageRun(currentRun, oldRun), false);
  assert.equal(currentRun.successCount, 0);
  assert.equal(currentRun.completed, false);
  assert.deepEqual(cancelPageRun(oldRun), ['page-1-1', 'page-1-2']);
  assert.equal(oldRun.cancelled, true);
  assert.deepEqual(oldRun.queue, []);
});

test('describes the floating page button for every translation state', () => {
  assert.deepEqual(getPageBallPresentation('idle', true), {
    label: '翻译页面',
    ariaLabel: '翻译当前页面'
  });
  assert.deepEqual(getPageBallPresentation('loading', true), {
    label: '取消',
    ariaLabel: '取消页面翻译'
  });
  assert.deepEqual(getPageBallPresentation('done', true), {
    label: '原文',
    ariaLabel: '隐藏译文'
  });
  assert.deepEqual(getPageBallPresentation('done', false), {
    label: '译文',
    ariaLabel: '显示译文'
  });
});

test('takes a bounded translation batch while preserving queue order', () => {
  const queue = [
    { id: 'first', text: 'a'.repeat(10) },
    { id: 'second', text: 'b'.repeat(10) },
    { id: 'third', text: 'c'.repeat(10) }
  ];

  assert.deepEqual(
    takeTranslationBatch(queue, 2, 100).map(item => item.id),
    ['first', 'second']
  );
  assert.deepEqual(queue.map(item => item.id), ['third']);
});

test('always takes the first item and stops before exceeding the character limit', () => {
  const queue = [
    { id: 'large', text: 'a'.repeat(30) },
    { id: 'next', text: 'b'.repeat(10) }
  ];

  assert.deepEqual(
    takeTranslationBatch(queue, 10, 20).map(item => item.id),
    ['large']
  );
  assert.deepEqual(queue.map(item => item.id), ['next']);
});
