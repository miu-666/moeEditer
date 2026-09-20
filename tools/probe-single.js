/**
 * 生成单文件版的运行时探针副本，并用真浏览器跑一遍。
 * 用法：node tools/probe-single.js
 *
 * 目的：证明 dist/moe-bio-editor.html 在 file:// 协议下（也就是别人拿到文件
 * 双击打开的场景）能完整跑起来 —— 而不是只看文件大小对不对。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "moe-bio-editor.html");
const PROBE = path.join(ROOT, ".workbuddy", "probe-single.html");

if (!fs.existsSync(DIST)) {
  console.error("✗ 先跑 tools/build-single.js 生成 dist 产物");
  process.exit(1);
}

const probeCode = `
<script>
(function () {
  var out = { errors: [], steps: [] };
  function step(name, detail) { out.steps.push(name + ": " + detail); }
  window.addEventListener("error", function (e) { out.errors.push("error → " + e.message); });
  window.addEventListener("unhandledrejection", function (e) { out.errors.push("reject → " + e.reason); });
  var _err = console.error;
  console.error = function () { out.errors.push("console.error → " + Array.prototype.join.call(arguments, " ")); _err.apply(console, arguments); };

  window.addEventListener("load", function () { setTimeout(run, 60); });

  function run() {
    try {
      // ---- 1. 组件按钮新增 ----
      // image 按钮走文件选择器（triggerImageUpload），headless 点不出文件对话框，
      // 所以它单独用 createElement 直接建，等价于用户上传完成后的状态。
      var uiTypes = ["text", "divider", "textbox", "label", "sticker"];
      uiTypes.forEach(function (t) {
        var btn = document.querySelector('.component-btn[data-type="' + t + '"]');
        if (!btn) { out.errors.push("缺少组件按钮 " + t); return; }
        btn.click();
      });
      step("UI按钮新增", "state.elements=" + state.elements.length + " / DOM=" + document.querySelectorAll(".canvas-element").length + " / 类型=[" + state.elements.map(function (e) { return e.type; }).join(",") + "]");

      var imgBtn = document.querySelector('.component-btn[data-type="image"]');
      step("image按钮", imgBtn ? "存在 ✓（走 triggerImageUpload 文件选择，属预期）" : "✗ 缺失");
      createElement("image");
      step("image元素", "新增后 state.elements=" + state.elements.length + " / DOM=" + document.querySelectorAll(".canvas-element").length);

      // ---- 2. 属性面板（选中 textbox，检查 D-5/D-6 的按钮真的渲染出来）----
      var tb = state.elements.filter(function (e) { return e.type === "textbox"; })[0];
      if (tb) {
        state.selectedElementId = tb.id;
        renderPropertiesPanel();
        var panel = document.getElementById("properties-panel");
        step("textbox面板(单栏)", "vAlign按钮=" + panel.querySelectorAll("[data-valign]").length + " 分栏Align按钮=" + panel.querySelectorAll("[data-colalign]").length + "（单栏应各 3）");

        // 切成两栏布局，面板应变成 2 组 × 3 个 Align
        updateElement(tb.id, { style: { layout: "columns" } });
        renderPropertiesPanel();
        panel = document.getElementById("properties-panel");
        step("textbox面板(分栏)", "vAlign按钮=" + panel.querySelectorAll("[data-valign]").length + " 分栏Align按钮=" + panel.querySelectorAll("[data-colalign]").length + "（分栏应为 3 / 6）");

        var tb0 = state.elements.filter(function (e) { return e.id === tb.id; })[0];
        var before = JSON.stringify(tb0.content.columns.map(function (c) { return c.align; })) + "|" + tb0.style.vAlign;
        var cbtn = panel.querySelector('[data-colalign="right"][data-col="1"]');
        var vbtn = panel.querySelector('[data-valign="bottom"]');
        if (cbtn) cbtn.click();
        if (vbtn) vbtn.click();
        var tb2 = state.elements.filter(function (e) { return e.id === tb.id; })[0];
        var after = JSON.stringify(tb2.content.columns.map(function (c) { return c.align; })) + "|" + tb2.style.vAlign;
        if (!cbtn) out.errors.push("分栏后找不到 col=1 的 Align 按钮");
        step("面板交互", before + " → " + after + (before !== after ? " ✓" : " ✗未变化"));

        // 预览 DOM 是否带上了对应 class
        var dom = document.querySelector('[data-element-id="' + tb.id + '"]');
        step("预览class", dom.querySelector(".box-body") ? dom.querySelector(".box-body").className : "(无 box-body)");
      }

      // ---- 3. 导出管线：独立画布跑一遍 renderElementToExportCanvas ----
      var W = 600, H = 900;
      var cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      state.elements.slice().sort(function (a, b) { return a.zIndex - b.zIndex; }).forEach(function (el) {
        try { renderElementToExportCanvas(ctx, el, function () {}); }
        catch (e) { out.errors.push("导出 " + el.type + " 抛错 → " + e.message); }
      });
      var data = ctx.getImageData(0, 0, W, H).data;
      var ink = 0;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) ink++;
      }
      step("导出墨迹像素", ink + (ink > 0 ? " ✓" : " ✗空白"));

      // ---- 3b. 完整点击 Export PNG：拦截下载动作，检查真的生成了 PNG ----
      var captured = null;
      var _click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) { captured = { name: this.download, href: this.href }; return; }
        return _click.apply(this, arguments);
      };
      var exportBtn = document.getElementById("btn-export");
      if (exportBtn) exportBtn.click();
      HTMLAnchorElement.prototype.click = _click;
      if (!captured) {
        out.errors.push("点 Export PNG 后没有触发下载");
      } else {
        var isPng = /^data:image\\/png;base64,/.test(captured.href);
        // base64 长度 → 字节数，再读 PNG 头里的宽高（偏移 16/20 的 IHDR）
        var b64 = captured.href.split(",")[1] || "";
        var bytes = Math.floor(b64.length * 0.75);
        var dims = "?";
        try {
          var bin = atob(b64.slice(0, 40));
          var w = (bin.charCodeAt(16) << 24) | (bin.charCodeAt(17) << 16) | (bin.charCodeAt(18) << 8) | bin.charCodeAt(19);
          var h = (bin.charCodeAt(20) << 24) | (bin.charCodeAt(21) << 16) | (bin.charCodeAt(22) << 8) | bin.charCodeAt(23);
          dims = w + "×" + h;
        } catch (e) { dims = "解析失败"; }
        step("Export PNG 全流程", "文件=" + captured.name + " PNG头=" + (isPng ? "✓" : "✗") + " 尺寸=" + dims + " 体积=" + (bytes / 1024).toFixed(1) + "KB" + (bytes > 500 ? " ✓" : " ✗疑似空白"));
      }

      // ---- 4. file:// 下 localStorage 可用性（别人打开时自动存档依赖它）----
      try {
        localStorage.setItem("__probe", "1");
        step("localStorage", localStorage.getItem("__probe") === "1" ? "可用 ✓" : "读回失败 ✗");
      } catch (e) { step("localStorage", "不可用（已 try/catch 兜住，功能降级）: " + e.message); }

      // ---- 5. 页面模式 + Phase C 新增件（内容结束虚线 / 整理成列表）----
      step("画布尺寸", document.getElementById("canvas").style.width + " × " + document.getElementById("canvas").style.height);
      state.selectedElementId = null;
      renderPropertiesPanel();
      var modeBtn = document.querySelector('[data-pagemode="long"]');
      if (modeBtn) {
        modeBtn.click();
        var hasMarker = !!document.querySelector(".content-end-marker");
        var tidyBtn = Array.prototype.filter.call(
          document.querySelectorAll("#properties-panel button"),
          function (b) { return /整理成列表/.test(b.textContent); }
        )[0];
        step("长页模式", "mode=" + state.canvas.mode + " 内容结束虚线=" + (hasMarker ? "有 ✓" : "无 ✗（内容非空时应出现）") + " 整理成列表按钮=" + (tidyBtn ? "有 ✓" : "无 ✗"));
      } else {
        out.errors.push("找不到 [data-pagemode=long] 按钮");
      }

      // ---- 6. 残留外链检查（file:// 下任何外链都会 404）----
      var ext = [];
      document.querySelectorAll("link[href],script[src],img[src]").forEach(function (n) {
        var u = n.getAttribute("href") || n.getAttribute("src") || "";
        if (u && !/^(data:|#|javascript:)/.test(u)) ext.push(n.tagName + ":" + u);
      });
      step("外部资源", ext.length ? "✗ " + ext.join(", ") : "0 个 ✓");

      step("JS错误", out.errors.length + (out.errors.length ? " → " + out.errors.join(" | ") : " ✓"));
    } catch (e) {
      out.errors.push("探针崩溃 → " + e.message);
    }

    var pre = document.createElement("pre");
    pre.id = "__PROBE__";
    // 隐藏：dump-dom 依然能序列化到它，但截图里不会干扰画面
    pre.style.cssText = "position:absolute;left:-9999px;top:0;";
    pre.textContent = out.steps.concat("RAW_ERRORS:" + JSON.stringify(out.errors)).join("\\n");
    document.body.appendChild(pre);
  }
})();
</script>
`;

const distHtml = fs.readFileSync(DIST, "utf8");
const withProbe = distHtml.replace("</body>", probeCode + "</body>");

fs.mkdirSync(path.dirname(PROBE), { recursive: true });
fs.writeFileSync(PROBE, withProbe, "utf8");
console.log("✓ 探针副本已生成：" + PROBE);
console.log("  dist 大小 = " + (Buffer.byteLength(distHtml, "utf8") / 1024).toFixed(0) + " KB\n");

// ---- 真浏览器跑一遍：headless Edge，dump 出 DOM 再抽取探针输出 ----
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const { spawnSync } = require("child_process");

const res = spawnSync(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--virtual-time-budget=5000",
    "--dump-dom",
    "file:///" + PROBE.replace(/\\/g, "/"),
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);

if (!res.stdout) {
  console.error("✗ 浏览器没有输出，Edge 路径可能不对：" + EDGE);
  process.exit(1);
}

// pre 上带了隐藏用的行内样式，所以标签后面不能直接跟 >
const m = res.stdout.match(/<pre id="__PROBE__"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
  console.error("✗ 没抓到探针输出 —— 说明页面在探针落地前就挂了");
  process.exit(1);
}

const text = m[1]
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, "&");

console.log(text);
console.log(text.includes("RAW_ERRORS:[]") ? "\n✓ 全部通过" : "\n✗ 有错误，见 RAW_ERRORS");
process.exit(text.includes("RAW_ERRORS:[]") ? 0 : 1);
