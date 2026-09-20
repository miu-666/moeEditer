// 基础触摸交互回归：选中 / 拖动 / 缩放手柄 / 长页滚动。
//
//   node tools/make-probe.js tools/probe-src/touch-basic.js probes/probe-touch-basic.html probe-touch-basic
//   node tools/probe-touch.js probes/probe-touch-basic.html 390 844
//
// 为什么必须真触摸：这些交互的正确性一半取决于**浏览器把不把手势让给页面**
// （touch-action、滚动容器抢手势、pointercancel）。合成 PointerEvent 绕过了这一层，
// 全绿也没意义。其中"手指按在元素上往下滑，页面还能不能滚"是长图在手机上能不能用的前提。
//
// 空白画布上的滑动是**对照**：它滚得动、元素上滚不动，才说明是产品的问题；
// 两个都滚不动，说明是无头环境量不到合成器滚动（见浏览器验证技能 6.5）。
//
// 注意：本文件会被整段内联进 script 标签，**任何位置都不能出现结束标签的
// 字面量**（注释里也不行）。

(function () {
  var LOG = [];
  var SCROLLS = [];
  var out = [];
  var S = {};
  var geo = {};
  var GAP = "  ·  ";

  function ok(name, cond, detail) {
    out.push((cond ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
  }
  function info(name, detail) {
    out.push("INFO " + name + "  " + detail);
  }

  function rec(e) {
    if (e.type === "mousemove") return;
    var x = e.clientX, y = e.clientY;
    if (e.changedTouches && e.changedTouches.length) {
      x = e.changedTouches[0].clientX;
      y = e.changedTouches[0].clientY;
    }
    LOG.push(e.type + "@" + Math.round(x || 0) + "," + Math.round(y || 0));
  }

  ["touchstart", "touchmove", "touchend", "touchcancel",
    "pointerdown", "pointermove", "pointerup", "pointercancel"].forEach(function (t) {
      document.addEventListener(t, rec, true);
    });

  // 任何元素滚动都会被这里看到 —— 万一滚的不是 canvas-area，也能查出来。
  window.addEventListener("scroll", function (e) {
    var t = e.target;
    var name = t === document ? "document" : (t.className || t.tagName || "?");
    SCROLLS.push(String(name).split(" ")[0] + ":" + Math.round(t === document ? 0 : t.scrollTop));
  }, true);

  function compress(from, to) {
    var parts = [], last = null;
    for (var i = from; i < to && i < LOG.length; i++) {
      var t = LOG[i].split("@")[0];
      if (last && last.t === t) { last.n++; continue; }
      last = { t: t, n: 1 };
      parts.push(last);
    }
    return parts.map(function (p) { return p.t + (p.n > 1 ? "×" + p.n : ""); }).join(" → ");
  }

  function qs(sel) { return document.querySelector(sel); }

  function isCancel(s) {
    return s.indexOf("pointercancel") === 0 || s.indexOf("touchcancel") === 0;
  }

  function rectOf(node) {
    var r = node.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  function domRectOf(id) { return rectOf(qs('[data-element-id="' + id + '"]')); }

  function elSnap(id) {
    var el = getElementById(id);
    return { x: el.x, y: el.y, w: el.width, h: el.height };
  }

  // 从中心往四个方向 1px 步进，量出这个命中体的实际尺寸（含伪元素撑大的部分）
  function hitBox(node) {
    var c = rectOf(node);
    function reach(dx, dy) {
      var n = 0;
      while (n < 80) {
        var at = document.elementFromPoint(Math.round(c.cx + dx * (n + 1)), Math.round(c.cy + dy * (n + 1)));
        if (!at || !(at === node || node.contains(at))) break;
        n++;
      }
      return n;
    }
    return { w: reach(-1, 0) + reach(1, 0), h: reach(0, -1) + reach(0, 1) };
  }

  function makeText(x, y, w, h, text) {
    var el = createElement("text");
    el.x = x; el.y = y; el.width = w; el.height = h;
    el.content.text = text;
    updateElementDOM(el);
    return el;
  }

  // 在画布上找一块"空"的位置（命中画布本身），作为滑动对照的起点
  function findEmptyPoint() {
    var canvas = document.getElementById("canvas");
    var r = rectOf(canvas);
    for (var x = r.l + r.w - 8; x > r.l; x -= 8) {
      for (var y = r.t + r.h - 8; y > r.t; y -= 8) {
        if (document.elementFromPoint(x, y) === canvas) return [x, y];
      }
    }
    return null;
  }

  function boot() {
    try {
      state.elements.slice().forEach(function (e) { deleteElement(e.id); });
      setSelectedElementId(null);

      state.canvas.mode = "long";
      state.canvas.width = 600;
      var a = makeText(40, 40, 300, 100, "A");
      var b = makeText(40, 1800, 300, 100, "B");   // 远在页尾，把画布撑高
      syncPageHeight();
      applyCanvasSize();

      var canvas = document.getElementById("canvas");
      var area = qs(".canvas-area");
      var empty = findEmptyPoint();

      geo = {
        scale: parseFloat(getComputedStyle(canvas).getPropertyValue("--canvas-scale")) || 1,
        area: area, canvas: canvas, aId: a.id, bId: b.id, empty: empty,
        areaTouchAction: getComputedStyle(area).touchAction,
        canvasTouchAction: getComputedStyle(canvas).touchAction,
        elTouchAction: getComputedStyle(qs('[data-element-id="' + a.id + '"]')).touchAction
      };

      var r = domRectOf(a.id);
      info("场景", "画布 " + state.canvas.width + "x" + state.canvas.height +
        "  滚动区 " + area.clientWidth + "x" + area.clientHeight +
        "  scrollHeight=" + area.scrollHeight +
        "  空白起点=" + (empty ? empty.map(function (v) { return v.toFixed(0); }).join(",") : "没找到"));

      window.__GESTURES__ = [
        // 0：未选中元素上竖直下滑 —— 目标是滚页面，不是挪元素
        { x: r.cx, y: r.cy, dx: 0, dy: 120, steps: 10 },
        // 1（对照）：空白画布上同样竖滑
        { x: empty ? empty[0] : r.cx, y: empty ? empty[1] : r.cy, dx: 0, dy: 120, steps: 10 },
        // 2：点一下 A（起点在 betweenGestures 里现算）
        { x: 0, y: 0, dx: 0, dy: 0, steps: 2 },
        // 3：水平拖已选中的 A
        { x: 0, y: 0, dx: 60, dy: 0, steps: 8 },
        // 4：拖右下角手柄放大 A
        { x: 0, y: 0, dx: 60, dy: 40, steps: 8 }
      ];

      window.__READY__ = true;
    } catch (err) {
      out.push("FAIL 准备阶段出错: " + (err && err.message ? err.message : err));
      window.__READY__ = true;
      window.__GESTURES__ = [];
    }
  }

  function mark(i) {
    S["after" + i] = {
      el: elSnap(geo.aId),
      scrollTop: geo.area.scrollTop,
      scrollTopDoc: document.documentElement.scrollTop,
      scrollEvents: SCROLLS.length,
      bTop: domRectOf(geo.bId).t,
      selected: state.selectedElementId === geo.aId,
      dragAlive: state.drag.active,
      log: LOG.length
    };
  }

  window.__betweenGestures__ = function (i) {
    var a = getElementById(geo.aId);
    var g = window.__GESTURES__;

    if (i >= 1) mark(i - 1);

    if (i === 2) {
      geo.area.scrollTop = 0;                    // 点之前先回到顶端
      var r = domRectOf(a.id);
      g[i].x = r.cx; g[i].y = r.cy;
      S.beforeTap = elSnap(a.id);
    }
    if (i === 3) {
      var r2 = domRectOf(a.id);
      g[i].x = r2.cx; g[i].y = r2.cy;
      S.beforeDrag = elSnap(a.id);
    }
    if (i === 4) {
      var node = qs('[data-element-id="' + a.id + '"]');
      var h = node.querySelector(".resize-handle.se");
      var hr = h ? rectOf(h) : null;
      S.handleHit = h ? hitBox(h) : null;
      S.handleStart = hr;
      S.beforeResize = elSnap(a.id);
      g[i].x = hr ? hr.cx : 0;
      g[i].y = hr ? hr.cy : 0;
    }
  };

  window.__afterGestures__ = function () {
    try {
      mark(4);
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
    var a = getElementById(geo.aId);

    info("视口", "scale=" + scale.toFixed(4) +
      "  滚动区 scrollHeight=" + geo.area.scrollHeight + " / clientHeight=" + geo.area.clientHeight);
    info("touch-action", "area=" + geo.areaTouchAction +
      "  canvas=" + geo.canvasTouchAction +
      "  未选中元素=" + geo.elTouchAction +
      "  选中后=" + getComputedStyle(qs('[data-element-id="' + a.id + '"]')).touchAction);
    info("滚动事件", SCROLLS.length ? SCROLLS.join(GAP) : "（一次都没有）");
    info("手势0 元素上竖滑", compress(0, S.after0.log));
    info("手势1 空白处竖滑", compress(S.after0.log, S.after1.log));
    info("手势2 点选", compress(S.after1.log, S.after2.log));
    info("手势3 拖动", compress(S.after2.log, S.after3.log));
    info("手势4 缩放", compress(S.after3.log, S.after4.log));

    function scrollLine(tag, s) {
      return tag + " 滚动 " + s.scrollTop.toFixed(0) + "px" +
        "  元素 " + s.el.x.toFixed(1) + "," + s.el.y.toFixed(1) +
        "  页尾元素 top=" + s.bTop.toFixed(0);
    }
    info("手势0 之后", scrollLine("元素上", S.after0));
    info("手势1 之后", scrollLine("空白处", S.after1));

    // ---- 1. 竖滑有没有被浏览器收走 ----
    //
    // 无头环境**量不到合成器滚动**：手指一滑，Chrome 会把手势收走（发 pointercancel），
    // 但真正的位移在合成器侧，主线程既读不到 scrollTop 也收不到 scroll 事件。
    // 用一个纯页面做过对照（4000px 高、overflow:auto，无本项目代码）：
    // 同样收不到 scrollTop 变化。所以这里断言的是**可观测的那一半**——
    // 浏览器有没有把手势收走。收走了，真机上这一次滑动就是滚动；
    // 没被收走，才说明页面把滚动吃掉了（preventDefault / touch-action 拦住了）。
    var cancelled0 = LOG.slice(0, S.after0.log).some(isCancel);
    var cancelled1 = LOG.slice(S.after0.log, S.after1.log).some(isCancel);

    ok("元素上竖滑被浏览器收走（真机上即滚动）", cancelled0,
      "pointercancel=" + cancelled0 + "  滚动量读不到（无头限制）");
    ok("空白处竖滑同样被收走", cancelled1, "pointercancel=" + cancelled1);
    ok("两种起点的结果一致 —— 元素不是滚动的障碍",
      cancelled0 === cancelled1, "元素上=" + cancelled0 + "  空白处=" + cancelled1);

    // ---- 2. 元素上竖滑不该把元素拖走 ----
    var swipeMovedX = Math.abs(S.after0.el.x - 40);
    var swipeMovedY = Math.abs(S.after0.el.y - 40);
    ok("元素上竖滑没有把元素拖走", swipeMovedX < 2 && swipeMovedY < 2,
      "落在 " + S.after0.el.x.toFixed(1) + "," + S.after0.el.y.toFixed(1) + "（起点 40,40）");

    ok("竖滑之后没有被选中（否则下一次滑动就变成拖动了）", S.after0.selected === false,
      "selected=" + S.after0.selected);
    ok("竖滑结束后拖动状态已收起", S.after0.dragAlive === false, "drag.active=" + S.after0.dragAlive);

    // ---- 3. 点一下 = 选中 ----
    ok("点一下可以选中元素", S.after2.selected, "selected=" + S.after2.selected);
    ok("点完之后 drag 状态已收起（pointerup 没漏）", S.after2.dragAlive === false,
      "drag.active=" + S.after2.dragAlive);
    ok("点一下不会让元素挪位",
      Math.abs(S.after2.el.x - S.beforeTap.x) < 1 && Math.abs(S.after2.el.y - S.beforeTap.y) < 1,
      "位移 " + (S.after2.el.x - S.beforeTap.x).toFixed(1) + "," + (S.after2.el.y - S.beforeTap.y).toFixed(1));

    // ---- 4. 已选中后拖动 = 元素跟手 ----
    var movedX = S.after3.el.x - S.beforeDrag.x;
    var wantX = 60 / scale;
    ok("已选中的元素可以拖动，位移按 scale 换算", Math.abs(movedX - wantX) < 2,
      "位移 " + movedX.toFixed(1) + "，期望 " + wantX.toFixed(1) + "（手指走了 60）");
    ok("拖动只改 X，没有串到 Y", Math.abs(S.after3.el.y - S.beforeDrag.y) < 1,
      "dy=" + (S.after3.el.y - S.beforeDrag.y).toFixed(2));

    // ---- 5. 缩放手柄 ----
    if (!S.handleHit) {
      ok("选中后出现缩放手柄", false, "找不到 .resize-handle.se");
      return;
    }
    var growW = a.width - S.beforeResize.w;
    var growH = a.height - S.beforeResize.h;
    info("手柄命中区", S.handleHit.w + "×" + S.handleHit.h + " 屏幕像素（可见 10px）");

    ok("拖右下角手柄能放大元素（宽）", Math.abs(growW - 60 / scale) < 2,
      "宽 " + growW.toFixed(1) + "，期望 " + (60 / scale).toFixed(1));
    ok("拖右下角手柄能放大元素（高）", Math.abs(growH - 40 / scale) < 2,
      "高 " + growH.toFixed(1) + "，期望 " + (40 / scale).toFixed(1));

    var hAfter = rectOf(qs('[data-element-id="' + a.id + '"]').querySelector(".resize-handle.se"));
    var fx = S.handleStart.cx + 60, fy = S.handleStart.cy + 40;
    info("手柄粘手", "手指终点 " + fx.toFixed(0) + "," + fy.toFixed(0) +
      "  手柄中心 " + hAfter.cx.toFixed(0) + "," + hAfter.cy.toFixed(0));
    ok("缩放手柄在屏幕上跟着手指（没有漂移）",
      Math.abs(hAfter.cx - fx) < 3 && Math.abs(hAfter.cy - fy) < 3,
      "偏差 " + (hAfter.cx - fx).toFixed(1) + "," + (hAfter.cy - fy).toFixed(1));

    // 手指覆盖约 40px；鼠标不需要。所以命中区是按断点分档的，两边都要盯住：
    // 窄屏放大了，桌面没被顺手放大。
    if (window.innerWidth <= 900) {
      ok("窄屏：缩放手柄的命中区对手指够大（≥ 40px）",
        S.handleHit.w >= 40 && S.handleHit.h >= 40, S.handleHit.w + "×" + S.handleHit.h);
    } else {
      ok("桌面：命中区保持鼠标尺寸（没被顺手放大）",
        S.handleHit.w < 30 && S.handleHit.h < 30, S.handleHit.w + "×" + S.handleHit.h);
    }
  }

  if (document.readyState === "complete") {
    setTimeout(boot, 120);
  } else {
    window.addEventListener("load", function () { setTimeout(boot, 120); });
  }
})();
