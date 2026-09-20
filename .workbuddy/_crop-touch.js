// 裁剪模式拖动的触摸回归。由 src/index.html 生成探针页，用真实触摸跑：
//
//   node tools/probe-touch.js .workbuddy/probe-crop-touch.html 390 844
//
// 这个探针存在的理由：合成 PointerEvent 永远不会复现"手势被浏览器抢走"，
// 所以拖动类问题必须在真触摸下测。同时它盯住一个真实存在过的死锁 ——
// 裁剪框一打开就恰好等于图片大小，图片偏移的可移动区间退化成 0，
// 于是拖动完全没有反应（桌面鼠标一样，只是先在手机上被发现）。
//
// 注意：本文件会被整段内联进 script 标签，**任何位置都不能出现结束标签的
// 字面量**（注释里也不行）。

(function () {
  var LOG = [];
  var out = [];
  var before = null;
  var geo = null;

  function ok(name, cond, detail) {
    out.push((cond ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
  }
  function info(name, detail) {
    out.push("INFO " + name + "  " + detail);
  }

  function rec(e) {
    if (e.type === "mousemove") return;
    var x = e.clientX;
    var y = e.clientY;
    if (e.changedTouches && e.changedTouches.length) {
      x = e.changedTouches[0].clientX;
      y = e.changedTouches[0].clientY;
    }
    LOG.push(e.type + "@" + Math.round(x || 0) + "," + Math.round(y || 0) +
      (e.defaultPrevented ? "*" : ""));
  }

  ["touchstart", "touchmove", "touchend", "touchcancel",
    "pointerdown", "pointermove", "pointerup", "pointercancel",
    "mousedown", "mouseup", "click"].forEach(function (t) {
      document.addEventListener(t, rec, true);
    });

  // 压成 "touchstart → pointerdown → touchmove×8"，一眼看出 pointercancel 在第几步插进来。
  function compress(list) {
    var parts = [];
    var last = null;
    for (var i = 0; i < list.length; i++) {
      var t = list[i].split("@")[0];
      if (last && last.t === t) { last.n++; continue; }
      last = { t: t, n: 1 };
      parts.push(last);
    }
    return parts.map(function (p) { return p.t + (p.n > 1 ? "×" + p.n : ""); }).join(" → ");
  }

  function hitCenter() {
    var r = document.getElementById("crop-window-hit").getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  // 从中心往四个方向 1px 步进，量出命中体的实际大小（含伪元素撑开的部分）
  function hitBox(node) {
    var r = node.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    function reach(dx, dy) {
      var n = 0;
      while (n < 80) {
        var at = document.elementFromPoint(Math.round(cx + dx * (n + 1)), Math.round(cy + dy * (n + 1)));
        if (!at || !(at === node || node.contains(at))) break;
        n++;
      }
      return n;
    }
    return { w: reach(-1, 0) + reach(1, 0), h: reach(0, -1) + reach(0, 1) };
  }

  function snapshot() {
    var d = state.crop.draft;
    return { x: d.x, y: d.y, w: d.w, h: d.h, offsetX: d.offsetX, offsetY: d.offsetY };
  }

  function boot() {
    try {
      // 上一次运行留下的元素（localStorage 在探针 profile 里是持久的）先清空，
      // 否则画布上会叠着一堆不属于本次的东西，很像是产品出了 bug。
      state.elements.slice().forEach(function (e) { deleteElement(e.id); });

      // 用 canvas 现画一张图，省得手写 base64
      var c = document.createElement("canvas");
      c.width = 240;
      c.height = 180;
      var g = c.getContext("2d");
      g.fillStyle = "#334";
      g.fillRect(0, 0, 240, 180);
      g.fillStyle = "#e88";
      g.fillRect(20, 20, 120, 90);

      var el = createElement("image");
      el.content.src = c.toDataURL("image/png");
      el.content.naturalWidth = 240;
      el.content.naturalHeight = 180;
      el.x = 60;
      el.y = 60;
      el.width = 240;
      el.height = 180;
      updateElementDOM(el);

      enterCropMode(el.id);

      var d = state.crop.draft;
      if (!d) throw new Error("没进裁剪模式：draft 为空");

      var center = hitCenter();
      var at = document.elementFromPoint(center[0], center[1]);
      var canvas = document.getElementById("canvas");

      geo = {
        scale: parseFloat(getComputedStyle(canvas).getPropertyValue("--canvas-scale")) || 1,
        center: center,
        at: at ? (at.id || at.className) : "(null)",
        canvas: canvas,
        hitTouchAction: getComputedStyle(document.getElementById("crop-window-hit")).touchAction,
        canvasTouchAction: getComputedStyle(canvas).touchAction
      };

      // 手势 0：框和图片一样大 —— 正是会死锁的那种初始状态
      before = snapshot();
      geo.slack0 = { x: d.w - el.content.naturalWidth * d.scaleX, y: d.h - el.content.naturalHeight * d.scaleY };

      window.__GESTURES__ = [
        { x: center[0], y: center[1], dx: 80, dy: 50, steps: 8 },
        // 往左上拖 —— 这时 offsetX 在右边界 0，只有这个方向才滑得动图片。
        // 反方向拖属于"到头了"，本就该整体平移框。
        { x: 0, y: 0, dx: -40, dy: -30, steps: 6 },  // 起点在 betweenGestures(1) 里现算
        { x: 0, y: 0, dx: 500, dy: 500, steps: 8 }   // 同上，用来撞画布右下边界
      ];

      // 等图片解码完再开跑，否则截图里的裁剪框是空的（图片尚未上屏）
      var waits = ["crop-ghost", "crop-clip-img"].map(function (id) {
        var im = document.getElementById(id);
        return im && im.decode ? im.decode().catch(function () { }) : Promise.resolve();
      });
      Promise.race([
        Promise.all(waits),
        new Promise(function (r) { setTimeout(r, 800); })
      ]).then(function () { window.__READY__ = true; });
    } catch (err) {
      out.push("FAIL 准备阶段出错: " + (err && err.message ? err.message : err));
      window.__READY__ = true;
      window.__GESTURES__ = [];
    }
  }

  window.__betweenGestures__ = function (i) {
    var d = state.crop.draft;
    var el = getElementById(state.crop.elementId);

    if (i === 1) {
      // 把手势 0 的结果收好，再把框缩到图片一半 —— 这时图片在框里终于有余量，
      // 拖动应该变成"滑图"而不是"移框"。
      geo.after0 = snapshot();
      d.w = 120;
      d.h = 90;
      clampCropDraft();
      renderCropOverlay();
      geo.before1 = snapshot();
    }

    if (i === 2) {
      geo.after1 = snapshot();
    }

    var center = hitCenter();
    window.__GESTURES__[i].x = center[0];
    window.__GESTURES__[i].y = center[1];
  };

  window.__afterGestures__ = function () {
    try {
      report();
    } catch (err) {
      out.push("FAIL __afterGestures__ 抛异常: " + (err && err.message ? err.message : err));
    }
    var pre = document.createElement("pre");
    pre.id = "probe-out";
    pre.style.position = "fixed";
    pre.style.left = "-9999px";
    pre.textContent = out.join("\n");
    document.body.appendChild(pre);
  };

  function report() {
    var scale = geo.scale;
    var d = state.crop.draft;

    info("缩放/命中", "scale=" + scale.toFixed(4) +
      "  落点上的元素=" + geo.at +
      "  hit 中心=" + geo.center.map(function (v) { return v.toFixed(0); }).join(","));
    info("touch-action", "hit=" + geo.hitTouchAction + "  canvas=" + geo.canvasTouchAction);
    info("事件序列", compress(LOG));

    // ---- 1. 手势没被浏览器抢走 ----
    var cancelled = LOG.some(function (e) {
      return e.indexOf("pointercancel") === 0 || e.indexOf("touchcancel") === 0;
    });
    ok("触摸拖动没有被浏览器取消", !cancelled);

    // hit 上有 touch-action:none 才拖得动；canvas 是 pan-y 让空白处还能滚长图。
    ok("裁剪框吞掉手势（touch-action: none）", geo.hitTouchAction === "none", geo.hitTouchAction);
    ok("画布本身仍保留纵向滚动", geo.canvasTouchAction === "pan-y", geo.canvasTouchAction);

    // ---- 2. 框 == 图 时：整体平移 ----
    var a0 = geo.after0;
    info("手势0 前后", "框 " + fmt(before) + " → " + fmt(a0) +
      "  图片余量 " + geo.slack0.x.toFixed(1) + "/" + geo.slack0.y.toFixed(1));

    var wantX = 80 / scale;
    var wantY = 50 / scale;

    ok("框和图片一样大时，拖动让整个裁剪框移动",
      Math.abs((a0.x - before.x) - wantX) < 1.5,
      "框位移 " + (a0.x - before.x).toFixed(1) + "，期望 " + wantX.toFixed(1));
    ok("纵向同理",
      Math.abs((a0.y - before.y) - wantY) < 1.5,
      "框位移 " + (a0.y - before.y).toFixed(1) + "，期望 " + wantY.toFixed(1));
    ok("整体平移不改变取景（图片相对框的偏移不变）",
      a0.offsetX === before.offsetX && a0.offsetY === before.offsetY,
      a0.offsetX + "," + a0.offsetY);

    // 视觉上图片确实跟着框一起走了
    var ghost = document.getElementById("crop-ghost");
    var win = document.getElementById("crop-window");
    var gap = parseFloat(ghost.style.left) - parseFloat(win.style.left);
    ok("图片（ghost）跟着框一起移动",
      Math.abs(gap - before.offsetX) < 0.5,
      "ghost.left - win.left = " + gap.toFixed(1) + "，期望 " + before.offsetX);

    // ---- 3. 框 < 图 时：滑图（不是移框） ----
    var b1 = geo.before1;
    var a1 = geo.after1;
    info("手势1 前后", "框 " + fmt(b1) + " → " + fmt(a1));
    info("手势1 余量", "水平 " + (a1.w - 240 * 1).toFixed(1) + "（框宽 " + a1.w + "）");

    ok("框比图小时，拖动是滑动图片而不是移动框",
      Math.abs((a1.offsetX - b1.offsetX) - (-40 / scale)) < 1.5 && a1.x === b1.x,
      "offsetX " + (a1.offsetX - b1.offsetX).toFixed(1) + "（期望 " + (-40 / scale).toFixed(1) +
      "），框位移 " + (a1.x - b1.x).toFixed(1));

    // ---- 4. 撞边界 ----
    var a2 = snapshot();
    info("手势2 之后", "框 " + fmt(a2) + "  offset " + a2.offsetX.toFixed(1) + "," + a2.offsetY.toFixed(1));

    ok("拖到画布外时被挡住，框不会跑出画布",
      a2.x >= -0.5 && a2.y >= -0.5 &&
      a2.x + a2.w <= state.canvas.width + 0.5 &&
      a2.y + a2.h <= state.canvas.height + 0.5,
      "框 " + a2.x.toFixed(1) + "," + a2.y.toFixed(1) + " + " + a2.w + "x" + a2.h +
      "  画布 " + state.canvas.width + "x" + state.canvas.height);

    ok("图片始终覆盖裁剪框（不露空白）",
      a2.offsetX <= 0.5 && a2.offsetY <= 0.5 &&
      a2.offsetX >= a2.w - 240 - 0.5 && a2.offsetY >= a2.h - 180 - 0.5,
      "offset " + a2.offsetX.toFixed(1) + "," + a2.offsetY.toFixed(1) +
      " 范围 [" + (a2.w - 240) + ",0] [" + (a2.h - 180) + ",0]");

    // 裁剪手柄是裁剪模式里唯一"要精准点到"的东西，可见尺寸只有 14px。
    // 命中区靠伪元素撑开，窄屏和桌面是两档 —— 两边都要盯住。
    //
    // 量之前先把框挪回画布中间：上一个手势把它顶到了画布右下角，手柄中心正好
    // 落在画布边界上，被 `.canvas { overflow: hidden }` 切掉一半，量出来是个假 0。
    d.x = 200;
    d.y = 150;
    d.w = 120;
    d.h = 90;
    renderCropOverlay();

    var handle = document.querySelector(".crop-handle-se") || document.querySelector(".crop-handle");
    if (!handle) {
      ok("裁剪框带手柄", false);
    } else {
      var hb = hitBox(handle);
      info("裁剪手柄命中区", hb.w + "×" + hb.h + " 屏幕像素（可见 14px）");
      if (window.innerWidth <= 900) {
        ok("窄屏：裁剪手柄命中区对手指够大（≥ 40px）", hb.w >= 40 && hb.h >= 40, hb.w + "×" + hb.h);
      } else {
        ok("桌面：裁剪手柄保持鼠标尺寸（没被顺手放大）", hb.w < 30 && hb.h < 30, hb.w + "×" + hb.h);
      }
    }
  }

  function fmt(s) {
    return "x=" + s.x.toFixed(0) + " y=" + s.y.toFixed(0) + " " + s.w + "x" + s.h;
  }

  if (document.readyState === "complete") {
    setTimeout(boot, 120);
  } else {
    window.addEventListener("load", function () { setTimeout(boot, 120); });
  }
})();
