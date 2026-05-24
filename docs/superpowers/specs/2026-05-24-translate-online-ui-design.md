# Translate Online — UI 美化设计规格

## 概述

为 Translate Online Edge 划词翻译扩展的三个核心组件（浮窗、侧边栏、设置页）进行视觉美化，采用二次元动漫图片作为背景，毛玻璃（Frosted Glass）作为核心设计语言，圆润活泼的视觉风格。

## 设计语言

| 属性 | 值 |
|------|-----|
| 风格 | 圆润活泼 · 毛玻璃（Frosted Glass） |
| 主色 | #2563EB（活力蓝） |
| 渐变 | linear-gradient(135deg, #2563EB, #1D4ED8) |
| 圆角 | 14-18px（卡片），8-10px（按钮/输入框） |
| 阴影 | 0 8px 32px rgba(0,0,0,0.15)（卡片层级） |
| 毛玻璃 | backdrop-filter: blur(12-20px) + rgba(255,255,255,0.75-0.88) |

### 背景图片分配

| 组件 | 图片 | 色调 | 用途 |
|------|------|------|------|
| 浮窗（Popup） | 图1 — 冷色忧郁少女（1204x1247） | 冷灰色调 | 氛围背景，与浮窗临时性匹配 |
| 侧边栏（Sidebar） | 图2 — 暖色温馨特写（2476x1141） | 暖橙色调 | 全屏背景，沉浸感 |
| 设置页（Options） | 图2 — 暖色温馨特写（2476x1141） | 暖橙色调 | 全屏背景，毛玻璃卡片居中 |

## 组件设计

### 1. 翻译浮窗（Popup）

**结构：**
- 全容器展示背景图片（brightness: 0.7 + 蓝色渐变叠加）
- 底部吸附式大面积毛玻璃卡片（backdrop-filter: blur(20px)）
- 卡片内容：语言标签 pill（渐变蓝）、原文、译文（浅蓝底）、操作按钮（🔊/☰）

**样式变更：**
- 圆角：8px → 16px（卡片）
- 背景：纯白 → rgba(255,255,255,0.75) + backdrop-filter
- 阴影：0 2px 12px → 0 8px 32px
- 译文区域：新增 rgba(37,99,235,0.06) 浅蓝底

### 2. 侧边栏（Sidebar）

**结构：**
- 全屏背景图片（brightness: 0.55 + 渐变色叠加 black 0.1→0.3）
- 标题栏半透明（带 T Logo 和操作按钮）
- 翻译条目：毛玻璃白色卡片（rgba(255,255,255,0.8) + blur(12px)）
- 底部输入区：半透明输入框 + 渐变蓝发送按钮（带阴影）

**样式变更：**
- 背景：纯白 → 全屏图片
- 条目卡片：纯白 → 毛玻璃（圆角14px，白色边框）
- 标题：白色字体 + 文字阴影
- 渐变蓝按钮添加 box-shadow 增强立体感
- 操作按钮添加半透明毛玻璃背景

### 3. 设置页（Options）

**结构：**
- 全屏背景图片（brightness: 0.6 + 浅蓝渐变叠加）
- 设置卡片居中，毛玻璃效果（rgba(255,255,255,0.85) + blur(20px)）
- 卡片圆角18px，带白色半透明边框

**样式变更：**
- 背景：纯灰 → 全屏图片
- 设置卡片：纯白 → 毛玻璃（圆角18px，大阴影）
- 保存按钮：渐变蓝 + 阴影增强
- 测试连接按钮：半透明白底 + 边框

## 材质规范

### 毛玻璃参数

```
/* 浮窗卡片 */
background: rgba(255, 255, 255, 0.75);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.4);
border-radius: 16px;

/* 侧边栏条目 */
background: rgba(255, 255, 255, 0.8);
backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.3);
border-radius: 14px;

/* 设置页卡片 */
background: rgba(255, 255, 255, 0.85);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.3);
border-radius: 18px;
```

### 图片处理

- 背景图片使用 CSS `background-size: cover; background-position: center`
- 使用 `filter: brightness(0.55-0.7)` 降低亮度和对比度，确保前景内容可读
- 叠加半透明渐变层，增强文字对比度
- 图片不随内容滚动（fixed 或 absolute 铺满）

## 实现范围

仅修改 CSS 文件，不涉及 HTML 结构调整或 JavaScript 逻辑变更：
- `src/popup.css` — 浮窗样式重写
- `src/sidebar.css` — 侧边栏样式重写
- `src/options.css` — 设置页样式重写

图片资源：
- `icons/屏幕截图 2024-11-29 201507.png` → 复制到 `images/popup-bg.png`
- `icons/屏幕截图 2025-11-16 143020.png` → 复制到 `images/sidebar-bg.png`

需创建 `images/` 目录存放背景图片。
