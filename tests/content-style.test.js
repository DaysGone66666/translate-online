const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contentScript = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content-script.js'),
  'utf8'
);
const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'manifest.json'),
  'utf8'
));

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

test('keeps the pet fully draggable and supports optional edge docking', () => {
  const toolbarStyle = contentScript.match(
    /\[data-translate-online-ui="floating-toolbar"\] \{([\s\S]*?)\n\}/
  );
  const petStageStyle = contentScript.match(
    /\.to-toolbar-pet-stage \{([\s\S]*?)\n\}/
  );

  assert.ok(toolbarStyle, 'floating toolbar style must exist');
  assert.ok(petStageStyle, 'pet stage style must exist');
  assert.doesNotMatch(toolbarStyle[1], /background:/);
  assert.doesNotMatch(toolbarStyle[1], /padding:/);
  assert.doesNotMatch(toolbarStyle[1], /border:/);
  assert.match(contentScript, /data-translate-online-ui="floating-toolbar"/);
  assert.match(contentScript, /data-toolbar-action="translate"/);
  assert.match(contentScript, /data-toolbar-action="sidebar"/);
  assert.match(contentScript, /data-toolbar-action="settings"/);
  assert.doesNotMatch(contentScript, /data-toolbar-drag-handle/);
  assert.match(contentScript, /width:\s*72px/);
  assert.match(contentScript, /height:\s*192px/);
  assert.doesNotMatch(contentScript, /right:\s*-32px/);
  assert.match(contentScript, /left:\s*calc\(100vw - 84px\)/);
  assert.match(contentScript, /data-dock="left"/);
  assert.match(contentScript, /data-dock="right"/);
  assert.match(contentScript, /TOOLBAR_DOCK_TRIGGER_DISTANCE/);
  assert.match(contentScript, /TOOLBAR_DOCK_VISIBLE_WIDTH/);
  assert.match(contentScript, /getDockedToolbarLeft/);
  assert.match(contentScript, /getToolbarDockSide/);
  assert.match(contentScript, /\.to-toolbar-pet-card\s*\{/);
  assert.match(contentScript, /--pet-drag-rotate/);
  assert.match(contentScript, /--pet-drag-shift-x/);
  assert.match(contentScript, /--pet-drag-shift-y/);
  assert.match(contentScript, /--pet-state-rotate/);
  assert.match(contentScript, /--pet-state-shift-x/);
  assert.match(contentScript, /--pet-state-shift-y/);
  assert.match(contentScript, /--pet-state-scale/);
  assert.match(contentScript, /--pet-eye-closed-opacity/);
  assert.match(contentScript, /--pet-mouth-open-opacity/);
  assert.match(contentScript, /\[data-toolbar-action="settings"\]\s*\{[\s\S]*top:\s*152px/);
  assert.match(contentScript, /name:\s*'body'/);
  assert.match(contentScript, /name:\s*'eye-closed'/);
  assert.match(contentScript, /name:\s*'mouth-open'/);
  assert.match(contentScript, /data-pet-part="\$\{part\.name\}"/);
  assert.match(contentScript, /class="to-toolbar-bubble"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(contentScript, /\.to-toolbar-action\s*\{[\s\S]*opacity:\s*0/);
  assert.match(contentScript, /avatarButton\.addEventListener\('pointerenter'/);
  assert.doesNotMatch(contentScript, /\[data-translate-online-ui="floating-toolbar"\]:hover/);
  assert.match(petStageStyle[1], /transition:\s*transform 0\.3s ease,\s*filter 0\.25s ease/);
  assert.match(contentScript, /\.to-toolbar-pet-card\s*\{[\s\S]*transform-origin:\s*center bottom/);
  assert.match(contentScript, /\.to-toolbar-pet-card\s*\{[\s\S]*transform:\s*translate3d\(calc\(var\(--pet-drag-shift-x,\s*0px\)\s*\+\s*var\(--pet-state-shift-x,\s*0px\)\),\s*calc\(var\(--pet-drag-shift-y,\s*0px\)\s*\+\s*var\(--pet-state-shift-y,\s*0px\)\),\s*0\)/);
  assert.match(contentScript, /\.to-toolbar-pet-card\s*\{[\s\S]*rotate\(calc\(var\(--pet-drag-rotate,\s*0deg\)\s*\+\s*var\(--pet-state-rotate,\s*0deg\)\)\)/);
  assert.match(contentScript, /\.to-toolbar-pet-card\s*\{[\s\S]*scale\(var\(--pet-drag-scale,\s*1\)\)\s*scale\(var\(--pet-state-scale,\s*1\)\)/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-dragging="true"\] \.to-toolbar-pet-card \{[\s\S]*animation:\s*none/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-dock="left"\]\[data-open="true"\][\s\S]*transform:\s*translateX\(\$\{TOOLBAR_DOCK_REVEAL_OFFSET\}px\)/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-dock="right"\]\[data-open="true"\][\s\S]*transform:\s*translateX\(-\$\{TOOLBAR_DOCK_REVEAL_OFFSET\}px\)/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-dock="left"\] \.to-toolbar-bubble \{[\s\S]*left:\s*calc\(100% \+ 10px\)/);
});

test('uses compressed local pet states with fallback and reduced-motion styling', () => {
  for (const assetName of [
    'rem-rig-body.png',
    'rem-rig-head-back.png',
    'rem-rig-face-base.png',
    'rem-rig-front-hair.png',
    'rem-rig-hair-accessory.png',
    'rem-rig-eye-closed.png',
    'rem-rig-mouth-open.png'
  ]) {
    assert.match(contentScript, new RegExp(`images/pet/${assetName.replace('.', '\\.')}`));
    const assetPath = path.join(__dirname, '..', 'images', 'pet', assetName);
    assert.ok(fs.existsSync(assetPath), `${assetName} must exist`);
    assert.ok(fs.statSync(assetPath).size < 500000, `${assetName} must stay below 500KB`);
  }

  assert.doesNotMatch(contentScript, /images\/pet\/rem-idle\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-hover-lite\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-loading\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-success\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-error\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-sleep\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-tap-react\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-blink\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-talk-open\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-talk-close\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-drag\.webp/);
  assert.doesNotMatch(contentScript, /images\/pet\/rem-hover\.webp/);
  assert.match(contentScript, /@keyframes translate-online-pet-float/);
  assert.match(
    contentScript,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/
  );
  assert.ok(
    manifest.web_accessible_resources.some(entry =>
      entry.resources.includes('images/pet/*')
    ),
    'manifest must expose derived pet resources'
  );
});

test('drags from the avatar and distinguishes dragging from opening the sidebar', () => {
  assert.match(contentScript, /pointerdown/);
  assert.match(contentScript, /pointermove/);
  assert.match(contentScript, /pointerup/);
  assert.match(contentScript, /setupToolbarDragging\(avatarButton\)/);
  assert.match(contentScript, /preloadPetImages\(\)/);
  assert.match(contentScript, /suppressAvatarClick/);
  assert.match(contentScript, /PET_SLEEP_DELAY/);
  assert.match(contentScript, /PET_TALK_FRAME_DURATION/);
  assert.match(contentScript, /PET_TAP_REACTION_DURATION/);
  assert.match(contentScript, /speakingFrame/);
  assert.match(contentScript, /dragging:\s*ballEl\.dataset\.dragging === 'true'/);
  assert.match(contentScript, /STORAGE_KEYS\.FLOATING_TOOLBAR_LEFT/);
  assert.match(contentScript, /clampToolbarTop/);
  assert.match(contentScript, /clampToolbarLeft/);
  assert.match(contentScript, /getToolbarDockSide/);
  assert.match(contentScript, /getDockedToolbarLeft/);
  assert.match(contentScript, /STORAGE_KEYS\.FLOATING_TOOLBAR_TOP/);
  assert.match(contentScript, /chrome\.storage\.local\.set/);
  assert.match(contentScript, /function setPetDragMotion\(dragOffsetX,\s*dragOffsetY\)/);
  assert.match(contentScript, /function resetPetDragMotion\(\)/);
  assert.match(contentScript, /function setPetStateMotion\(motion\)/);
  assert.match(contentScript, /function resetPetStateMotion\(\)/);
  assert.match(contentScript, /function getPetStateMotionPreset\(visualState\)/);
  assert.match(contentScript, /function applyPetStateMotion\(visualState\)/);
  assert.match(contentScript, /const PET_RIG_PARTS = Object\.freeze\(/);
  assert.match(contentScript, /function buildPetRigMarkup\(\)/);
  assert.match(contentScript, /function getPetExpressionPreset\(visualState\)/);
  assert.match(contentScript, /function resetPetRigExpression\(\)/);
  assert.match(contentScript, /function applyPetRigExpression\(visualState\)/);
  assert.match(contentScript, /setPetDragMotion\(event\.clientX - toolbarDrag\.startX,\s*event\.clientY - toolbarDrag\.startY\)/);
  assert.match(contentScript, /resetPetDragMotion\(\);/);
  assert.match(contentScript, /delete ballEl\.dataset\.dock/);
  assert.match(contentScript, /ballEl\.dataset\.dock = dockSide/);
});

test('does not replay success feedback when only toggling translated text visibility', () => {
  assert.match(
    contentScript,
    /function toggleAllTranslations\(\)[\s\S]*setBallState\(BALL_STATES\.DONE,\s*'',\s*false\)/
  );
});

test('keeps expanded hover on the continuous hover-lite pose instead of auto-playing talk frames', () => {
  assert.match(contentScript, /function syncPetAmbientTimers\(\)/);
  assert.match(
    contentScript,
    /function syncPetAmbientTimers\(\) \{[\s\S]*if \(canRunExpandedPetAmbientAnimation\(\)\) \{[\s\S]*return;\s*\}/
  );
  assert.doesNotMatch(contentScript, /schedulePetTalkLoop\(\);/);
  assert.doesNotMatch(contentScript, /runPetDragSequence/);
});

test('smooths non-drag pet states through code-driven motion presets', () => {
  assert.match(contentScript, /const PET_STATE_MOTION_PRESETS = Object\.freeze\(/);
  assert.match(contentScript, /const PET_TALK_MOTION_PRESETS = Object\.freeze\(/);
  assert.match(contentScript, /const PET_BLINK_MOTION_PRESETS = Object\.freeze\(/);
  assert.match(contentScript, /startsWith\('talk-'\)/);
  assert.match(contentScript, /startsWith\('blink-'\)/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\.idle/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\['hover-lite'\]/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\['tap-react'\]/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\.loading/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\.success/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\.error/);
  assert.match(contentScript, /PET_STATE_MOTION_PRESETS\.sleep/);
  assert.match(contentScript, /applyPetStateMotion\(presentation\.visualState\);/);
  assert.match(contentScript, /--pet-float-duration/);
  assert.match(contentScript, /--pet-float-lift/);
  assert.match(contentScript, /--pet-float-sway/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-visual-state="hover-lite"\] \{[\s\S]*--pet-float-duration:\s*2\.6s/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-visual-state="hover-lite"\] \{[\s\S]*--pet-float-lift:\s*7px/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-visual-state="hover-lite"\] \{[\s\S]*--pet-float-sway:\s*1\.2px/);
  assert.match(contentScript, /animation:\s*translate-online-pet-float var\(--pet-float-duration,\s*4\.2s\) ease-in-out infinite/);
  assert.match(contentScript, /\[data-translate-online-ui="floating-toolbar"\]\[data-visual-state="hover-lite"\] \.to-toolbar-pet-stage \{[\s\S]*animation:\s*translate-online-pet-hover-breathe var\(--pet-float-duration,\s*2\.6s\) ease-in-out infinite/);
  assert.match(contentScript, /@keyframes translate-online-pet-hover-breathe/);
});
