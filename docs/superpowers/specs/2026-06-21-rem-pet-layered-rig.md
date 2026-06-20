# Rem 宠物分层 Rig 方案说明
日期：`2026-06-21`

## 问题

之前的工具栏宠物在眨眼、说话等状态下，主要依赖整张位图切换。

这会带来两个直接问题：

- 表情切换时，整个人物都会跟着一起跳，视觉重心不稳定
- 即使代码里已经补了拖拽插值和姿态插值，整帧切换仍然会造成“突然换图”的卡顿感

根因不是插值不够，而是“表情变化”和“整张图替换”被绑在一起了。

## 解决思路

这次改成了固定底层结构 + 局部表情覆盖的分层 Rig：

1. 基准图先拆层，保留稳定不变的主体部件
2. 眨眼和说话不再切整张图，只叠加局部覆盖层
3. 姿态变化继续交给代码插值，表情变化只改局部透明度和缩放

这样做之后：

- 身体、头部、头发、饰品始终稳定
- 眨眼只影响眼部覆盖层
- 说话只影响嘴部覆盖层
- 拖拽、hover、sleep、loading 等状态继续沿用代码驱动的连续 motion

## 资产处理

### 1. 基准图拆层

基准图：

- `images/rem-pet-source/generated-v3-2026-06-20/frame-01.png`

拆分输出目录：

- `images/rem-pet-source/generated-v3-2026-06-20/frame-01-split`

拆分脚本：

- `scripts/split-rem-pet-frame.py`

当前拆出的主要层：

- `01-body.png`
- `02-head-back.png`
- `03-face-base.png`
- `06-front-hair.png`
- `07-hair-accessory.png`

### 2. 局部表情覆盖层

为了避免继续切整帧，这次没有再把 `blink-*`、`talk-*` 作为整图状态使用，而是只从现有动作素材中提取局部覆盖层：

- 闭眼覆盖层来源：`images/rem-pet-source/generated-v4-motion-sheets/blink/blink-03.png`
- 张嘴覆盖层来源：`images/rem-pet-source/generated-v4-motion-sheets/talk/talk-03.png`

生成脚本：

- `scripts/generate-rem-pet-rig-assets.py`

生成结果：

- `images/pet/rem-rig-body.png`
- `images/pet/rem-rig-head-back.png`
- `images/pet/rem-rig-face-base.png`
- `images/pet/rem-rig-front-hair.png`
- `images/pet/rem-rig-hair-accessory.png`
- `images/pet/rem-rig-eye-closed.png`
- `images/pet/rem-rig-mouth-open.png`
- `images/pet/rem-rig-manifest.json`
- `images/pet/rem-rig-preview.png`

其中 `rem-rig-manifest.json` 记录了每个部件在 `1024 x 1536` 基准画布中的精确位置和尺寸，运行时直接按这个布局渲染。

## 运行时实现

对应代码文件：

- `src/content-script.js`

### 1. 不再使用整图状态切换

原来的整图切换逻辑已经移除，工具栏宠物不再维护主图/副图双层切换。

现在改为：

- 固定渲染一组 `PET_RIG_PARTS`
- 通过 `buildPetRigMarkup()` 生成分层 `<img>`
- 通过 `applyPetStateMotion()` 驱动整体姿态
- 通过 `applyPetRigExpression()` 驱动局部表情

### 2. 表情驱动方式

新增两组表情预设：

- `PET_BLINK_EXPRESSION_PRESETS`
- `PET_TALK_EXPRESSION_PRESETS`

以及基础预设：

- `PET_IDLE_EXPRESSION_PRESET`
- `PET_SLEEP_EXPRESSION_PRESET`

运行时根据 `visualState` 选择预设，再写入这些 CSS 变量：

- `--pet-eye-closed-opacity`
- `--pet-eye-closed-scale-y`
- `--pet-mouth-open-opacity`
- `--pet-mouth-open-scale`
- `--pet-mouth-open-shift-y`

也就是说，现在眨眼和说话不是“换一张新人物图”，而是“在固定人物上调局部层的透明度和缩放”。

### 3. 姿态驱动方式

整体 motion 逻辑保留，并继续使用代码插值：

- `PET_STATE_MOTION_PRESETS`
- `PET_TALK_MOTION_PRESETS`
- `PET_BLINK_MOTION_PRESETS`

这样拖拽、hover、sleep、error、success 等状态还是连续变化，不会退回到僵硬的静态图切换。

## 为什么这样会更顺

核心原因只有一个：把“大范围替换”改成了“局部变化”。

之前每次切换表情时，浏览器看到的是一整张人物图变化，轮廓、阴影、重心都会一起变。

现在浏览器看到的是：

- 大部分层完全不动
- 只有眼部或嘴部小区域变化
- 同时配合已有的 `transform` 插值做连续过渡

因此观感会稳定很多，卡顿感也会明显下降。

## 当前限制

这次仍然不是完整骨骼动画系统，而是“分层 Rig + 局部覆盖层”。

当前 `face-base` 仍然保留了基础脸部内容，因此眼睛和嘴巴覆盖层本质上是局部贴片，不是完全独立的可变形器官。

这套方案的优点是：

- 不需要你立刻补大量新素材
- 可以直接接入当前已有基准图和眨眼/说话素材
- 风险低，改动集中，已经能明显改善卡顿

如果后续你再提供更细的拆层素材，例如：

- 无眼睛的纯脸底
- 单独的开眼层
- 单独的闭眼层
- 单独的嘴型层

那就可以继续把这套方案往更纯粹的部件 Rig 方向推进，进一步减少贴片感。

## 本次验证

已执行的校验：

- `node --test tests/*.test.js`
- `node --check ...` 以及 `node scripts/check-project.js`
- `python -m py_compile scripts/generate-rem-pet-rig-assets.py scripts/split-rem-pet-frame.py`
- `git diff --check`

结果：

- `158` 个测试全部通过
- 项目检查通过，验证 `28` 个 manifest/资源引用
- Python 脚本语法检查通过
- `git diff --check` 通过

## 结论

这次不是继续堆更多整帧表情图，而是把宠物改成了“稳定底层 + 局部表情层 + 代码姿态插值”的结构。

它解决的重点不是“让帧更多”，而是“让切换不再依赖整张图替换”。这正是之前卡顿的根因。
