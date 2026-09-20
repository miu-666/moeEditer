    const results = [];
    const errors = [];
    window.addEventListener("error", (e) => errors.push(String(e.message)));

    function check(name, cond, detail) {
      results.push((cond ? "PASS" : "FAIL") + " | " + name + (detail !== undefined ? " | " + detail : ""));
    }
    function info(name, detail) { results.push("INFO | " + name + " | " + detail); }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // --- Export helpers -----------------------------------------------------

    // Drives the real export path (renderElementToExportCanvas) into an offscreen
    // bitmap, exactly like exportPNG does, but without the download.
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

    // Same page, one element: lets each scenario be measured in isolation.
    async function renderOnly(el) {
      const keep = state.elements;
      state.elements = [el];
      const r = await renderExportCanvas();
      state.elements = keep;
      return r;
    }

    // Ink = anything that is not the page background.
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
      return {
        count,
        cx: count ? x0 + sx / count : 0,
        cy: count ? y0 + sy / count : 0,
        rows, cols, x0, y0
      };
    }

    function inkRowRange(stats) {
      let first = -1, last = -1;
      stats.rows.forEach((n, i) => { if (n > 0) { if (first < 0) first = i; last = i; } });
      return { first: first < 0 ? -1 : stats.y0 + first, last: last < 0 ? -1 : stats.y0 + last };
    }
    function inkColRange(stats) {
      let first = -1, last = -1;
      stats.cols.forEach((n, i) => { if (n > 0) { if (first < 0) first = i; last = i; } });
      return { first: first < 0 ? -1 : stats.x0 + first, last: last < 0 ? -1 : stats.x0 + last };
    }
    function inkSpan(stats) {
      const c = inkColRange(stats);
      return c.first < 0 ? 0 : c.last - c.first + 1;
    }

    // An independent reference render: same font settings, drawn straight onto a
    // scratch canvas. Used as the yardstick for "did the export actually apply
    // uppercase / tracking", so the assertion never calls the code under test.
    function ref(ctxBox, text, o) {
      const cv = document.createElement("canvas");
      cv.width = ctxBox.width;
      cv.height = ctxBox.height;
      const c = cv.getContext("2d");
      c.fillStyle = "#FFFFFF";
      c.fillRect(0, 0, cv.width, cv.height);
      c.font = `${o.fontWeight} ${o.fontSize}px sans-serif`;
      c.letterSpacing = (o.letterSpacing || 0) + "px";
      c.fillStyle = "#333333";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, cv.width / 2, cv.height / 2);
      const stats = inkIn(c, { x: 0, y: 0, width: cv.width, height: cv.height });
      stats.letterSpacingSupported = (function () {
        const probe = document.createElement("canvas").getContext("2d");
        probe.letterSpacing = "4px";
        return probe.letterSpacing === "4px";
      })();
      return stats;
    }

    // --- Scenario -----------------------------------------------------------

    function buildScene() {
      state.elements = [];
      state.canvas.mode = "fixed";
      state.canvas.width = 600;
      state.canvas.height = 420;
      state.canvas.background = "#FFFFFF";

      const sticker = createElement("sticker", { x: 60, y: 40, width: 80, height: 80 });
      sticker.content = "\u2726";
      sticker.style.fontSize = 64;
      sticker.style.color = "#E4572E";

      const divider = createElement("divider", { x: 60, y: 170, width: 480, height: 24 });
      divider.style.lineWidth = 6;
      divider.style.color = "#2E86AB";

      const faded = createElement("divider", { x: 60, y: 230, width: 480, height: 24 });
      faded.style.lineWidth = 6;
      faded.style.color = "#2E86AB";
      faded.style.opacity = 0.5;

      const label = createElement("label", { x: 60, y: 300, width: 200, height: 40 });
      label.content = "hello world";

      const text = createElement("text", { x: 320, y: 300, width: 220, height: 40 });
      text.content = "\u5bf9\u7167\u6587\u672c";

      renderAllElements();
      return { sticker, divider, faded, label, text };
    }

    // A label with "oooo": lowercase x-height vs uppercase cap height makes the
    // ink counts far apart, which is what makes the case assertion meaningful.
    // The border is switched off on purpose — the default 2px ring covers the
    // whole 400×100 box, so counting ink with it on measures the frame instead
    // of the glyphs (it dwarfed the text by ~15:1 and made every text assertion
    // meaningless).
    function makeLabel(opts) {
      const el = createElement("label", { x: 60, y: 100, width: 400, height: 100 });
      el.content = "oooo";
      el.style.fontSize = opts.fontSize;
      el.style.letterSpacing = opts.letterSpacing;
      el.style.textTransform = opts.textTransform;
      el.style.borderWidth = 0;
      return el;
    }

    async function run() {
      const BOX = { x: 60, y: 100, width: 400, height: 100 };

      // ---------- D-1a: sticker ----------
      const els = buildScene();
      const { ctx } = await renderExportCanvas();

      const stickerBox = { x: els.sticker.x, y: els.sticker.y, width: els.sticker.width, height: els.sticker.height };
      const st = inkIn(ctx, stickerBox);
      check("sticker：导出里有墨（不再消失）", st.count > 50, "ink=" + st.count + "px");
      const stOffsetX = st.cx - (els.sticker.x + els.sticker.width / 2);
      const stOffsetY = st.cy - (els.sticker.y + els.sticker.height / 2);
      info("sticker 墨迹中心偏移（导出 vs 元素中心）", "dx=" + stOffsetX.toFixed(1) + "px dy=" + stOffsetY.toFixed(1) + "px");
      check("sticker：水平居中", Math.abs(stOffsetX) <= 4, "dx=" + stOffsetX.toFixed(1));
      check("sticker：垂直偏差在 6px 内", Math.abs(stOffsetY) <= 6, "dy=" + stOffsetY.toFixed(1));
      check("sticker：墨迹不越出元素框", (function () {
        const outside = inkIn(ctx, { x: 0, y: 0, width: 600, height: 160 });
        return outside.count === st.count;
      })());

      // ---------- D-1b: divider ----------
      const dv = inkIn(ctx, { x: els.divider.x, y: els.divider.y, width: els.divider.width, height: els.divider.height });
      const rows = inkRowRange(dv);
      const cols = inkColRange(dv);
      check("divider：导出里有墨（不再消失）", dv.count > 2000, "ink=" + dv.count + "px");
      check("divider：线高 = lineWidth",
        rows.first >= 0 && rows.last - rows.first + 1 === els.divider.style.lineWidth,
        "rows " + rows.first + ".." + rows.last);
      const expectTop = els.divider.y + (els.divider.height - els.divider.style.lineWidth) / 2;
      check("divider：垂直居中（与 .divider-line 的 flex 居中一致）",
        rows.first === expectTop, "top=" + rows.first + " expect=" + expectTop);
      check("divider：横向铺满元素宽度",
        cols.first === els.divider.x && cols.last === els.divider.x + els.divider.width - 1,
        "cols " + cols.first + ".." + cols.last + " expect " + els.divider.x + ".." + (els.divider.x + els.divider.width - 1));
      check("divider：颜色跟随 style.color", (function () {
        const d = ctx.getImageData(300, Math.round(expectTop) + 3, 1, 1).data;
        return d[2] > 120 && d[0] < 120;
      })());
      check("divider：元素框外没有溢出", (function () {
        const above = inkIn(ctx, { x: els.divider.x, y: els.divider.y - 30, width: els.divider.width, height: 30 });
        const below = inkIn(ctx, { x: els.divider.x, y: els.divider.y + els.divider.height, width: els.divider.width, height: 20 });
        return above.count === 0 && below.count === 0;
      })());

      // ---------- D-1c: opacity 仍然是单次应用 ----------
      check("divider：opacity 只吃一次（globalAlpha 与预览一致）", (function () {
        const solid = ctx.getImageData(300, Math.round(expectTop) + 3, 1, 1).data;
        const fade = ctx.getImageData(300, 230 + 9 + 3, 1, 1).data;
        const expect = [Math.round((46 + 255) / 2), Math.round((134 + 255) / 2), Math.round((171 + 255) / 2)];
        const ok = Math.abs(fade[0] - expect[0]) <= 2 && Math.abs(fade[1] - expect[1]) <= 2 && Math.abs(fade[2] - expect[2]) <= 2;
        return ok && fade[2] > solid[2];
      })());

      // ---------- D-2a: text-transform ----------
      // The editor's label carries `text-transform: uppercase` from CSS. The old
      // export drew el.content verbatim, so "oooo" came out as lowercase.
      // Case and tracking are varied one at a time — comparing an uppercase
      // 1px label against a lowercase 0px one mixes two variables and reads as
      // a false failure.
      const lDefault = makeLabel({ fontSize: 20, letterSpacing: 1, textTransform: "uppercase" });
      const lZero = makeLabel({ fontSize: 20, letterSpacing: 0, textTransform: "uppercase" });
      const lWide = makeLabel({ fontSize: 20, letterSpacing: 6, textTransform: "uppercase" });
      const lPrevious = makeLabel({ fontSize: 20, letterSpacing: 1, textTransform: "none" });

      const dExport = inkIn((await renderOnly(lDefault)).ctx, BOX);
      const zeroExport = inkIn((await renderOnly(lZero)).ctx, BOX);
      const wideExport = inkIn((await renderOnly(lWide)).ctx, BOX);
      const prevExport = inkIn((await renderOnly(lPrevious)).ctx, BOX);

      const refUp = ref(BOX, "OOOO", { fontWeight: "600", fontSize: 20, letterSpacing: 1 });
      const refUpZero = ref(BOX, "OOOO", { fontWeight: "600", fontSize: 20, letterSpacing: 0 });
      const refLow = ref(BOX, "oooo", { fontWeight: "600", fontSize: 20, letterSpacing: 1 });

      info("canvas letterSpacing 支持", String(refUp.letterSpacingSupported));
      info("墨迹量（同字号 20，无边框）", "导出=" + dExport.count + "（大写参考=" + refUp.count +
        "）　旧行为对照=" + prevExport.count + "（小写参考=" + refLow.count + "）");

      check("label：导出为大写（墨迹量与独立绘制的大写参考一致）",
        Math.abs(dExport.count - refUp.count) <= 2,
        "导出=" + dExport.count + " 大写参考=" + refUp.count);
      check("label：对照——不做大写处理则墨迹明显更少（断言有区分度）",
        prevExport.count < dExport.count * 0.85 && Math.abs(prevExport.count - refLow.count) <= 2,
        "旧行为=" + prevExport.count + " 新行为=" + dExport.count);
      check("label：字高 = 大写高度（cap height）而非 x-height", (function () {
        const hExport = inkRowRange(dExport);
        const hUp = inkRowRange(refUp);
        const hLow = inkRowRange(refLow);
        const spanExport = hExport.last - hExport.first + 1;
        return Math.abs(spanExport - (hUp.last - hUp.first + 1)) <= 1 && spanExport > (hLow.last - hLow.first + 1);
      })(), (function () {
        const hExport = inkRowRange(dExport);
        const hUp = inkRowRange(refUp);
        const hLow = inkRowRange(refLow);
        return "导出=" + (hExport.last - hExport.first + 1) + " 大写=" + (hUp.last - hUp.first + 1) +
          " 小写=" + (hLow.last - hLow.first + 1);
      })());

      // ---------- D-2b: letter-spacing ----------
      const spanDefault = inkSpan(dExport);
      const spanZero = inkSpan(zeroExport);
      const spanWide = inkSpan(wideExport);
      info("墨迹宽度（同为大写，同字号 20）", "字距0=" + spanZero + " 字距1=" + spanDefault + " 字距6=" + spanWide +
        "　参考：字距0=" + inkSpan(refUpZero) + " 字距1=" + inkSpan(refUp));
      check("label：默认 1px 字距画出来了（3 个字间距）",
        Math.abs((spanDefault - spanZero) - 3) <= 2, "Δ=" + (spanDefault - spanZero) + " expect 3");
      check("label：字距 6px 时宽度按 5px × 3 个间距增长",
        Math.abs((spanWide - spanDefault) - 15) <= 2, "Δ=" + (spanWide - spanDefault) + " expect 15");
      check("label：字距后的墨迹宽度与独立参考一致",
        Math.abs(spanDefault - inkSpan(refUp)) <= 1 && Math.abs(spanZero - inkSpan(refUpZero)) <= 1,
        "导出 " + spanZero + "/" + spanDefault + " vs 参考 " + inkSpan(refUpZero) + "/" + inkSpan(refUp));

      // CSS adds letter-spacing after *every* character including the last, and
      // text-align: center centres the line box — so both preview and export sit
      // half a tracking to the left of the element centre. Measured, not assumed.
      const dxDefault = dExport.cx - (BOX.x + BOX.width / 2);
      const dxWide = wideExport.cx - (BOX.x + BOX.width / 2);
      info("尾随字距引起的居中偏移", "字距1: dx=" + dxDefault.toFixed(1) + "px　字距6: dx=" + dxWide.toFixed(1) + "px（预览同此行为）");
      check("label：默认字距下几乎不偏", Math.abs(dxDefault) <= 2, "dx=" + dxDefault.toFixed(1));
      check("label：字距 6px 时按 −(字距)/2 偏心",
        Math.abs(dxWide - (-3)) <= 1.5, "dx=" + dxWide.toFixed(1));

      // ---------- D-2c: 纯函数 applyTextTransform ----------
      const tf = [
        ["hello world", "uppercase", "HELLO WORLD"],
        ["HELLO WORLD", "lowercase", "hello world"],
        ["hello world", "capitalize", "Hello World"],
        ["HeLLo", "none", "HeLLo"],
        ["", "uppercase", ""],
        [null, "uppercase", ""]
      ];
      tf.forEach(([input, mode, want]) => {
        const got = applyTextTransform(input, mode);
        check("applyTextTransform(" + JSON.stringify(input) + ", " + mode + ")", got === want, JSON.stringify(got));
      });

      // ---------- 回归 ----------
      check("回归：label 边框仍在导出", (function () {
        // borderWidth 2, inset by half -> the ring spans x = 60..62.
        const d = ctx.getImageData(Math.round(els.label.x + 1), Math.round(els.label.y + els.label.height / 2), 1, 1).data;
        return d[0] < 120 && d[1] < 120 && d[2] < 120;
      })(), "");
      check("回归：text 仍在导出", inkIn(ctx, { x: els.text.x, y: els.text.y, width: els.text.width, height: els.text.height }).count > 30);
      check("回归：之前会消失的类型现在都在", st.count > 0 && dv.count > 0);
      check("回归：无 JS 运行时错误", errors.length === 0, errors.join(" ~ "));

      const out = document.createElement("pre");
      out.id = "probe-out";
      out.textContent = "PROBE_RESULT_START\n" + results.join("\n") + "\nPROBE_RESULT_END";
      document.body.appendChild(out);
    }

    // Visual scene: the editor canvas on top, the export bitmap underneath.
    async function shot() {
      // The app shell is 100vh, which would push the export bitmap off-screen.
      // For the screenshot only, let it size to its content and drop the panels.
      document.querySelector(".app").style.height = "auto";
      const main = document.querySelector(".main");
      if (main) main.style.height = "auto";
      document.querySelectorAll(".sidebar").forEach(n => { n.style.display = "none"; });
      const area = document.querySelector(".canvas-area");
      if (area) { area.style.overflow = "visible"; area.style.height = "auto"; }

      buildScene();
      setSelectedElementId(null);
      renderPropertiesPanel();
      const wrap = document.getElementById("shot-wrap");
      const { canvas } = await renderExportCanvas();

      const l1 = document.createElement("div");
      l1.className = "shot-label";
      l1.textContent = "\u4e0a\uff1a\u7f16\u8f91\u5668\u753b\u5e03\uff08\u9884\u89c8\uff09\u3000\u4e0b\uff1a\u5bfc\u51fa\u4f4d\u56fe\uff08exportPNG \u8d70\u7684\u540c\u4e00\u6761\u6e32\u67d3\u8def\u5f84\uff09";
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
