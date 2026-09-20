# TODO - V1 收尾计划

> 本文档记录 Moe Bio Editor V1 收尾阶段要做的事情。
> 按 Phase 顺序推进，每完成一项打勾。

---

## Phase 4 - 组件库与素材管理（收尾）

### 4.1 素材删除

- [x] 在 My Assets 的每个素材卡片右上角加一个 × 删除按钮
- [x] 点击后从 `state.assets` 移除并重新渲染
- [x] 同步保存到 localStorage
- [x] hover 素材时才显示删除按钮，避免误触

**实现位置**：`assets.js` + `components.css`

---

### 4.2 素材点击放入画布

- [x] 点击 My Assets 中的素材 → 直接在画布创建一个 image 元素
- [x] 初始位置：画布中央偏移（避免堆叠）
- [x] 初始尺寸：按图片真实宽高比，最大边 200px
- [x] 不做拖拽放入（用户明确说不用）

**实现位置**：`assets.js`（`renderAssets` 绑定 click 事件）

---

## Phase 6 - 进阶交互

### 6.1 Undo / Redo

- [x] 每次实质性操作后 push 快照
- [x] Ctrl+Z → undo
- [x] Ctrl+Shift+Z 或 Ctrl+Y → redo
- [x] History 上限：50 条

**实现位置**：`history.js`，`app.js`

---

### 6.2 智能对齐辅助线

- [x] 拖动元素时检测与其他元素的对齐关系
- [x] 阈值 5px，显示紫色虚线辅助线并吸附

**实现位置**：`alignment.js`，`drag.js`

---

### 6.3 层级调整

- [x] 属性面板底部加 `置顶` / `置底` 按钮
- [x] 更新 zIndex 并反映到 DOM

**实现位置**：`elements.js`，`canvas.js`

---

## Polish / 优化

### 7.1 画布背景

- [x] 无元素选中时右侧显示 Canvas 属性
- [x] 背景色、上传背景图片、清除背景图片
- [x] 使用 `background-color` + `background-image` 共存

**实现位置**：`canvas.js`，`state.js`

---

### 7.2 图片自由变形 + 预设裁剪

#### 自由变形
- [x] 图片 resize 默认保持比例
- [x] 属性面板 `锁定 / 自由` 开关
- [x] 关闭后可自由拉长拉宽

#### 预设裁剪
- [x] 移除四边滑条裁剪
- [x] 改为预设形状：none / circle / rounded / heart / star / diamond / arch
- [x] 使用 CSS `clip-path` 实现
- [x] 导出 PNG 时也应用相同裁剪（Canvas Path2D）

**实现位置**：`elements.js`，`canvas.js`，`export.js`

---

### 7.3 Box 拆分为 Text Box / Image Box + 样式预设

- [x] `Box` 拆成两个组件按钮：`Text Box`（放文字）和 `Image Box`（放图片）
- [x] Text Box 支持样式预设：`default` / `shadow-soft` / `shadow-hard` / `dashed`
- [x] Image Box 支持相同样式预设 + 内部图片 Fit（cover / contain）+ 裁剪形状
- [x] 旧数据 `type: "box"` 自动迁移为 `textbox`
- [x] 导出支持阴影/虚线框/裁剪

**实现位置**：`elements.js`，`canvas.js`，`export.js`，`components.css`，`index.html`

---

### 7.4 图片裁剪模式（方案 B）

- [x] 图片元素属性面板加「裁剪」按钮，进入独立裁剪模式
- [x] 裁剪模式：元素 x/y/width/height 就是裁剪框，`content.crop` 记录图片在框内的位置
- [x] 双层图片实现：底层 30% 透明显示框外内容，上层 clip 到形状显示框内效果
- [x] 四角控制点可调整裁剪框大小，**所有形状宽高独立自由拉伸**（按住 Shift 保持 1:1）
- [x] 拖动裁剪框内部可平移图片，决定显示哪一部分
- [x] 自动 clamp：图片始终盖满裁剪框，不出现空白
- [x] 形状预设：矩形 / 正方形 / 圆形 / 心形（圆形心形真透明，无白色底）
- [x] 选中正方形/圆形只做一次 1:1 摆正，之后仍可自由拉伸（圆→椭圆、方→矩形）
- [x] 完成 / 取消（Esc 取消），完成后元素 id 不变，可反复重新裁剪
- [x] 导出 PNG 按几何参数 + Canvas clip 绘制，形状与预览一致
- [x] 旧的快捷形状（Crop Shape 网格）已并入裁剪模式，避免两套形状概念
- [x] 修复 heart / arch 使用 CSS `path()` 不随元素缩放的问题（改用 SVG `clipPath` objectBoundingBox）

**实现位置**：新增 `src/js/crop.js`；改动 `state.js` `elements.js` `canvas.js` `drag.js` `resize.js` `export.js` `history.js` `app.js` `components.css` `index.html`

---

### 7.5 裁剪后的图形可自由拉宽高

- [x] 移除裁剪模式里正方形/圆形的 1:1 强制，改为「点击形状 = 摆正一次，拖控制点 = 自由」
- [x] 按住 Shift 拖控制点保持 1:1
- [x] `getClipPath("circle")` 由 `circle()` 改为 `ellipse()`，圆形拉成椭圆后渲染正确
- [x] 导出 PNG 的 `circle` 由 `ctx.arc` 改为 `ctx.ellipse`，椭圆能正确导出
- [x] 裁剪后的图片恢复 `锁定 / 自由` 开关，自由模式下可非等比拉伸
- [x] **裁剪几何从绝对像素改为比例存储**：`crop = { shape, ix, iy, iw, ih }`
      —— 图片位置/尺寸全部相对元素框，元素被拉伸时图片自动跟随，不再露出空白
- [x] 旧数据（`offsetX/offsetY/scale`）通过 `getCropGeometry()` 兼容读取，无需迁移脚本
- [x] 显式设置 `object-fit: fill`，避免样式表的 `contain` 让图片在拉伸后的框里留白

**实现位置**：`crop.js` `elements.js`（新增 `getCropGeometry`）`resize.js` `export.js` `canvas.js` `components.css`

---

### 7.6 颜色透明度 + 内外边框 + 图片投影

用户反馈三件事：Box 背景「怎么改都是 transparent」、改颜色时也要能调透明度、边框要分内/外、图片也要边框和投影。

#### 7.6.1 修复 Background 改不动

- [x] **根因**：`canvas.js#onPropertyInput` 里有一句隐式转换——
      颜色选成 `#ffffff` 就静默存成 `"transparent"`。
      而面板显示的是 `el.style.backgroundColor`，所以选白色后依然显示 `transparent`，
      看起来就是「怎么改都改不动」。
- [x] 删掉这段隐式转换。透明改为**显式**控制：把 alpha 拉到 0 才是透明。

#### 7.6.2 颜色 + 透明度

引入统一的「颜色 + 透明度」行控件（`color-alpha`）：色块 + alpha 滑条 + 百分比。

- [x] 颜色字段存 hex（`backgroundColor` / `borderColor` / `borderOuterColor` / `shadowColor`）
- [x] 透明度字段存 0~1（`backgroundAlpha` / `borderAlpha` / `borderOuterAlpha` / `shadowAlpha`）
- [x] 渲染时用 `withAlpha(hex, a)` 拼成 `rgba()`
- [x] 滑条在 DOM 里用 0~100 的整数，写入 state 时除以 100，避免浮点滑条手感差

#### 7.6.3 内边框 / 外边框

| 边框 | 实现 | 位置 |
|---|---|---|
| 内边框 | `border`（沿用旧字段 `borderWidth` / `borderColor` + 新 `borderAlpha`） | `.element-content` |
| 外边框 | `outline` + `outline-offset: 0` | `.canvas-element`（外层） |

- [x] 内边框用 `border`：因为 `box-sizing: border-box`，它天然是「压在内容内侧」的效果，
      并且对被 `clip-path` 裁剪的图片会变成**环形描边**（圆形图片的圆环）
- [x] 外边框用 `outline`：不占布局空间，加多少都不影响元素尺寸
- [x] 外边框和投影都挂到外层 `.canvas-element`，避免被 `content` 的 `clip-path` 一起裁掉
- [x] 外层圆角 = `borderRadius + borderOuterWidth`，让外框圆角自然外扩

#### 7.6.4 投影

- [x] 参数化：`shadowX` / `shadowY` / `shadowBlur` / `shadowSpread` / `shadowColor` / `shadowAlpha`
- [x] 四个滑条各管一件事：X / Y 偏移、B 模糊、S 粗细（扩散）
- [x] 偏移可正可负（±40），模糊 0~40，粗细 −30~30
- [x] **不做预设按钮**：B 已经是模糊，再放「柔和 / 硬边」只是帮你填一组数，属于多余的一层
- [x] `boxStyle` 只保留 `default` / `dashed` 两个框样式，不再夹带阴影预设
- [x] 原 `boxStyle: shadow-soft / shadow-hard` 的 CSS `box-shadow` 已删除 —— 否则会和
      inline 阴影叠成两层
- [x] 图片元素也加上同一套投影参数

> 7.6.4 修订历史：
> **第一轮**「柔和 / 硬边」其实是隐藏模式，一个 `S` 滑条在两种模式下含义不同。
> **第二轮**拆成 X / Y / B，预设降级为按钮。
> **第三轮**（当前）干脆去掉预设按钮，补上 `S`（扩散 / 粗细），让每个滑条只对应一个数值。
>
> 迁移规则：只在 X / Y / B **三者都缺失**时才从旧字段推导，避免把已经手调过的阴影重置掉。
> - `shadowSize: N, soft` → `X0 / Y round(0.3N) / B N`
> - `shadowSize: N, hard` → `X round(0.3N) / Y 同 / B 0`
> - 更早的 `boxStyle: shadow-soft | shadow-hard` → 按 soft 20 / hard 12 展开
> - `shadowSpread` 缺失时补 0

#### 7.6.5 导出同步

- [x] 背景 / 边框都用带 alpha 的 `rgba`
- [x] 用 `ctx.shadowColor / shadowBlur / shadowOffsetX / Y` 还原偏移与模糊
- [x] **Canvas 没有 shadow spread**，所以 `S ≠ 0` 时单独走一遍投射体：把轮廓按 `S`
      放大/缩小后填成**阴影颜色**，再让框体盖上去 —— 多出来的一圈就是扩散
- [x] 形状裁剪重构成 `buildShapePath()` 返回 `Path2D`，这样能先 `fill(path)` 画出带阴影的形状、再 `clip(path)` 画图片
- [x] `fillSilhouette()` 支持圆角，图片元素的外边框在导出时也是圆角

**实现位置**：`elements.js`（`withAlpha` / `readShadow` / `hasShadow` / `buildShadow` / `applySurface`）`canvas.js`（`colorAlphaRow` / `slimRange` / `shadowGroup`）`export.js` `components.css`

---

### 7.7 Padding 拆成上下 / 左右两个方向

用户反馈「Padding 上下也要改」——原来只有一个 `padding` 滑条，四个方向绑死。

- [x] 字段拆成 `paddingH`（左右）/ `paddingV`（上下），旧字段 `padding` 在
      `migrateOldElementTypes()` 里展开成两个方向，旧作品外观不变
- [x] `readPadding(style, fallback)` 统一读取：新字段优先 → 旧 `padding` → 类型默认值
      （Text Box 12 / Image Box 8），`applyPadding()` 拼成 `padding: Vpx Hpx`
- [x] 属性面板 Padding 组改成两个细滑条 `H` / `V`（0~60），沿用 `slimRange` 的既有样式
- [x] 导出 PNG 同步：Text Box 上下用 `paddingV`、左右用 `paddingH`；
      Image Box 内框按 `V/H` 分别内缩，且 `innerW/innerH` 兜底不为负
- [x] 顺手修导出与预览的偏差：Text Box 的文字在编辑器里是**垂直居中**的，
      导出却一直按「贴顶 + 半个字号」画。现在改成同样的居中公式，
      多行文字导出位置和画布一致

**实现位置**：`elements.js`（`readPadding` / `applyPadding` / `DEFAULT_STYLES` / 迁移）
`canvas.js`（两个 Padding 组）`export.js`

> 备忘：Text Box 的文字是垂直居中的，所以调 `V` 只有在文字撑满或接近撑满时才看得出来；
> 如果想「让文字靠上 / 靠下」，要另外加一个垂直对齐（Top / Middle / Bottom），现在没做。

---

### 7.8 Image Box 合并进 Image（去重复）

用户：「image box 和 image 功能有重复吧」——对，重叠了 6 项（形状、内外边框、投影、圆角、透明度），
而且同一个概念有两套说法。这一节记录合并方案。

#### 合并结果

只有一个图片类型 `image`，能力是原来的并集：

| 能力 | 来源 |
|---|---|
| 真裁剪（框内平移定位、可反复裁） | 原 Image |
| 锁定 / 自由比例（拖拽时） | 原 Image |
| 背景色 + 透明度、内边距 H/V、框样式 default / dashed、替换图片 | 原 Image Box |
| 形状裁剪、内外边框、投影、圆角、透明度 | 两边都有，现在只剩一份实现 |

- [x] `DEFAULT_STYLES` 只留 `image`（默认 = 裸图：无边框、无圆角、padding 0、fit contain）
- [x] 渲染收敛成 `applyImageFrame()` + `syncImageContent()` 两个函数，
      初次渲染和属性变更走同一条路径（原来是两段几乎相同的代码）
- [x] 属性面板从两套变成一个（Image / Crop / Shape / Fit / Frame / 比例 / Padding /
      Background / Inner / Outer / Shadow / Radius / Opacity）
- [x] 导出从两个分支（`image` / `imagebox`）并成一个，复用 `drawBoxFrame(ctx, el, shape)`
- [x] 组件库去掉 Image Box 按钮；`components.css` 删掉 `.element-imagebox` 规则
- [x] 旧数据迁移：`imagebox` → `image`，保留 padding / 框样式 / fit / 形状，
      并用 `lockAspectRatio: false` 保住原来「自由拉伸」的手感

#### 顺手干掉的两处「同一件事两种说法」

1. **形状**：以前裁剪模式里是 `rect / square / circle / heart`（存 `content.crop.shape`），
   Image Box 面板里是 `none / circle / rounded / heart / star / diamond / arch`（存 `style.cropShape`）。
   现在 **只有 `style.cropShape` 一个来源**，裁剪工具条和属性面板共用一份 `CROP_SHAPES` 清单。
   `content.crop` 只保留几何 `{ix, iy, iw, ih}`。
2. **适配**：以前 Image 用 `lockAspectRatio` 反推 `contain / fill`，Image Box 用显式 `imageFit`。
   现在 `imageFit`（contain / cover / fill）管「图片怎么摆」，`lockAspectRatio` 只管「拖拽是否锁比例」。

#### 顺带修掉的导出 / 预览不一致

- [x] 加了内边距或边框后，裁剪几何会按 `getPictureArea()` 等比缩进图片区域 ——
      以前裁剪图的几何是相对**元素框**的，加 padding 会被完全忽略
- [x] 形状裁剪的星形：导出用的是「min(宽,高) 为半径」的圆式星（拉长后和 CSS polygon 不一致），
      改成和 CSS 同一份 0~100 归一化坐标，拉伸后两边一致
- [x] `rounded` 形状：CSS `inset(0 round 20%)` 的 rx / ry 分别是宽高的 20%，
      导出以前用单一半径 `min(w,h)*0.2`，现在 `traceRoundRect` 支持 rx / ry
- [x] 内边框在导出时跟随形状描边（圆环），和预览的 `border` + `clip-path` 对齐
- [x] 背景透明的框体导出时也会投影了（预览里 wrapper 的 `box-shadow` 一直都在，
      导出以前因为「没有填充物可投影」直接跳过）

**实现位置**：`elements.js`（`applyImageFrame` / `syncImageContent` / `getPictureArea` /
`getCropPlacement` / `getImageShape` / `readImageFit` + 迁移）`canvas.js` `export.js` `crop.js`
`app.js` `index.html` `components.css` `state.js`

> 说明：`1:1` 从形状里拆出来单独做成工具条上的一个按钮（原来是点「正方形 / 圆形」顺手摆正）。
> 形状现在只表示「轮廓」，不再顺手改宽高。

---

## Phase A - Page 两种模式（Fixed / Long）

方案见 `PLAN.md`。**Phase A 已实现，Phase B（分栏）未开始。**

### 8.1 两种模式，一套代码

- [x] `state.canvas.mode = "fixed" | "long"`，新增 `src/js/page.js` 集中管理页面几何
- [x] 不变量：**`state.canvas.height` 永远等于「当前页面高度」**。fixed 由用户写（比例预设或
      Height 输入框），long 由 `syncPageHeight()` 算。这是 drag / resize / crop / export
      七个读取点完全不用改的原因。
- [x] `fixed` → `long`：元素一个不动，高度立刻按内容重算
- [x] `long` → `fixed`：高度冻结成当前值，`ratio` 退回 `custom`（否则面板显示 3:4 而实际不是）
- [x] 切换模式**永不删除内容**

### 8.2 长页面：高度跟随内容，不是流式布局

- [x] 元素仍然是**绝对定位 + 自由摆放**，位置由用户决定；变的只是页面高度跟着长
- [x] 拖动 / 缩放过程中**只增长不收缩**（实时收缩会让页面在指针下抖动），
      松手时 `syncPageHeight()` 回收一次
- [x] 两个护栏：`minHeight`（空页面 900，不会塌成一条线）、`maxHeight`（20000，
      拖到底就停，元素也不能被拖出这个范围）
- [x] `Bottom Gap` 滑条（默认 80）：内容底部留白，决定页面比内容多长一截
- [x] 新建元素在 long 模式下默认落在「现有内容底部 + 20」，方便一路往下加区块
      （仍然可以自由拖动，不是流式推挤）
- [x] `New` 按钮只清内容，保留页面模式与尺寸

### 8.3 导出：长图的真实风险是 canvas 位图上限

- [x] `export.js` 直接拿 `state.canvas.height` 当位图高度。Chrome/Edge 上限约 268M px，
      但 **Safari / iOS 约 16.7M px** —— 600×30000（18M px）在那边会**静默导出空白图**
- [x] 新增 `MAX_EXPORT_PIXELS = 16e6`：超限自动等比降采样 + 右下角提示条说明实际倍率
      （不做切片导出，那属于过度设计）
- [x] 导出尺寸改用 `pageW / pageH`（不再用 `tempCanvas.width` 当绘制坐标），
      这样降采样时所有元素坐标不用换算

### 8.4 顺手找回 / 修掉的两件事

- [x] **Box（Text Box）导出分支丢失**：上一轮 Image/ImageBox 合并时，
      `export.js` 的 `textbox` 分支被一起并掉了，导致 Text Box **在导出图里完全消失**。
      这次重新补上，并和预览对齐（`drawBoxFrame` + 内容区扣掉 `border + padding`）
- [x] **导出不折行**：新增 `wrapText()` / `drawTextBlock()`，对齐 CSS 的
      `word-break: break-word`（`\n` 换行、空格断词、超长词按字符切、中文逐字断）。
      `text` 元素以前导出也完全不折行，一起修了 —— 长页面里高窄文本框很常见，不折行会很明显

**实现位置**：`state.js`（4 个字段）`page.js`（新建）`canvas.js`（Page 面板）
`drag.js` `resize.js`（按 mode 夹取 + 只增长）`elements.js`（新建落底部 + 增删后回收）
`history.js` `app.js` `export.js` `index.html` `editor.css`

**已知限制（V1 接受）**：

- 拖动到窗口底部时页面会继续变长，但**不会自动滚动**，需要松手后手动往下滚再拖一次
  （自动滚动属于 Phase C 手感打磨）
- 长页面下 `crop.js` 的裁剪框仍以当前页面高度为下界；因为裁剪框本身就在元素框内、
  而元素框在页面内，实际不会受限
- `sticker` / `divider` 两种元素**从未有导出分支**（既有缺口，不是本次引入），
  导出 PNG 里不会出现。要补的话各约 10 行，等确认要不要做

---

## Phase B - Box 分栏 + Title / Body

> 状态：**已完成**（2026-09-19），待试用确认后进 Phase C

### 9.1 一个 Box，一到两栏，每栏一个标题 + 正文

没有引入 Container / Section / Row / Column 这类新元素类型，只给 `textbox.style`
加了几个字段，并让 `content` 从「一个字符串」变成「两个列槽」：

```js
// 现在
el.content = "Your text here"

// 之后（永远两个，即使单栏只显示第一个）
el.content = { columns: [ { title: "", body: "" }, { title: "", body: "" } ] }

el.style.layout = "single" | "columns" | "rows"   // 单栏 / 左右 / 上下
el.style.split  = 0.15 ~ 0.85                     // 第一栏占比
el.style.gap    = 0 ~ 40                          // 栏间距
el.style.titleFontSize / titleFontWeight / titleColor / titleGap
```

- **Title 挂在「栏」上，不挂在 Box 上**：左右分栏时两栏各自需要标题，挂在 Box
  上立刻就不成立。单栏 = 只有一栏的 Box，三种布局走同一份渲染代码。
- **`columns` 数组恒长 2**，不做嵌套、不放进 `state.elements`：Column 不是 Element，
  没有 id、没有坐标、不能单独选中。这是这次能保持轻量的关键。
- **切回单栏不丢内容**：第二栏的文字留在数据里，只是不渲染。
- **Title 非空才渲染**，没有额外的显示开关 —— 面板里不填就是没有标题。

### 9.2 分隔线可以拖

新增 `src/js/columns.js`（约 110 行），写法完全对照 `resize.js`：
`pointerdown` 落在 `.column-splitter` 上 → `pointermove/up` 绑 `document`。

- 拖动时直接写内联 CSS 变量 `--split`，不走 re-render 路径，所以很跟手
- `drag.js` 里为 `.column-splitter` 加了提前返回（和 `.resize-handle` 同一套写法），
  两边不会抢同一个手势
- 上限 15% / 85%，避免拖成 0 宽导致内容无处可放
- 拖动时把 `body` 的 cursor 改成 `col-resize` / `row-resize`，否则指针离开那 11px
  分隔条就会变回元素的 `move`

### 9.3 预览与导出用同一套几何

`--split` 一个变量同时驱动「第一栏的宽度」和「分隔线的位置」。导出侧新增：

- `boxColumnRects(meta, area)`：把内容区按 `split` / `gap` 切成 1~2 个矩形，
  和 flex 规则逐项对应（第一栏 = `split × 主轴`，第二栏 = 剩余 - gap）
- `measureTextBlock()`：先量高度再画，因为**单栏的标题 + 正文是整体垂直居中的**
  （对应 CSS 的 `justify-content: center`），要先知道总高才能算居中偏移
- `drawBoxColumn()`：标题在上、正文在下；单栏居中，分栏则各自顶端对齐

**溢出行为也刻意对齐**：内容超出时 flex 会把项目压到容器高度，于是文字从顶部开始
溢出并裁掉下沿 —— 导出侧同样「装不下就不居中，从顶部开始」。两边一致。

### 9.4 顺手修掉的三件事

- [x] **Box 内多行文本预览和导出不一致**：`.box-text` 加了 `white-space: pre-wrap`。
      以前预览会把 `\n` 折叠成空格（显示成一行），导出却按 `\n` 分行 —— 两边对不上
- [x] **面板里带引号的文字会撑坏 HTML**：新增 `escapeHtml()`，Box 的标题 / 正文
      写回面板时做转义（以前 `value="${...}"` 遇到 `"` 会把后面的属性切断）
- [x] **每个新 Box 的默认内容共享同一个数组**：`createElement` 现在深拷贝默认内容，
      否则改一个 Box 的正文会改到 `DEFAULT_CONTENT` 常量上，连带影响之后新建的 Box

**实现位置**：`elements.js`（布局字段 / 列读写 helper / 渲染 / 迁移）`columns.js`（新建）
`drag.js`（放过分隔条）`canvas.js`（Layout / Split / Gap / 每栏 Title+Body / 标题样式）
`export.js`（分栏绘制 + measureTextBlock）`components.css` `state.js` `index.html` `app.js`

**已知取舍**：

- Text Align 是**整框**的，会同时作用到所有栏；分栏各自对齐需要再引入每栏的设置，
  V1 不做
- 单栏下正文短于框高时是垂直居中的（沿用旧的观感），所以「文字靠上 / 靠下」需要
  再加一个垂直对齐控件才能表达
- 分栏里**不能放图片**（按约定 V1 只放 Title + Body），要「左图右文」用独立的
  Image + Text Box 并排摆，视觉结果一样

---

## Phase C - 长页手感打磨

### 10.1 拖动到视口边缘时自动滚动

长页比窗口高得多，把区块往底部拖时以前只能「松手 → 往下滚 → 再拖一次」。现在指针
停在 `.canvas-area` 上 / 下 64px 的边缘带里，滚动容器会自己滚，**并且拖动起点
（`state.drag.startY`）按滚动量等量补偿** —— 指针不动、内容在动，元素就跟着内容走，
不会卡在边上。

- 速度渐进：刚进边缘带约 1px/帧，贴到边上到 18px/帧（`AUTOSCROLL_MAX_STEP`）
- `requestAnimationFrame` 驱动；松手、指针离开边缘带、拖动结束都会停
- 位置重算仍走 `applyDragPosition()`，所以夹取、智能对齐、吸附、页面增长在自动
  滚动期间全部照常工作
- 拖动逻辑为此从 `onPointerMove` 里抽成 `applyDragPosition(id, node)`，指针位置存在
  `state.drag.pointerX/Y`，滚动时用它重放

### 10.2 画布底部的「内容结束」虚线

长页会一直长到「内容底部 + Bottom Gap」，屏幕上看不出内容到底在哪儿结束。现在在
内容真实底部画一条虚线，右侧带一个「内容结束」小标签。

- 只在 long 模式、且页面上有元素时出现；fixed 模式不画
- 元素变矮、被删、或页面高度被 `minHeight` 兜住时，线依然跟着内容走
  （`syncPageHeight()` 在提前 return 之前刷新它）
- **纯 DOM 装饰**：导出走 `state` 重绘、不经过 DOM，所以不会进 PNG
- `z-index: 8000`，在裁剪遮罩（9000）之下、所有元素之上，且 `pointer-events: none`

### 10.3 「整理成列表」按钮

散乱摆放之后想变整齐，以前只能一个个对。现在 Canvas 面板（long 模式）有一个按钮：
按 y（同高按 x）排序，从 `y=40` 起依次往下排，`x=40` 统一左对齐，间距固定 24px
（`TIDY_TOP` / `TIDY_LEFT` / `TIDY_GAP`）。只改位置，不动宽高 / 样式 / 层级，**整次
整理是一步撤销**。

- 只在 long 模式出现：fixed 模式的底部是用户定的，堆下来会直接冲出画布
- 空画布时按钮禁用
- 元素比页面还宽时，左对齐让位给「不出界」

**实现位置**：`drag.js`（自动滚动 + `applyDragPosition` 抽取）`page.js`
（`syncContentEndMarker` / `tidyIntoList` / `TIDY_*`）`canvas.js`（Layout 组 + 按钮）
`components.css`（`.content-end-marker` / `.content-end-label`）`state.js`
（`drag.pointerX/Y`）

**已知限制**：

- 自动滚动只在**拖动**时生效；拖右下角**缩放**到边缘还不会滚（`resize.js` 未接入）
- headless 浏览器不出合成帧（实测 600ms 内 0~1 帧），所以「连续出帧」这一段无法在
  无头环境里端到端验证，只验证了逐帧数学与循环的启停；真实浏览器由 rAF 连续出帧

---

## Phase D - V1 收尾（导出补齐 / 一致性 / 清理）

> 完整方案见 `PLAN.md` 第八节 Phase D。排序依据只有一条：
> **画布上看得见的东西，导出 PNG 里必须也在，而且长得一样。**

### 11.1 D-1 补 `sticker` / `divider` 的导出分支

- [x] `export.js` 加 `sticker` 分支：字形在元素框内居中（对齐
      `.element-sticker .element-content` 的 flex 居中），`${fontSize}px sans-serif`，
      颜色跟随 `style.color`
- [x] `export.js` 加 `divider` 分支：照 `.divider-line` 的 `width: 100%` + `height: lineWidth`
      + 垂直居中 + `border-radius: 1px` 画一条圆角横线
- [x] 透明度沿用调用方统一设好的 `ctx.globalAlpha`，不重复应用
- [x] 探针：`.workbuddy/probe-phase-d.html`（像素级；D-1 + D-2 共 29 条断言全过）

**为什么以前会消失**：`renderElementToExportCanvas()` 是 if / else if 链，只有
`text` / `textbox` / `image` / `label` 四个分支，落到最后的 `else` 就 `restore()` 直接返回。
`sticker` 和 `divider` 在组件库（`index.html`）和属性面板（`canvas.js`）里都是齐的 ——
能放、能调、能拖，只有导出这一环没接上，而且不报错、不提示，导出的图里就是干净地少了两个元素。

**验收方式**（不看"分支是否存在"，直接数像素）：把导出位图渲染出来，
`getImageData()` 统计各元素包围盒内的墨迹。

| 断言 | 实测 |
|---|---|
| sticker 有墨 | 732px |
| sticker 水平居中 | dx = -0.4px |
| sticker 垂直偏差 | dy = **1.1px**（80px 框 / fontSize 64） |
| divider 线高 = lineWidth | rows 179..184（6 行） |
| divider 垂直居中 | top = 179 = `y + (h - lineWidth) / 2` |
| divider 铺满宽度 | cols 60..539（= 元素整宽） |
| divider 元素框外无溢出 | ✓ |
| opacity 只吃一次 | 50% 时通道值 = 目标 ±2 |
| 回归 | text 仍在导出、零 JS 错误 |

**顺带修正一处预期**：实现前担心 canvas 的 `textBaseline: "middle"` 与 CSS flex 居中的
字体度量不一致（按 Arial 的 ascent/descent 估算是 0.155em，fontSize 64 时约 10px 的偏差）。
实测只有 1.1px，不需要任何补偿 —— 这也和 `label` 分支一直以来的做法一致。

**留了一个对照**：截图「导出补齐-预览与导出对照.png」里，label 在预览是 `HELLO WORLD`、
导出是小写 `hello world`，这就是 D-2，下一项修。

**实现位置**：`export.js`（`renderElementToExportCanvas` 新增两个分支，约 24 行）

---

### 11.2 D-2 `label` 的 `letterSpacing` / `textTransform` 补进导出

- [x] `export.js` label 分支：`ctx.letterSpacing = letterSpacing + "px"`，文字走
      `applyTextTransform()` 后再 `fillText()`
- [x] 新增纯函数 `applyTextTransform(text, transform)`，支持
      `uppercase` / `lowercase` / `capitalize` / 其它（原样）
- [x] 探针补齐 D-2 断言，Phase D 探针共 **29 条全过**

**问题**：`letterSpacing: 1` 和 `textTransform: "uppercase"` 是 `label` 默认样式里的字段
（`elements.js`），预览靠 CSS（`.element-label .element-content` 上的
`text-transform: uppercase` + 内联 `letter-spacing`）吃到，导出分支却只
`fillText(el.content)` —— 画布上是 `HELLO WORLD`，导出图里是 `hello world`，
字距也没了。截图里一眼可见。

**实现**：约 6 行。Canvas2D 没有 `text-transform`，所以手写了一个纯函数；
`ctx.letterSpacing` 是现行的上下文属性（本机 Edge 实测支持），老引擎上赋不进去也不会报错，
只是丢掉那 1px 字距。

**验收数字**（都是与"独立绘制"的参考做比对，参考不调用被测代码）：

| 断言 | 实测 |
|---|---|
| 导出墨迹量 = 大写参考 | **631 = 631**（逐像素同量） |
| 对照：不做大写处理 | 462 = 小写参考 462（证明断言有区分度） |
| 字高 = cap height | 导出 16 = 大写 16 > 小写 13 |
| 字距 0 / 1 / 6 的墨迹宽度 | 61 / 64 / 79（参考 61 / 64；Δ=3 与 Δ=15 都精确） |
| `applyTextTransform` 6 例 | 全过（含空串与 `null`） |

**一个被量出来的既有行为**：CSS 的 `letter-spacing` 加在**每个字符之后（含最后一个）**，
`text-align: center` 居中的是整行盒，所以预览和导出都会比元素中心**偏左半个字距**
（字距 6px 时实测 dx = −3.3px）。两边一致，是可接受的既有行为，不改。

**探针踩的坑（记下来）**：第一版统计墨迹时忘了关 label 的边框 —— 默认 2px 边框环
覆盖整个 400×100 框（约 2454px 墨迹），把文字那 169px 完全盖住，导致 4 条断言假失败。
**量文字之前先把边框/背景清零**。另一处是变量没控住：拿"大写+1px 字距"去比
"小写+0px 字距"，一次动两个变量，同样是假失败 —— 字距断言必须同为大写。

**实现位置**：`export.js`（`applyTextTransform` + label 分支）

---

### 11.3 D-3 清掉死代码（三个死函数 + 一个死常量）

删掉四个从未被引用的顶层声明：

```text
grid.js     initGrid()       空函数，网格的活已由 toggleGrid() 承担
assets.js   initAssets()     空函数，素材由 loadState() 恢复
assets.js   ASSET_STORE_KEY  声明后从未使用
storage.js  clearState()     没有「重置」入口，从未被调用
```

顺手做了一次全局扫描（顶层 `function` + 全大写常量，按整个项目里的引用计数找孤儿），
除这四个外没有其他死代码。

`clearState()` 删掉后项目里就没有「清空本地数据」的入口了。当前 UI 也没有这个按钮，
**要加的话是 4 行的事**（`localStorage.removeItem` 两张 key），到时候再写回来。

**验收**：全量 `node --check` 通过；Phase C 探针 28/28、Phase D 探针 29/29 全过；
真实入口正常渲染。

**实现位置**：`grid.js` / `assets.js` / `storage.js`（纯删除）

---

### 11.4 D-4 `ARCHITECTURE.md` 模块清单补齐

文档停在 Phase 1：模块清单只有 10 个文件，第 28 节还在句子中间 `state.sele` 就断了。
这次补齐：

* **新增五节**：`page.js`(§7) / `columns.js`(§12) / `crop.js`(§13) /
  `alignment.js`(§15) / `history.js`(§18)，各写「负责 / 不负责」+ 该模块的关键约束。
* **章节重排**：模块节按真实加载顺序排列，后续章节整体后移（16~28 → 21~33，
  新增 §34）。全项目没有对章节号的交叉引用，重排是安全的。
* **§3 目录**：从 Phase 1 的设想目录（`docs/` 之类）改成实际结构，并写明
  「加载顺序就是 `index.html` 里 `<script>` 的顺序」。
* **§5 State**：补 `canvas.mode` / `bottomGap` / `maxHeight` 等真实字段，
  写清哪些块不进 localStorage、哪些东西不该进 state。
* **§19 export.js**：新增「导出必须逐项对齐预览」与
  「已知的两处实现（改一处必须改另一处）」—— 形状几何在预览（SVG）和导出
  （Canvas2D）里是两套实现、同一套数学。
* **§22 依赖关系**：补全模块清单，并把实际存在的跨模块调用边列清楚。
* **§33 收尾**：把它写完，并记录「形状几何重复」这个被接受的例外。
* **§34 新增**：怎么验（真浏览器 + 导出位图并排比），以及两个回归探针的位置。

**验收**：`grep -c '^```'` 为偶数（围栏配对）；章节编号 2~34 连续无重复；
全文无断句。

**实现位置**：`ARCHITECTURE.md`（纯文档）

---

### 11.5 D-5 Box 的垂直对齐开关（Top / Middle / Bottom）

**问题**：单栏的 Box 把文字垂直居中写死在 CSS 里
（`.box-body.layout-single .box-column { justify-content: center }`），分栏的各栏则是
顶对齐，用户改不了 —— 想在一个高框里把文字压到底部做不到。

**改法**：新增 `style.vAlign`（`top` / `middle` / `bottom`），三个地方各让一步：

| 层 | 改动 |
|---|---|
| `elements.js#readBoxLayout` | 新增 `vAlign` 字段。**默认值跟着布局走**：单栏 → `middle`，分栏 → `top`，所以老作品一像素都不变 |
| `components.css` | 写死单栏居中的那行删掉，改成 `.box-body.valign-{top,middle,bottom} > .box-column` 三条规则 |
| `elements.js#applyBoxBody` | 顺手把 `valign-*` 写进 `.box-body` 的 class（和 `layout-*` 同一处） |
| `export.js#drawBoxColumn` | 按 `meta.vAlign` 算 `top`，不再用 `!meta.isSplit` 判断 |
| `canvas.js` | Box 面板的 Align 下面加一组 `T / M / B` 分段按钮 |

`boxStructureSignature()` 没动 —— vAlign 只换一个 class，不改变 DOM 的形状，所以走的是
增量更新路径（`updateElementDOM → applyBoxBody`），不重建节点、不抢焦点。

**顺手修掉一处既有的预览/导出不一致**：原 `drawBoxColumn` 里有一句
`if (total < rect.height)` 兜底 —— 内容比栏高时改成顶对齐。但预览侧的 flex 是
`justify-content: center` + `.box-column { overflow: hidden }`，溢出时文字是**向上探出再
被裁掉**，不是回到顶部。两者在"字最多"的时候反而差得最远。现在导出改成：照 flex 的
数学算偏移（允许为负），并 `ctx.clip()` 到栏矩形，与预览的 `overflow: hidden` 对齐。

**验证**：新增探针 `.workbuddy/probe-phase-d5.html`，**46 条断言全过、0 JS 错误**：

| 断言 | 实测 |
|---|---|
| 默认值矩阵（8 条，含非法值/空串回落） | 全过 |
| 预览 DOM：class + computed `justify-content` | `flex-start` / `center` / `flex-end` |
| 预览的位移 = 导出的位移 | 189.6px vs **190px**（差 0.4px） |
| 用预览反推导出的墨迹位置 | 预测 152.8 / 247.6，实测 153 / 248 |
| 分栏下 top / bottom 各栏独立生效 | Δ=190px |
| 溢出时导出裁在栏内 | 墨迹 57..147，栏 52..148 |
| 面板点击 → state → 画布 → 一步撤销（7 条） | 全过 |
| 老记录（无 vAlign）单栏仍居中、分栏仍顶对齐 | 全过 |
| Phase C 28/28、Phase D 29/29 回归 | 无 FAIL |

**探针本身踩了一个坑，值得记下来**：第一版把测量窗口设成"栏那么大"，于是溢出的墨迹
根本不在统计范围内 —— F3/F4 两条断言**永远不会失败**，是假通过。发现方式是**故意把
实现改回旧行为再跑一遍**，结果 38 条全过（本该失败）。把窗口改成高于栏之后，旧行为
立刻在 F4 上失败（墨迹画到 181，栏底只有 148，33px 跑到栏外）。

**已知取舍**：`vAlign` 是显式值优先 —— 手动设过 `middle` 之后再切到分栏，它仍是
`middle`，不会自动跟随布局变回 `top`。这是刻意的（用户的选择不该被布局切换悄悄改掉），
面板上的 active 态也如实反映。

**实现位置**：`elements.js` / `components.css` / `export.js` / `canvas.js`

---

### 11.6 D-6 分栏下每栏各自的 Text Align

**问题**：水平对齐挂在 `style.textAlign` 上，是**整框**属性 —— 左右分栏时想让左栏靠右
（向分隔线靠）、右栏靠左（也向分隔线靠）做不到，两栏只能同向。

**做法**：把 align 挪到**栏**上，`content.columns[i].align`，取值 `left` / `center` / `right`，
`""` 表示继承。读取统一走新的 `readColumnAlign(column, style)`：栏自己设了就用它，
否则回落 `style.textAlign`。**所有老记录都没有 `column.align`，于是原样落到 `style.textAlign`，
一像素不变。**

面板上原来的**整框 Align 控件被移除了**，改成每栏自己一组 L/C/R（在栏的标题/正文输入框
下面）。理由是留两个控件会互相打架：栏一旦设过自己的值，整框控件的 active 态就没法同时
如实反映两栏。现在只有一个控件、一个含义。`V Align` 仍是整框的 —— 并排两栏一个上对齐
一个下对齐通常只会显得坏掉，所以刻意保留为整框设置。

**顺手修掉一个真 bug（本轮最大的收获）**：写探针时发现**单栏 Box 的预览与导出宽度不一样**。

- 预览：`components.css` 里 `.box-body > .box-column[data-col="0"] { flex: 0 0 var(--split, 50%) }`
  **没有区分布局**，于是单栏模式下那一栏只占内容区的**一半宽**。
- 导出：`boxColumnRects()` 对 `!isSplit` 显式返回**整个内容区**。

后果是单栏 Box 的预览把文字画在左半边（居中也在左半边的中心），而导出 PNG 是整框居中 ——
实测 300px 宽的 Box，预览栏宽 138、导出栏宽 276，`center` 对齐下差 **69px**。之前没暴露
是因为 D-5 只比对过**垂直**位置。

修法是给 CSS 补一条 `.box-body.layout-single > .box-column[data-col="0"] { flex: 1 1 0 }`，
并把 `--split` 那两条规则显式限定到 `layout-columns` / `layout-rows`。
**渲染方向是让预览去对上导出**（导出本来就用全宽），所以已有作品的 PNG 不变，变的只是
画布上那半宽的显示 —— 它本来就在骗人。

| 断言 | 实测 |
|---|---|
| 单栏：预览栏宽 == 导出栏宽 | 276 == 276（旧 CSS 下 138 vs 276） |
| `left→right` 的横向位移，预览 vs 导出 | 245.0px vs 245px |
| `left`：导出墨迹起点 == 预览文字起点 | 偏移 0 |
| `right`：导出墨迹终点 == 预览文字终点 | 右间隙 0 |
| `center`：导出墨迹中心 == 栏中心 | 189.5 vs 190 |
| 分栏：栏0 左贴栏左、栏1 右贴栏右 | 0px / 0px |
| 面板点击 → state → 画布（不重建节点）→ 一步撤销（10 条） | 全过 |
| `readColumnAlign` 8 例（含 null / 非法值 / 无 style） | 全过 |
| 存取往返 8 例（含"输入正文后 align 不丢"） | 全过 |
| 老记录（无 `column.align`）→ 仍居中 | 全过 |
| 回归：Phase C 28/28、D 29/29、D-5 46/46 | 无 FAIL |

**探针本身踩了两个坑**，都记下来了：

1. 第一版按「墨迹的连续区间」分栏，结果 16px 字号下**一个词内部字母之间的缝隙**被当成了
   分界，`BBB` 被拆成 3 段，`bands[1]` 拿到的其实是第一个 `B`。改成**按已知的栏矩形切**
   （`inkExtent(stats, left, right)`）才对。
2. 拿「墨迹总量」比较两个不同对齐的场景 —— 字形落在不同**亚像素相位**上抗锯齿出来的非白
   像素数量本来就不同（实测 361 vs 381，差 5.5%）。改成比**墨迹跨度**（相位无关）。

**验证手法**：修完 CSS 之后**故意把那条规则改回去再跑一遍**，确认 E0/E2/E3/E4 四条真的
会失败（预览 138 vs 导出 276）—— 否则「断言通过」可能只是因为两边共享了同一个错误宽度。

**实现位置**：`elements.js`（`readColumnAlign` / `getBoxColumns` / `setBoxColumn` /
`applyBoxTextNodeStyle`）/ `export.js`（`drawBoxColumn`）/ `canvas.js`（每栏 L/C/R）/
`components.css`（单栏全宽）

---

### 11.7 D-7 缩放时也自动滚动

**现象**：长页面里把元素拖到底部会自动滚动（Phase C 做的），但拖**右下角手柄改尺寸**到
底部不会 —— 想拉长一个块到页面下方，只能"拉一点 → 松手 → 滚 → 再拉"。

**做法**：把自动滚动从 `drag.js` 抽成 `src/js/autoscroll.js`，drag 与 resize 共用。
能共用是因为两个交互测量自己的方式完全一样：开始时记一个不动点（`startX` / `startY`）
和初始几何，之后每帧用「当前指针 − 不动点」算增量。内容滚走了 `moved`，等价于指针
反向走了 `moved`，补偿掉即可：

```js
if (state.drag.active)   state.drag.startY -= moved;
if (state.resize.active) state.resize.startY -= moved;
reapplyCanvasInteraction();   // 唯一分叉：reapplyDrag() 还是 reapplyResize()
```

resize 侧为此做了两件事：

1. 把几何计算从 `onResizeMove` 里抽成 `applyResize(domEl)`，并加 `reapplyResize()`
   —— 没有新指针事件时也能重跑（drag 早就有 `reapplyDrag()`）。
2. `state.resize` 增加 `pointerX` / `pointerY`，与 `state.drag` 同一契约。

**关键断言**：真正的判据不是"滚动条动了"，而是**手柄在屏幕上没动**。

| 断言 | 实测 |
|---|---|
| 前提：画布区域确实能滚（否则后面全恒真） | 5220 vs 756 |
| 拖到边缘启动滚动循环 | step=16.875 frame=1 |
| 逐帧推进滚动条（5 帧） | dscroll=85 |
| 高度跟着指针长（起点补偿生效） | dh=85 = dscroll |
| **手柄粘住指针（屏幕位置不变）** | 809.0 → 809.0 |
| 顶边（向上滚，符号相反）：y 同步减小 | dy=-85 = dscroll |
| **顶边手柄粘住指针** | 51.0 → 51.0 |
| 横向不受影响 / 其他元素不被连带移动 | 全过 |
| 指针离开边缘带后停止（循环启停） | step=0 frame=null |
| 回归：拖动侧自动滚动照旧（4 条） | 全过 |

**验证手法**：把 `state.resize.startY -= moved` 这行临时注释掉再跑一遍 —— 4 条断言立刻
失败，且偏差正好等于滚动量（手柄 809.0 → 724.0、dh=0），证明断言不是恒真。

**顺带发现的坑**：5 个探针各维护一份自己的 `<script>` 清单，新增 js 文件时极易漏。
`probe-phase-c` 当场报 `autoScrollStepFor is not defined`。已给全部探针补齐，写进
`ARCHITECTURE.md` §3 的「新增一个 js 文件要同步三处」，并加了 `tools/run-probes.js`
一条命令跑全部探针（191 条）。

**实现位置**：新增 `autoscroll.js`；`drag.js`（删掉本地那份实现，保留 `reapplyDrag()`）；
`resize.js`（`applyResize` / `reapplyResize` / pointer 记录 / 起停）；`state.js`
（`resize.pointerX / pointerY`）；`index.html` + 5 个探针的脚本清单。

---

## Phase E - 窄屏适配（手机 / 竖屏平板）—— 已完成 2026-09-20

D-7 之后计划里只剩 D-8，而 D-8 六项全部需要拍板，于是按"没计划就做手机适配"推进。
方案与取舍见 `ARCHITECTURE.md` §36。

**E-1 布局：侧栏变抽屉**（断点 820px）

桌面是「220 + 画布 + 220」，390 宽的手机上可用宽度是负数，所以窄屏必须换排布：
左抽屉（组件，`min(300px, 84vw)`）+ 底抽屉（属性，`min(58vh, 520px)`）+ 遮罩 +
右下角悬浮按钮组。开关状态是 `body.drawer-left` / `body.drawer-right`。
关闭按钮由 `app.js` 注入，桌面 DOM 零改动；从抽屉里新增元素会自动收起。

**踩过的坑**：`components.css` 在 `editor.css` 之后加载，`.component-list` 的两列
网格被它的 `flex-direction: column` 吃掉 —— 选择器得写成 `.sidebar .component-list`
才盖得住。已加断言盯住这条。

**E-2 画布视口缩放**

`scale = min(1, 可用宽 / 画布宽)`，只缩不放（桌面恒为 1，行为不变）。用
`transform: scale()` 显示，`.canvas-wrapper` 尺寸同步（transform 不改布局盒，
不设的话滚动区还是按 600px 算）。scale 写到 `--canvas-scale`，让手柄用
`calc(10px / var(--canvas-scale))` 在屏幕上恒为 10px。

**E-3 坐标换算**（本次最容易漏的一处）

指针增量是屏幕像素、元素坐标是画布单位，三处必须过 `toCanvasDelta()`：
`drag.js#applyDragPosition` / `resize.js#applyResize` / `crop.js`（pan + resize）。
`alignment.js` / `page.js` / `export.js` 全在画布坐标里工作，不受影响；
`columns.js` 算的是比例，等比缩放下不变；`autoscroll.js` 补偿的是 client 坐标。

**E-4 触摸与视口细节**

`touch-action` 分流（空白画布 `pan-y` 可滚长图、选中元素与手柄 `none` 可拖）、
`100svh` + `env(safe-area-inset-bottom)`、裁剪工具栏窄屏收窄、滚动条宽度预留
（否则「缩小 → 丢滚动条 → 区域变宽 → 放大 → 滚动条回来」会互相追）。

**验证**

- 新增 `tools/probe-device.js`：Edge 的窗口最小宽度约 490px，`--window-size=390`
  实际拿到 492，`--force-device-scale-factor` 也只影响几个像素 —— 所以改走 CDP 的
  `Emulation.setDeviceMetricsOverride` 拿真机尺寸，顺带支持存截图。
- `.workbuddy/probe-phase-mobile.html` 在 320 / 390 / 768 / 1100 / 1440 五种宽度下
  断言（窄屏走抽屉分支、桌面走"不回归"分支）。
- 证伪实验：把 `toCanvasDelta` 改成恒等 → 4 条断言失败，偏差正好是 `1/scale`。
- 全量探针 191 → 210 条，`run-probes.js` 加进 mobile 探针后桌面侧无回归；
  单文件产物重建为 198 KB，14 项验证全过。

**没做**：双指缩放、触屏长按菜单、多选框选（横屏手机宽度 > 820 时按桌面走）。

---

## Phase F - 手机裁剪「拖不动」—— 已完成 2026-09-20

用户反馈：手机上进入裁剪模式后，拖动那个裁剪框没有任何反应。

**排查路径**（结论跟直觉相反的地方在最后一层）

1. 先怀疑事件类型 —— `crop.js` 用的全是 pointer 事件，不是 mouse 事件，排除。
2. 再怀疑 `touch-action` —— `#canvas` 上是 `pan-y`，裁剪命中区是它的后代。理论上
   后代的 `touch-action: none` 会覆盖祖先，但"理论上"不算证据，得实测。
3. 用 `new PointerEvent()` + `dispatchEvent` 写的探针**测不出来**：合成事件直接跳到
   页面处理器，绕过了浏览器的手势仲裁，而真机拖不动绝大多数时候正是栽在仲裁上。
   于是新增 `tools/probe-touch.js`（CDP `Input.dispatchTouchEvent` + 触摸模拟，走真实
   输入管线），用它录了一遍事件序列。
4. 录到的结论：**全程没有任何 `pointercancel`，命中区的 `touch-action` 也正常**
   （实测 computed = `none`）。浏览器没抢手势 —— 排除触摸特有因素。
5. 真因在几何：诊断输出 `图片余量 水平=0.0 垂直=0.0`。面板改尺寸后新开的裁剪框
   **恰好等于图片显示尺寸**，而 `clampCropDraft()` 把图片偏移限制在 `[d.w - dw, 0]`，
   两者相等时这个区间退化成一个点 → `offsetX` 永远算成 0。
   **所以这不是手机特有问题，桌面用鼠标同样拖不动**，只是一直没人往这个方向试。

**修法**（`crop.js#startCropPan`）：拖图优先，图滑到头就把剩下的位移交给整个裁剪框。

```js
d.offsetX = clamp(startOffsetX + wantX, ...);
const leftoverX = (startOffsetX + wantX) - d.offsetX;   // 图片吃不下、被 clamp 掉的部分
d.x = clamp(startX + leftoverX, 0, canvasW - d.w);       // 交给框平移
```

**验证**：`.workbuddy/probe-crop-touch.html`（由 `tools/make-probe.js` 从 `src/index.html`
生成，配 `tools/probe-touch.js` 跑真触摸）覆盖两种情形 —— 框比图大（整体平移）、
框比图小（先滑图片、滑到头再平移框），10/10 通过。证伪实验：把「滑到头就整体平移」
拿掉后，"拖动后裁剪区域有位移"立刻失败且位移正好 0.0，即修复前的症状。

**顺手**：`tools/run-probes.js` 支持探针自带的 `#probe-out` 输出、两个 CDP 工具跑前
`Storage.clearDataForOrigin` 清场（裁剪那次的截图里混进过上一次跑剩下的元素，看着
像产品 bug）；旧 5 个探针的内联脚本抽成 `.workbuddy/_phase-*.js`，统一由
`make-probe.js` 生成，脚本清单不再是手工副本。

---

## Phase G - 其余触摸交互的真实触摸回归 —— 已完成 2026-09-20

裁剪修完后，用 `probe-touch.js`（CDP `Input.dispatchTouchEvent` 真实输入管线）把
**其余触摸交互**也过了一遍，新增 `.workbuddy/probe-touch-basic.html`（由
`tools/make-probe.js` 从 `src/index.html` 生成）。抓到三个真问题，全修：

**G-1 元素上竖滑被 `pointercancel` 打断后，元素被拖走不回来**

- 现象：在**未选中**元素上竖滑想滚页面，浏览器仲裁后发 `pointercancel` 归还手势给
  滚动，但 drag 已把元素挪到了半路 —— 元素留在滑出来的位置上，页面也没滚到位。
- 修法：`drag.js` / `resize.js` 的 `onPointerUp` 加 `cancelled` 参数，`pointercancel`
  时**回滚到按下前的几何**（`state.drag.elStartX/elStartY`），取消选中、不 push 历史。
  缩放侧同理回滚宽高与 x/y。真实触摸验证：打断后元素位移 = 0。

**G-2 拖动/缩放状态不收起（`pointercancel` 不算结束）**

- `pointercancel` 后 `state.drag.active` 一直为 true，下一根手指落在空白处会被当成
  继续拖动。cancelled 分支一并清掉 active / elementId / handle。

**G-3 手柄命中区太小**

- 10px 手柄在手机上（画布缩到 0.65 时屏幕上仅 10px 但手指需要 ±10px 容差）极难点中。
- 修法：`components.css` 给 `.resize-handle` 加 `::after` 透明命中层 —— 窄屏
  `inset: calc(-16px / var(--canvas-scale, 1))`（屏幕上恒为 ±16px）、桌面 −6px。
  裁剪手柄同理。真实触摸验证 390 宽下手柄可一次命中。

**验证**：两个触摸探针（crop-touch 10 条 + touch-basic）合计 **249/0 全过**，
`run-probes.js` 共 9 个探针。证伪：把 cancelled 回滚注释掉，G-1 断言立刻失败且
偏差正好是滑出去的 39.8px。

**headless 已知限制**：合成器滚动量在无头环境测不出来（纯 HTML 对照实验证实是环境
限制而非产品问题），滚动量断言降级为 INFO 不作 FAIL。

**实现位置**：`src/js/drag.js` `resize.js`（cancelled 回滚）`state.js`
（`drag.elStartX/elStartY`、`origX/origY`）`components.css`（手柄命中区 / crop 工具栏窄屏紧凑化）
`tools/probe-touch.js` `tools/make-probe.js` `tools/run-probes.js`
`.workbuddy/_touch-basic.js` `_crop-touch.js`

---

## 当前待处理 / 可继续优化

> Phase D 的完整方案（含现象、范围、验收）见 `PLAN.md` 第八节 Phase D。
> 排序依据只有一条：**画布上看得见的东西，导出 PNG 里必须也在，而且长得一样。**

- [x] ~~**D-1 补 `sticker` / `divider` 的导出分支**~~ → 见 11.1
- [x] ~~**D-2 `label` 的 `letterSpacing` / `textTransform` 没进导出**~~ → 见 11.2
- [x] ~~**D-3 清掉三个死函数** `initGrid()` / `initAssets()` / `clearState()`~~ → 见 11.3
      （连同 `ASSET_STORE_KEY` 一起清掉，共四个孤儿声明；全局复扫已归零）
- [x] ~~**D-4 `ARCHITECTURE.md` 模块清单补齐**~~ → 见 11.4
      （补 `page.js` / `columns.js` / `crop.js` / `history.js` / `alignment.js` 五节，
      章节重排 + §3/§5/§19/§22 校准 + §33 补完 + §34 新增）
- [x] ~~**D-5 Box 的垂直对齐开关**（Top / Middle / Bottom）~~ → 见 11.5
      （新增 `style.vAlign`；默认值随布局走所以老作品不变形，顺带修掉
      内容溢出时导出回落到顶对齐、与预览不一致的问题）
- [x] ~~**D-6 分栏下每栏各自的 Text Align**~~ → 见 11.6
      （align 移到栏上 `content.columns[i].align`；老记录回落 `style.textAlign` 不变形。
      顺带修掉**单栏 Box 预览栏宽只有一半、与导出不一致**的真 bug）
- [x] ~~**D-7 缩放时也自动滚动**~~ → 见 11.7
      （抽出 `autoscroll.js` 供 drag / resize 共用；resize 侧加 `applyResize()` /
      `reapplyResize()` 与 `state.resize.pointerX / pointerY`。核心断言是"手柄屏幕
      位置不变"，故意去掉补偿后 4 条断言立刻失败且偏差正好等于滚动量）
- [ ] **D-8 小项打包（可选）** —— 2026-09-20 已逐项核对现状，全部需要拍板（详见 `PLAN.md` 第八节 D-8 的表格）：
      - `rounded` 形状与 `Radius` 滑条互斥显示**已经化解了重叠**（有形状时滑条不渲染），
        只剩"删不删 `rounded` 入口"的取舍
      - ~~Image 面板「替换图片」入口~~ → **早已实现**（`btn-change-image` + `#image-file`，
        且替换后刷新 `naturalWidth/Height`），从清单划掉
      - 投影多层叠加 —— 真缺口，属新功能
      - 裁剪模式缩放 —— 真缺口，只有平移 / 改框 / 正方吸附，**得先定交互方式**
      - 扩展裁剪形状 —— 真缺口，成本极低（路径表 + 分支 + 标签各一处），**但加哪些要定**
      - 7.9 留白透投影色 —— 已论证为预期行为且预览与导出**一致**，改它属变更视觉语义
- [x] ~~**手机裁剪拖不动**~~ → 见 Phase F（根因是裁剪框恰好等于图片时 `clamp` 区间退化成
      一个点，桌面同样拖不动；修法是拖图优先、滑到头把剩余位移交给框平移）


### 7.9 形状图片的外边框 / 投影跟随形状

以前只有**内**边框跟随形状（挂在 `.element-content` 上的 `border` 会被 `clip-path` 裁），
**外**边框和投影一直是矩形 —— 因为两者都靠 wrapper 的 `box-shadow`，而 spread 只能撑大
一个圆角矩形，压不出一个圆形环。现在这两样搬到一层 SVG 上：

- `.element-shape-layer`（`elements.js#syncShapeLayer`）插在 content **之下**、wrapper 之内，
  `overflow: visible` 让它能画到元素边界之外。
- **外边框** = 同一形状路径的**居中描边**，`stroke-width = W * 2`。内侧半个线宽压在图片
  底下被盖住，露出来的正好是 `W` 宽的一圈环。
- **投影** = 形状 + `filter: drop-shadow(x y blur color)`。`S`（spread）没有被丢掉：先把
  形状按 `(w + 2S) / w`、`(h + 2S) / h` 围绕中心放大再投影，和导出侧
  `fillSilhouette(x - S, y - S, w + 2S, h + 2S)` 是同一套数学。
- 形状几何只留一份：`shapeSvgNode()` / `SHAPE_PATHS_100`。裁剪模式的虚线轮廓也改用它
  （crop.js 原先自己抄了一份路径表）。
- 滑条每次 `pointermove` 都会走 `updateElementDOM`，所以层上存了一个 `data-shape-sig`
  签名，参数没变就不重建 SVG 节点。
- **没有形状时零变化**：外边框和投影照旧走 wrapper 的 `box-shadow`，`box-shadow` 也照旧
  为空时才清掉。

导出侧顺带修正一处：外边框从「填一个外扩的实心形状」改成 **even-odd 环**。原来图片没铺满
框时（有内边距、或 `contain` 留白），中间会露出外框色的一整块而不是一圈。

**已知边界**：形状 + 投影 + 背景透明 + 图片没铺满框时，留白处会透出投影色。
`box-shadow` 在同样条件下也是这个行为（spread 会让阴影铺满元素正下方），给框加个背景色
即可。预览与导出在这点上**一致**。

### 外边框（Outer Border）的 W 到底做了什么

值得写下来，因为内/外边框的 `W` 看起来一样、实际约束不同：

| | 内边框 Inner Border | 外边框 Outer Border |
|---|---|---|
| CSS 实现 | `border`（border-box） | `box-shadow: 0 0 0 Wpx`（spread 外扩）；**有形状时改用 SVG 描边** |
| 位置 | 压在内容**内侧**，会缩小可用内容区 | 往元素**外面**长，不占空间、不挤内容 |
| 圆角 | 跟随 `border-radius` | 外圆角自动 = `border-radius + W` |
| 裁剪图片 | 跟随 `clip-path` 形状（圆形裁剪得到一圈环） | 有形状时同样跟随（见 7.9） |
| 导出 | `ctx.stroke()` 沿形状路径内缩半个线宽 | 有形状时填一个 even-odd 环，否则填外扩的圆角矩形 |

- 修了一处圆角算重的问题：wrapper 的 `border-radius` 原先是 `radius + outer`，
  而 `box-shadow` 的 spread 本身就会把圆角撑大 `outer`，等于多算了一次。
- 外边框本质是「不占空间的 outline」，所以元素贴到画布边缘时会被画布裁掉一截 —— 这是预期行为。

---

## 验收清单

- [x] 素材可以删除
- [x] 素材点击后能放入画布
- [x] Ctrl+Z 能撤销
- [x] Ctrl+Shift+Z 能重做
- [x] 拖动时显示对齐辅助线
- [x] 置顶/置底生效
- [x] 画布背景色可切换
- [x] 画布可上传背景图片
- [x] 图片可自由拉长拉宽（关闭比例锁定后）
- [x] 图片可用预设形状裁剪
- [x] 形状裁剪的图片，外边框与投影都跟随形状（预览与导出一致）
- [x] Image 可调整圆角/边框/背景色/阴影/内边距/框样式
- [x] 组件库只有一个图片来源（Image），不再有 Image / Image Box 之分
- [x] 页面支持「固定画布 / 纵向长页」两种模式，切换不丢内容
- [x] 长页模式下内容增加页面自动变长，松手后回收多余高度
- [x] Box 支持单栏 / 左右分栏 / 上下分栏，分隔线可以拖动改比例
- [x] Box 的每一栏都有独立的 Title 和 Body
- [x] 分栏的 Box 导出后与画布一致（含折行、居中、栏宽）
- [x] 长页拖动元素到视口边缘时，画布自动滚动且元素跟着指针走
- [x] 长页画布底部显示「内容结束」虚线，导出图里不出现
- [x] Canvas 面板可「整理成列表」，一次点击重排、一步撤销
- [x] 贴纸与分隔线导出后与画布一致（位置 / 粗细 / 透明度）
- [x] 标签导出后与画布一致（大写 + 字距）
- [x] 没有从未被调用的死函数 / 死常量
- [x] `ARCHITECTURE.md` 的模块清单与代码一致
- [x] Box 的文字可以设成顶对齐 / 垂直居中 / 底对齐，导出与画布一致
- [x] 分栏时每一栏可以各自水平对齐（左/中/右），导出与画布一致
- [x] 单栏 Box 的预览宽度与导出宽度一致（不再只占内容区一半）
- [x] 刷新后所有状态都能恢复
- [x] 手机竖屏能看全整张画布（按比例缩小，而不是被截掉一半）
- [x] 窄屏时左右面板收成抽屉（左滑入 / 下上滑），桌面的常驻两栏布局不变
- [x] 缩小后的画布上拖动、缩放元素仍然跟手（屏幕位移按 scale 换算成画布位移）
- [x] 缩放手柄在屏幕上保持同样大小，缩到 0.49 也点得到
- [x] 320 / 390 / 768 / 1100 / 1440 五种宽度都跑过断言
- [x] 手机上裁剪模式能拖动图片 / 平移裁剪框（真触摸事件验证，非合成事件）
- [x] 未选中元素上竖滑滚页面时，元素不被拖走（pointercancel 回滚）
- [x] 缩放手柄在手机上一次就能点中（命中区屏幕上恒为 ±16px）
- [x] 全部触摸交互过了真实触摸回归（CDP Input.dispatchTouchEvent，9 探针 249 条）
