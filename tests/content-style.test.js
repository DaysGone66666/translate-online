const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contentScript = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content-script.js'),
  'utf8'
);

test('keeps injected page translations visually lightweight', () => {
  const styleBlock = contentScript.match(
    /\[data-translate-online-result\] \{([\s\S]*?)\n\}/
  );

  assert.ok(styleBlock, 'translation result style must exist');
  assert.doesNotMatch(styleBlock[1], /(?:^|\n)\s*width:\s*100%/);
  assert.doesNotMatch(styleBlock[1], /background:/);
  assert.doesNotMatch(styleBlock[1], /box-shadow:/);
  assert.doesNotMatch(styleBlock[1], /border-radius:/);
  assert.match(styleBlock[1], /color:\s*inherit/);
  assert.match(styleBlock[1], /opacity:\s*0\.82/);
  assert.match(styleBlock[1], /font-weight:\s*inherit/);
});

test('uses an HLTV-only cyan translation theme while other sites follow source colors', () => {
  assert.match(contentScript, /const isHltvSite = location\.hostname === 'hltv\.org' \|\| location\.hostname\.endsWith\('\.hltv\.org'\)/);
  assert.match(contentScript, /data-translate-online-site-theme/);
  assert.match(contentScript, /\[data-translate-online-site-theme="hltv"\] \[data-translate-online-result\]/);
  assert.match(contentScript, /color:\s*#00c896\s*!important/);
  assert.match(contentScript, /getComputedStyle\(textNode\.parentElement\)\.color/);
  assert.match(contentScript, /if \(!isHltvSite\)[\s\S]*result\.style\.setProperty\('color',\s*sourceColor,\s*'important'\)/);
});

test('inserts translations beside their source text and observes dynamic content', () => {
  assert.match(contentScript, /insertBefore\(result,\s*textNode\.nextSibling\)/);
  assert.doesNotMatch(contentScript, /block\.appendChild\(result\)/);
  assert.match(contentScript, /new MutationObserver\(/);
  assert.match(contentScript, /collectTranslatableTextNodes/);
});

test('translates page text through bounded batch requests', () => {
  assert.match(contentScript, /type:\s*'translate-batch'/);
  assert.match(contentScript, /takeTranslationBatch/);
  assert.match(contentScript, /hostname:\s*location\.hostname/);
});

test('skips same-language page results instead of inserting the source text again', () => {
  assert.match(contentScript, /result\.skipped/);
  assert.match(contentScript, /start-page-translation-command/);
});

test('keeps only a small half-hidden avatar visible until the avatar is hovered', () => {
  const toolbarStyle = contentScript.match(
    /\[data-translate-online-ui="floating-toolbar"\] \{([\s\S]*?)\n\}/
  );

  assert.ok(toolbarStyle, 'floating toolbar style must exist');
  assert.doesNotMatch(toolbarStyle[1], /background:/);
  assert.doesNotMatch(toolbarStyle[1], /padding:/);
  assert.doesNotMatch(toolbarStyle[1], /border:/);
  assert.match(contentScript, /data-translate-online-ui="floating-toolbar"/);
  assert.match(contentScript, /data-toolbar-action="translate"/);
  assert.match(contentScript, /data-toolbar-action="sidebar"/);
  assert.match(contentScript, /data-toolbar-action="settings"/);
  assert.doesNotMatch(contentScript, /data-toolbar-drag-handle/);
  assert.match(contentScript, /width:\s*36px/);
  assert.match(contentScript, /right:\s*-18px/);
  assert.match(contentScript, /\.to-toolbar-avatar\s*\{[\s\S]*width:\s*32px/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-open="true"\]/);
  assert.match(contentScript, /\.to-toolbar-action\s*\{[\s\S]*opacity:\s*0/);
  assert.match(contentScript, /avatarButton\.addEventListener\('pointerenter'/);
  assert.doesNotMatch(contentScript, /\[data-translate-online-ui="floating-toolbar"\]:hover/);
});

test('drags from the avatar and distinguishes dragging from opening the sidebar', () => {
  assert.match(contentScript, /pointerdown/);
  assert.match(contentScript, /pointermove/);
  assert.match(contentScript, /pointerup/);
  assert.match(contentScript, /setupToolbarDragging\(avatarButton\)/);
  assert.match(contentScript, /suppressAvatarClick/);
  assert.match(contentScript, /clampToolbarTop/);
  assert.match(contentScript, /STORAGE_KEYS\.FLOATING_TOOLBAR_TOP/);
  assert.match(contentScript, /chrome\.storage\.local\.set/);
});
