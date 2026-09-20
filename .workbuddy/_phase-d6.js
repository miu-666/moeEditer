    const results = [];
    const errors = [];
    window.addEventListener("error", (e) => errors.push(String(e.message)));

    function check(name, cond, detail) {
      results.push((cond ? "PASS" : "FAIL") + " | " + name + (detail !== undefined ? " | " + detail : ""));
    }
    function info(name, detail) { results.push("INFO | " + name + " | " + detail); }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const near = (a, b, tol) => Math.abs(a - b) <= tol;

    // --- Export helpers (same path as exportPNG) ----------------------------

    function renderExportCanvas() {
      return new Promise((resolve) => {
        const w = Math.round(state.canvas.width);
        const h = Math.round(state.canvas.height);
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = state.canvas.background;
        ctx.fillRect(0, 0, w, h);

        const sorted = [...state.elements].sort((a, b) => a.zIndex - b.zIndex);
        if (sorted.length === 0) { resolve({ canvas: cv, ctx }); return; }

        let pending = sorted.length;
        sorted.forEach(el => {
          renderElementToExportCanvas(ctx, el, () => {
            pending--;
            if (pending === 0) resolve({ canvas: cv, ctx });
          });
        });
      });
    }

    async function renderOnly(el) {
      const keep = state.elements;
      state.elements = [el];
      const r = await renderExportCanvas();
      state.elements = keep;
      return r;
    }

    function inkIn(ctx, box) {
      const x0 = Math.max(0, Math.floor(box.x));
      const y0 = Math.max(0, Math.floor(box.y));
      const x1 = Math.min(ctx.canvas.width, Math.ceil(box.x + box.width));
      const y1 = Math.min(ctx.canvas.height, Math.ceil(box.y + box.height));
      const w = x1 - x0, h = y1 - y0;
      if (w <= 0 || h <= 0) return { count: 0, cx: 0, cy: 0, rows: [], cols: [], x0, y0 };
      const d = ctx.getImageData(x0, y0, w, h).data;
      let count = 0, sx = 0, sy = 0;
      const rows = new Array(h).fill(0);
      const cols = new Array(w).fill(0);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const isBg = d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255;
          if (!isBg) {
            count++; sx += x; sy += y;
            rows[y]++; cols[x]++;
          }
        }
      }
      return { count, cx: count ? x0 + sx / count : 0, cy: count ? y0 + sy / count : 0, rows, cols, x0, y0 };
    }

    // Horizontal run of ink inside one x-range, in page pixels. Splitting by the
    // known column rects rather than by "runs of ink" matters: at 16px the gaps
    // *inside* a word are wider than 1px, so a run-based split reports one band
    // per glyph and "the first band" is not the first column.
    function inkExtent(stats, left, right) {
      const x0 = stats.x0;
      let first = -1, last = -1;
      const from = Math.max(0, Math.floor(left) - x0);
      const to = Math.min(stats.cols.length, Math.ceil(right) - x0);
      for (let i = from; i < to; i++) {
        if (stats.cols[i] > 0) {
          if (first < 0) first = x0 + i;
          last = x0 + i;
        }
      }
      return { first, last, width: first < 0 ? 0 : last - first + 1 };
    }

    function inkRowRange(stats) {
      let first = -1, last = -1;
      stats.rows.forEach((n, i) => { if (n > 0) { if (first < 0) first = i; last = i; } });
      return { first: first < 0 ? -1 : stats.y0 + first, last: last < 0 ? -1 : stats.y0 + last };
    }

    // --- Scenario ------------------------------------------------------------

    // No frame: the default 2px border would put its own ink inside the window
    // and the pixel assertions could not tell a border from a glyph. (Phase D and
    // D-5 both tripped over this.) The window also spans the whole content area,
    // edges included, so a right-aligned line's ink is inside the measurement —
    // a window that stopped at the text would make every alignment look the same.
    const PAD = 12;
    const OVERSCAN = 40;

    function contentWindow(el) {
      return {
        x: el.x + PAD,
        y: Math.max(0, el.y - OVERSCAN),
        width: el.width - PAD * 2,
        height: el.height + OVERSCAN * 2
      };
    }

    function makeBox(opts) {
      const el = createElement("textbox", { x: 40, y: 40, width: 300, height: 240 });
      el.style.layout = opts.layout || "single";
      el.style.split = 0.5;
      el.style.gap = 12;
      el.style.titleGap = 6;
      el.style.fontSize = 16;
      el.style.lineHeight = 1.4;
      el.style.borderWidth = 0;                // no frame ink (see above)
      el.content = {
        columns: [
          { title: opts.title || "", body: opts.body || "", align: opts.align0 || "" },
          { title: "", body: opts.body2 || "", align: opts.align1 || "" }
        ]
      };
      return el;
    }

    // Where the preview actually drew a node's text, in page pixels. A block
    // node's own rect is the full column width, so measure the text with a Range
    // instead — that returns the glyph boxes, which is what text-align shifts.
    function previewTextBox(selector, elId) {
      const canvasRect = document.getElementById("canvas").getBoundingClientRect();
      const node = document.querySelector(`[data-element-id="${elId}"] ${selector}`);
      if (!node || !node.firstChild) return null;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return {
        left: r.left - canvasRect.left,
        right: r.right - canvasRect.left,
        top: r.top - canvasRect.top,
        bottom: r.bottom - canvasRect.top
      };
    }

    function previewColumnRect(index, elId) {
      const canvasRect = document.getElementById("canvas").getBoundingClientRect();
      const node = document.querySelector(`[data-element-id="${elId}"] .box-column[data-col="${index}"]`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left - canvasRect.left, right: r.right - canvasRect.left, width: r.width };
    }

    async function measure(el) {
      state.elements = [el];
      renderAllElements();

      const col0 = previewColumnRect(0, el.id);
      const col1 = previewColumnRect(1, el.id);
      const body0 = previewTextBox('.box-text[data-col="0"]', el.id);
      const body1 = previewTextBox('.box-text[data-col="1"]', el.id);
      const title0 = previewTextBox('.box-title[data-col="0"]', el.id);
      const align0 = document.querySelector(`[data-element-id="${el.id}"] .box-text[data-col="0"]`);
      const align1 = document.querySelector(`[data-element-id="${el.id}"] .box-text[data-col="1"]`);
      const titleAlign0 = document.querySelector(`[data-element-id="${el.id}"] .box-title[data-col="0"]`);

      const { ctx } = await renderOnly(el);
      const ink = inkIn(ctx, contentWindow(el));

      // The column geometry comes from the editor's own geometry helper, not from
      // the DOM, so a CSS width bug would show up as a mismatch instead of being
      // silently absorbed by both sides.
      const area = {
        x: el.x + PAD,
        y: el.y + PAD,
        width: el.width - PAD * 2,
        height: el.height - PAD * 2
      };
      const exportRects = boxColumnRects(readBoxLayout(el.style), area);
      const ink0 = inkExtent(ink, exportRects[0].x, exportRects[0].x + exportRects[0].width);
      const ink1 = exportRects[1]
        ? inkExtent(ink, exportRects[1].x, exportRects[1].x + exportRects[1].width)
        : null;

      return {
        col0, col1, body0, body1, title0,
        computed0: align0 ? getComputedStyle(align0).textAlign : null,
        computed1: align1 ? getComputedStyle(align1).textAlign : null,
        computedTitle0: titleAlign0 ? getComputedStyle(titleAlign0).textAlign : null,
        exportRects,
        ink0, ink1,
        ink,
        inkRows: inkRowRange(ink),
        meta: readBoxLayout(el.style)
      };
    }

    // --- Run -----------------------------------------------------------------

    async function run() {
      state.canvas.mode = "fixed";
      state.canvas.width = 420;
      state.canvas.height = 340;
      state.canvas.background = "#FFFFFF";

      // ---------- A. readColumnAlign（纯函数） ----------
      info("--- A. readColumnAlign ---");
      const styleCenter = { textAlign: "center" };
      check("A1 栏自己设了值 → 用它", readColumnAlign({ align: "right" }, styleCenter) === "right");
      check("A2 栏没设值 → 回落到 style.textAlign",
        readColumnAlign({ align: "" }, styleCenter) === "center");
      check("A3 完全没有 align 字段 → 同样回落",
        readColumnAlign({ body: "x" }, styleCenter) === "center");
      check("A4 栏设了 left → 覆盖 style 的 center",
        readColumnAlign({ align: "left" }, styleCenter) === "left");
      check("A5 非法值 → 回落（不是原样返回）",
        readColumnAlign({ align: "justify" }, styleCenter) === "center");
      check("A6 style.textAlign 也没有 → left",
        readColumnAlign({ align: "" }, {}) === "left");
      check("A7 style.textAlign 非法 → left",
        readColumnAlign({ align: "" }, { textAlign: "justify" }) === "left");
      check("A8 空 column / 空 style 都不炸",
        readColumnAlign(null, null) === "left");

      // ---------- B. getBoxColumns / setBoxColumn 读写往返 ----------
      info("--- B. 存取往返 ---");
      const rt = makeBox({ body: "hi" });
      setBoxColumn(rt, 1, "align", "right");
      check("B1 写进去的是这一点", rt.content.columns[1].align === "right",
        JSON.stringify(rt.content.columns[1]));
      check("B2 写入后仍保持两栏的规范形状", rt.content.columns.length === 2);
      setBoxColumn(rt, 0, "align", "left");
      check("B3 两栏互不影响",
        rt.content.columns[0].align === "left" && rt.content.columns[1].align === "right");

      // The one that matters: typing text must not wipe the alignment, because
      // `setBoxColumn` rewrites the whole columns array from `getBoxColumns`.
      setBoxColumn(rt, 1, "body", "typed");
      check("B4 之后输入正文不会丢掉 align",
        rt.content.columns[1].align === "right" && rt.content.columns[1].body === "typed",
        JSON.stringify(rt.content.columns[1]));
      setBoxColumn(rt, 1, "align", "justify");
      check("B5 非法值写入 → 存成空（回落语义）", rt.content.columns[1].align === "",
        JSON.stringify(rt.content.columns[1].align));
      setBoxColumn(rt, 1, "align", "right");
      setBoxColumn(rt, 5, "align", "left");
      check("B6 越界栏号被忽略（不会造出第三栏）",
        rt.content.columns.length === 2 && rt.content.columns[1].align === "right");

      const legacy = createElement("textbox", { content: "老字符串正文" });
      setBoxColumn(legacy, 0, "align", "right");
      check("B7 老记录（content 是字符串）也能设 align，且正文被保住",
        legacy.content.columns[0].align === "right" &&
        legacy.content.columns[0].body === "老字符串正文",
        JSON.stringify(legacy.content.columns[0]));
      check("B8 老记录第一栏的 align 落进同一个规范结构",
        getBoxColumns(legacy)[0].align === "right");

      // ---------- C. 预览：text-align 真的落到这一栏的节点上 ----------
      info("--- C. 预览 DOM ---");
      const sLeft = await measure(makeBox({ body: "AAA", align0: "left" }));
      const sMid = await measure(makeBox({ body: "AAA", align0: "center" }));
      const sRight = await measure(makeBox({ body: "AAA", align0: "right" }));

      check("C1 单栏 left → computed left", sLeft.computed0 === "left", sLeft.computed0);
      check("C2 单栏 center → computed center", sMid.computed0 === "center", sMid.computed0);
      check("C3 单栏 right → computed right", sRight.computed0 === "right", sRight.computed0);

      const hLeft = sLeft.body0.left - sLeft.col0.left;
      const hRight = sRight.col0.left + sRight.col0.width - sRight.body0.right;
      const hMidL = sMid.body0.left - sMid.col0.left;
      const hMidR = sMid.col0.left + sMid.col0.width - sMid.body0.right;
      info("预览：left 左间隙 " + hLeft.toFixed(1) + "，right 右间隙 " + hRight.toFixed(1) +
        "，center 两侧 " + hMidL.toFixed(1) + " / " + hMidR.toFixed(1));
      check("C4 预览 left：文字贴住栏左边", near(hLeft, 0, 1.5), hLeft.toFixed(1));
      check("C5 预览 right：文字贴住栏右边", near(hRight, 0, 1.5), hRight.toFixed(1));
      check("C6 预览 center：两侧留白相等", near(hMidL, hMidR, 1.5),
        hMidL.toFixed(1) + " vs " + hMidR.toFixed(1));
      check("C7 三种对齐真的把文字摆在三个不同位置",
        sLeft.body0.left < sMid.body0.left && sMid.body0.left < sRight.body0.left,
        sLeft.body0.left.toFixed(0) + " < " + sMid.body0.left.toFixed(0) + " < " + sRight.body0.left.toFixed(0));

      // ---------- D. 导出：墨迹的水平位置 ----------
      info("--- D. 导出位图 ---");
      const dLeft = sLeft.ink0, dMid = sMid.ink0, dRight = sRight.ink0;
      info("导出墨迹横向：left " + dLeft.first + ".." + dLeft.last +
        "　center " + dMid.first + ".." + dMid.last +
        "　right " + dRight.first + ".." + dRight.last +
        "　（导出栏宽 " + sLeft.exportRects[0].width + "，预览栏宽 " + sLeft.col0.width.toFixed(0) + "）");
      check("D1 三种对齐都画出了墨（不是空栏）",
        sLeft.ink.count > 20 && sMid.ink.count > 20 && sRight.ink.count > 20,
        sLeft.ink.count + " / " + sMid.ink.count + " / " + sRight.ink.count);
      check("D2 导出：left 在最左、right 在最右（单调）",
        dLeft.first < dMid.first && dMid.first < dRight.first,
        dLeft.first + " < " + dMid.first + " < " + dRight.first);
      check("D3 导出墨迹量三档一致（只是挪位置，没裁掉字）",
        Math.abs(sLeft.ink.count - sRight.ink.count) <= 3 &&
        Math.abs(sLeft.ink.count - sMid.ink.count) <= 3,
        sLeft.ink.count + " / " + sMid.ink.count + " / " + sRight.ink.count);

      // ---------- E. 关键断言：预览与导出的对齐位置一致 ----------
      info("--- E. 预览位置 vs 导出位置 ---");
      // Regression for a real bug this probe caught: the first column used to be
      // `flex: 0 0 var(--split)` even in single mode, so the preview drew the text
      // into the left half while the exporter — boxColumnRects() — used the full
      // frame. Every horizontal assertion below would "pass" if both sides shared
      // the same wrong width, so the width itself is pinned too.
      check("E0 单栏：预览栏宽 == 导出栏宽（CSS 少了一条 layout-single 规则就会挂）",
        near(sLeft.col0.width, sLeft.exportRects[0].width, 1),
        "预览 " + sLeft.col0.width.toFixed(1) + " 导出 " + sLeft.exportRects[0].width);
      check("E1 left：导出墨迹起点 == 预览文字起点（±2px）",
        near(dLeft.first - sLeft.col0.left, hLeft, 2),
        "导出偏移 " + (dLeft.first - sLeft.col0.left) + " 预览偏移 " + hLeft.toFixed(1));
      check("E2 right：导出墨迹终点 == 预览文字终点（±2px）",
        near((sRight.col0.left + sRight.col0.width) - dRight.last, hRight, 2),
        "导出右间隙 " + ((sRight.col0.left + sRight.col0.width) - dRight.last) +
        " 预览右间隙 " + hRight.toFixed(1));
      const pSpan = sRight.body0.left - sLeft.body0.left;
      const eSpan = dRight.first - dLeft.first;
      info("left→right 的横向位移：预览 " + pSpan.toFixed(1) + "px　导出 " + eSpan + "px");
      check("E3 left→right 的位移量，预览与导出一致（±2px）", near(pSpan, eSpan, 2),
        pSpan.toFixed(1) + " vs " + eSpan);
      const midCenter = (dMid.first + dMid.last) / 2;
      const colCenter = sMid.col0.left + sMid.col0.width / 2;
      check("E4 center 的墨迹中心落在栏中心", near(midCenter, colCenter, 2),
        "导出中心 " + midCenter.toFixed(1) + " 栏中心 " + colCenter.toFixed(1));

      // ---------- F. 分栏：两栏各自对齐（D-6 的新能力） ----------
      info("--- F. 分栏两栏各不相同 ---");
      // col0 左对齐 + col1 右对齐：两条墨迹带应该分别贴住各自栏的外侧边缘。
      const fwd = makeBox({ layout: "columns", body: "AAA", body2: "BBB", align0: "left", align1: "right" });
      const rev = makeBox({ layout: "columns", body: "AAA", body2: "BBB", align0: "right", align1: "left" });
      const mFwd = await measure(fwd);
      const mRev = await measure(rev);

      // Guard against a vacuous test: if both columns' ink landed in the same
      // x-range, "col0 is left and col1 is right" could not be told from "both
      // centred". Two separated extents is what makes the assertions meaningful.
      info("分栏 正向：栏0 墨迹 " + mFwd.ink0.first + ".." + mFwd.ink0.last +
        "　栏1 墨迹 " + mFwd.ink1.first + ".." + mFwd.ink1.last +
        "　预览栏0 " + mFwd.col0.left.toFixed(0) + ".." + (mFwd.col0.left + mFwd.col0.width).toFixed(0) +
        "　预览栏1 " + mFwd.col1.left.toFixed(0) + ".." + (mFwd.col1.left + mFwd.col1.width).toFixed(0));
      check("F0 两栏的墨迹确实分开（否则下面的断言无意义）",
        mFwd.ink0.last < mFwd.ink1.first,
        "栏0 到 " + mFwd.ink0.last + "，栏1 从 " + mFwd.ink1.first + " 起");
      check("F0b 分栏时预览栏宽 == 导出栏宽（两栏都对）",
        near(mFwd.col0.width, mFwd.exportRects[0].width, 1) &&
        near(mFwd.col1.width, mFwd.exportRects[1].width, 1),
        "栏0 " + mFwd.col0.width.toFixed(1) + " vs " + mFwd.exportRects[0].width +
        "　栏1 " + mFwd.col1.width.toFixed(1) + " vs " + mFwd.exportRects[1].width);
      check("F1 预览：栏0 是 left、栏1 是 right",
        mFwd.computed0 === "left" && mFwd.computed1 === "right",
        mFwd.computed0 + " / " + mFwd.computed1);
      check("F2 导出：栏0 的墨迹从栏左边缘开始（±2px）",
        near(mFwd.ink0.first - mFwd.col0.left, 0, 2),
        (mFwd.ink0.first - mFwd.col0.left) + " px");
      check("F3 导出：栏1 的墨迹贴着栏右边缘（±2px）",
        near((mFwd.col1.left + mFwd.col1.width) - mFwd.ink1.last, 0, 2),
        ((mFwd.col1.left + mFwd.col1.width) - mFwd.ink1.last) + " px");
      check("F4 预览：栏0 文字贴左、栏1 文字贴右",
        near(mFwd.body0.left - mFwd.col0.left, 0, 1.5) &&
        near((mFwd.col1.left + mFwd.col1.width) - mFwd.body1.right, 0, 1.5),
        (mFwd.body0.left - mFwd.col0.left).toFixed(1) + " / " +
        ((mFwd.col1.left + mFwd.col1.width) - mFwd.body1.right).toFixed(1));
      check("F5 反向：栏0 贴右、栏1 贴左（墨迹与正向相反）",
        near((mRev.col0.left + mRev.col0.width) - mRev.ink0.last, 0, 2) &&
        near(mRev.ink1.first - mRev.col1.left, 0, 2),
        "栏0 右间隙 " + ((mRev.col0.left + mRev.col0.width) - mRev.ink0.last) +
        "　栏1 左间隙 " + (mRev.ink1.first - mRev.col1.left));
      check("F6 反向：预览也是栏0 贴右、栏1 贴左（与导出同向）",
        near((mRev.col0.left + mRev.col0.width) - mRev.body0.right, 0, 1.5) &&
        near(mRev.body1.left - mRev.col1.left, 0, 1.5),
        ((mRev.col0.left + mRev.col0.width) - mRev.body0.right).toFixed(1) + " / " +
        (mRev.body1.left - mRev.col1.left).toFixed(1));
      // Ink *count* is not comparable between the two: a glyph drawn at a
      // different sub-pixel offset anti-aliases into a different number of
      // non-white pixels. The extent width is phase-independent, so compare that.
      check("F7 正 / 反向是同一批字，只是位置换了（墨迹跨度一致）",
        near(mFwd.ink0.width, mRev.ink0.width, 1) && near(mFwd.ink1.width, mRev.ink1.width, 1),
        "栏0 " + mFwd.ink0.width + " vs " + mRev.ink0.width +
        "　栏1 " + mFwd.ink1.width + " vs " + mRev.ink1.width);
      // 标题跟着栏走，和正文用同一条规则。
      const titled = makeBox({ layout: "columns", title: "TT", body: "AAA", body2: "BBB", align1: "right" });
      const mTitled = await measure(titled);
      check("F8 栏的 align 同时作用于标题（预览）", mTitled.computedTitle0 === "center",
        "栏0 未设值 → 回落 style.textAlign=" + mTitled.computedTitle0);
      const titleRight = makeBox({ layout: "columns", title: "TT", body: "AAA", body2: "BBB", align0: "right", align1: "right" });
      const mTitleRight = await measure(titleRight);
      check("F9 栏设了值，标题也跟着（预览）", mTitleRight.computedTitle0 === "right",
        mTitleRight.computedTitle0);

      // ---------- G. 老记录：没有 column.align，观感一像素不变 ----------
      info("--- G. 老记录回归 ---");
      const oldRecord = makeBox({ layout: "columns", body: "AAA", body2: "BBB" });
      oldRecord.content = { columns: [{ title: "", body: "AAA" }, { title: "", body: "BBB" }] };
      const mOld = await measure(oldRecord);
      check("G1 老记录（无 align）→ 落到 style.textAlign = center",
        mOld.computed0 === "center" && mOld.computed1 === "center",
        mOld.computed0 + " / " + mOld.computed1);
      check("G2 老记录导出也是居中（两栏墨迹各自居中于本栏）",
        near((mOld.ink0.first + mOld.ink0.last) / 2,
          mOld.col0.left + mOld.col0.width / 2, 2) &&
        near((mOld.ink1.first + mOld.ink1.last) / 2,
          mOld.col1.left + mOld.col1.width / 2, 2),
        "栏0 " + ((mOld.ink0.first + mOld.ink0.last) / 2).toFixed(1) +
        " vs " + (mOld.col0.left + mOld.col0.width / 2).toFixed(1) +
        "　栏1 " + ((mOld.ink1.first + mOld.ink1.last) / 2).toFixed(1) +
        " vs " + (mOld.col1.left + mOld.col1.width / 2).toFixed(1));
      check("G3 readColumnAlign 对老记录返回 center（不是 left）",
        readColumnAlign(getBoxColumns(oldRecord)[0], oldRecord.style) === "center");

      // ---------- H. 面板：每栏一个控件，点了真的生效 ----------
      info("--- H. 属性面板 ---");
      const panelBox = makeBox({ layout: "columns", body: "AAA", body2: "BBB" });
      state.elements = [panelBox];
      renderAllElements();
      setSelectedElementId(panelBox.id);
      renderPropertiesPanel();
      pushHistory();                       // baseline so undo has somewhere to go

      const panel = document.getElementById("properties-panel");
      const caBtns = panel.querySelectorAll("[data-colalign]");
      check("H1 分栏时面板有 6 个按钮（每栏 L/C/R）", caBtns.length === 6,
        Array.from(caBtns).map(b => b.dataset.col + ":" + b.dataset.colalign).join(" "));
      check("H2 textbox 面板不再有整框的 data-align 控件（避免两个控件打架）",
        panel.querySelectorAll("[data-align]").length === 0,
        panel.querySelectorAll("[data-align]").length + " 个");
      check("H3 老记录的 active 态反映「实际生效」的对齐（center）",
        panel.querySelector('[data-col="0"][data-colalign="center"]').classList.contains("active") &&
        panel.querySelector('[data-col="1"][data-colalign="center"]').classList.contains("active"));

      const nodeBefore = document.querySelector('[data-element-id="' + panelBox.id + '"] .box-text[data-col="1"]');
      const btn1R = panel.querySelector('[data-col="1"][data-colalign="right"]');
      btn1R.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await sleep(20);

      check("H4 点栏1 的 R 之后，align 落在栏1 上（不是整框）",
        panelBox.content.columns[1].align === "right", JSON.stringify(panelBox.content.columns[1]));
      check("H5 栏0 没有被连带改掉（栏0 仍是空 = 继承）",
        panelBox.content.columns[0].align === "", JSON.stringify(panelBox.content.columns[0].align));
      const nodeAfter = document.querySelector('[data-element-id="' + panelBox.id + '"] .box-text[data-col="1"]');
      check("H6 画布改成右对齐了", nodeAfter && getComputedStyle(nodeAfter).textAlign === "right",
        nodeAfter && getComputedStyle(nodeAfter).textAlign);
      check("H7 改对齐没有重建 DOM 节点（换 class 不改结构）", nodeBefore === nodeAfter,
        nodeBefore === nodeAfter ? "同一节点" : "被重建了");
      check("H8 面板重建后栏1 的 R 是 active",
        document.querySelector('#properties-panel [data-col="1"][data-colalign="right"]')
          .classList.contains("active"));

      // 导出的确跟着动
      const afterClick = await measure(panelBox);
      check("H9 点完之后导出：栏1 的墨迹贴住栏右边缘（±2px）",
        near((afterClick.col1.left + afterClick.col1.width) - afterClick.ink1.last, 0, 2),
        ((afterClick.col1.left + afterClick.col1.width) - afterClick.ink1.last) + " px");

      undo();
      await sleep(20);
      check("H10 一次点击 = 一步撤销",
        readColumnAlign(getBoxColumns(state.elements[0])[1], state.elements[0].style) === "center",
        JSON.stringify(getBoxColumns(state.elements[0])[1]));

      // 单栏时只给一栏的控件
      const singlePanelBox = makeBox({ body: "AAA" });
      state.elements = [singlePanelBox];
      renderAllElements();
      setSelectedElementId(singlePanelBox.id);
      renderPropertiesPanel();
      check("H11 单栏时只有 3 个按钮（一栏的控件，不再是整框的）",
        document.querySelectorAll("#properties-panel [data-colalign]").length === 3,
        document.querySelectorAll("#properties-panel [data-colalign]").length + " 个");

      // ---------- I. 回归：text 元素的整框 Align 没被动到 ----------
      info("--- I. 回归 ---");
      const textEl = createElement("text", { content: "hello" });
      state.elements = [textEl];
      renderAllElements();
      setSelectedElementId(textEl.id);
      renderPropertiesPanel();
      const tBtns = document.querySelectorAll("#properties-panel [data-align]");
      check("I1 text 元素仍有整框的 L / C / R", tBtns.length === 3, tBtns.length + " 个");
      document.querySelector('#properties-panel [data-align="right"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await sleep(20);
      check("I2 text 元素的 Align 仍然写进 style.textAlign",
        textEl.style.textAlign === "right", textEl.style.textAlign);
      check("I3 text 元素不带 data-colalign（不是 Box）",
        document.querySelectorAll("#properties-panel [data-colalign]").length === 0);
      check("I4 回归：无 JS 运行时错误", errors.length === 0, errors.join(" ~ "));

      const out = document.createElement("pre");
      out.id = "probe-out";
      out.textContent = "PROBE_RESULT_START\n" + results.join("\n") + "\nPROBE_RESULT_END";
      document.body.appendChild(out);
    }

    // Visual: legacy centring next to the new per-column control.
    async function shot() {
      document.querySelector(".app").style.height = "auto";
      const main = document.querySelector(".main");
      if (main) main.style.height = "auto";
      document.querySelectorAll(".sidebar").forEach(n => { n.style.display = "none"; });
      const area = document.querySelector(".canvas-area");
      if (area) { area.style.overflow = "visible"; area.style.height = "auto"; }

      state.canvas.mode = "fixed";
      state.canvas.width = 740;
      state.canvas.height = 300;
      state.canvas.background = "#FFFFFF";
      applyCanvasSize();

      const three = "\u957f\u4e00\u884c\n\u4e2d\u4e00\u884c\n\u77ed";
      const specs = [
        { title: "\u8001\u8bb0\u5f55 \u00b7 \u7ee7\u627f\u5c45\u4e2d", a0: "", a1: "" },
        { title: "\u5de6 / \u53f3", a0: "left", a1: "right" },
        { title: "\u53f3 / \u5de6", a0: "right", a1: "left" },
        { title: "\u5c45\u4e2d / \u5c45\u4e2d", a0: "center", a1: "center" }
      ];
      state.elements = specs.map((s, i) => {
        const el = createElement("textbox", { x: 20 + i * 180, y: 30, width: 160, height: 240 });
        el.style.layout = "columns";
        el.style.fontSize = 13;
        el.style.titleFontSize = 13;
        el.style.paddingH = 10;
        el.style.paddingV = 10;
        el.content = {
          columns: [
            { title: s.title, body: three, align: s.a0 },
            { title: "", body: three, align: s.a1 }
          ]
        };
        return el;
      });
      state.elements.forEach((el, i) => { el.zIndex = i + 1; });

      setSelectedElementId(null);
      renderAllElements();
      const wrap = document.getElementById("shot-wrap");
      const { canvas } = await renderExportCanvas();

      const l1 = document.createElement("div");
      l1.className = "shot-label";
      l1.textContent = "\u4e0a\uff1a\u7f16\u8f91\u5668\u753b\u5e03\uff08\u9884\u89c8\uff09\u3000\u4e0b\uff1a\u5bfc\u51fa\u4f4d\u56fe\u3000" +
        "\u56db\u7ec4\u4ece\u5de6\u5230\u53f3\uff1a\u8001\u8bb0\u5f55\u7ee7\u627f\u5c45\u4e2d / \u5de6\u53f3 / \u53f3\u5de6 / \u5c45\u4e2d\u5c45\u4e2d";
      wrap.appendChild(l1);

      const img = document.createElement("img");
      img.id = "export-img";
      img.width = canvas.width;
      img.height = canvas.height;
      img.src = canvas.toDataURL("image/png");
      wrap.appendChild(img);
    }

    window.addEventListener("load", () => {
      if (location.hash.indexOf("#shot") === 0) {
        shot().catch(err => { document.title = "shot failed: " + err.message; });
        return;
      }
      run().catch(err => {
        results.push("FAIL | 探针自身异常 | " + (err && err.message));
        const out = document.createElement("pre");
        out.id = "probe-out";
        out.textContent = "PROBE_RESULT_START\n" + results.join("\n") + "\nPROBE_RESULT_END";
        document.body.appendChild(out);
      });
    });
