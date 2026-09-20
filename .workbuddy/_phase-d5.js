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

    function inkRowRange(stats) {
      let first = -1, last = -1;
      stats.rows.forEach((n, i) => { if (n > 0) { if (first < 0) first = i; last = i; } });
      return { first: first < 0 ? -1 : stats.y0 + first, last: last < 0 ? -1 : stats.y0 + last };
    }

    // --- Scenario ------------------------------------------------------------

    // No frame in the measured scenarios: the default 2px border would sit inside
    // the measurement window and its ink would be counted as text. With
    // borderWidth 0 the only ink on the page is glyphs, so the window can be
    // opened up far enough to see text that would spill out of the column.
    const PAD = 12;
    const OVERSCAN = 100;

    // The window is the Box's content area grown vertically. Growing it is the
    // whole point: a window the size of the column would hide the very overflow
    // the F assertions are about.
    function inkWindow(el) {
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
      el.style.vAlign = opts.vAlign;           // undefined = leave it to the default
      el.style.split = 0.5;
      el.style.gap = 12;
      el.style.titleGap = 6;
      el.style.fontSize = 16;
      el.style.lineHeight = 1.4;
      el.style.borderWidth = 0;                // no frame ink (see above)
      el.content = {
        columns: [
          { title: opts.title || "", body: opts.body || "" },
          { title: "", body: opts.body2 || "" }
        ]
      };
      return el;
    }

    // Where the preview actually puts a node, in page pixels.
    function previewRect(selector, elId) {
      const canvasRect = document.getElementById("canvas").getBoundingClientRect();
      const node = document.querySelector(`[data-element-id="${elId}"] ${selector}`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top - canvasRect.top, bottom: r.bottom - canvasRect.top, height: r.height, width: r.width };
    }

    async function measure(el) {
      // Preview: render for real, then read the laid-out geometry.
      state.elements = [el];
      renderAllElements();

      const col = previewRect('.box-column[data-col="0"]', el.id);
      const text = previewRect(".box-text", el.id);
      const title = previewRect(".box-title", el.id);
      const body = document.querySelector(`[data-element-id="${el.id}"] .box-body`);
      const justify = body ? getComputedStyle(body.querySelector('.box-column[data-col="0"]')).justifyContent : null;
      const classes = body ? body.className : null;

      // Export: same Box, through the real export renderer.
      const { ctx } = await renderOnly(el);
      const ink = inkIn(ctx, inkWindow(el));

      return {
        col, text, title, justify, classes,
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

      const body3 = "\u4e00\u4e8c\u4e09";   // three short lines
      const lines = [];
      for (let i = 0; i < 6; i++) lines.push("\u884c" + (i + 1));
      const longBody = lines.join("\n");

      // ---------- A. readBoxLayout 的默认值 ----------
      info("--- A. 默认值（老作品不变形）---");
      const noAlign = createElement("textbox", {}).style;
      check("A1 无 vAlign + 单栏 → middle（保住原来的居中观感）",
        readBoxLayout({ ...noAlign, layout: "single" }).vAlign === "middle",
        readBoxLayout({ ...noAlign, layout: "single" }).vAlign);
      check("A2 无 vAlign + 左右分栏 → top",
        readBoxLayout({ ...noAlign, layout: "columns" }).vAlign === "top");
      check("A3 无 vAlign + 上下分栏 → top",
        readBoxLayout({ ...noAlign, layout: "rows" }).vAlign === "top");
      check("A4 显式 top 覆盖单栏默认",
        readBoxLayout({ ...noAlign, layout: "single", vAlign: "top" }).vAlign === "top");
      check("A5 显式 bottom 覆盖单栏默认",
        readBoxLayout({ ...noAlign, layout: "single", vAlign: "bottom" }).vAlign === "bottom");
      check("A6 显式 middle 在分栏下也生效",
        readBoxLayout({ ...noAlign, layout: "columns", vAlign: "middle" }).vAlign === "middle");
      check("A7 非法值回落到布局默认值",
        readBoxLayout({ ...noAlign, layout: "columns", vAlign: "sideways" }).vAlign === "top");
      check("A8 空字符串也回落到布局默认值",
        readBoxLayout({ ...noAlign, layout: "single", vAlign: "" }).vAlign === "middle");

      // ---------- B. 预览：class 与 computed 样式 ----------
      info("--- B. 预览 DOM ---");
      const bTop = makeBox({ vAlign: "top", body: body3 });
      const bMid = makeBox({ vAlign: "middle", body: body3 });
      const bBot = makeBox({ vAlign: "bottom", body: body3 });

      const mTop = await measure(bTop);
      const mMid = await measure(bMid);
      const mBot = await measure(bBot);

      check("B1 .box-body 带上 valign-top", mTop.classes === "box-body layout-single valign-top", mTop.classes);
      check("B2 .box-body 带上 valign-bottom", mBot.classes === "box-body layout-single valign-bottom", mBot.classes);
      check("B3 top → justify-content: flex-start", mTop.justify === "flex-start", mTop.justify);
      check("B4 middle → justify-content: center", mMid.justify === "center", mMid.justify);
      check("B5 bottom → justify-content: flex-end", mBot.justify === "flex-end", mBot.justify);

      // Preview: the text node's offset inside its column.
      const pH = mTop.col.height;
      const pT = mTop.text.height;
      const pTopOff = mTop.text.top - mTop.col.top;
      const pMidOff = mMid.text.top - mMid.col.top;
      const pBotOff = mBot.text.top - mBot.col.top;
      info("预览：栏高 " + pH.toFixed(1) + "，文本高 " + pT.toFixed(1) +
        "，偏移 top=" + pTopOff.toFixed(1) + " middle=" + pMidOff.toFixed(1) + " bottom=" + pBotOff.toFixed(1));
      check("B6 预览：top 贴住栏顶", near(pTopOff, 0, 1), pTopOff.toFixed(1));
      check("B7 预览：middle 居中", near(pMidOff, (pH - pT) / 2, 1.5),
        "实测 " + pMidOff.toFixed(1) + " 期望 " + ((pH - pT) / 2).toFixed(1));
      check("B8 预览：bottom 贴住栏底", near(pBotOff, pH - pT, 1.5),
        "实测 " + pBotOff.toFixed(1) + " 期望 " + (pH - pT).toFixed(1));

      // ---------- C. 导出：墨迹真的跟着动 ----------
      info("--- C. 导出位图 ---");
      const cTop = mTop.inkRows, cMid = mMid.inkRows, cBot = mBot.inkRows;
      info("导出墨迹行范围：" + cTop.first + ".." + cTop.last +
        " / " + cMid.first + ".." + cMid.last + " / " + cBot.first + ".." + cBot.last);

      check("C1 三种对齐都有墨（不是画歪了没画出来）",
        mTop.ink.count > 30 && mMid.ink.count > 30 && mBot.ink.count > 30,
        mTop.ink.count + " / " + mMid.ink.count + " / " + mBot.ink.count);
      check("C2 导出：top 在最上、bottom 在最下（单调）",
        cTop.first < cMid.first && cMid.first < cBot.first,
        cTop.first + " < " + cMid.first + " < " + cBot.first);
      check("C3 导出墨迹量三档一致（只是挪位置，没有裁掉字）",
        Math.abs(mTop.ink.count - mBot.ink.count) <= 2 && Math.abs(mTop.ink.count - mMid.ink.count) <= 2,
        mTop.ink.count + " / " + mMid.ink.count + " / " + mBot.ink.count);

      // ---------- D. 关键断言：预览的位移 == 导出的位移 ----------
      info("--- D. 预览位移 vs 导出位移 ---");
      const pDelta = pBotOff - pTopOff;                 // 预览把文字往下推了多少
      const eDelta = (cBot.first - cTop.first) - 0;     // 导出把墨迹往下推了多少
      info("预览位移 " + pDelta.toFixed(1) + "px　导出位移 " + eDelta + "px");
      check("D1 bottom−top 的位移量，预览与导出一致（±2px）", near(pDelta, eDelta, 2),
        "预览 " + pDelta.toFixed(1) + " 导出 " + eDelta);
      check("D2 middle 的位移 = 一半（预览）", near(pMidOff - pTopOff, pDelta / 2, 1.5),
        (pMidOff - pTopOff).toFixed(1) + " vs " + (pDelta / 2).toFixed(1));
      check("D3 middle 的位移 = 一半（导出）",
        near((cMid.first - cTop.first) - eDelta / 2, 0, 2),
        (cMid.first - cTop.first) + " vs " + (eDelta / 2).toFixed(1));

      // 导出墨迹落在栏内的绝对位置：用一次偏置量把"墨迹行"和"文本框"对上，
      // 之后三档都用同一个偏置，所以比对是自洽的而不是自证循环。
      const bias = pTopOff - (cTop.first - mTop.col.top);
      info("文本框→墨迹的固定偏置 " + bias.toFixed(1) + "px（首行上半行距，三档共用）");
      const predictMid = mTop.col.top + pMidOff - bias;
      check("D4 用预览预测导出：middle 的首行墨迹位置（±2px）",
        near(cMid.first, predictMid, 2),
        "导出 " + cMid.first + " 预测 " + predictMid.toFixed(1));
      const predictBot = mTop.col.top + pBotOff - bias;
      check("D5 用预览预测导出：bottom 的首行墨迹位置（±2px）",
        near(cBot.first, predictBot, 2),
        "导出 " + cBot.first + " 预测 " + predictBot.toFixed(1));

      // ---------- E. 分栏：每栏各自垂直对齐 ----------
      info("--- E. 分栏 ---");
      const splitTop = makeBox({ layout: "columns", vAlign: "top", body: "AAA", body2: "BBB" });
      const splitBot = makeBox({ layout: "columns", vAlign: "bottom", body: "AAA", body2: "BBB" });
      const sTop = await measure(splitTop);
      const sBot = await measure(splitBot);

      check("E1 分栏时两栏都拿到 valign 类", sBot.classes === "box-body layout-columns valign-bottom", sBot.classes);
      // 同一场景内部对比：字号字形完全相同，所以"预览位移 == 导出位移"是硬约束，
      // 不需要借用别的字形量出来的偏置量。
      const sPreviewDelta = sBot.text.top - sTop.text.top;
      const sExportDelta = sBot.inkRows.first - sTop.inkRows.first;
      info("分栏：预览位移 " + sPreviewDelta.toFixed(1) + "px　导出位移 " + sExportDelta + "px");
      check("E2 分栏：top→bottom 的位移，预览与导出一致（±2px）",
        near(sPreviewDelta, sExportDelta, 2), sPreviewDelta.toFixed(1) + " vs " + sExportDelta);
      check("E3 分栏：bottom 时预览贴住栏底",
        near(sBot.text.bottom - (sBot.col.top + sBot.col.height), 0, 1.5),
        (sBot.text.bottom - (sBot.col.top + sBot.col.height)).toFixed(1));
      check("E4 分栏：top 与 bottom 的导出行确实不同（两档都生效）",
        sExportDelta > 20, "Δ=" + sExportDelta);

      // ---------- F. 溢出：内容比栏高，预览与导出都得裁在栏边上 ----------
      info("--- F. 内容溢出一栏 ---");
      const overflowMid = makeBox({ vAlign: "middle", body: longBody });   // 6 行 ≈ 134px 文本
      overflowMid.height = 120;   // 内容区只有 120-28=92px
      const ovf = await measure(overflowMid);

      const ovfTextOff = ovf.text.top - ovf.col.top;
      info("溢出：栏高 " + ovf.col.height.toFixed(1) + "，文本高 " + ovf.text.height.toFixed(1) +
        "，预览偏移 " + ovfTextOff.toFixed(1));
      // Guard against a vacuous test: if the measurement window were only as tall
      // as the column, spill-out ink would never be counted and F3/F4 could not
      // fail. (The first version of this probe made exactly that mistake.)
      const win = inkWindow(overflowMid);
      check("F0 测量窗口确实高于栏（否则 F3/F4 无效）",
        win.y < ovf.col.top - 20 && win.y + win.height > ovf.col.top + ovf.col.height + 20,
        "窗口 " + win.y + ".." + (win.y + win.height).toFixed(0) +
        "　栏 " + ovf.col.top.toFixed(0) + ".." + (ovf.col.top + ovf.col.height).toFixed(0));
      check("F1 预览：文本高过栏（确实溢出了，用例有效）", ovf.text.height > ovf.col.height + 4,
        ovf.text.height.toFixed(1) + " > " + ovf.col.height.toFixed(1));
      check("F2 预览：middle 溢出时向上探出（负偏移，靠 overflow:hidden 裁掉）", ovfTextOff < -1,
        ovfTextOff.toFixed(1));
      const ovfRows = ovf.inkRows;
      const ovfColTop = ovf.col.top, ovfColBot = ovf.col.top + ovf.col.height;
      info("导出墨迹 " + ovfRows.first + ".." + ovfRows.last + "，栏 " +
        ovfColTop.toFixed(0) + ".." + ovfColBot.toFixed(0));
      check("F3 导出：墨迹不越过栏顶（裁在栏边上）", ovfRows.first >= ovfColTop - 1.5,
        ovfRows.first + " vs 栏顶 " + ovfColTop.toFixed(1));
      check("F4 导出：墨迹不越过栏底（旧实现会画到栏外）", ovfRows.last <= ovfColBot + 1.5,
        ovfRows.last + " vs 栏底 " + ovfColBot.toFixed(1));
      check("F5 导出：整栏都被文字填满（说明是裁掉而不是改成了顶对齐）",
        ovf.ink.count > 0 && (ovfRows.last - ovfRows.first) > ovf.col.height * 0.85,
        (ovfRows.last - ovfRows.first) + " / 栏高 " + ovf.col.height.toFixed(1));

      // ---------- H. 面板：按钮真的接上了 ----------
      info("--- H. 属性面板 ---");
      const panelBox = makeBox({ vAlign: "top", body: body3 });
      state.elements = [panelBox];
      renderAllElements();
      pushHistory();                       // baseline so undo has somewhere to go
      setSelectedElementId(panelBox.id);
      renderPropertiesPanel();

      const panel = document.getElementById("properties-panel");
      const vBtns = panel.querySelectorAll("[data-valign]");
      check("H1 面板里有 T / M / B 三个按钮", vBtns.length === 3,
        Array.from(vBtns).map(b => b.dataset.valign).join(","));
      check("H2 当前值对应的按钮是 active 态",
        panel.querySelector('[data-valign="top"]').classList.contains("active") &&
        !panel.querySelector('[data-valign="bottom"]').classList.contains("active"),
        "vAlign=" + readBoxLayout(panelBox.style).vAlign);

      // Click through the real handler chain: panel → updateElement →
      // updateElementDOM → applyBoxBody.
      const btnBottom = panel.querySelector('[data-valign="bottom"]');
      btnBottom.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await sleep(20);

      check("H3 点 B 之后 state 变成 bottom", panelBox.style.vAlign === "bottom", panelBox.style.vAlign);
      const domBody = document.querySelector('[data-element-id="' + panelBox.id + '"] .box-body');
      check("H4 点 B 之后画布同步更新（不用重新渲染整个画布）",
        domBody && domBody.classList.contains("valign-bottom"), domBody && domBody.className);
      check("H5 面板重建后 B 是 active",
        document.querySelector('#properties-panel [data-valign="bottom"]').classList.contains("active"));

      const exportedAfterClick = await measure(panelBox);
      check("H6 改变对齐不改栏高（不会牵动页面高度）",
        near(exportedAfterClick.col.height, mTop.col.height, 0.5),
        exportedAfterClick.col.height.toFixed(1) + " vs " + mTop.col.height.toFixed(1));

      // The click pushed its own history entry, so one undo goes back to top.
      // applySnapshot swaps in a deep copy, so read the value back out of state
      // rather than off the old object reference.
      undo();
      await sleep(20);
      const afterUndo = readBoxLayout(state.elements[0].style).vAlign;
      check("H7 一次点击 = 一步撤销", afterUndo === "top", afterUndo);

      // ---------- G. 回归 ----------
      info("--- G. 回归 ---");
      const legacy = makeBox({ body: body3 });          // 不写 vAlign，模拟老记录
      delete legacy.style.vAlign;
      const lg = await measure(legacy);
      check("G1 老记录（无 vAlign）单栏仍然居中",
        lg.meta.vAlign === "middle" && near(lg.text.top - lg.col.top, (lg.col.height - lg.text.height) / 2, 1.5),
        "vAlign=" + lg.meta.vAlign + " 偏移=" + (lg.text.top - lg.col.top).toFixed(1));
      const legacySplit = makeBox({ layout: "columns", body: body3, body2: "BB" });
      delete legacySplit.style.vAlign;
      const lgs = await measure(legacySplit);
      check("G2 老记录分栏仍然顶对齐",
        lgs.meta.vAlign === "top" && near(lgs.text.top - lgs.col.top, 0, 1),
        "vAlign=" + lgs.meta.vAlign + " 偏移=" + (lgs.text.top - lgs.col.top).toFixed(1));
      const titled = makeBox({ vAlign: "bottom", title: "TITLE", body: body3 });
      const tt = await measure(titled);
      check("G3 有标题时 bottom 是「标题+正文」整块贴底（不是把正文单独贴底）",
        near(tt.text.bottom - (tt.col.top + tt.col.height), 0, 1.5),
        (tt.text.bottom - (tt.col.top + tt.col.height)).toFixed(1));
      check("G4 有标题时标题仍在正文上方",
        tt.title.top < tt.text.top,
        "title " + tt.title.top.toFixed(1) + " < text " + tt.text.top.toFixed(1));
      check("G5 回归：无 JS 运行时错误", errors.length === 0, errors.join(" ~ "));

      const out = document.createElement("pre");
      out.id = "probe-out";
      out.textContent = "PROBE_RESULT_START\n" + results.join("\n") + "\nPROBE_RESULT_END";
      document.body.appendChild(out);
    }

    // Visual: 3 alignments × single/split, preview on top, export bitmap below.
    async function shot() {
      document.querySelector(".app").style.height = "auto";
      const main = document.querySelector(".main");
      if (main) main.style.height = "auto";
      document.querySelectorAll(".sidebar").forEach(n => { n.style.display = "none"; });
      const area = document.querySelector(".canvas-area");
      if (area) { area.style.overflow = "visible"; area.style.height = "auto"; }

      state.canvas.mode = "fixed";
      state.canvas.width = 700;
      state.canvas.height = 270;
      state.canvas.background = "#FFFFFF";
      // push the new page size onto the DOM, otherwise .canvas keeps its
      // default 600x900 and the export bitmap gets pushed off the screenshot
      applyCanvasSize();

      const body = "\u4e00\u4e8c\u4e09";
      const specs = [
        { vAlign: "top", layout: "single", label: "单栏 top" },
        { vAlign: "middle", layout: "single", label: "单栏 middle" },
        { vAlign: "bottom", layout: "single", label: "单栏 bottom" },
        { vAlign: "top", layout: "columns", label: "分栏 top" },
        { vAlign: "middle", layout: "columns", label: "分栏 middle" },
        { vAlign: "bottom", layout: "columns", label: "分栏 bottom" }
      ];
      state.elements = specs.map((s, i) => {
        const el = createElement("textbox", { x: 14 + i * 114, y: 20, width: 106, height: 230 });
        el.style.layout = s.layout;
        el.style.vAlign = s.vAlign;
        el.style.fontSize = 13;
        el.style.titleFontSize = 13;
        el.style.paddingH = 8;
        el.style.paddingV = 8;
        el.content = {
          columns: [
            { title: "\u6807\u9898", body: body },
            { title: "", body: "BB" }
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
      l1.textContent = "\u4e0a\uff1a\u7f16\u8f91\u5668\u753b\u5e03\uff08\u9884\u89c8\uff09\u3000\u4e0b\uff1a\u5bfc\u51fa\u4f4d\u56fe\uff08\u540c\u4e00\u6761\u6e32\u67d3\u8def\u5f84\uff09\u3000" +
        "\u6bcf\u7ec4\u4ece\u5de6\u5230\u53f3\uff1atop / middle / bottom\uff0c\u5de6\u4e09\u4e2a\u5355\u680f\u3001\u53f3\u4e09\u4e2a\u5206\u680f";
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
