(function () {
  const results = [];
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.message)));

  function check(name, cond, detail) {
    results.push((cond ? "PASS" : "FAIL") + " | " + name + (detail !== undefined ? " | " + detail : ""));
  }
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const nodeOf = (id) => document.querySelector('[data-element-id="' + id + '"]');
  const handleOf = (id, dir) => document.querySelector('[data-element-id="' + id + '"] .resize-handle.' + dir);

  // Headless does not guarantee a steady stream of animation frames, so the
  // per-frame maths is driven by hand. Everything about the loop *starting* and
  // *stopping* is asserted separately on the real code path.
  function driveFrames(n) {
    for (let i = 0; i < n; i++) {
      if (autoScrollFrame) { cancelAnimationFrame(autoScrollFrame); autoScrollFrame = null; }
      runAutoScroll();
    }
  }

  function down(node, x, y) {
    node.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
  }
  function move(x, y) {
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
  }
  function up(x, y) {
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true }));
  }

  async function run() {
    state.elements = [];
    renderAllElements();
    state.canvas.mode = "long";

    const r1 = createElement("text", { x: 60, y: 200, width: 200, height: 60 });
    const spacer = createElement("text", { x: 60, y: 5000, width: 200, height: 60 });
    syncPageHeight();
    setSelectedElementId(r1.id);
    renderPropertiesPanel();

    const area = document.querySelector(".canvas-area");
    area.scrollTop = 0;
    const rect = area.getBoundingClientRect();

    // 前提断言：视口真的能滚。不能滚的话下面每条"滚动条推进了"都恒为真。
    check("前提：画布区域确实能滚", area.scrollHeight > area.clientHeight + 100,
      area.scrollHeight + " vs " + area.clientHeight);

    const se = handleOf(r1.id, "se");
    check("前提：右下角手柄已渲染", !!se);
    if (!se) return finish();

    // ---------- D-7 主角：south 手柄 + 视口底边 ----------
    const x0 = r1.x;
    const spacerY0 = getElementById(spacer.id).y;
    const box = se.getBoundingClientRect();
    down(se, box.left + box.width / 2, box.top + box.height / 2);
    check("前提：已进入 resize（se）", state.resize.active === true && state.resize.handle === "se",
      "active=" + state.resize.active + " handle=" + state.resize.handle);

    const edgeY = rect.bottom - 4;
    move(200, edgeY);
    check("缩放：拖到边缘启动滚动循环",
      autoScrollStep !== 0 && autoScrollFrame !== null,
      "step=" + autoScrollStep + " frame=" + autoScrollFrame);

    const sBefore = area.scrollTop;
    const hBefore = getElementById(r1.id).height;
    const gripBefore = handleOf(r1.id, "se").getBoundingClientRect().bottom;
    driveFrames(5);
    const dScroll = area.scrollTop - sBefore;
    const dHeight = getElementById(r1.id).height - hBefore;
    const gripAfter = handleOf(r1.id, "se").getBoundingClientRect().bottom;

    check("缩放：逐帧推进滚动条", dScroll > 0, "dscroll=" + dScroll);
    check("缩放：高度跟着指针长（起点补偿生效）",
      Math.abs(dHeight - dScroll) < 4, "dh=" + dHeight + " dscroll=" + dScroll);
    // 这条是 D-7 的核心：内容从指针底下滑走，手柄必须留在原地。
    check("缩放：手柄粘住指针（屏幕位置不变）",
      Math.abs(gripAfter - gripBefore) < 2,
      gripBefore.toFixed(1) + " -> " + gripAfter.toFixed(1));
    check("缩放：横向不受影响", getElementById(r1.id).x === x0, String(getElementById(r1.id).x));
    check("缩放：其他元素不被连带移动", getElementById(spacer.id).y === spacerY0);

    updateAutoScroll(rect.top + rect.height / 2);
    check("缩放：指针离开边缘带后停止", autoScrollStep === 0 && autoScrollFrame === null);

    up(200, edgeY);
    await sleep(50);
    check("缩放：松手后状态清理",
      state.resize.active === false && state.resize.elementId === null && state.resize.handle === null,
      "active=" + state.resize.active);

    // ---------- north 手柄 + 视口顶边（符号相反，单独验一遍） ----------
    state.elements = [];
    renderAllElements();
    // y=1000 是为了让它滚到 scrollTop=800 时仍停在视口里
    const n1 = createElement("text", { x: 60, y: 1000, width: 200, height: 60 });
    const far = createElement("text", { x: 60, y: 5000, width: 200, height: 60 });
    syncPageHeight();
    setSelectedElementId(n1.id);
    renderPropertiesPanel();
    area.scrollTop = 800;

    const nw = handleOf(n1.id, "nw");
    check("前提：左上角手柄已渲染", !!nw);
    if (nw) {
      const nb = nw.getBoundingClientRect();
      check("前提：元素仍在视口内", nb.top > rect.top && nb.top < rect.bottom, nb.top.toFixed(1));
      down(nw, nb.left + nb.width / 2, nb.top + nb.height / 2);
      const topEdgeY = rect.top + 4;
      move(200, topEdgeY);
      check("缩放：拖到顶边启动滚动循环（向上）",
        autoScrollStep < 0 && autoScrollFrame !== null, "step=" + autoScrollStep);

      const sB = area.scrollTop;
      const yB = getElementById(n1.id).y;
      const gripB = handleOf(n1.id, "nw").getBoundingClientRect().top;
      driveFrames(5);
      const dS = area.scrollTop - sB;
      const dY = getElementById(n1.id).y - yB;
      const gripN = handleOf(n1.id, "nw").getBoundingClientRect().top;

      check("缩放：向上滚动", dS < 0, "dscroll=" + dS);
      check("缩放：向上时元素跟着指针走（y 同步减小）",
        Math.abs(dY - dS) < 4, "dy=" + dY + " dscroll=" + dS);
      check("缩放：顶边手柄粘住指针",
        Math.abs(gripN - gripB) < 2, gripB.toFixed(1) + " -> " + gripN.toFixed(1));

      up(200, topEdgeY);
      await sleep(50);
      check("缩放：松手后停止", state.resize.active === false);
    }
    check("回归：far 元素没被动过", getElementById(far.id).y === 5000);

    // ---------- 回归：拖动侧的自动滚动（重构后必须一模一样） ----------
    state.elements = [];
    renderAllElements();
    const d1 = createElement("text", { x: 60, y: 200, width: 200, height: 60 });
    createElement("text", { x: 60, y: 5000, width: 200, height: 60 });
    syncPageHeight();
    area.scrollTop = 0;
    const r0 = area.getBoundingClientRect();

    check("回归：视口中部不触发", autoScrollStepFor(r0.top + r0.height / 2) === 0);
    check("回归：底边附近向下", autoScrollStepFor(r0.bottom - 2) > 0, String(autoScrollStepFor(r0.bottom - 2)));
    check("回归：顶边附近向上", autoScrollStepFor(r0.top + 2) < 0, String(autoScrollStepFor(r0.top + 2)));

    down(nodeOf(d1.id), 120, 200);
    move(120, r0.bottom - 4);
    check("回归：拖到边缘启动滚动循环", autoScrollStep !== 0 && autoScrollFrame !== null);

    const ds0 = area.scrollTop;
    const dy0 = getElementById(d1.id).y;
    driveFrames(5);
    const dsD = area.scrollTop - ds0;
    const dyD = getElementById(d1.id).y - dy0;
    check("回归：逐帧推进滚动条", dsD > 0, "dscroll=" + dsD);
    check("回归：元素跟着指针走", Math.abs(dyD - dsD) < 4, "dy=" + dyD + " dscroll=" + dsD);

    up(120, r0.bottom - 4);
    await sleep(50);
    check("回归：松手后停止并清理", state.drag.active === false && autoScrollStep === 0 && autoScrollFrame === null);
    check("回归：元素位置被夹在页面内",
      getElementById(d1.id).y >= 0 && getElementById(d1.id).y + getElementById(d1.id).height <= state.canvas.height,
      String(getElementById(d1.id).y));

    check("全局：无 JS 运行时错误", errors.length === 0, errors.join(" ~ "));

    let rafFrames = 0;
    const rafTick = () => { rafFrames++; if (rafFrames < 100) requestAnimationFrame(rafTick); };
    requestAnimationFrame(rafTick);
    await sleep(600);
    results.push("INFO | 环境参考：headless 600ms 内 rAF 帧数 = " + rafFrames + "（headless 不出合成帧，不代表真实浏览器）");

    finish();
  }

  function finish() {
    const out = document.createElement("pre");
    out.id = "probe-out";
    out.style.cssText = "position:absolute;left:-9999px;top:0;";
    out.textContent = "PROBE_RESULT_START\n" + results.join("\n") + "\nPROBE_RESULT_END";
    document.body.appendChild(out);
  }

  window.addEventListener("load", () => {
    run().catch(err => {
      results.push("FAIL | 探针自身异常 | " + (err && err.message));
      finish();
    });
  });
})();
