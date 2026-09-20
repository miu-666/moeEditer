    const results = [];
    const errors = [];
    window.addEventListener("error", (e) => errors.push(String(e.message)));

    function check(name, cond, detail) {
      results.push((cond ? "PASS" : "FAIL") + " | " + name + (detail !== undefined ? " | " + detail : ""));
    }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function run() {
      // ---------- C-2 内容结束虚线 ----------
      state.elements = [];
      renderAllElements();

      state.canvas.mode = "fixed";
      state.canvas.height = 900;
      applyCanvasSize();
      check("fixed 模式不画结束线", !document.getElementById("content-end-marker"));

      state.canvas.mode = "long";
      syncPageHeight();
      check("long 模式空页面不画结束线", !document.getElementById("content-end-marker"));

      const e1 = createElement("text", { x: 60, y: 200, width: 240, height: 70 });
      const e2 = createElement("textbox", { x: 90, y: 800, width: 420, height: 300 });
      const e3 = createElement("divider", { x: 40, y: 300, width: 200, height: 6 });
      syncPageHeight();

      let marker = document.getElementById("content-end-marker");
      const bottom1 = Math.round(computeContentBottom());
      check("long 模式出现结束线", !!marker);
      check("结束线贴在内容底部", marker && parseInt(marker.style.top, 10) === bottom1, marker && marker.style.top + " vs " + bottom1);
      check("页面高度 = 内容底部 + Bottom Gap", state.canvas.height === bottom1 + getPageBottomGap(), String(state.canvas.height));

      // 内容变矮但页面高度被 minHeight 兜住 -> 线仍要跟着内容
      updateElement(e2.id, { height: 100 });
      syncPageHeight();
      marker = document.getElementById("content-end-marker");
      check("页面高度不变时结束线仍跟随内容",
        marker && parseInt(marker.style.top, 10) === Math.round(computeContentBottom()),
        marker && marker.style.top + " vs " + Math.round(computeContentBottom()));

      // 切回 fixed 立刻消失
      state.canvas.mode = "fixed";
      applyCanvasSize();
      check("切回 fixed 结束线消失", !document.getElementById("content-end-marker"));
      state.canvas.mode = "long";
      syncPageHeight();

      // 清空 -> 消失
      state.elements = [];
      renderAllElements();
      syncPageHeight();
      check("清空元素后结束线消失", !document.getElementById("content-end-marker"));

      // ---------- C-3 整理成列表 ----------
      const t1 = createElement("text", { x: 300, y: 900, width: 200, height: 60 });
      const t2 = createElement("text", { x: 20, y: 120, width: 300, height: 80 });
      const t3 = createElement("textbox", { x: 500, y: 400, width: 100, height: 220 });
      syncPageHeight();

      const beforeTidy = state.elements.map(x => x.id + ":" + Math.round(x.x) + "," + Math.round(x.y)).sort().join("|");
      const tidyOk = tidyIntoList();
      // Same as the button: the pass is one undo step.
      saveState();
      pushHistory();

      const ordered = state.elements.slice().sort((a, b) => a.y - b.y);
      check("整理返回 true", tidyOk === true);
      check("整理：统一左对齐", state.elements.every(x => x.x === Math.min(TIDY_LEFT, state.canvas.width - x.width)),
        state.elements.map(x => x.x).join(","));
      check("整理：从顶部起排", ordered[0].y === TIDY_TOP, String(ordered[0].y));
      check("整理：按原 Y 顺序（t2 -> t3 -> t1）",
        ordered[0].id === t2.id && ordered[1].id === t3.id && ordered[2].id === t1.id,
        ordered.map(x => x.id).join(","));
      let gapOk = true, gapDetail = "";
      for (let i = 1; i < ordered.length; i++) {
        const expect = ordered[i - 1].y + ordered[i - 1].height + TIDY_GAP;
        if (ordered[i].y !== expect) { gapOk = false; gapDetail += ordered[i].y + "!=" + expect + " "; }
      }
      check("整理：间距恒定 " + TIDY_GAP + "px", gapOk, gapDetail);
      check("整理：DOM 与 state 同步", state.elements.every(x => {
        const node = document.querySelector('[data-element-id="' + x.id + '"]');
        return node && node.style.top === x.y + "px" && node.style.left === x.x + "px";
      }));
      const expectPage = Math.min(getPageMaxHeight(), Math.max(getPageMinHeight(), Math.round(computeContentBottom() + getPageBottomGap())));
      check("整理：页面高度重算", state.canvas.height === expectPage, state.canvas.height + " vs " + expectPage);
      check("整理：结束线跟着走", (function () {
        const m = document.getElementById("content-end-marker");
        return m && parseInt(m.style.top, 10) === Math.round(computeContentBottom());
      })());

      undo();
      const afterUndo = state.elements.map(x => x.id + ":" + Math.round(x.x) + "," + Math.round(x.y)).sort().join("|");
      check("整理：可撤销（一次回到原位置）", afterUndo === beforeTidy, afterUndo);

      // ---------- C-4 边缘自动滚动 ----------
      state.elements = [];
      renderAllElements();
      const d1 = createElement("text", { x: 60, y: 200, width: 200, height: 60 });
      const d2 = createElement("text", { x: 60, y: 5000, width: 200, height: 60 });
      syncPageHeight();

      const area = document.querySelector(".canvas-area");
      const rect = area.getBoundingClientRect();
      check("自动滚动：视口中部不触发", autoScrollStepFor(rect.top + rect.height / 2) === 0);
      check("自动滚动：底边附近向下", autoScrollStepFor(rect.bottom - 2) > 0, String(autoScrollStepFor(rect.bottom - 2)));
      check("自动滚动：顶边附近向上", autoScrollStepFor(rect.top + 2) < 0, String(autoScrollStepFor(rect.top + 2)));

      const node1 = document.querySelector('[data-element-id="' + d1.id + '"]');
      area.scrollTop = 0;
      node1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 120, clientY: 200, bubbles: true }));
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 120, clientY: rect.bottom - 4, bubbles: true }));
      check("自动滚动：拖到边缘启动滚动循环",
        autoScrollStep !== 0 && autoScrollFrame !== null,
        "step=" + autoScrollStep + " frame=" + autoScrollFrame);

      // Headless does not guarantee a steady stream of animation frames, so the
      // per-frame maths is driven by hand here. The loop itself is what the
      // check above covers.
      stopAutoScroll();
      autoScrollStep = autoScrollStepFor(rect.bottom - 4);
      const sPrev = area.scrollTop;
      const yPrev = getElementById(d1.id).y;
      for (let i = 0; i < 5; i++) {
        if (autoScrollFrame) { cancelAnimationFrame(autoScrollFrame); autoScrollFrame = null; }
        runAutoScroll();
      }
      const dScroll = area.scrollTop - sPrev;
      const dY = getElementById(d1.id).y - yPrev;
      check("自动滚动：逐帧推进滚动条", dScroll > 0, "dscroll=" + dScroll);
      check("自动滚动：元素跟着指针走（起点补偿生效）",
        Math.abs(dY - dScroll) < 4, "dy=" + dY + " dscroll=" + dScroll);

      updateAutoScroll(rect.top + rect.height / 2);
      check("自动滚动：指针离开边缘带后停止",
        autoScrollStep === 0 && autoScrollFrame === null);

      document.dispatchEvent(new PointerEvent("pointerup", { clientX: 120, clientY: rect.bottom - 4, bubbles: true }));
      const atUp = area.scrollTop;
      await sleep(300);
      check("自动滚动：松手后停止", area.scrollTop === atUp, atUp + " -> " + area.scrollTop);
      check("自动滚动：drag 状态已清理", state.drag.active === false);

      // ---------- 回归：拖动 / 缩放 / 导出仍正常 ----------
      const r1 = getElementById(d1.id);
      check("回归：拖动后位置被夹在页面内", r1.y >= 0 && r1.y + r1.height <= state.canvas.height, String(r1.y));
      check("回归：无 JS 运行时错误", errors.length === 0, errors.join(" ~ "));

      // 环境参考：headless 几乎不出合成帧（实测 0~1 帧 / 600ms），所以上面自动
      // 滚动的逐帧数学是手动驱动的；真实浏览器由 rAF 连续出帧，循环会一直转到
      // 松手或指针离开边缘带。
      let rafFrames = 0;
      const rafTick = () => { rafFrames++; if (rafFrames < 100) requestAnimationFrame(rafTick); };
      requestAnimationFrame(rafTick);
      await sleep(600);
      results.push("INFO | 环境参考：headless 600ms 内 rAF 帧数 = " + rafFrames + "（headless 不出合成帧，不代表真实浏览器）");

      const out = document.createElement("pre");
      out.id = "probe-out";
      out.textContent = "PROBE_RESULT_START\n" + results.join("\n") + "\nPROBE_RESULT_END";
      document.body.appendChild(out);
    }

    // 截图用场景：#shot-before 散乱， #shot-after 整理后
    function layoutShot(mode) {
      state.elements = [];
      state.canvas.mode = "long";
      state.canvas.width = 600;
      state.canvas.bottomGap = 80;
      renderAllElements();

      const a = createElement("textbox", { x: 60, y: 90, width: 420, height: 200 });
      a.content = { columns: [{ title: "关于我", body: "做一点小东西，写一点小字。" }, { title: "", body: "" }] };
      const b = createElement("text", { x: 330, y: 350, width: 200, height: 56 });
      b.content = "第二个区块";
      const c = createElement("divider", { x: 420, y: 470, width: 140, height: 6 });
      const d = createElement("label", { x: 100, y: 560, width: 160, height: 34 });
      d.content = "一个标签";

      renderAllElements();
      if (mode === "#shot-after") tidyIntoList();
      setSelectedElementId(null);
      renderPropertiesPanel();
      syncPageHeight();
      const area = document.querySelector(".canvas-area");
      if (area) area.scrollTop = 0;
    }

    window.addEventListener("load", () => {
      if (location.hash.indexOf("#shot") === 0) {
        layoutShot(location.hash);
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
