# Translate Online — Edge 划词翻译扩展设计规格

> 历史设计文档。当前权限、存储、快捷键和请求生命周期以
> `docs/superpowers/specs/2026-06-07-reliability-accessibility-design.md` 为准。

## 概述

一款面向 Edge 浏览器（Chromium 扩展）的划词翻译工具。默认使用免费公共翻译 API（无需配置，开箱即用），用户也可自行配置 DeepSeek API Key 获得更高质量的翻译。支持浮窗快速翻译和侧边栏翻译历史两种展示模式。

## 产品形态

- **平台**: Edge 浏览器（Chromium 扩展，MV3）
- **翻译引擎**: 
  - **默认** — 免费公共翻译 API（如 LibreTranslate / MyMemory，无需 Key）
  - **可选** — DeepSeek API（用户自配 API Key，翻译质量更高）
- **引擎选择**: 用户在设置页中切换，选择后实时生效
- **展示方式**: 浮窗（popup）+ 侧边栏（sidebar）
- **触发方式**: 划词自动翻译 + 快捷键 Alt+T + 右键菜单

## 架构

### 方案选择：Service Worker 中继架构

内容脚本只负责 UI 交互，所有 API 调用通过 Service Worker 转发，API Key 不暴露到网页上下文。

```
划词 → content-script → message → service-worker →─→ 免费公共 API (无 Key 时默认)
                              ↓                     └→ DeepSeek API (配置了 Key 时)
浮窗 ← content-script ← message ←
```

引擎选择逻辑在 service-worker 中处理：检测到用户配置了 DeepSeek API Key 时优先使用；否则回退到免费公共 API。用户也可在设置页手动固定引擎。

### 项目结构

```
translate-online/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── service-worker.js    # 后台服务线程，API 中转
│   ├── content-script.js    # 划词检测 + 浮窗管理
│   ├── popup.js             # 浮窗 UI
│   ├── popup.css
│   ├── sidebar.html         # 侧边栏入口
│   ├── sidebar.js
│   ├── sidebar.css
│   ├── options.html         # 设置页
│   ├── options.js
│   └── options.css
```

## 数据流

### 划词翻译
1. content-script 监听 mouseup，检测用户选中非空文本
2. 发送消息到 service-worker: `{type: "translate", text, targetLang: "中文"}`
3. service-worker 判断引擎选择：
   - 如果配置了 DeepSeek Key 且引擎设为 DeepSeek → 调用 DeepSeek Chat Completions API
   - 否则 → 调用免费公共翻译 API（如 LibreTranslate / MyMemory）
4. 结果返回 content-script，在选区附近渲染浮窗

### 侧边栏
1. 浮窗上点击 ☰ 图标，通知 service-worker 打开 sidePanel
2. 侧边栏翻译请求同样通过 service-worker 转发
3. 翻译历史通过 chrome.storage.local 共享

## UI 设计

### 浮窗（简洁卡片）
- 简洁卡片样式，原文在上、译文在下
- 右下角有朗读（🔊）和打开侧边栏（☰）按钮
- 自动定位在选中文本下方，空间不足时显示在上方
- 失去焦点或按 ESC 时自动关闭
- 选中后 0.3s 延迟防误触

### 侧边栏（对话式）
- 每条记录显示原文 → 译文，带语言标签（EN/中文）
- 从上到下按时间排列，最新在最上方
- 切换页面不关闭侧边栏（chrome.sidePanel 原生行为）
- 底部输入框支持手动输入文本翻译
- 翻译历史持久化到 chrome.storage.local

### 设置页（独立选项页）
- **翻译引擎**：选择"免费引擎（无需配置）"或"DeepSeek（需 API Key）"
- DeepSeek API Key 输入（masked password，仅在选定 DeepSeek 时显示）
- 模型选择（默认 deepseek-chat，仅 DeepSeek 模式）
- 目标语言设置（默认中文简体）
- 触发方式开关（划词自动翻译 / 快捷键 / 右键菜单）
- 测试连接按钮验证 API Key 有效性
- 保存到 chrome.storage.sync
- 引擎切换实时生效，无需重启扩展

## 错误处理

- API 不可用：浮窗显示"翻译失败"提示
- 401：提示 API Key 无效
- 429：提示请求过于频繁
- 空文本或空白字符：不触发翻译
- 超长文本（>2000 字符）：截断并提示
- 浮窗超出视口：自动调整位置
- 未配置 Key 且引擎设为 DeepSeek：浮窗提示"未配置 API Key，请在设置中配置或切换为免费引擎"，并提供跳转链接
- Key 在界面上始终以 mask 形式显示
- 免费引擎限频时（429）：提示"免费引擎请求频繁，请稍后重试或切换为 DeepSeek"

## 边界情况

- 首次安装：开箱即用，无需任何配置即可通过免费引擎翻译。DeepSeek 设置可选
- 侧边栏关闭后：再次点击浮窗的 ☰ 可重新打开
- 语言方向：默认为自动检测源语言 → 中文，用户可在侧边栏手动切换
- 引擎切换：设置页切换引擎后，service-worker 立即使用新引擎，无需重启扩展
