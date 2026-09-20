// 窄屏适配探针的断言部分。它不是直接打开的页面 —— 由 src/index.html 生成：
// 把本文件注入 index.html 副本的 body 末尾，写成 .workbuddy/probe-phase-mobile.html，
// 同时把相对路径的 css/js 改成绝对 file:// 路径。生成命令见 ARCHITECTURE.md §34。
//
// 跑（真机尺寸，--window-size 给不到 390）：
//   node tools/probe-device.js .workbuddy/probe-phase-mobile.html 390 844 截图.png
//
// 断言分两种视口：窄屏（≤820）走抽屉分支，桌面走"不回归"分支。
//
// 注意：本文件会被整段内联进 script 标签，所以**任何位置都不能出现结束标签的
// 字面量**（注释里也不行）—— 它会提前闭合标签，探针代码被截断，症状是"没抓到
// 结果节点"。生成命令里那句 `if (/<\/script/i.test(inject))` 就是防这个的。

(function () {
  var out = [];

  function ok(name, cond, detail) {
    out.push((cond ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
  }
  function info(name, detail) {
    out.push("INFO " + name + "  " + detail);
  }

  function matrixOf(node) {
    var t = getComputedStyle(node).transform;
    if (!t || t === "none") return [0, 0];
    var m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return [0, 0];
    var parts = m[1].split(",");
    return [parseFloat(parts[4]) || 0, parseFloat(parts[5]) || 0];
  }

  function pointer(type, target, x, y) {
    target.dispatchEvent(new PointerEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true
    }));
  }

  function run() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var narrow = vw <= 820;

    var canvas = document.getElementById("canvas");
    var area = document.querySelector(".canvas-area");
    var sidebarLeft = document.querySelector(".sidebar-left");
    var sidebarRight = document.querySelector(".sidebar-right");
    var fabs = document.getElementById("mobile-fabs");

    var scale = parseFloat(getComputedStyle(canvas).getPropertyValue("--canvas-scale")) || 1;
    var rect = canvas.getBoundingClientRect();
    var areaRect = area.getBoundingClientRect();

    info("viewport", vw + "x" + vh + (narrow ? "  narrow" : "  desktop"));
    info("scale", scale.toFixed(4) + "  canvas " + state.canvas.width + "x" + state.canvas.height);
    info("canvas visual", rect.width.toFixed(1) + "x" + rect.height.toFixed(1));

    // ---- 1. 画布缩放本身 ----
    // 只断言"性质"，不照抄实现的公式 —— 抄一遍就等于没测。
    var csArea = getComputedStyle(area);
    var padH = (parseFloat(csArea.paddingLeft) || 0) + (parseFloat(csArea.paddingRight) || 0);
    var scrollbar = area.offsetWidth - area.clientWidth;
    var avail = area.clientWidth - padH;

    if (avail >= state.canvas.width) {
      ok("可用宽度装得下时保持原样（768 宽平板属于这种）",
        scale === 1, "可用 " + avail);
    } else {
      // 当前没显示滚动条时也要知道将来它会占多少
      var probeDiv = document.createElement("div");
      probeDiv.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;";
      document.body.appendChild(probeDiv);
      var sbWidth = probeDiv.offsetWidth - probeDiv.clientWidth;
      probeDiv.remove();

      var slack = Math.max(scrollbar, sbWidth);

      ok("装不下时缩到刚好塞进可用宽（至多留一条滚动条的余量）",
        scale < 1 && rect.width <= avail + 0.5 && rect.width >= avail - slack - 1,
        "画布宽 " + rect.width.toFixed(1) + "，可用 " + avail + "，滚动条 " + scrollbar + "/" + sbWidth);

      if (sbWidth > 0 && scrollbar === 0) {
        ok("还没出现滚动条时也预留了一条的宽度（免得缩放和滚动条互相追）",
          rect.width <= avail - sbWidth + 0.5,
          "画布宽 " + rect.width.toFixed(1) + "，应 <= " + (avail - sbWidth));
      } else if (sbWidth === 0) {
        info("滚动条", "overlay（宽 0），不需要预留");
      }
    }

    ok("画布视觉宽度 == 画布宽 × scale",
      Math.abs(rect.width - state.canvas.width * scale) < 1.5,
      rect.width.toFixed(2) + " vs " + (state.canvas.width * scale).toFixed(2));

    ok("画布视觉高度 == 画布高 × scale（滚动区也跟着缩）",
      Math.abs(rect.height - state.canvas.height * scale) < 1.5,
      rect.height.toFixed(2) + " vs " + (state.canvas.height * scale).toFixed(2));

    ok("画布横向不超出可用宽度",
      rect.width <= area.clientWidth + 0.5,
      rect.width.toFixed(1) + " <= " + area.clientWidth);

    var wrapper = canvas.parentElement;
    ok("滚动容器尺寸 == 画布视觉尺寸",
      Math.abs(parseFloat(wrapper.style.width) - rect.width) < 1.5 &&
      Math.abs(parseFloat(wrapper.style.height) - rect.height) < 1.5,
      wrapper.style.width + " x " + wrapper.style.height);

    // 居中要按内容区算：clientWidth 不含滚动条槽位，边框盒含。
    var contentLeft = areaRect.left + (parseFloat(csArea.paddingLeft) || 0);
    var contentRight = areaRect.left + area.clientWidth - (parseFloat(csArea.paddingRight) || 0);
    var gapLeft = rect.left - contentLeft;
    var gapRight = contentRight - rect.right;

    info("gap", "left=" + gapLeft.toFixed(1) + " right=" + gapRight.toFixed(1) +
      "  scrollbar/gutter=" + (area.offsetWidth - area.clientWidth));

    ok("画布水平居中（按内容区算，滚动条槽位不算）",
      Math.abs(gapLeft - gapRight) < 2,
      gapLeft.toFixed(1) + " / " + gapRight.toFixed(1));

    // ---- 2. 窄屏：抽屉 / 悬浮按钮 ----
    if (narrow) {
      var lr = sidebarLeft.getBoundingClientRect();
      var rr = sidebarRight.getBoundingClientRect();

      info("left drawer", "left=" + lr.left.toFixed(1) + " right=" + lr.right.toFixed(1) +
        " w=" + lr.width.toFixed(1) + " h=" + lr.height.toFixed(1));
      info("right drawer", "top=" + rr.top.toFixed(1) + " w=" + rr.width.toFixed(1) +
        " h=" + rr.height.toFixed(1) +
        " transform=" + getComputedStyle(sidebarRight).transform +
        " bottom=" + getComputedStyle(sidebarRight).bottom +
        " class=[" + document.body.className + "]");

      // components.css 在 editor.css 之后加载，同名的规则会赢 —— 这条断言就是
      // 为了盯住那次踩过的坑（两列组件被 flex-direction: column 覆盖掉）。
      var compList = document.querySelector(".component-list");
      var compStyle = getComputedStyle(compList);
      ok("组件列表在窄屏排成两列",
        compStyle.display === "grid" &&
        compStyle.gridTemplateColumns.split(" ").filter(function (v) { return v; }).length === 2,
        compStyle.display + " / " + compStyle.gridTemplateColumns);

      ok("画布区横向铺满", areaRect.width >= vw - 1, areaRect.width.toFixed(1) + " of " + vw);
      ok("左抽屉默认收在屏幕左侧外", lr.right <= 1, "right=" + lr.right.toFixed(1));
      ok("属性抽屉默认收在屏幕下方外", rr.top >= vh - 1, "top=" + rr.top.toFixed(1));
      ok("悬浮按钮在窄屏可见", getComputedStyle(fabs).display !== "none");
      ok("两个抽屉都注入了关闭按钮",
        document.querySelectorAll(".drawer-close").length === 2,
        document.querySelectorAll(".drawer-close").length + " 个");

      var noMotion = document.createElement("style");
      // 断言要的是「抽屉该在哪儿」这个目标状态，不是动画走到哪一帧，所以先把
      // 过渡关掉。这条样式**故意不删**：删掉会让浏览器补播一次关闭动画，
      // 接着拍的截图就会撞在动画中间，看起来像抽屉没关干净。
      noMotion.textContent = "*{transition:none !important;animation:none !important;}";
      document.head.appendChild(noMotion);

      document.getElementById("fab-components").click();
      ok("点悬浮按钮打开左抽屉", document.body.classList.contains("drawer-left"));
      ok("左抽屉滑到 left=0", Math.abs(matrixOf(sidebarLeft)[0]) < 0.5,
        "tx=" + matrixOf(sidebarLeft)[0].toFixed(2));

      document.getElementById("drawer-scrim").click();
      ok("点遮罩关掉抽屉",
        !document.body.classList.contains("drawer-left") && !document.body.classList.contains("drawer-right"));

      document.getElementById("fab-properties").click();
      ok("点悬浮按钮打开属性抽屉", document.body.classList.contains("drawer-right"));
      ok("属性抽屉上滑到位", Math.abs(matrixOf(sidebarRight)[1]) < 0.5,
        "ty=" + matrixOf(sidebarRight)[1].toFixed(2));

      var closeBtn = sidebarRight.querySelector(".drawer-close");      if (closeBtn) closeBtn.click();
      ok("关闭按钮能收起抽屉", !document.body.classList.contains("drawer-right"));

      var countBefore = state.elements.length;
      var stickerBtn = document.querySelector('.component-btn[data-type="sticker"]');
      if (stickerBtn) stickerBtn.click();
      ok("在抽屉里新增元素后自动收起，看得到画布",
        state.elements.length === countBefore + 1 && !document.body.classList.contains("drawer-left"),
        "elements " + countBefore + " -> " + state.elements.length);
    } else {
      ok("桌面：侧栏仍是常驻列（没变成 fixed 抽屉）",
        getComputedStyle(sidebarLeft).position === "static",
        "position=" + getComputedStyle(sidebarLeft).position);
      ok("桌面：悬浮按钮不出现", getComputedStyle(fabs).display === "none");
      ok("桌面：侧栏没有被推走", Math.abs(matrixOf(sidebarLeft)[0]) < 0.5,
        "tx=" + matrixOf(sidebarLeft)[0].toFixed(2));
      ok("桌面：左栏宽度仍是 220", Math.abs(lrWidth(sidebarLeft) - 220) < 1,
        lrWidth(sidebarLeft).toFixed(1));
    }

    // ---- 3. 指针换算：屏幕位移 → 画布位移 ----
    // 智能对齐会把结果吸到别的元素或边缘上，这里只测换算本身，先把它隔离掉。
    var savedCheck = checkAlignment;
    checkAlignment = function (el, x, y) { return { snappedX: x, snappedY: y, guides: [] }; };
    state.grid.snap = false;

    createElement("text");
    var el = state.elements[state.elements.length - 1];
    el.x = 150;
    el.y = 150;
    updateElementDOM(el);

    var dom = document.querySelector('[data-element-id="' + el.id + '"]');
    var startX = el.x;
    var startY = el.y;

    var screenDx = 60;
    var screenDy = 40;
    var originX = 320;
    var originY = 300;

    pointer("pointerdown", dom, originX, originY);
    pointer("pointermove", document, originX + screenDx, originY + screenDy);
    pointer("pointerup", document, originX + screenDx, originY + screenDy);

    var gotX = el.x - startX;
    var gotY = el.y - startY;
    var wantX = screenDx / scale;
    var wantY = screenDy / scale;

    ok("拖动 X：屏幕位移按缩放换算成画布位移",
      Math.abs(gotX - wantX) < 1.2,
      "得到 " + gotX.toFixed(1) + "，期望 " + wantX.toFixed(1));
    ok("拖动 Y：同上",
      Math.abs(gotY - wantY) < 1.2,
      "得到 " + gotY.toFixed(1) + "，期望 " + wantY.toFixed(1));

    // ---- 4. 缩放手柄：屏幕尺寸恒定 + 位移换算 ----
    setSelectedElementId(el.id);
    var dom2 = document.querySelector('[data-element-id="' + el.id + '"]');
    var handle = dom2 ? dom2.querySelector(".resize-handle.se") : null;

    ok("右下角缩放手柄存在", !!handle);

    if (handle) {
      var hRect = handle.getBoundingClientRect();
      ok("手柄在屏幕上仍是 10px（calc 除以了 --canvas-scale）",
        Math.abs(hRect.width - 10) < 1,
        hRect.width.toFixed(2) + "px");

      var w0 = el.width;
      var h0 = el.height;
      var resizeDx = 40;
      var resizeDy = 30;
      var hx = hRect.left + hRect.width / 2;
      var hy = hRect.top + hRect.height / 2;

      pointer("pointerdown", handle, hx, hy);
      pointer("pointermove", document, hx + resizeDx, hy + resizeDy);
      pointer("pointerup", document, hx + resizeDx, hy + resizeDy);

      ok("缩放宽度也按缩放换算",
        Math.abs((el.width - w0) - resizeDx / scale) < 1.5,
        "得到 " + (el.width - w0).toFixed(1) + "，期望 " + (resizeDx / scale).toFixed(1));
      ok("缩放高度也按缩放换算",
        Math.abs((el.height - h0) - resizeDy / scale) < 1.5,
        "得到 " + (el.height - h0).toFixed(1) + "，期望 " + (resizeDy / scale).toFixed(1));
    }

    checkAlignment = savedCheck;

    // ---- 5. 触摸分流 ----
    var selectedDom = document.querySelector('[data-element-id="' + el.id + '"]');
    ok("选中的元素吞掉手势（可拖动）",
      getComputedStyle(selectedDom).touchAction === "none",
      "touch-action=" + getComputedStyle(selectedDom).touchAction);
    ok("空白画布保留纵向滚动（长图能滑）",
      getComputedStyle(canvas).touchAction === "pan-y",
      "touch-action=" + getComputedStyle(canvas).touchAction);
  }

  function lrWidth(node) {
    return node.getBoundingClientRect().width;
  }

  function boot() {
    try {
      // 上一次运行的残留（探针 profile 的 localStorage 是持久的）先清空，
      // 否则画布上会叠着一堆不属于本次的东西。
      state.elements.slice().forEach(function (e) { deleteElement(e.id); });
      run();
    } catch (err) {
      out.push("FAIL 探针抛异常: " + (err && err.message ? err.message : err));
    }

    // 收尾快照：截图拍的是这一刻的样子，两者的差异要看这里
    var rightNode = document.querySelector(".sidebar-right");
    out.push("INFO 收尾状态  body=[" + document.body.className + "]  rightTop=" +
      (rightNode ? rightNode.getBoundingClientRect().top.toFixed(1) : "?"));

    var pre = document.createElement("pre");
    pre.id = "probe-out";
    pre.style.position = "fixed";
    pre.style.left = "-9999px";
    pre.style.top = "0";
    pre.textContent = out.join("\n");
    document.body.appendChild(pre);
  }

  // headless 里不保证出合成帧，所以等的是定时器不是 requestAnimationFrame
  //（ResizeObserver 的回调在布局之后就会跑，不需要帧）。
  if (document.readyState === "complete") {
    setTimeout(boot, 120);
  } else {
    window.addEventListener("load", function () {
      setTimeout(boot, 120);
    });
  }
})();
