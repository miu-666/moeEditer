/**
 * 把 src/ 打成一个自包含的单文件 HTML（CSS / JS 全部内联，零外部请求）。
 *
 * 用法：node tools/build-single.js
 * 产物：dist/moe-bio-editor.html
 *
 * 之所以能直接内联：项目本身没有任何 fetch / 外链 / ES module，
 * 所有脚本都是全局脚本 + 顺序加载，所以只要保持 <script> 顺序即可。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "moe-bio-editor.html");

/**
 * 内联时做的源码重写。
 *
 * 原因：Chrome / Edge 把 file:// 当成同一个源，localStorage 是共享的。
 * 单文件版如果沿用开发版的 key，别人（或你自己）打开 dist 产物时会读到
 * 本地开发时残留的存档，出现「一打开就有一堆不属于我的元素」。
 * 换成独立 key，两边互不打扰。
 */
const JS_RENAMES = [
  ['"moe_bio_editor_state"', '"moe_bio_editor_state_singlefile"'],
  ['"moe_clipboard"', '"moe_clipboard_singlefile"'],
];

/** 防止脚本内容里出现 </script> 提前闭合标签 */
function escapeForInlineScript(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}

/** 防止样式内容里出现 </style> 提前闭合标签 */
function escapeForInlineStyle(css) {
  return css.replace(/<\/style/gi, "<\\/style");
}

function readFileOrDie(rel) {
  const abs = path.join(SRC, rel);
  if (!fs.existsSync(abs)) {
    console.error(`✗ 找不到文件：${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

let html = readFileOrDie("index.html");

// ---- 1. 内联所有 <link rel="stylesheet"> ----
let cssCount = 0;
html = html.replace(
  /[ \t]*<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>\s*\n?/gi,
  (match, href) => {
    const css = readFileOrDie(href);
    cssCount++;
    console.log(`  + css  ${href.padEnd(24)} ${(css.length / 1024).toFixed(1)} KB`);
    return `<style>\n${escapeForInlineStyle(css)}\n</style>\n`;
  }
);

// ---- 2. 内联所有 <script src>（严格保持原有顺序） ----
let jsCount = 0;
const renameHits = new Set();
html = html.replace(
  /[ \t]*<script[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>\s*\n?/gi,
  (match, src) => {
    let js = readFileOrDie(src);
    JS_RENAMES.forEach(([from, to]) => {
      if (js.includes(from)) {
        renameHits.add(from);
        js = js.split(from).join(to);
      }
    });
    jsCount++;
    console.log(`  + js   ${src.padEnd(24)} ${(js.length / 1024).toFixed(1)} KB`);
    return `<script>\n${escapeForInlineScript(js)}\n</script>\n`;
  }
);

// 源码里的 key 改名了却没同步到上面这张表 → 单文件版会去读开发版存档
JS_RENAMES.forEach(([from]) => {
  if (!renameHits.has(from)) {
    console.error(`✗ 重写规则未命中：${from} 已不在源码中，请更新 JS_RENAMES`);
    process.exit(1);
  }
});

// ---- 3. 残留检查：确认真的没有外链了 ----
const leftovers = html.match(/<(?:link|script)[^>]*(?:href|src)=["'][^"']+["']/gi) || [];
if (leftovers.length) {
  console.error("✗ 仍有未内联的外部引用：\n  " + leftovers.join("\n  "));
  process.exit(1);
}

// ---- 4. 加个构建标记，方便分辨单文件版本 ----
// 用 ISO 格式（天然带 Z），别手算时区 —— 本机是 UTC+8，直接取本地时间会让标记
// 比实际早一天，看的人会以为拿到了旧产物。
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
html = html.replace(
  "<head>",
  `<head>\n  <!-- Single-file build · inlined ${cssCount} css + ${jsCount} js · ${stamp} -->`
);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
console.log(`\n✓ 打包完成：dist/moe-bio-editor.html  (${kb} KB，无任何外部请求)`);
