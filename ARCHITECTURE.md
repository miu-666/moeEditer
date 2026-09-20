# ARCHITECTURE.md

## 1. Project Overview

本项目是一个轻量级的自由排版 Bio / Profile 编辑器。

产品定位：

> Rentry / Tumblr 风格的个人 Bio 自由排版工具。

核心体验：

> 添加元素 → 拖动 → 调整 → 排版 → 导出。

本项目不是 Photoshop、Figma 或 Canva 的完整替代品。

代码应优先保持：

* 简单
* 易理解
* 易修改
* 模块职责清晰
* 尽量少的依赖

---

# 2. Technology

当前技术方案：

* HTML
* CSS
* JavaScript

原则：

1. 优先使用原生能力。
2. 不要为了简单功能引入大型依赖。
3. 如果现有技术可以解决问题，不要主动更换技术栈。
4. 不要为了“未来可能需要”提前加入复杂架构。

---

# 3. Directory Structure

实际结构：

```text
moeEditer/
│
├── prd.md
├── ARCHITECTURE.md
├── PLAN.md
├── TODO.md
│
├── tools/
│   ├── build-single.js   把 src/ 打成自包含单文件 HTML
│   ├── make-probe.js     由 src/index.html 生成一个探针页（注入断言脚本）
│   ├── run-probes.js     一把跑完 probes/ 下所有回归探针
│   ├── probe-single.js   单文件版的真浏览器回归（跑 file://）
│   ├── probe-device.js   真机尺寸跑探针（CDP 设备模拟，可截图）
│   └── probe-touch.js    发真实触摸事件跑探针（CDP Input.dispatchTouchEvent）
│
├── dist/
│   └── moe-bio-editor.html   构建产物，唯一对外交付物
│
└── src/
    ├── index.html
    │
    ├── css/
    │   ├── base.css
    │   ├── editor.css
    │   └── components.css
    │
    └── js/
        ├── state.js        全局 state 与挂在 state.js 的小工具
        ├── page.js         页面高度（fixed / long 两种模式）
        ├── elements.js     元素模型、DOM、表面与形状
        ├── autoscroll.js   视口边缘自动滚动（drag / resize 共用）
        ├── drag.js         拖动
        ├── resize.js       缩放
        ├── columns.js      Box 分栏分隔条
        ├── crop.js         图片裁剪
        ├── grid.js         网格与吸附
        ├── alignment.js    智能对齐与参考线
        ├── assets.js       素材
        ├── storage.js      localStorage
        ├── history.js      撤销 / 重做
        ├── export.js       PNG 导出
        ├── canvas.js       画布 + 属性面板
        └── app.js          启动与全局事件绑定
```

没有模块系统，所有文件都往全局挂；**加载顺序就是 `index.html` 里 `<script>` 的书写
顺序**，`app.js` 必须最后。新增文件时记得把它加进这个顺序里，且不要把依赖放到自己
后面。

**新增一个 js 文件只需要改一处**：

| 位置 | 说明 |
|---|---|
| `src/index.html` | 加进 `<script>` 清单，注意顺序（依赖不能排在依赖者后面） |
| `probes/probe-*.html` | 不用改 —— 探针页由 `tools/make-probe.js` 从 `index.html` 生成，自动跟随 |
| `tools/build-single.js` | 不用改 —— 它从 `index.html` 读脚本清单，自动跟随 |

探针页以前是**手工维护的副本**，是这套结构里最容易忘的地方（D-7 把自动滚动从
`drag.js` 拆到 `autoscroll.js` 时就没跟上，`probe-phase-c` 立刻报
`autoScrollStepFor is not defined`，看着像功能坏了其实是探针过期）。现在探针页
一律从 `index.html` 生成，`node tools/make-probe.js <注入脚本> <输出 html>`，
这类失效不会再出现。改完源码跑一遍 `node tools/run-probes.js`。

不要为了强行符合某个理想目录而重构已有项目。

---

# 4. Core Architecture

项目采用：

> **State → Logic → DOM**

的简单架构。

基本关系：

```text
User Interaction
       ↓
Interaction Logic
       ↓
State
       ↓
Render
       ↓
DOM
```

例如拖动：

```text
鼠标移动
   ↓
drag.js
   ↓
更新 element.x / element.y
   ↓
state
   ↓
更新 DOM
```

State 是画布数据的主要来源。

---

# 5. State

文件：

```text
src/js/state.js
```

负责：

> 全局唯一的可变数据源，以及少数挂在它上面、到处都要用的小工具。

* 画布 / 页面状态（`canvas`，含两种 Page 模式）
* 元素列表与当前选中项
* 网格与吸附开关
* 用户素材
* 各个交互的进行中状态（`drag` / `resize` / `crop` / `split`）
* 历史栈（`history`）

同时导出这几个跨模块的小工具：`snapToGrid()` / `generateId()` /
`setSelectedElementId()` / `setGridEnabled()` / `setGridSnap()`。

---

结构：

```js
const state = {
  canvas: {
    mode: "fixed",        // "fixed" | "long"，语义见 page.js
    ratio: "custom",
    width: 600,
    height: 900,          // 永远等于当前页面高度
    background: "#ffffff",
    backgroundImage: null,
    minHeight: 900,
    bottomGap: 80,
    maxHeight: 20000
  },

  elements: [],
  selectedElementId: null,

  grid:    { enabled: false, snap: false, size: 8 },
  assets:  [],

  history: { stack: [], index: -1, max: 50 },

  // 交互中的临时状态：不是文档数据，不持久化
  drag:   { active, elementId, startX, startY, elStartX, elStartY, pointerX, pointerY },
  resize: { active, elementId, handle, startX, startY, startWidth, startHeight, ... },
  crop:   { active, elementId, shape, draft },
  split:  { active, elementId, axis, startClient, startSplit, extent }
};
```

哪些内容**不进** localStorage：`selectedElementId`、`history`，以及 `drag` / `resize` /
`crop` / `split` 四个交互快照 —— `saveState()` 只写 `canvas` / `elements` / `grid` /
`assets` 四块。

哪些东西**不该进 state**：画布上的纯装饰（对齐参考线、内容结束虚线、裁剪浮层）。它们
由各自的模块按需创建和移除，进了 state 就会被导出逻辑当成真元素。

---

## State 原则

### 规则 1

State 是画布内容的主要数据来源。

### 规则 2

不要在多个模块中分别维护同一份核心数据。

错误：

```js
// drag.js
let currentX;

// canvas.js
let currentPosition;

// elements.js
let elementPosition;
```

正确：

```js
state.elements[index].x
state.elements[index].y
```

---

# 6. Element Model

所有画布对象都称为：

> Element

基础结构：

```js
{
  id: "unique-id",

  type: "text",

  x: 100,
  y: 200,

  width: 200,
  height: 50,

  rotation: 0,

  zIndex: 1,

  content: "",

  style: {}
}
```

---

## Element Types

```text
text
image        （原 Image 与 Image Box 已合并，见 TODO 7.8）
sticker
divider
textbox      （Box：带表面的框，内部是 1~2 个文本栏，见下）
label
```

以后可以扩展。

---

## Box 的内部结构

Box 是**唯一**拥有内部区域的元素类型。它没有引入任何新的元素类型，只是让自己的
`content` 变成两个「列槽」：

```js
el.style.layout  = "single" | "columns" | "rows"
el.style.split   = 0.15 ~ 0.85
el.style.vAlign  = "top" | "middle" | "bottom"   // 栏内文字的垂直位置（整框）
el.content       = { columns: [ { title, body, align }, { title, body, align } ] }
                                      // align: "left" | "center" | "right" | ""（继承）
```

```text
.canvas-element
  └── .element-content        ← 背景 / 内边框 / 外边框 / 投影 / padding
        └── .box-body         ← flex，layout-* / valign-* / --split / --box-gap / --title-gap
              ├── .box-column[data-col="0"]
              │     ├── .box-title
              │     └── .box-text
              ├── .box-column[data-col="1"]      （仅分栏时渲染）
              └── .column-splitter              （仅分栏时渲染）
```

约定：

* **Column 不是 Element。** 不进 `state.elements`，没有 id / 坐标，不能单独选中。
  `columns` 数组恒长 2，不做嵌套 —— 这是这套结构保持轻量的原因。
* **`single` 只渲染第一栏**，第二栏的内容保留在数据里，切布局不丢文字。
* **Title 挂在栏上，不挂在 Box 上**：左右分栏时两栏各自需要标题。
* 读写一律走 `getBoxColumns()` / `setBoxColumn()`，不要直接摸 `el.content`。
  栏的字段有三个：`title` / `body` / `align`。
* **水平对齐挂在栏上，垂直对齐挂在 Box 上。** 栏的 `align` 为空时回落
  `style.textAlign`（老记录都没有这个字段，于是原样不变），统一由
  `readColumnAlign(column, style)` 读出。并排两栏可以一个贴左一个贴右；
  而 `vAlign` 刻意留成整框的 —— 两栏一上一下通常只会显得坏掉。
* **`vAlign` 的默认值跟着 `layout` 走**（单栏 `middle`、分栏 `top`），由
  `readBoxLayout()` 补上；显式设过之后就以用户的选择为准，切布局不会把它改回去。
  想改默认观感，只改 `readBoxLayout()` 一处。
* **单栏时那一栏占满整个内容区**，不分栏才用 `--split` 分。CSS 与
  `boxColumnRects()` 必须一致，否则文字的对齐位置和折行宽度都会对不上 ——
  这里曾经漏过一条 CSS 规则，单栏预览只有半宽、导出却是全宽。
* 导出的分栏几何由 `boxColumnRects()` 复刻 flex 规则、栏内摆位由 `drawBoxColumn()`
  复刻 `justify-content` + `text-align` + `overflow: hidden`，**改这两处 CSS 时导出要一起改**。

---

## Element ID

每一个 Element 必须拥有唯一 ID。

复制 Element 时必须生成新的 ID。

禁止通过数组 index 作为 Element 的唯一身份。

---

# 7. page.js

负责：

> 页面（Page）几何 —— 唯一知道页面该有多高的模块。

* 页面高度的推导与落地（`state.canvas.height`）
* 两种页面模式：`fixed`（用户定高）/ `long`（内容定高）
* 比例预设与 Height 字段（`applyPageRatio()` / `refreshPageHeightField()`）
* 新建元素的落点（`getNewElementY()`）
* 画布底部「内容结束」虚线（`syncContentEndMarker()`）
* 「整理成列表」（`tidyIntoList()`）
* **画布在视口里的缩放**（`applyCanvasScale()` / `toCanvasDelta()`，见 §36）

不负责：

* 元素自身的坐标与尺寸（elements.js / drag.js / resize.js）
* 网格与吸附
* 导出
* localStorage

> 画布缩放放在这里，是因为它和页面高度是同一类东西：**画布这个盒子在 DOM 里的
> 呈现**。scale 是纯视图状态，不进 `state`、不进存档、不进历史、不影响导出。

---

## 核心不变量

```text
state.canvas.height  ===  当前页面高度
```

两种模式共用同一个 canvas 元素：

```text
fixed → 用户拥有 height（比例预设或 Height 字段）
long  → height 由内容推导：max(元素底部) + bottomGap
```

drag / resize / crop / export 只读 `state.canvas.height`，**不需要知道当前是哪种模式**。
这是两种模式能共存的原因，改这块时不要破坏它。

`minHeight` 是兜底下限，`maxHeight` 是安全上限（默认 20000）：元素可以一直往下拖，
但页面不会跟着越过上限。

---

## long 模式的高度何时收缩

```text
拖动中    growCanvasIfNeeded()  → 只增不减，页面跟手
pointerup syncPageHeight()      → 才回收多余高度
```

拖动过程中收缩会让元素在指针下方跳动，所以「只在松手时回收」是刻意的。

---

## 画布上的纯装饰

「内容结束」虚线（`#content-end-marker`）和参考线一样，是**只存在于 DOM 的装饰**：
导出走 `state` 重绘，所以它们不会进 PNG。加这类元素时不要写进 `state.elements`。

---

# 8. canvas.js

负责：

* 创建画布
* 初始化画布
* 渲染画布
* 更新画布尺寸
* 更新背景
* 画布级操作

不负责：

* 文字编辑
* 图片上传
* 网格算法
* localStorage
* Export

---

# 9. elements.js

负责：

* 创建 Element
* 删除 Element
* 查找 Element
* 更新 Element
* 复制 Element
* Element DOM 创建
* Element DOM 更新

例如：

```text
createElement()
deleteElement()
duplicateElement()
updateElement()
getElementById()
```

---

## 元素修改原则

修改 Element 时：

```text
State
 ↓
更新
 ↓
Render / Update DOM
```

不要只修改 DOM 而不修改 State。

错误：

```js
element.style.left = "100px";
```

但 State 仍然是：

```js
x: 50
```

这会造成数据与界面不一致。

---

# 10. drag.js

负责：

* Element 拖动
* 鼠标 / Pointer 事件
* 拖动过程中位置计算
* 与 Grid / Snap 的交互
* 提供 `reapplyDrag()`：不依赖新指针事件重跑一次位置计算，供自动滚动逐帧调用
* **被浏览器取消的手势要回滚**（见下）

不负责：

* 创建 Element
* 保存数据
* 上传图片
* Export
* 边缘自动滚动本身（在 autoscroll.js，drag 与 resize 共用）

---

## pointercancel 不是 pointerup

跟鼠标不一样，触摸手势随时可能被浏览器**收走**：手指竖直滑动时它是一次页面滚动，
不是拖元素。收走的表现就是给页面一个 `pointercancel`，此后不再有 `pointermove`。

如果把它当普通的 `pointerup` 收尾，**取消前已经到达的那几帧位移就被留下了**：实测
竖滑 120px 会把元素先推下去 39.8px（约 24 屏幕像素，刚好是浏览器认出"这是滚动"
之前跑掉的步数），然后元素就永久停在那儿。于是在手机上，一个"想滚页面"的动作会把
画布上的东西蹭歪。

所以取消路径是**回滚**，不是收尾：

```js
const cancelled = e.type === "pointercancel";
...
if (cancelled) {
  el.x = state.drag.elStartX;      // 回到按下前的位置
  el.y = state.drag.elStartY;
  if (undoSelection) setSelectedElementId(null);
  syncPageHeight();                // 把这次拖动撑出来的页高收回去
  saveState();                     // 不 pushHistory —— 什么都没发生
  return;
}
```

`state.drag.wasSelected` 记下"按下之前是否已经选中"，取消时决定要不要把选中也退回。
这一步必须做：**选中的元素带 `touch-action: none`**，一次滑动顺手把它选中之后，
下一次在同一个块上滑动就会被当成拖动而不是滚动 —— 表现是"滑一次能滚，再滑就挪东西"。
回滚之后，无论在同一个块上滑多少次，结果都一样。

---

## Drag Flow

```text
pointerdown
    ↓
记录初始位置
    ↓
pointermove
    ↓
计算新位置
    ↓
如果 Snap 开启
    ↓
执行 Snap
    ↓
更新 State
    ↓
更新 DOM
    ↓
pointerup
```

---

## 边缘自动滚动（autoscroll.js，drag 与 resize 共用）

长页面比视口高，把元素拖到底部时如果只能"松手 → 滚动 → 再抓住"，手感很差。
所以指针停在视口上下边缘带（`AUTOSCROLL_EDGE = 64px`）内时，`.canvas-area`
自己按帧滚动（`AUTOSCROLL_MAX_STEP = 18px/帧`，越靠边越快）。

只滚是不够的 —— 内容从静止的指针底下滑走了，元素会越掉越远。所以每帧还要把
**正在进行的那个交互的起点**按内容移动量补偿回去：

```js
if (state.drag.active)   state.drag.startY -= moved;
if (state.resize.active) state.resize.startY -= moved;
reapplyCanvasInteraction();   // 唯一的差异点：drag 走 reapplyDrag，resize 走 reapplyResize
```

能共用一套补偿，是因为两个交互测量自己的方式一样：都在开始时记一个不动点
（`startX` / `startY`）和初始几何，之后每帧用"当前指针 − 不动点"算增量。
指针不动、内容动了 `moved`，等价于指针反向动了 `moved` —— 补偿掉即可。
（`state.split` 的分隔条拖动没有接，它是横向手势，纵向滚动对它没意义。）

drag 与 resize 各自保留一个"重跑一次"的入口，是这套共用的前提：

| 交互 | 重跑入口 | 位置来源 |
|---|---|---|
| drag | `reapplyDrag()`（drag.js） | `state.drag.pointerX / pointerY` |
| resize | `reapplyResize()`（resize.js） | `state.resize.pointerX / pointerY` |

两个 state 里都存了"最后一次指针位置"，正是为了在没有新指针事件时也能重算。

**循环的启停**由 `updateAutoScroll(clientY)`（每次 pointermove 调）和
`stopAutoScroll()`（pointerup 调）控制，判据是"指针是否在边缘带内"，
而不是"是否还在拖动"。

> 无头浏览器里 `requestAnimationFrame` 几乎不回调（实测 600ms 内 0 帧），所以
> 探针验证的是**每帧的数学**（手动连调 `runAutoScroll()`，断言"滚动多少、元素
> 就跟着走多少、手柄屏幕位置不变"）加上**循环的启停**，真实连续手感由人试。

---

# 11. resize.js

负责：

* Element resize
* resize handles
* 宽高计算
* 图片比例保持
* 拖到视口边缘时的自动滚动（复用 autoscroll.js，见第 10 节末尾；靠
  `reapplyResize()` 逐帧重跑，起点为 `state.resize.pointerX / pointerY`）
* 被 `pointercancel` 取消时回滚到按下前的几何（同第 10 节「pointercancel 不是
  pointerup」；`startWidth / startHeight / startLeft / startTop` 同时是回滚点）

不负责：

* Element 创建
* Element 删除
* Grid 绘制

---

# 12. columns.js

负责：

* Box 分栏分隔条（`.column-splitter`）的拖动
* 把拖动过程中的像素位移换算成 `style.split`（取值范围 0.15 ~ 0.85）

不负责：

* Box 的内容与布局（elements.js）
* 分栏的导出几何（export.js 的 `boxColumnRects()`）

---

事件结构与 resize.js 同形：`pointerdown` 挂在画布上，`pointermove` / `pointerup`
挂在 `document` 上，指针离开元素也不会丢手势。

`drag.js` 在 `pointerdown` 里对 `.column-splitter` 直接 return，两者不会抢同一个手势。

上下限是 `MIN_SPLIT` / `MAX_SPLIT`，两侧各留 15%，避免某一栏被拖到不可见。

---

# 13. crop.js

负责：

* 裁剪模式的进入与退出（`enterCropMode()` / `exitCropMode()`）
* 裁剪浮层与工具条（`buildCropOverlay()` / `renderCropToolbar()`）
* 裁剪框的平移与缩放（`startCropPan()` / `startCropResize()`）
* 形状选择（`CROP_SHAPES` / `setCropShape()`）

不负责：

* 图片本身的绘制（elements.js）
* 形状几何（`shapeSvgNode()` / `SHAPE_PATHS_100` 在 elements.js，裁剪轮廓直接复用，
  不再自己抄一份路径）

---

## 裁剪的数据模型

元素的 `x` / `y` / `width` / `height` **就是裁剪框**，`content.crop` 只描述图片在这个
框里怎么摆：

```js
el.content.crop = { ix, iy, iw, ih }   // 比例，相对元素框
```

所以裁剪不改变元素的位置和尺寸，只改变框内图片的构图。

---

## 裁剪模式下的拖动（`startCropPan`）

拖裁剪框内部一次干两件事，按顺序：

1. **先滑动图片**。这是裁剪的常规操作，也是框比图小时唯一动得了的东西。
2. **被边界拒绝的那部分位移，改成整体平移裁剪框**。图片滑不动了（已经在边上），
   剩下的位移让框带着图一起走，取景不变。

第 2 步不是锦上添花，是必需品。`clampCropDraft()` 把图片偏移限制在
`[d.w - dw, 0]`，而**新建的裁剪框恰好等于图片大小**（contain 的初始状态），
两者相等时这个区间退化成 `[0, 0]` —— 于是拖动会被自己的边界条件锁死，
**一点反应都没有**。桌面鼠标同样如此，只是先在手机上被发现的。

判据是"clamp 前后差多少"，不是"有没有余量"，所以两种情形共用一条代码路径，
拖到头之后会连续地过渡到整体平移，没有模式切换。

---

## 裁剪与形状是两个概念

```text
style.cropShape → 只换轮廓，不动图片内容
content.crop    → 只改构图，不动轮廓
```

两者刻意分开，属性面板上也各自给了说明文字。形状清单 `CROP_SHAPES` 是唯一的，
裁剪工具条和属性面板都从这里取，不会出现两套词汇。

> 改形状时注意：几何只有 `shapeSvgNode()` / `SHAPE_PATHS_100` 一处来源，
> 不要再抄一份路径数据。

---

# 14. grid.js

负责：

* 网格显示
* 网格隐藏
* 网格尺寸
* Snap
* Snap 坐标计算

默认：

```text
gridSize = 8
```

基本 Snap：

```js
snappedX = Math.round(x / gridSize) * gridSize;
snappedY = Math.round(y / gridSize) * gridSize;
```

---

## Grid 与 Snap 是两个概念

允许：

```text
Grid = ON
Snap = OFF
```

也允许：

```text
Grid = OFF
Snap = ON
```

UI 可以根据实际体验决定是否允许这种组合。

代码层面不要强制认为两者一定相同。

---

# 15. alignment.js

负责：

* 智能对齐：拖动 / 缩放时把当前元素与其他元素的边、中线比对
* 参考线的绘制与清除（`renderGuides()` / `clearGuides()`）

不负责：

* 元素坐标的最终裁决（由调用方 drag.js / resize.js 决定是否采纳返回值）
* 网格吸附（那是 state.js 的 `snapToGrid()`）

---

`checkAlignment()` 是**纯函数**：传入「当前元素 + 候选坐标」，返回
`{ snappedX, snappedY, guides }`，不写 state、不碰 DOM。阈值是 `ALIGN_THRESHOLD = 5`
（px）。

因此它的调用顺序是固定的 —— 智能对齐先算，网格吸附后算，吸附可能把坐标又推过边界，
所以调用方还要再夹取一次：

```text
候选坐标
  ↓
checkAlignment()   → 贴边 + 参考线
  ↓
snapToGrid()       → 网格
  ↓
clamp              → 兜回页内
```

---

# 16. assets.js

负责：

* 用户素材上传
* 素材列表
* 删除素材
* 将素材添加到画布

不负责：

* 画布拖动
* 图片 resize
* Export

---

## Asset Model

例如：

```js
{
  id: "asset-001",

  type: "image",

  name: "star.png",

  src: "...",

  createdAt: 123456789
}
```

用户上传的素材与画布中的 Image Element 是两个概念。

```text
Asset
 ↓
创建
 ↓
Image Element
```

不要把 Asset 和 Element 混为一个对象。

---

# 17. storage.js

负责：

* 保存 State（`saveState()`）
* 读取 State（`loadState()`）

不负责：

* 决定「什么时候该保存」（调用方在操作结束时调 `saveState()`）
* 撤销 / 重做（历史栈只活在内存里，见 history.js）

---

## 存储介质

默认使用：

```text
localStorage
```

如果图片数据量过大导致 localStorage 不适合，则可以改用：

```text
IndexedDB
```

但不要因为“以后可能需要大量素材”而提前实现服务器存储。

目前用到两张 key：

```text
moe_bio_editor_state   → canvas / elements / grid / assets
moe_clipboard          → 复制的元素（app.js 的复制 / 粘贴）
```

---

# 18. history.js

负责：

* 撤销 / 重做（`undo()` / `redo()`）
* 快照的压栈与容量控制（`pushHistory()`）
* 把快照写回 state 并重绘（`applySnapshot()`）

不负责：

* 判断「什么时候算一步」（调用方在操作结束时调 `pushHistory()`）
* 持久化（历史栈**不进** localStorage，刷新即清空）

---

```text
state.history = { stack: [], index: -1, max: 50 }
```

规则：

* 快照只深拷贝 `elements` / `canvas` / `grid`，**不含 assets** —— 素材不进历史。
* 在中间位置产生新快照时会丢弃后面所有分支（撤销后再编辑，就回不到原来的“后面”了）。
* 超过 `max` 时从栈底丢弃，`index` 同步前移。
* 一步操作 = 一次 `pushHistory()`。「整理成列表」整次整理只推一次，所以是一步撤销。

---

# 19. export.js

负责：

> 将 Canvas 导出为图片。

目标：

```text
Editor Canvas
      ↓
Export
      ↓
PNG
```

Export 逻辑应该独立。

不要把 Export 代码散落在：

```text
canvas.js
elements.js
app.js
```

多个文件中。

---

## 导出必须逐项对齐预览

导出不走 DOM，是照 `state` 在 Canvas2D 上重画一遍。所以**每一处预览的视觉效果都要在
`renderElementToExportCanvas()` 里有对应分支**，否则就是「画布上有、导出里没有」。

主循环是一条 `if / else if` 链，目前覆盖：

```text
text / textbox / image / label / sticker / divider
```

加新元素类型时，**导出分支和预览分支要一起加**。少加不会报错，只会静默消失。

## 已知的几处实现（改一处必须改另一处）

形状几何在预览和导出里是**两套实现、同一套数学**：

| 用途 | 位置 | 形态 |
|---|---|---|
| 预览 | `elements.js` 的 `SHAPE_PATHS_100` / `shapeSvgNode()` | SVG path 数据 |
| 导出 | `export.js` 的 `shapePath()` / `STAR_POINTS_100` / `drawHeartPath()` | Canvas `Path2D` |

预览靠 CSS `clip-path` / SVG，导出只有 Canvas2D，所以没有合成一份。**代价是改形状
（加一种、调一条曲线）时必须同时改两边**，并且用导出位图做一次像素比对 —— 这类差异
不会报错，只会“看着不太一样”。

同理，`.divider-line` 这类靠 CSS 摆出来的几何（`width: 100%` + 垂直居中 + 圆角）在导出
侧是手算的，改 CSS 要回来看一眼导出分支。

Box 的栏内摆位是同一类：预览是 `justify-content` + `text-align` + `.box-column { overflow: hidden }`，
导出是 `drawBoxColumn()` 里算偏移再 `ctx.clip()` 到栏矩形。两边必须用同一套数学 ——
**包括内容比栏高的时候**：那时偏移是负数、文字向上探出，靠裁剪裁在栏边；如果导出改成
"溢出就回到顶部"，恰恰在用户字最多的时候和画布不一致。

**栏宽也是同一类**：预览由 CSS 的 `flex` 决定（`.box-body.layout-single` 全宽，
`layout-columns` / `layout-rows` 才用 `--split`），导出由 `boxColumnRects()` 决定。
这两处一旦不一致，症状不是"报错"而是**水平对齐和折行位置整体偏移** —— 单栏 Box 曾经
因为 CSS 缺一条 `layout-single` 规则而只有半宽，与导出差了半个内容区。

> 判断这类问题的办法：在探针里把**预览量出来的矩形**和**导出用的矩形**直接对比
> （`previewColumnRect()` vs `boxColumnRects()`）。只比"两边画出来像不像"会漏 ——
> 宽度错了，两边的相对位置看起来仍然自洽。

---

# 20. app.js

负责：

> 应用初始化和模块之间的协调。

例如：

```text
初始化 State
 ↓
初始化 Canvas
 ↓
初始化 Components
 ↓
初始化 Assets
 ↓
读取 Storage
 ↓
绑定全局事件
```

app.js 可以调用其他模块。

但是不要把所有具体业务逻辑全部写进 app.js。

---

# 21. CSS Architecture

CSS 至少分为：

```text
base.css
editor.css
components.css
```

---

## base.css

负责：

* reset
* body
* typography
* 通用基础样式

---

## editor.css

负责：

* 编辑器布局
* 左侧栏
* Canvas
* Properties Panel
* Toolbar
* 窄屏（≤820px）的抽屉布局 —— 全部集中在本文件末尾一段 `@media` 里

> `index.html` 里的加载顺序是 base → editor → components。**同优先级的选择器，
> 后面的文件赢**：窄屏规则写在这里、而 `components.css` 又定义了同名类时，
> 得把选择器写具体一点（比如 `.sidebar .component-list`）才盖得住。
> 组件列表两列化就是这么被 `flex-direction: column` 吃掉过一次。

---

## components.css

负责：

* Button
* Asset Card
* Component Card
* Input
* Panel
* Selection Box

---

# 22. Module Dependency Rules

推荐依赖关系：

```text
app
 ├── state
 ├── page
 ├── canvas
 ├── elements
 ├── autoscroll
 ├── drag
 ├── resize
 ├── columns
 ├── crop
 ├── grid
 ├── alignment
 ├── assets
 ├── storage
 ├── history
 └── export
```

原则：

> 低层模块不要反过来依赖 app.js。

例如：

```text
drag.js → app.js
```

应该尽量避免。

---

## 实际存在的跨模块调用

没有模块系统，谁都能调谁，所以真正需要守住的是**这几条已经存在的边**：

```text
drag.js   → alignment.checkAlignment() / page.clampPageY() / page.growCanvasIfNeeded()
            state.snapToGrid()

resize.js → page.growCanvasIfNeeded()

crop.js   → elements.shapeSvgNode()（只借几何，不借状态）

export.js → elements 的几何函数（getBoxColumns / drawBoxFrame / fillSilhouette …）
            —— 只读 state，并复用 elements 的几何

autoscroll.js ⇄ drag.js / resize.js
```

方向是一致的：**交互层调用几何 / 页面层，几何层不反过来调交互层**。page.js 和
alignment.js 是纯函数（给值算值），谁都能调，它们不碰 DOM、不碰 state 以外的东西。

最后一条是本项目**唯一一处双向依赖**，值得说明：autoscroll.js 需要在每一帧里重跑
"当前正在进行的那个交互"，只能调 drag / resize 暴露的重跑入口；而 drag / resize 又
需要调 autoscroll 的 `updateAutoScroll()` / `stopAutoScroll()` 来控制循环的启停。

它不违反"低层不依赖高层"：三个文件同属交互层，且调用都发生在事件里（函数声明提升
之后），所以谁先加载都无所谓。真正的约束是**方向单一**：autoscroll 只调它们的
`reapplyDrag()` / `reapplyResize()`，不碰它们的位置数学 —— 那部分留在各自文件里。

---

# 23. Single Responsibility

每个模块应该尽量只有一个主要职责。

例如：

错误：

```text
app.js
├── 拖动
├── 图片上传
├── localStorage
├── Grid
├── Export
├── CSS
└── 所有按钮
```

正确：

```text
state.js
    → 全局 state

page.js
    → 页面高度（fixed / long）

elements.js
    → 元素模型 / DOM / 表面 / 形状

drag.js
    → 拖动（含边缘自动滚动）

resize.js
    → 缩放

columns.js
    → 分栏分隔条

crop.js
    → 裁剪

grid.js
    → 网格 / Snap

alignment.js
    → 智能对齐

assets.js
    → 素材

storage.js
    → 保存

history.js
    → 撤销 / 重做

export.js
    → 导出

canvas.js
    → 画布与属性面板
```

判断标准很简单：**改一个功能时，你应该能说出该动哪个文件。** 如果说不出来、或者要动
三四个文件，说明职责边界有问题 —— 但要先检查是不是真的越界，而不是急着拆文件。

---

# 24. DOM 与 State 一致性

必须遵守：

> **不要只修改 DOM。**

例如移动元素时：

错误：

```js
dom.style.left = "100px";
```

但：

```js
state.elements[i].x
```

没有变化。

正确：

```text
用户拖动
 ↓
计算 x / y
 ↓
更新 state
 ↓
更新 DOM
```

---

# 25. Event Handling

优先使用 Pointer Events：

```text
pointerdown
pointermove
pointerup
```

这样以后更容易支持：

* Mouse
* Touch
* Pen

但如果当前项目已有稳定的 Mouse Event 实现，不需要为了这个规则重写已有代码。

---

# 26. Performance Rules

拖动元素时：

> 不要每次 pointermove 都重新渲染整个应用。

优先：

```text
只更新当前 Element
```

避免：

```text
pointermove
 ↓
重新创建全部 Elements
 ↓
重新创建全部 DOM
```

---

# 27. Error Handling

任何单个 Element 出错：

> 不应该导致整个编辑器崩溃。

例如：

图片加载失败：

```text
显示占位状态
```

而不是：

```text
整个页面崩溃
```

---

# 28. Adding a New Element Type

以后如果增加：

```text
music
gif
quote
```

理想流程：

```text
定义 type
 ↓
定义默认数据
 ↓
定义 render
 ↓
定义 properties
```

不要为了增加一个 Element 类型而修改大量无关模块。

---

# 29. Adding a New Feature

开发新功能之前：

必须先回答：

1. 这个功能属于哪个模块？
2. 是否需要修改 State？
3. 是否需要新增模块？
4. 是否影响已有功能？
5. 最小修改范围是什么？

---

# 30. Modification Rules

任何对项目的修改都必须遵守以下规则：

### Rule 1

修改前先阅读相关代码。

不要扫描整个项目后主动重构。

### Rule 2

优先局部修改。

### Rule 3

不要因为新增一个功能而重写整个项目。

### Rule 4

不要随意更换技术栈。

### Rule 5

不要删除已有功能。

### Rule 6

不要复制大量重复代码。

### Rule 7

不要把所有逻辑写入一个文件。

### Rule 8

不要为了“未来可能需要”增加复杂架构。

### Rule 9

如果需要大规模重构，必须先说明：

```text
为什么需要重构
会修改哪些文件
会影响哪些功能
为什么局部修改无法解决
```

未经确认不要执行大规模重构。

---

# 31. Change Scope Rule

正常功能修改：

> 尽量控制在 1～3 个相关模块。

如果一个简单功能需要修改：

```text
5+
```

个核心模块，应先检查架构是否存在问题。

不要自动进行大规模重构。

---

# 32. No Giant File Rule

任何单个 JS 文件如果不断增长，应考虑拆分。

但：

> **不要为了追求文件数量而过度拆分。**

目标不是：

```text
100 个文件
```

而是：

> 每个文件的职责容易理解。

---

# 33. No Duplicate State Rule

同一个核心状态只应该有一个主要来源。

例如：

```text
selectedElementId
```

应该由：

```text
state.selectedElementId
```

唯一维护。不要在别的模块里再存一份。

---

## 判断方法

问一句：**这个值被改变时，有几个地方需要跟着同步？**

* 只有一个 —— 合格。
* 两个以上，而且靠「记得一起改」维持 —— 迟早会漏。

已知且被接受的例外只有一处：形状几何的数值同时存在于

```text
elements.js   SHAPE_PATHS_100 / shapeSvgNode()   （预览，SVG）
export.js     shapePath() / STAR_POINTS_100       （导出，Canvas2D）
```

这不是状态，是几何常量：预览走 CSS / SVG、导出只有 Canvas2D，共用不了一份数据。
所以退而求其次 —— **改一处必须改另一处，并跑一次导出位图的像素比对**（见第 19 节）。

除此之外不要新增第二份来源。宁可多写一次函数调用，也不要多存一份数据。

---

# 34. 改完之后怎么验

项目没有测试框架，验证靠两条：

```text
1. 真浏览器跑一遍（Edge headless 就够）
   → 看 DOM、看几何、看有没有 JS 报错

2. 导出一张 PNG，和画布并排比
   → “预览 vs 导出”的差异一眼可见
```

仓库里已经有七个回归探针：

```text
probes/probe-phase-c.html    长页手感（自动滚动 / 内容结束虚线 / 整理成列表）
probes/probe-phase-d.html    导出补齐（sticker / divider / label 字距与大小写）
probes/probe-phase-d5.html   Box 垂直对齐（含"预览位移 == 导出位移"的交叉验证）
probes/probe-phase-d6.html   Box 每栏水平对齐（含"预览栏宽 == 导出栏宽"的回归）
probes/probe-phase-d7.html   缩放侧的边缘自动滚动（含"手柄粘住指针"的交叉验证）
probes/probe-phase-mobile.html  窄屏适配（抽屉归位 / 画布缩放 / 指针换算，分视口断言）
probes/probe-crop-touch.html    裁剪拖动（真实触摸：拖图优先 + 整体平移兜底）
probes/probe-touch-basic.html   基础触摸交互（真实触摸：拖动/缩放回滚、手柄命中区、状态收起）
```

探针页都是**生成**出来的，不手抄 `index.html`：源脚本放 `tools/probe-src/`，
用 `tools/make-probe.js` 注入到 `src/index.html` 的副本里。

```bash
node tools/make-probe.js tools/probe-src/crop-touch.js probes/probe-crop-touch.html
```

> **为什么要生成而不是手抄。** 探针必须跟真实的 `index.html` 完全一致（同样的样式表、
> 同样的脚本清单与顺序），手抄一份的结局是加了新模块后探针少加载一个文件，报出
> `xxx is not defined` —— 看着像功能坏了，其实是探针过期了。`make-probe.js` 还会
> 拦下注入脚本里的结束标签字面量（连注释里都算），那个会让标签提前闭合、探针被
> 静默截断。

**不用一个个手跑，一条命令全跑完：**

```bash
node tools/run-probes.js          # 全部，退出码 = 是否有 FAIL
node tools/run-probes.js d7 d6    # 只跑名字里含 d7 / d6 的
node tools/run-probes.js crop     # 只跑裁剪触摸探针
```

单文件产物另有一条（先生成再验证，验的是 `dist/` 产物）：

```bash
node tools/probe-single.js
```

窄屏的事必须换尺寸跑，`--window-size` 顶不住：

```bash
node tools/probe-device.js probes/probe-phase-mobile.html 390 844 截图.png
```

> **为什么不用 `--window-size`。** Edge 有窗口最小宽度（实测约 490px），传 390 拿到
> 的实际是 492，手机宽度根本给不到；`--force-device-scale-factor` 也只在几个像素
> 之内有效。`probe-device.js` 走 CDP 的 `Emulation.setDeviceMetricsOverride`，
> 视口想多小就多小，还能顺带存截图。

> 用完记得它起的是**独立 profile**（`.cdp-profile`），否则会连到你正在
> 用的那个浏览器实例上。

> 提取探针结果别用 `grep PROBE_RESULT_START` —— 探针源码里有同一个字面量，
> 会抓到源码而不是结果。按 `<pre id="probe-out">` 节点取，`run-probes.js`
> 已经这么做。

> **新断言要证明它会失败。** 写完探针后**故意把实现改回旧行为再跑一遍**，
> 看新断言是否真的变红。D-5 与 D-6 都靠这一步各抓出过一批"永远不会失败"的断言
> （测量窗口太小 / 两边共享了同一个错误宽度）。

改动涉及的既有功能要一起回归。长页的手感（自动滚动跟手、拖动惯性）在无头环境里
验不了 —— 那部分必须交给用户试用。

## 触摸类问题必须用真实触摸测

拖动、手势、命中区这类问题，用 `new PointerEvent()` + `dispatchEvent` **测不出来**：
合成事件直接跳到页面的处理器，绕过了浏览器的手势仲裁。而真机上"拖不动"绝大多数
时候正是栽在仲裁上 —— `touch-action` 不允许、滚动容器抢走手势、浏览器发
`pointercancel` 把拖动打断。合成事件下这些**永远不会复现**，探针一路全绿而真机
纹丝不动。

```bash
node tools/probe-touch.js probes/probe-crop-touch.html 390 844 截图.png
```

它走 CDP 的 `Input.dispatchTouchEvent`（真实输入管线，会做手势识别、会遵守
`touch-action`、该发 `pointercancel` 就发），配合 `Emulation.setTouchEmulationEnabled`
生成对应的 pointer 事件。页面侧约定写在 `tools/probe-touch.js` 头部。
`run-probes.js` 会连带把它跑了。

> **探针跑之前要清场。** 探针 profile 里的 `localStorage` 是持久的，上一次跑
> `saveState()` 存下的元素下次会叠在画布上，看起来像"画布里冒出一堆不属于本次的
> 东西"，极易误判成产品 bug。两个跑探针的工具都会先
> `Storage.clearDataForOrigin`，探针自己也会把 `state.elements` 清一遍。

> **真实触摸能证明"没被抢走"，不能证明"拖得动"。** 这次就是：事件序列里一个
> `pointercancel` 都没有、`touch-action` 也全对，拖不动的原因其实在页面自己的
> clamp 数学里。所以探针要同时断言事件序列**和**最终位移，缺一半就会误判。

---

# 35. 单文件构建（对外交付）

`src/` 是开发形态：18 个文件、靠 `<script>` 顺序加载。要发给别人时不能发一个目录，
所以 `tools/build-single.js` 把它压成一个自包含 HTML：

```bash
node tools/build-single.js     # → dist/moe-bio-editor.html（约 184 KB）
```

做法就是纯文本替换：三个 `<link rel="stylesheet">` 换成 `<style>`，18 个
`<script src>` 换成内联 `<script>`，顺序原样保留。**能这么简单是因为项目本身
零外部依赖** —— 没有 `fetch`、没有 CDN、没有 ES module、图片全是 dataURL。
构建完还会断言一遍「页面里不再有任何 `href`/`src` 外链」，有就报错退出。

两个必须记住的点：

- **内联时要转义 `</script`。** 哪怕将来某个字符串字面量里出现它，也会提前闭合
  标签把整页撕成两半，而且报错位置毫无线索。
- **构建时换掉了 localStorage 的 key。** Chrome / Edge 把 `file://` 视为同一个源，
  localStorage 是共享的：单文件版若沿用 `moe_bio_editor_state`，别人打开时会直接
  读到本机开发时残留的存档。所以构建脚本把它重写成 `..._singlefile`
  （`moe_clipboard` 同理）。规则写在 `JS_RENAMES` 里，**命中数为 0 会报错** ——
  防止哪天源码改了 key 而这张表悄悄失效。

`dist/` 是产物不是源码，改功能只改 `src/`，改完重新构建。忘了重新构建是这里最
容易犯的错 —— `probe-single.js` 跑的是 `dist/` 产物，所以它同时也是"产物是否
跟得上源码"的哨兵：源码改了但没重新构建，探针会拿旧产物去验，特征是新功能缺失。

---

# 36. 窄屏适配（手机 / 竖屏平板）

断点 **820px**，规则集中在 `editor.css` 末尾一段 `@media` 里，桌面一律走原路径。

## 为什么非做不可

布局是「220px 侧栏 + 画布 + 220px 侧栏」。390 宽的手机上，光两个侧栏就 440px
—— **可用宽度是负数**。所以窄屏不是"挤一挤"，必须换一套排布。

## 布局层：侧栏变抽屉

* 左抽屉（组件）：从左滑入，宽 `min(300px, 84vw)`
* 底抽屉（属性）：从下上滑，高 `min(58vh, 520px)`，顶边圆角
* 遮罩 `.drawer-scrim` 和每栏的关闭按钮，两条路都能关
* 开关状态就是 `body.drawer-left` / `body.drawer-right` 两个 class
  （也是遮罩和过渡动画的开关）
* 入口是右下角两个悬浮按钮（`.mobile-fabs`），只有窄屏才出现

关闭按钮由 `app.js#initMobileChrome()` 注入，不写在 `index.html` 里 —— 桌面 DOM
因此一点没变，也不需要额外的 CSS 去藏它。从抽屉里新增元素后会**自动收起**，
否则新块落在看不见的地方。

## 缩放层：画布只缩不放

600px 宽的画布在 390 屏上放不下，于是整体缩放显示：

```js
scale = min(1, 可用宽 / state.canvas.width)   // 永远 <= 1
```

实现是给 `.canvas` 加 `transform: scale(s)` + `transform-origin: 0 0`，并把父容器
`.canvas-wrapper` 的宽高设成 `画布尺寸 × s` —— **transform 不改变布局盒**，不手设
wrapper 尺寸的话，滚动区还是按 600px 算的。

scale 同时写到 `.canvas` 的 `--canvas-scale` 上，让 CSS 能补偿：`.resize-handle`
的尺寸写成 `calc(10px / var(--canvas-scale))`，于是手柄在屏幕上**恒为 10px**，
缩到多小都点得到；裁剪刀柄同理。

## 坐标契约（最容易漏的一处）

> **任何"屏幕像素 → 画布坐标"的转换都必须过 `toCanvasDelta()`。**

拖动 / 缩放 / 裁剪记的都是 `clientX/clientY` 不动点，之后用「当前指针 − 不动点」
算增量 —— 那是**屏幕像素**，而元素坐标是**画布单位**。不除以 scale，画布缩到 0.6
时元素就只跟手 60%。全项目就三处：

```text
drag.js    applyDragPosition()
resize.js  applyResize()
crop.js    startCropPan() / startCropResize()
```

反过来看为什么只有这三处：`alignment.js` 的吸附、`page.js` 的 `clampPageY`、
`export.js` 的全部计算都工作在画布坐标里，与 scale 无关；`columns.js` 用
`getBoundingClientRect()` 算的是**比例**，等比缩放下不变。`autoscroll.js` 补偿的是
`state.drag.startY`，那本来就是 client 坐标，滚动量也是屏幕像素，同样不用换算。

## 滚动条预留

`computeCanvasScale()` 用 `clientWidth` 当可用宽，但**当前没有滚动条时也预留一条
的宽度**。否则两者会互相追：

```text
缩小到丢掉滚动条 → 区域变宽 → scale 变大 → 滚动条回来 → 又缩小 → …
```

手机是 overlay 滚动条（量出来 0），完全不受影响；桌面只有窗口宽约 1100 时会走到
这条逻辑。

## 触摸手势分流

同一根手指既要"滚长图"又要"拖元素"，只能靠选中状态区分：

```css
.canvas { touch-action: pan-y; }                  /* 空白处上下滑 = 滚页面 */
.canvas-element.selected { touch-action: none; }  /* 选中后按下 = 拖它 */
```

代价是触屏上要**先点一下选中、再按住拖**（第一次按下会被浏览器当成滚动）。
这是移动端编辑器的共同取舍，比"根本没法滚"好。手柄和裁剪窗口是 `none`。

另外 `body` 高度用 `100svh` 而不是 `100vh`（地址栏收起来时布局不跳），底部抽屉
和裁剪工具栏都加了 `env(safe-area-inset-bottom)`。

## 什么没做

* **双指缩放**：画布只自动适应宽度，不能手动放大看细节
* 触屏上的长按菜单、多选框选
* 横屏手机（宽度 > 820 时按桌面走，此时画布本来就放得下）

---

_本文档描述的是**当前**实现，不是理想目标。实现与文档不一致时以代码为准，并把文档
改过来 —— 不要为了让代码符合文档而改代码。_