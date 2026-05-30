# Translate Online — 页面一键翻译设计规格

## 概述

在现有划词翻译插件基础上，新增"页面一键翻译"功能。用户点击页面右侧吸附小球，整页文本自动翻译并以双语对照模式展示。翻译引擎沿用用户当前设置（免费 MyMemory 或 DeepSeek）。

## 触发机制

- **浮动小球**：页面右侧垂直居中位置，吸附在右边缘的半圆角标签
- 宽 36px，高 60px，圆角在左侧，右侧平直贴合屏幕边缘
- `position: fixed`，不随页面滚动

### 三态切换

| 状态 | 颜色 | 文字 | 行为 |
|------|------|------|------|
| 未翻译 | 紫色渐变 (#667eea→#764ba2) | "译" | 点击开始翻译 |
| 翻译中 | 橙色渐变 (#f39c12→#e67e22) | 旋转箭头 ⟳ | 点击无操作 |
| 已翻译 | 绿色渐变 (#27ae60→#2ecc71) | "原文" | 点击切换显示/隐藏译文 |

- 防抖 500ms，避免连续快速点击

## 翻译范围：智能过滤

使用 `document.createTreeWalker` 遍历页面文本节点，收集阶段自动跳过：

1. `<script>`、`<style>`、`<noscript>` 内的文本
2. 可见文本长度 ≤ 3 字符（按钮、标签等 UI 短文本）
3. 祖先有 `translate="no"` 属性的节点
4. 父节点是 `<code>`、`<pre>`、`<kbd>` 的代码块
5. 已标记 `data-to-translated` 的节点（避免重复）

## API 调用策略：视口优先 + 串行队列

```
收集文本节点 → IntersectionObserver 标记视口
                    │
              ┌─ 视口内 → 队列头部
              └─ 视口外 → 队列尾部
                    │
           串行逐个调用 API（一次一个）
                    │
              翻译完成 → 注入 DOM → 下一个
```

- `IntersectionObserver` 持续扫描：新进入视口的未翻译节点插队到队列头部
- 串行调用避免 MyMemory 429 限频；DeepSeek 也不会撞并发
- 每个节点翻译后打 `data-to-translated` 标记，Observers 停止监控该节点
- 滚动时不做节流——Observer 自身有触发频率控制
- SPA 路由变化时重置翻译状态

## 双语 DOM 注入

```
原文结构：
  <p>Hello world.</p>

翻译后：
  <p data-to-original="h_abc123">Hello world.</p>
  <p class="to-tr" data-to-src="h_abc123">你好世界。</p>
```

- 译文段落 `<p class="to-tr">` 紧跟原文段落之后
- 原文追加 `data-to-original`，译文追加 `data-to-src`，通过唯一 ID 关联
- 小球切换到"隐藏译文"模式时：所有 `.to-tr { display: none }`
- 小球切换到"显示译文"模式时：`display: block` 恢复
- 切换不触发新的 API 请求

## 复用现有通道

| 改动文件 | 改动内容 |
|----------|----------|
| `content-script.js` | +小球渲染、+文本节点收集、+串行翻译队列、+双语 DOM 注入、+切换逻辑 |
| `service-worker.js` | 无需改动（已有 `{type: "translate"}` 接口） |
| `manifest.json` | 无需新增权限 |

content-script 通过 `chrome.runtime.sendMessage({type:"translate", text})` 逐段调用现有翻译接口，引擎选择在 service-worker 中已有处理。

## 错误处理

| 场景 | 处理 |
|------|------|
| 免费引擎 429 限频 | 暂停队列 5 秒后自动重试，小球保持橙色旋转 |
| DeepSeek 401 Key 无效 | 弹出提示"API Key 无效"，小球恢复紫色 |
| 单个节点翻译失败 | 跳过该节点继续下一个，不阻塞队列 |
| 页面无文本 | 小球点击无响应，保持紫色 |
| 用户关闭页面 | 队列自然销毁，无残留 |
| SPA 路由切换 | 监听 URL 变化，重置所有翻译状态，小球恢复紫色 |
| 小球快速连击 | 500ms 防抖，避免重复触发队列 |

## 一期不做

- 小球拖拽调整位置
- 翻译结果持久化（页面刷新后需重新翻译）
- 快捷键触发页面翻译（可后续添加）
