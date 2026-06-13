const fs = require('node:fs');
const path = require('node:path');
const { PROVIDERS } = require('../src/providers.js');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const fixedHostPermissions = manifest.host_permissions || [];

if (!fixedHostPermissions.includes('https://api.mymemory.translated.net/*')) {
  console.error('Manifest 必须保留 MyMemory 固定主机权限');
  process.exitCode = 1;
}
if (fixedHostPermissions.includes('https://api.deepseek.com/*')) {
  console.error('DeepSeek 必须使用按需主机权限，不能保留固定权限');
  process.exitCode = 1;
}

const forbiddenSvgContent = [
  { pattern: /<script\b/i, description: 'script element' },
  { pattern: /https?:\/\//i, description: 'remote URL' },
  { pattern: /(^|[^:])\/\/[^\s/]/i, description: 'protocol-relative URL' },
  { pattern: /@import/i, description: 'CSS import' },
  { pattern: /url\s*\(/i, description: 'CSS URL' },
  { pattern: /\son[a-z][\w:.-]*\s*=/i, description: 'event handler attribute' },
  { pattern: /<!DOCTYPE\b/i, description: 'DOCTYPE declaration' },
  { pattern: /<!ENTITY\b/i, description: 'ENTITY declaration' },
  { pattern: /<foreignObject\b/i, description: 'foreignObject element' },
  { pattern: /<(?:image|use)\b/i, description: 'external resource element' },
  { pattern: /\s(?:href|xlink:href)\s*=/i, description: 'resource reference attribute' }
];

const providerIconPaths = [];
for (const provider of Object.values(PROVIDERS)) {
  if (/^https?:\/\//i.test(provider.icon)) {
    console.error(`供应商 ${provider.id} 的图标必须是本地文件: ${provider.icon}`);
    process.exitCode = 1;
    continue;
  }

  const iconPath = path.resolve(root, 'src', provider.icon);
  const relativeIconPath = path.relative(root, iconPath);
  const escapesRoot = (
    relativeIconPath === '..' ||
    relativeIconPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeIconPath)
  );
  if (escapesRoot) {
    console.error(`供应商 ${provider.id} 的图标路径超出项目根目录: ${provider.icon}`);
    process.exitCode = 1;
    continue;
  }

  providerIconPaths.push(relativeIconPath);
  if (!fs.existsSync(iconPath)) {
    continue;
  }

  const svg = fs.readFileSync(iconPath, 'utf8');
  if (
    !/<svg\b/i.test(svg) ||
    !/<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/i.test(svg) ||
    !/\bviewBox\s*=/i.test(svg)
  ) {
    console.error(`供应商 ${provider.id} 的图标不是带 namespace 和 viewBox 的 SVG: ${provider.icon}`);
    process.exitCode = 1;
  }
  const contentWithoutSvgNamespace = svg.replace(
    /\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/i,
    ''
  );
  for (const { pattern, description } of forbiddenSvgContent) {
    if (pattern.test(contentWithoutSvgNamespace)) {
      console.error(`供应商 ${provider.id} 的图标包含不安全的 ${description}: ${provider.icon}`);
      process.exitCode = 1;
    }
  }
}

const referencedPaths = [
  'src/providers.js',
  'src/provider-adapters.js',
  'src/glossary.js',
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.side_panel.default_path,
  manifest.options_page,
  ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css]),
  ...Object.values(manifest.icons),
  ...providerIconPaths,
  'images/providers/SOURCES.md'
];

const missing = referencedPaths.filter(relativePath =>
  !fs.existsSync(path.resolve(root, relativePath))
);

if (missing.length) {
  console.error(`项目引用了不存在的文件:\n${missing.join('\n')}`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(`Manifest 和供应商资源检查通过，共验证 ${referencedPaths.length} 个文件引用。`);
}
