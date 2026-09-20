/**
 * 由 src/index.html 生成一个探针页。
 *
 * 为什么不让探针自己维护一份 HTML 副本：探针页必须跟真实的 index.html 完全一致
 * （同样的样式表、同样的脚本清单与顺序），否则测的就不是产品。手抄一份的结局是
 * 加了新模块后探针少加载一个文件，报出 "xxx is not defined" —— 看起来像功能坏了，
 * 其实是探针过期了。
 *
 * 做三件事：
 *   1. 把相对路径的 css/js 换成绝对 file://（探针页在 probes/ 下，相对路径会找不到）
 *   2. 把注入脚本内联到 </body> 前
 *   3. 断言注入脚本里没有结束标签字面量 —— 有的话会提前闭合 script 标签，
 *      探针代码被截断，症状是"没抓到结果节点"，极难排查
 *
 * 用法：
 *   node tools/make-probe.js tools/probe-src/crop-touch.js probes/probe-crop-touch.html
 *   node tools/make-probe.js <注入脚本> <输出 html> [<title>]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src", "index.html");

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.log("用法: node tools/make-probe.js <注入脚本> <输出 html> [<title>]");
  process.exit(2);
}

const injectRel = argv[0];
const outRel = argv[1];
const title = argv[2] || path.basename(outRel, ".html");

let html = fs.readFileSync(SRC, "utf8");
const inject = fs.readFileSync(path.resolve(ROOT, injectRel), "utf8");

if (/<\/script/i.test(inject)) {
  console.error("✗ 注入脚本里出现了结束标签字面量（注释里也不行）——会提前闭合标签");
  process.exit(1);
}

const base = "file:///" + path.join(ROOT, "src").replace(/\\/g, "/") + "/";
html = html.replace(/(href|src)="(css\/[^"]+|js\/[^"]+)"/g, (m, attr, p) => `${attr}="${base}${p}"`);
html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
html = html.replace("</body>", `  <script>\n${inject}\n  </script>\n</body>`);

const outPath = path.resolve(ROOT, outRel);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");

const rel = (html.match(/(href|src)="(?!file:|data:)/g) || []).length;
console.log(`✓ ${outRel}  注入 ${injectRel}  ${rel === 0 ? "外链全为绝对 file://" : `还有 ${rel} 个相对外链 ✗`}`);
process.exit(rel === 0 ? 0 : 1);
