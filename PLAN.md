# 页面模式（Fixed / Long）+ Box 分栏 + Title/Body 方案

> 状态：**方案已确认；Phase A / B / C 均已完成（2026-09-19）；Phase D（V1 收尾）已排期，见第八节 Phase D**
> 阅读对象：用户 / 后续维护者
> 前置文档：`prd.md`、`ARCHITECTURE.md`、`TODO.md`

## 已拍板的四个决定（用户确认）

1. **Long Page = 自由摆放 + 高度跟随内容**，不做流式堆叠、不引入第二套定位系统。
   拖动中只增长、松手才回收，保留 `minHeight` 与最大高度护栏。
2. **分栏 V1 只放 Title + Body**，Column 内不放 Image 等完整 Element（以后单独设计）。
3. **`state.canvas` 不改名 `state.page`**。
4. **Phase C 先做「新建元素落在内容底部」**（仅 Long 模式；新建后仍可自由拖动）。
   另外同意在 Phase A 一起处理**导出高度上限 / 超大 Canvas**，以及顺手修 Box / Text 的导出折行。

## 实现进度

- Phase A（Page Mode / Long Page / 导出护栏 / 导出折行）：**已完成**，见 `TODO.md` 第 8 节
- Phase B（分栏 + Title/Body）：**已完成**，见 `TODO.md` 第 9 节
- Phase C（长页手感打磨）：**已完成**，见 `TODO.md` 第 10 节 —— 新建元素落底部、
  拖动到视口边缘自动滚动、画布底部「内容结束」虚线、「整理成列表」按钮；
  导出降采样护栏早在 Phase A-5 就做完了
- Phase D（V1 收尾 —— 导出补齐 / 一致性 / 清理）：**进行中**，共 8 项，清单见第八节 Phase D。
  D-1（贴纸/分隔线导出）、D-2（label 字距与大小写）已完成 —— 这两项是唯一两处
  "画布上有、导出里没有 / 不一样"的真缺口；D-3（清死代码）、D-4（补 ARCHITECTURE.md）、
  D-5（Box 垂直对齐，顺带修掉溢出时的预览/导出一致性）、
  D-6（每栏各自水平对齐，顺带修掉单栏 Box 预览只有半宽的真 bug）已完成，
  见 `TODO.md` 11.3 / 11.4 / 11.5 / 11.6。剩下的 D-7~D-8 都是手感与可选小项

---

## 零、先说三句结论

1. **两种 Page Mode 不需要两套编辑器。** 当前架构里，固定画布和长页面**唯一的差别是"谁决定 height"**——一个是用户输入，一个是由内容算出来。改掉这一个点，其余（元素绝对定位、拖拽、缩放、裁剪、导出）全部原地复用。

2. **长页面不能用"流式布局"实现。** 那等于在项目里塞第二套定位系统，正面违反 PRD 的「简单」「自由」和你的"不要维护两个编辑器"。推荐做法是：**保持自由摆放，页面高度跟着内容长**。这是最小改动、也是唯一不破坏现有手感的做法。

3. **分栏不做成 Container 系统。** 在现有 `textbox` 上加 `layout` 字段（single / columns / rows），内部渲染成 1~2 个 `.box-column`。**Title + Body 挂在"列"上，不挂在 Box 上**——单栏就是"只有一列的 Box"，三种布局走同一份代码。

---

## 一、现状分析（对应你的问题 1~3）

### 1.1 Canvas / Page 现在是怎么实现的

```
state.canvas = { width: 600, height: 900, background, backgroundImage }
        ↓
initCanvas()  →  #canvas.style.width/height = ...     （canvas.js:1-13）
        ↓
.canvas { position: relative; overflow: hidden }      （editor.css:77-86）
        ↓
每个元素是 .canvas-element，position: absolute，left/top 用像素
```

- 画布就是**一个 div**，没有 `<canvas>`、没有 scale、没有 transform、没有 zoom。
- `state.canvas.width/height` 是**唯一真源**，被 7 个文件读：

| 文件 | 用途 |
|---|---|
| `canvas.js:5-6` | 初始化写 DOM 尺寸 |
| `canvas.js:92-96, 142-153` | Canvas 属性面板 Width / Height 输入框 |
| `drag.js:80-81` | 拖动时把 x/y **夹在画布内** |
| `resize.js:116-121` | 缩放时把右下边界**夹在画布内** |
| `crop.js:459-465` | 裁剪框**夹在画布内** |
| `history.js:48-49` | 撤销时恢复尺寸 |
| `export.js:8-9` | 导出位图尺寸 = 画布尺寸 |

**这是本次需求的核心杠杆点**：只要让 `state.canvas.height` 在 long 模式下"由内容算出来"，上面 7 处全部自动正确，一行都不用改。

### 1.2 Box 现在是怎么实现的

`textbox`（组件库里的 "Text Box"）本质是"一个带表面的框 + 一段文字"：

```
renderElementToCanvas()  case "textbox"            （elements.js:613-664）
  .canvas-element
    └── .element-content      ← applySurface()：背景 / 内边框 / 外边框 / 投影
                                 applyPadding()：paddingV / paddingH
                                 display:flex; align-items:center
        └── .box-inner        ← contentEditable，内容是**一个字符串**
```

- `box.style.boxStyle` 只有 `default | dashed` 两个值。
- **没有任何布局概念**：没有列、没有行、没有子区域。整框只有"一段居中文字"。
- 内容存储：`el.content = "Your text here"`（字符串）。
- 双击进入编辑 → `blur` 时 `el.content = inner.textContent` 写回（`elements.js:639-645`）。

### 1.3 Element 是怎么定位和保存的

- **定位**：`x / y / width / height` 全部是**画布内的像素绝对值**，加 `zIndex` 控制层叠。没有父子关系、没有容器、没有百分比。
- **保存**：`storage.js` 把 `{ canvas, elements, grid, assets }` 整体 `JSON.stringify` 进 `localStorage`，key = `moe_bio_editor_state`。
- **撤销**：`history.js` 每次 `pushHistory()` 深拷贝一份 `{ elements, canvas, grid }`，上限 50 条。**canvas 已经在快照里**，所以页面模式/比例切换天然可撤销，不用额外做事。

**这条结论很重要**：`elements` 是**扁平数组**，元素之间互相不知道对方存在。这意味着"Box 里装东西"在当前模型里是不可能的——Box 的"内容"只能是它自己的 `content` 字段，不能是"另外几个 Element"。这决定了分栏的实现方式（见第五节）。

---

## 二、两种 Page Mode 能不能自然扩展（问题 4）

**能，而且改动面比想象小得多。**

| | Fixed 固定画布 | Long 纵向长页 |
|---|---|---|
| width | 用户决定（比例或手填） | 用户决定（手填，固定） |
| height | 用户决定（比例或手填） | **由内容派生** |
| y 上限 | `canvas.height - el.height` | **不设上限** |
| x 上限 | `canvas.width - el.width` | 不变 |
| 元素系统 | 同一套 | 同一套 |
| 导出 | 一张 PNG | 一张纵向长 PNG |

**关键判断**：两者的差别只有 `height` 的**来源**和 `y` 的**上限**。元素、Box、裁剪、网格、吸附、撤销、素材——全部原样复用，一行不用动。

所以"两种模式"不是两套代码，而是**同一个画布的一个开关**：

```
state.canvas.mode = "fixed" | "long"
```

`mode` 只影响两件事：谁写 `height`，以及拖拽时 y 要不要夹。

### 切换模式时内容怎么处理

- **fixed → long**：不动任何元素。高度立刻重算（`max(元素底部) + bottomGap`），如果原来内容没铺满 900，页面可能"缩短"，这是对的。
- **long → fixed**：不动任何元素。高度**冻结**成当前值，写进输入框让用户自己调。
- **内容永不删除**。这是硬规则。

---

## 三、Long Page 怎么实现才能避免无限画布（问题 5）

### 3.1 核心机制：高度是"派生值"，不是"用户输入"

```js
// 新增 src/js/page.js
function computeContentBottom() {
  let bottom = 0;
  for (const el of state.elements) bottom = Math.max(bottom, el.y + el.height);
  return bottom;
}

function syncPageHeight() {
  if (state.canvas.mode !== "long") return;          // fixed：height 归用户所有
  const gap = state.canvas.bottomGap ?? 80;
  const min = state.canvas.minHeight ?? 900;
  const target = Math.max(min, computeContentBottom() + gap);
  if (target === state.canvas.height) return;        // 没变就不动 DOM
  state.canvas.height = target;
  applyCanvasSize();                                 // 只写 style.width/height
}
```

**不变量**：`state.canvas.height` 永远等于"现在的页面高度"，无论谁写的。
- fixed 模式 = 用户在面板里写的。
- long 模式 = `syncPageHeight()` 算的。

这样 1.1 表格里那 7 个读取点全部继续正确，不需要改造。

### 3.2 什么时候触发重算

| 时机 | 缩不缩 |
|---|---|
| 新建元素 / 删除 / 复制 / 粘贴 | 都算 |
| 拖动结束（pointerup） | 都算 |
| 缩放结束（pointerup） | 都算 |
| 撤销 / 重做 / 载入存档 | 都算 |
| **拖动过程中** | **只长不缩** |
| **缩放过程中** | **只长不缩** |

拖动时若实时收缩，元素一旦触底画布就抖，体验很差。所以拖动过程中只做一件事：

```js
// drag/resize 的 pointermove 里
function growCanvasIfNeeded(y, height) {
  if (state.canvas.mode !== "long") return;
  const need = y + height + (state.canvas.bottomGap ?? 80);
  if (need > state.canvas.height) {
    state.canvas.height = need;
    applyCanvasSize();   // 一次 style 写入，成本极低
  }
}
```

松手时才调 `syncPageHeight()` 做一次回收（缩回去）。

### 3.3 为什么这不会产生"无限 DOM"

- 画布是**一个 div**，高度只是它的 CSS 高度。10000px 的高度 = 一条长滚动区，**不是** 10000px 的 DOM 节点。
- 子节点数量 = 元素数量，与页面高度**无关**。
- 唯一的真实成本是浏览器对超长滚动区的合成，实测几百个元素 + 一万多像素没有任何问题。

### 3.4 必须加的两个护栏

| 护栏 | 值 | 理由 |
|---|---|---|
| `minHeight` | 900（可改） | 空页面不会塌成一条线，看起来还像个"页面" |
| `MAX_PAGE_HEIGHT` | 建议 20000 | 到顶后停止增长，提示"已达页面高度上限"，防止用户误拖出 10 万像素 |

### 3.5 导出的真实风险（这条最容易被忽略）

`export.js` 直接 `tempCanvas.height = state.canvas.height`。浏览器对 canvas 位图有**硬限制**：

| 浏览器 | 限制 |
|---|---|
| Chrome / Edge | 单边 ≤ 65535，总面积 ≤ 268M px |
| Safari / iOS | 总面积 ≈ 16.7M px（约 4096×4096） |

`600 × 20000 = 12M px` 还安全；`600 × 30000 = 18M px` 在 Safari 上**会直接失败**（画布变空白，不报错）。

**方案**：导出前判断，超了就自动降采样，并告知用户。

```js
const MAX_EXPORT_PIXELS = 16e6;
let scale = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (w * h)));
// ctx.scale(scale, scale) 后再画，导出图上标注实际倍率
```

不做"切片导出成多张图"——那属于过度设计，V1 不需要。

### 3.6 面板变化

fixed 模式下 Canvas 面板：

```
Page Mode   [ 固定画布 | 纵向长页 ]
Ratio       [ 1:1 | 3:4 | 4:3 | 9:16 | 自定义 ]
Width  [600]      Height [900]
```

long 模式下：

```
Page Mode   [ 固定画布 | 纵向长页 ]
Width  [600]
Height 900  (Auto · 只读，灰底)
Bottom Gap [80]        ← 内容底部留白，新增
```

### 3.7 可选加分项（建议但可以砍）

在 long 模式下：

1. **新建元素落在内容底部**，而不是永远出现在 `(50, 50)` 堆叠。约 5 行代码，但对"不断往下加区块"的手感提升巨大。
2. **画布底部显示一条虚线"内容结束"标记**，让用户知道页面长到哪了。
3. **「整理成列表」按钮**：把所有元素按 y 排序，从顶部起依次排列，统一左对齐 + 固定间距。这是给"我想要 Lit.link 那种整齐堆叠"提供的一个**手动按钮**，而不是把整套流式布局塞进架构。约 20 行。

> 3 是我认为最划算的一条：它用 20 行换到了"流式布局 80% 的结果"，而不用为此引入第二套定位系统。

---

## 四、Box 分栏怎么实现（问题 6）

### 4.1 数据结构

不加新元素类型，只给 `textbox.style` 加字段：

```js
// DEFAULT_STYLES.textbox 追加
layout: "single",        // "single" | "columns" | "rows"
split: 0.5,              // 0.15 ~ 0.85，第一栏占比
gap: 12,                 // 栏间距
// Title 的样式（Body 复用现有的 fontSize / color / lineHeight）
titleFontSize: 16,
titleFontWeight: "700",
titleColor: "#333333",
titleGap: 6
```

### 4.2 渲染结构

```
.canvas-element.element-textbox
  └── .element-content          ← 背景 / 边框 / padding 完全不变
        └── .box-body           ← flex 容器，--split 用内联变量
              ├── .box-column[data-col="0"]
              │     ├── .box-title   (contentEditable)
              │     └── .box-text    (contentEditable)
              ├── .box-column[data-col="1"]
              │     └── ...
              └── .column-splitter   ← 选中时显示的拖动条
      ├── .resize-handle nw/ne/sw/se
```

CSS 要点：

```css
.box-body { display: flex; width: 100%; height: 100%; gap: var(--box-gap); }
.box-body.layout-columns { flex-direction: row; }
.box-body.layout-rows    { flex-direction: column; }

.box-column { display: flex; flex-direction: column; overflow: hidden;
              min-width: 0; min-height: 0; }   /* min-* 必须，否则 flex 撑不缩 */
.box-column[data-col="0"] { flex: 0 0 var(--split); }   /* 内联传 50% */
.box-column[data-col="1"] { flex: 1 1 0; }
```

用 `--split: 50%` 这个 CSS 变量而不是每次重算 `flex-basis`，是因为分隔条位置也能用同一个变量定位：

```css
.box-body.layout-columns .column-splitter {
  position: absolute; width: 10px; top: 0; bottom: 0;
  left: calc(var(--split) - 5px); cursor: col-resize;
}
.box-body.layout-rows .column-splitter {
  position: absolute; height: 10px; left: 0; right: 0;
  top: calc(var(--split) - 5px); cursor: row-resize;
}
.canvas-element.selected .column-splitter { display: block; }
```

（需要给 `.element-textbox .element-content` 补 `position: relative`。）

### 4.3 比例拖动

新增 `src/js/columns.js`，完全对照 `resize.js` 的写法：

```js
state.columnDrag = { active: false, boxId: null, startClient: 0, startSplit: 0, axis: "x", extent: 0 };
```

- pointerdown 在 `.column-splitter` 上 → `stopPropagation()`，否则会被 `drag.js` 当成拖动整个 Box。
- 计算：`newSplit = clamp(0.15, 0.85, startSplit + (clientX - startClient) / extent)`
- 直接改 `box.style.split` + 更新内联 `--split`，pointerup 时才 `saveState() + pushHistory()`。

> **注意**：`drag.js:17-22` 已经为 `.resize-handle` 做了 "先判断是不是控制点" 的分支。分隔条要**同样**在 `drag.js` 里加一句判断（双保险：自己的 handler 先 `stopPropagation`，父级再显式放过），保持和现有控制点一致的写法。

### 4.4 分栏和导出

导出是目前最容易被低估的部分。`export.js` 的 textbox 分支现在是"按 `\n` 切行，一行一行 `fillText`"，**完全不折行**——因为 DOM 里是 CSS 自动折行，导出一直没管。

一旦有了分栏，栏宽变窄，**不折行就会和 preview 严重不一致**（文字冲出栏外）。所以必须新增：

```js
function wrapText(ctx, text, maxWidth)   // 支持 \n + 超长词强制断行（对齐 CSS 的 word-break: break-word）
function drawTextBlock(ctx, text, x, y, w, { font, color, lineHeight, align })
```

然后 textbox 分支改成：

```js
drawBoxFrame(ctx, el);
const rect = 内容区（扣掉 border + padding + gap）;
if (layout === "columns") { 按 split 切成左右两个子矩形 }
if (layout === "rows")    { 按 split 切成上下两个子矩形 }
for (const [i, col] of columns) {
  drawTextBlock(ctx, col.title, ...titleFont);
  drawTextBlock(ctx, col.body,  ...bodyFont);
}
```

**顺手收益**：这个 `drawTextBlock` 也可以给 `text` 元素用——它现在导出也不折行，和编辑器不一致。属于已存在的 bug，可以一起修。

---

## 五、Title + Body 放在哪一层（问题 7）—— 这是最关键的一个决定

### 结论：**挂在"列"上，不挂在 Box 上。**

```
Box
 └── columns: [ {title, body}, {title, body} ]   ← 永远存 2 个
```

`layout === "single"` 时只渲染 `columns[0]`，但 `columns[1]` 的内容**保留在数据里**。

### 为什么不是"Box 一个 Title + 一个 Body"

因为那在左右分栏下**立刻就不成立了**：左边一栏和右边一栏各自需要自己的标题。一旦支持分栏，Title/Body 就只能是"列"的属性。

### 为什么不做"任意数量的列 / 嵌套列"

- 只支持 1 栏和 2 栏，`columns` 数组永远长 2。逻辑是常量复杂度。
- 不做嵌套 —— 那正是你列的禁止项（多级嵌套 Container）。
- 将来真要 3 栏，只是 `columns.length` 变成 3 + 面板多一组输入，渲染代码不用改。

### 内容结构

```js
// 现在
content: "Your text here"

// 之后
content: {
  columns: [
    { title: "", body: "Your text here" },
    { title: "", body: "" }
  ]
}
```

**迁移**（放进 `migrateOldElementTypes()`，和现有迁移一个地方）：

```js
if (el.type === "textbox" && typeof el.content === "string") {
  el.content = { columns: [{ title: "", body: el.content }, { title: "", body: "" }] };
}
```

再加一个 `getBoxColumns(el)` 兜底 helper，即使迁移没跑到也返回合法结构。

### Title 什么时候显示

**`title` 非空就渲染，为空就不渲染。** 不额外加 `showTitle` 开关。

理由：`{title:"", body:"正文"}` 和 `{title:"标题", body:"正文"}` 两种状态已经足够表达，多一个布尔量就多一个可能和数据打架的状态。面板里给一个 Title 输入框，用户不填就是没有标题。

### 编辑交互怎么改

现在双击 → `.box-inner` 变 contentEditable。改成：

```js
// 每个 .box-title / .box-text 自己带 data-col 和 data-part
node.dataset.col  = "0" | "1"
node.dataset.part = "title" | "body"

// blur 时写回
const { col, part } = node.dataset;
el.content.columns[Number(col)][part] = node.textContent;
```

`updateElementDOM` 里现有的 `editing` 守卫要改成**按节点判断**（`node.isContentEditable`），否则改 A 栏会把正在编辑的 B 栏刷掉。

面板侧：最多 2 栏 × 2 个字段 = 4 个输入框，全部平铺出来，不需要引入 `selectedColumn` 这种新状态。字段名用 `box.col0.title` 这种前缀，在 `onPropertyInput` 里加一个小分支：

```js
if (field.startsWith("box.")) {
  const [, col, part] = field.split(".");
  el.content.columns[Number(col)][part] = value;
}
```

### 分栏里要不要能放图片

**建议 V1 不放。**

- 你的示例树里 Column 下面有 Image，我理解那是表达"方向"。
- 但"图片进列"会引入：列内坐标系统、列内图片的 fit/crop、列内图片的导出裁剪、和现有自由 Image 元素的关系——这是**一次小的嵌套容器改造**，正好撞上你要避免的东西。
- 现在要"左图右文"，直接用独立的 `Image` + `Text Box` 并排摆就行，视觉结果一样。

数据结构上留了口子（`columns[i]` 将来加 `image` 字段即可），但 V1 不做。**这一条需要你拍板。**

---

## 六、推荐的数据结构总览

```js
// state.canvas —— 保持对象名不变，只加字段（12 处引用一行不动）
state.canvas = {
  mode: "fixed",           // ← new: "fixed" | "long"
  ratio: "custom",         // ← new: "1:1" | "3:4" | "4:3" | "9:16" | "custom"
  width: 600,
  height: 900,             // fixed: 用户值；long: 派生值（真源不变）
  background: "#ffffff",
  backgroundImage: null,
  minHeight: 900,          // ← new: long 模式空页面下限
  bottomGap: 80            // ← new: long 模式内容底部留白
};

// Element —— 结构完全不变
{ id, type, x, y, width, height, rotation, zIndex, content, style }

// textbox.style —— 追加
{ layout: "single", split: 0.5, gap: 12,
  titleFontSize: 16, titleFontWeight: "700", titleColor: "#333333", titleGap: 6,
  ...SURFACE_DEFAULTS, paddingH, paddingV, fontSize, color, lineHeight, textAlign, boxStyle }

// textbox.content —— 从字符串变成结构化
{ columns: [ { title: "", body: "" }, { title: "", body: "" } ] }
```

**为什么 `state.canvas` 不改名成 `state.page`**：改名会碰 7 个文件共 12 处引用 + 存档迁移，纯粹是命名收益，没有功能收益。在 `state.canvas` 上加一行注释说明"它就是 Page"更划算。（如果你更在意命名整洁，现在改也行，趁数据结构还没被更多代码依赖。）

---

## 七、Page / Box / Column / Element 关系

```
Page（= state.canvas）
│   mode: fixed | long
│   width / height（long 下 height 派生）
│
└── Element[]（扁平数组，绝对坐标，互相不知道对方存在）
    │
    ├── text / image / sticker / divider / label
    │
    └── textbox（Box）
        │   layout: single | columns | rows
        │   split: 0.5
        │
        └── Column[1..2]        ← 不是 Element，是 Box 内部的文本槽
            ├── title : string
            └── body  : string
```

**注意最后两层的性质**：Column 不是 Element，不进 `state.elements`，没有 id、没有坐标、不能单独选中或拖动。它只是 `content.columns` 数组里的一个对象。

这一点是整个方案能保持"轻量"的原因——**没有引入新的元素层级**，只是让一个已有元素能渲染出两个文本区。你的示例树里 Column 下面是 Title/Body/Image/Decoration，我这里刻意收窄成 Title/Body 两个文本槽，就是为了不引入嵌套。

---

## 八、实现方案（分阶段，每阶段可独立验收）

### Phase A — Page Mode（不含分栏）≈ 改动 6 个文件

1. `state.js`：给 `state.canvas` 加 `mode / ratio / minHeight / bottomGap`。
2. 新建 `src/js/page.js`：`isLongPage()` / `applyPageRatio()` / `computeContentBottom()` / `syncPageHeight()` / `growCanvasIfNeeded()` / `applyCanvasSize()`。
3. `canvas.js`：Canvas 面板加 Page Mode 分段控件 + Ratio 网格；long 下 Height 变只读。
4. `drag.js` / `resize.js`：夹取逻辑按 mode 分支（long 放开 y 上限），拖动中调 `growCanvasIfNeeded()`。
5. `elements.js`：创建/删除/复制后调 `syncPageHeight()`。
6. `storage.js` + `history.js`：存档里 `canvas` 已经整体存了，**不需要改**（`loadState()` 之后再调一次 `syncPageHeight()` 即可）。

**验收**：切成 long → 拖动一个元素到画布底部 → 画布变长 → 松手不回弹 → 删掉它 → 画布缩回。导出得到一张纵向长图。切回 fixed → 所有元素位置不变。

### Phase B — Box 分栏 + Title/Body ≈ 改动 7 个文件

1. `elements.js`：`DEFAULT_STYLES.textbox` 加字段；`content` 迁移；`getBoxColumns()` / `getBoxLayout()`；`renderElementToCanvas` / `updateElementDOM` 的 textbox 分支重写（含按节点判断的编辑守卫）。
2. 新建 `src/js/columns.js`：分隔条拖动。
3. `drag.js`：放过 `.column-splitter`。
4. `canvas.js`：box 面板加 Layout 分段控件 + Split 滑条 + Gap；把单个 Content textarea 换成 Title/Body 输入组（单栏 1 组，分栏 2 组）；`onPropertyInput` 加 `box.*` 分支。
5. `export.js`：新增 `wrapText()` / `drawTextBlock()`；重写 textbox 分支。
6. `components.css`：`.box-body` / `.box-column` / `.box-title` / `.box-text` / `.column-splitter`。
7. `index.html`：引入 `page.js`、`columns.js`（顺序：`state.js` → `elements.js` → ... → `page.js` 放在 `elements.js` 之前或之后都行，只要没有顶层调用；`columns.js` 放 `crop.js` 附近）。

**验收**：旧作品打开后外观完全不变；切成左右分栏 → 两栏各有标题正文 → 拖分隔条改比例 → 导出和画布一致；切回单栏 → 第二栏内容还在，只是不显示。

### Phase C — 长页面手感打磨（已完成）

1. [x] 新建元素在 long 模式下落到内容底部。
2. [x] 画布底部"内容结束"虚线。
3. [x] 「整理成列表」按钮。
4. [x] 拖动到视口边缘自动滚动。
5. [x] 导出超限自动降采样 + 提示（Phase A-5 已完成）。

### Phase D — V1 收尾（导出补齐 / 一致性 / 清理）

> 判断依据只有一条：**画布上看得见的东西，导出 PNG 里必须也在，而且长得一样。**
> 凡是踩到这条线的排前面，其余按"改动成本 × 手感收益"排。

**D-1 补 `sticker` / `divider` 的导出分支** ★唯一一处"画布 ≠ 导出图" —— **[已完成 2026-09-19]**

- 现象：`export.js` 主循环只有 `text` / `textbox` / `image` / `label` 四个分支，落到
  `else` 就 `restore()` 走人。而组件库（`index.html`）里有 `data-type="divider"` /
  `data-type="sticker"` 两个按钮，`canvas.js` 也各自配了属性面板 —— 用户能放、能调，
  导出时**静默消失**，没有报错、没有提示。
- 范围：`export.js` 加两个分支，几何照抄预览。
  - `sticker`：字形在元素框内居中（`.element-sticker .element-content` 是 flex 居中），
    `${fontSize}px sans-serif`，颜色 / 透明度跟随。
  - `divider`：`.divider-line` 是 `width: 100%` + `height: lineWidth` + 垂直居中 +
    `border-radius: 1px`，所以画成一条贴满元素宽度的圆角横线。
- 验收：一个含贴纸 + 分隔线的页面，导出的 PNG 里两个都在，位置 / 颜色 / 粗细与画布一致。
- 结果：像素级探针 14 条全过（贴纸垂直偏差实测 1.1px，不需要字体度量补偿）。
  验证方式与全部数字见 `TODO.md` 11.1。

**D-2 `label` 的 `letterSpacing` / `textTransform` 没进导出** —— **[已完成 2026-09-19]**

- 现象：预览里 label 靠 CSS 吃到 `text-transform: uppercase` 和 `letter-spacing: 1px`
  （`components.css:334`），导出分支只 `fillText(el.content)` —— 小写照画小写、没有字距。
- 范围：`export.js` label 分支。`ctx.letterSpacing` 在 Chromium 上已可用，赋值失败也只是
  回落成 0 字距，不会报错。
- 验收：小写内容导出后是大写，字距与画布一致。
- 结果：新增纯函数 `applyTextTransform()`；探针以"独立绘制"为参考比对，
  导出墨迹量与大写参考**精确相等**（631 = 631），字距宽度 61 / 64 / 79 与参考一致。
  全部数字见 `TODO.md` 11.2。

**D-3 清掉三个死函数**

- `initGrid()` / `initAssets()` / `clearState()` 声明了从未被调用（`initAssets` 还是空函数，
  `initGrid` 的活已由 `toggleGrid()` 干了）。纯删除，零风险。
- 结果：顺手做了一次全局孤儿扫描（顶层函数 + 全大写常量按引用计数找），共清掉四个声明
  （多一个 `ASSET_STORE_KEY`），复扫归零。全量 `node --check` 通过，两套探针
  28/29 与 29/29 全过。见 `TODO.md` 11.3。

**D-4 `ARCHITECTURE.md` 模块清单补齐**（纯文档）

- 清单停在 Phase 1：缺 `page.js` / `columns.js` / `crop.js` / `history.js` / `alignment.js`
  五节，Phase A / B / C 也都没进去。
- 结果：补齐五节并按真实加载顺序重排章节（16~28 → 21~33，新增 §34）；另修掉一处
  硬缺陷 —— 原文第 28 节断在 `state.sele` 半句话上。同时校准了 §3 目录、§5 State、
  §19 导出一致性、§22 依赖边，并记录「形状几何在预览/导出是两套实现」这个例外。
  见 `TODO.md` 11.4。

**D-5 Box 的垂直对齐开关（Top / Middle / Bottom）**

- 现状：单栏写死垂直居中（`justify-content: center`），分栏各栏顶对齐，用户没法改。
- 范围：`style.vAlign` 一个新字段 + `components.css` + `export.js#drawBoxColumn` 同步，
  面板给三个分段按钮。默认值取现在的行为（单栏 middle / 分栏 top），老作品不变。
- 结果：只加了一个字段和三条 CSS 规则，没动 `boxStructureSignature()`（换 class 不改
  DOM 形状，所以走增量路径）。**顺带修掉一处既有的预览/导出不一致**：原文
  `drawBoxColumn` 在内容比栏高时会回落到顶对齐，而预览是居中后向上探出再被
  `overflow: hidden` 裁掉 —— 导出侧改成同一套数学并 `ctx.clip()` 到栏矩形。
  探针 46 条全过；预览位移 189.6px vs 导出 190px。见 `TODO.md` 11.5。

**D-6 分栏下每栏各自的 Text Align** —— 已完成（2026-09-19），见 `TODO.md` 11.6

- 现状：`style.textAlign` 整框生效，两栏想一个左一个右做不到。
- 范围：把 align 挪到栏上（`content.columns[i].align`），面板每栏一个控件，导出同步。
  读取时 `column.align ?? style.textAlign` 兜底，老数据不动。
- 结果：加了 `readColumnAlign()` 与每栏的 L/C/R；整框的 Align 控件移除（两个控件会互相
  打架）。**写探针时抓到一个真 bug**：`components.css` 的 `--split` 规则没有区分单栏，
  于是单栏 Box 的预览栏宽只有内容区一半，而导出的 `boxColumnRects()` 用的是全宽 ——
  实测 138 vs 276，居中时差 69px。补了一条 `layout-single` 全宽规则，并把 `--split`
  限定到分栏布局。探针 60 条全过；`left→right` 位移预览 245.0px vs 导出 245px。

**D-7 缩放时也自动滚动** —— 已完成（2026-09-20），见 `TODO.md` 11.7

- 现状：自动滚动只接了拖动（`drag.js`），拖右下角 resize 到视口边缘不会滚。
- 范围：把 `autoScrollStepFor` / `runAutoScroll` 从 `drag.js` 抽成共享的（或复制同一套到
  `resize.js`），并同步补偿 resize 的起点。
- 结果：新建 `src/js/autoscroll.js`，drag / resize 共用一套滚动 + 起点补偿，唯一分叉是
  `reapplyCanvasInteraction()`（走 `reapplyDrag()` 还是 `reapplyResize()`）。resize 侧
  为此把几何计算抽成 `applyResize(domEl)` 并新增 `state.resize.pointerX / pointerY`
  （与 `state.drag` 同一契约）。探针 28 条全过：手柄屏幕位置 809.0 → 809.0 精确不变、
  高度增量 == 滚动量（85 == 85）；故意移除补偿后 4 条断言立刻失败（偏差正好 85px），
  证明断言有区分度。全量回归 191 条全过。
- 过程中发现一个结构隐患：5 个探针各维护一份自己的 `<script>` 清单，新增 js 文件时
  极易遗漏（`probe-phase-c` 当场报 `autoScrollStepFor is not defined`）。已给全部探针
  补齐并写进 `ARCHITECTURE.md` §3，另加了 `tools/run-probes.js` 一把全跑。

**D-8 小项打包（可选，按需挑）** —— 2026-09-20 逐项核对过现状

先核对再动手，因为这份清单是**凭印象写的，已经过时**（其中一项早已实现）。核对结论：

| 项 | 现状（代码取证） | 结论 |
|---|---|---|
| `rounded` 形状与 `Radius` 滑条效果重叠 | 重叠**已被互斥化解**：面板里 `if (!shape)` 才渲染 Radius 滑条（`canvas.js:465`），有形状时形状自己管圆角。`rounded` 是固定圆角（`elements.js:219`） | 只剩"要不要删掉 `rounded` 这个入口"的取舍 —— **要你拍板** |
| Image 面板加「替换图片」入口 | **已经做了**：`#btn-change-image` + `#image-file`，且替换后刷新 `naturalWidth / naturalHeight`，重新裁剪不会用旧比例（`canvas.js:387 / 847`） | 从清单划掉，无需做 |
| 投影支持多层叠加 | 真缺口。`style` 里是单层：`shadowX / shadowY / shadowBlur / shadowSpread` + `boxStyle: shadow-soft / shadow-hard` | 属新功能，**要你拍板** |
| 裁剪模式支持缩放 | 真缺口。只有平移（`startCropPan`）、改框（`startCropResize`）、正方吸附（`snapCropToSquare`），**没有滚轮或按钮缩放**；图比框小时被 `clampCropDraft()` 夹住 | 要动就得先定交互（滚轮？工具栏 +/-？），**要你拍板** |
| 扩展更多裁剪形状 | 现有 7 种（none / rounded / circle / heart / star / diamond / arch）。成本很低：`SHAPE_PATHS_100` 加一条路径 + `shapeSvgNode` 加一个分支 + 标签表加一行，预览与导出自动共用 | 加**哪些**形状是产品决策，**要你拍板** |
| 7.9 形状 + 投影 + 透明背景时留白处透出投影色 | 7.9 已论证：`box-shadow` 在同条件下行为相同，**预览与导出一致**，规避方式是给框一个背景色 | 它不是"预览 ≠ 导出"的不一致，改它属于变更视觉语义，**要你拍板** |

**结论：D-8 里没有可以单方面安全落地的项。** 六项要么是产品决策（删哪个入口 / 加哪种形状 /
要不要加缩放），要么已被论证为预期行为，要么早就做完了。全部留给你拍板 —— 其中
「加更多裁剪形状」的性价比最高（改动最小、收益直接）。

**不做**：`prd.md` 的既有范围之外的新功能（如多页、导出 PDF、协作），本轮一律不碰。

---

## 九、涉及文件清单（问题 8）

| 文件 | Phase | 改动性质 |
|---|---|---|
| `src/js/state.js` | A | 加 4 个字段 + `state.columnDrag` |
| `src/js/page.js` | A | **新建**，约 90 行 |
| `src/js/canvas.js` | A+B | 面板：Page Mode / Ratio / Layout / Split / Title-Body；`onPropertyInput` 加 `box.*` 分支 |
| `src/js/drag.js` | A+B | y 夹取按 mode 分支；拖动中长画布；放过 `.column-splitter` |
| `src/js/resize.js` | A | 右下边界夹取按 mode 分支；长画布 |
| `src/js/elements.js` | A+B | 默认样式、content 迁移、box 渲染/更新、几何 helper |
| `src/js/columns.js` | B | **新建**，约 70 行 |
| `src/js/export.js` | A+B | 位图尺寸 + 降采样；`wrapText` / `drawTextBlock`；textbox 分栏绘制 |
| `src/css/components.css` | B | 分栏 + 分隔条样式 |
| `src/index.html` | A+B | 加两个 `<script>` |
| `src/js/storage.js` | — | **不用改** |
| `src/js/history.js` | — | **不用改**（canvas 已在快照里） |
| `src/js/crop.js` | — | **不用改**（它读的 `canvas.height` 在 long 下也会是正确值） |
| `src/js/alignment.js` | — | **不用改** |
| `prd.md` / `ARCHITECTURE.md` / `TODO.md` | 全程 | 补章节 |

---

## 十、冲突与风险（问题 9）

### 高

1. **`state.canvas.height` 的时序。** 它是 7 个文件的夹取依据。如果 long 模式下 `height` 是过期值，元素会被夹在旧的底部，表现为"拖不下去"。**约束**：任何改变元素 y/height 的路径，都必须在夹取之前或紧跟着调 `syncPageHeight()` / `growCanvasIfNeeded()`。这是本次需求**唯一**真正需要小心的点。
2. **`box.content` 从字符串变成对象。** 凡是直接对它做字符串操作的地方都会坏。已知触点：`canvas.js:413`（textarea value）、`elements.js:624`（`inner.textContent = el.content`）、`elements.js:643`（写回）、`export.js` textbox 分支（`String(el.content)`）、`canvas.js:486` 附近的其他分支不受影响。`duplicateElement` 和剪贴板已经是深拷贝/JSON，安全。
   **规避**：所有读写都走 `getBoxColumns(el)`，不要在任何地方直接摸 `el.content` 的字符串形态。
3. **导出 canvas 位图尺寸上限**（见 3.5）。长页面在 Safari 上可能直接导出空白。

### 中

4. **导出折行规则要和 CSS 完全一致。** DOM 用 `word-break: break-word`，Canvas 手写的 `wrapText` 必须也支持"超长英文单词强制断行"，否则会不一致。中日文之间无空格，要按字符断行；纯英文按空格断词。
5. **`.canvas-element.selected` 的 outline 会被分栏视觉干扰。** 分隔条在选中态显示，选中框是 `outline: 2px solid; outline-offset: 2px`，两者不冲突，但分隔条要设 `z-index` 高于 `.resize-handle`（10）。
6. **`columns.css` 的百分比定位。** `left: calc(var(--split) - 5px)` 中 `--split` 是 `50%`，百分比在 `left/top` 上按包含块解析，行为正确。但 `.element-content` 必须补 `position: relative`，否则会被解析到 `.canvas-element` 上（尺寸不同，位置会偏）。**这个坑和之前 Grid 那次 `background` 简写覆盖是同类问题，值得注意。**
7. **Ratio 与手改宽高的关系。** 用户选了 `3:4` 后又手改 Height，`ratio` 应该自动退回 `custom`，否则面板上显示 `3:4` 但实际不是，会让人困惑。

### 低

8. `New` 按钮目前只清空 `elements`。建议**保留** page mode 和尺寸（符合"clear canvas and start new"的语义）。
9. long 模式下元素仍然可以被拖到 x 越界？不会，x 夹取保持不变。
10. 空 long 页面高度 = `minHeight`，不会出现 0 高度。

---

## 十一、最小改动方案（问题 10）

如果只想先要"能用的两种模式"，砍到最小：

**只做 3 件事，改 3 个文件，约 120 行：**

```
1. state.js   →  state.canvas.mode = "fixed" | "long"（加 1 个字段）
2. page.js    →  新建，只含 computeContentBottom() + syncPageHeight()（约 25 行）
3. canvas.js  →  Canvas 面板加一个两选一分段控件（约 40 行）
   drag.js    →  y 上限按 mode 分支 + growCanvasIfNeeded（约 15 行）
   elements.js→  create/delete/duplicate 后调 syncPageHeight（3 行）
```

**不含**：比例预设（用户手填宽高即可）、bottomGap / minHeight 可调（写死 900 / 80）、新建元素落底部、整理成列表、导出降采样。

这版能跑通"固定 ↔ 长页切换、内容增长页面变长、导出纵向长图"，且**不碰 Box、不碰 export 的分栏逻辑**。分栏和 Title/Body 完全独立，可以之后单独做，互不影响。

---

## 十二、实现顺序建议

```
Phase A-1  page.js + state 字段 + Canvas 面板模式开关   ← 先只有切线、不动逻辑
Phase A-2  drag/resize 按 mode 放开 y 夹取 + growCanvasIfNeeded
Phase A-3  create/delete/duplicate/undo 后 syncPageHeight
Phase A-4  导出：纵向长图（先不降采样，只验证高度正确）
Phase A-5  导出降采样护栏 + MAX_PAGE_HEIGHT
────────── A 到此可完整验收，先让你试手感，再决定 Phase C 的加分项 ──────────
Phase B-1  textbox content 结构化 + 迁移 + getBoxColumns（先只渲染 Title+Body，单栏）
Phase B-2  单栏的 Title/Body 编辑 + 面板 + 导出折行（wrapText / drawTextBlock）
Phase B-3  columns / rows 渲染 + CSS + split 变量
Phase B-4  columns.js 分隔条拖动
Phase B-5  导出分栏绘制
Phase C    手感打磨（可选）
```

**B-1/B-2 单独交付是有意义的**：即使不做分栏，"Box 里有独立的 Title 和 Body"本身对 Bio 排版就是有用的，而且它把 content 结构化的风险提前隔离出来，B-3 之后就只有纯几何问题了。

---

## 十三、需要你拍板的 4 件事

| # | 问题 | 我的建议 |
|---|---|---|
| 1 | **Long 模式 = 自由摆放 + 高度跟随内容**，还是**真正的流式堆叠**（区块自动上下排、互相推挤）？ | 选前者。后者=第二套定位系统，直接违反"不要维护两个编辑器"，且改动量是前者的 5~10 倍 |
| 2 | **分栏里要不要能放图片？** | V1 不放，只放 Title + Body。要"左图右文"用现有的独立 Image + Text Box 拼。数据结构留口子 |
| 3 | **`state.canvas` 要不要顺便改名成 `state.page`？** | 不改。纯命名收益，要碰 12 处引用 + 存档迁移 |
| 4 | **Phase C 的三条加分项**（新建元素落底部 / 内容结束虚线 / 整理成列表按钮）要不要做？ | 至少做「新建元素落底部」，对长页手感提升最大；「整理成列表」性价比也很高 |

确认后我按 Phase A 开始写，A 做完先给你试，再进 Phase B。

---

## 十四、Phase E - 窄屏适配（已完成 2026-09-20）

D-7 之后计划里只剩 D-8，而 D-8 六项全部需要拍板，于是按"没计划就做手机显示适配"推进。

**E-1 布局：侧栏变抽屉**（断点 820px）

左抽屉宽 `min(300px, 84vw)`、底抽屉高 `min(58vh, 520px)`、遮罩 + 关闭按钮、
右下角悬浮按钮组。开关状态就是 `body.drawer-left` / `body.drawer-right`。
关闭按钮由 JS 注入，桌面 DOM 零改动。

**E-2 画布视口缩放**

`scale = min(1, 可用宽 / 画布宽)`，只缩不放。用 `transform: scale()` 显示，
`.canvas-wrapper` 的尺寸同步成 `画布尺寸 × scale`（transform 不改布局盒）。
scale 写到 `--canvas-scale` 上供 CSS 补偿手柄尺寸。

**E-3 坐标换算**

`toCanvasDelta()` 接上 drag / resize / crop 三处 —— 指针增量是屏幕像素，
元素坐标是画布单位，不换算的话画布缩到 0.6 时元素只跟手 60%。

**E-4 触摸细节**

`touch-action` 分流（空白画布 `pan-y` 可滚、选中元素 `none` 可拖）、
`100svh`（地址栏不跳）、`env(safe-area-inset-bottom)`、滚动条宽度预留
（防"缩放 ↔ 滚动条"互相追）。

**验证**

新增 `tools/probe-device.js`：Edge 的窗口最小宽度约 490px，`--window-size=390`
拿到的其实是 492，所以改用 CDP `Emulation.setDeviceMetricsOverride` 拿真机尺寸，
顺便支持截图。探针 `probes/probe-phase-mobile.html` 在 320 / 390 / 768 /
1100 / 1440 五种宽度下断言，桌面侧不回归。

**没做**：双指缩放、触屏长按菜单、多选框选。
