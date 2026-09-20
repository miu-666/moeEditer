/**
 * 跑一遍所有回归探针，汇总 PASS / FAIL。
 *
 * 两种探针：
 *   1. .workbuddy/probe-phase-*.html  —— 普通探针，--dump-dom 跑一遍读结果节点
 *   2. 触摸探针（下面 touchProbes）    —— 必须发真实触摸事件，交给 probe-touch.js 跑
 *      合成 PointerEvent 绕过了浏览器的手势仲裁，拖动类问题在它下面永远不复现。
 *
 * 用法：
 *   node tools/run-probes.js            跑全部
 *   node tools/run-probes.js d7 d6      只跑名字里含 d7 / d6 的
 *   node tools/run-probes.js crop       只跑裁剪触摸探针
 *
 * 退出码 = 是否有 FAIL（0 表示全过），可以直接接在别的命令后面。
 *
 * headless 里不保证出合成帧，所以涉及 rAF 的逐帧数学由探针自己手动驱动 ——
 * 这里只负责跑和汇总。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, ".workbuddy");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

// 需要真实触摸的探针。跑法不一样（走 CDP dispatchTouchEvent），所以单独列出来。
// `src` 是断言源码；跑之前会先用 make-probe 重新生成一次探针页，这样改了断言
// 就不用记得手动跑生成那一步。多尺寸的探针两种宽度都要过。
const touchProbes = [
  { file: "probe-crop-touch.html", src: "_crop-touch.js", sizes: [[390, 844]], tag: "crop" },
  { file: "probe-touch-basic.html", src: "_touch-basic.js", sizes: [[390, 844], [1440, 900]], tag: "touch" }
];

const filters = process.argv.slice(2);
const hit = (name, tag) => !filters.length || filters.some((k) => name.includes(k) || (tag || "").includes(k));

const probes = fs
  .readdirSync(DIR)
  .filter((f) => /^probe-phase-.*\.html$/.test(f))
  .filter((f) => hit(f, ""))
  .sort();

if (!probes.length && !touchProbes.some((t) => hit(t.file, t.tag))) {
  console.error("✗ 没找到匹配的探针");
  process.exit(1);
}

let totalPass = 0;
let totalFail = 0;
const failedFiles = [];

for (const name of probes) {
  const abs = path.join(DIR, name);
  const res = spawnSync(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--window-size=1400,900",
      "--virtual-time-budget=6000",
      "--dump-dom",
      "file:///" + abs.replace(/\\/g, "/"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );

  // 结果节点：探针把断言写进 <pre id="probe-out">。注意不能直接 grep
  // PROBE_RESULT_START —— 探针源码里也有这个字面量，会抓到源码而不是结果。
  const m = (res.stdout || "").match(/<pre id="probe-out"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) {
    console.log(`\n✗ ${name} —— 没抓到结果节点（页面可能在探针落地前就挂了）`);
    totalFail++;
    failedFiles.push(name);
    continue;
  }

  const text = m[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

  const pass = (text.match(/^PASS/gm) || []).length;
  const failLines = text.split("\n").filter((l) => l.startsWith("FAIL"));
  const infoLines = text.split("\n").filter((l) => l.startsWith("INFO"));
  totalPass += pass;
  totalFail += failLines.length;

  console.log(`\n${failLines.length ? "✗" : "✓"} ${name}  ${pass} passed, ${failLines.length} failed`);
  failLines.forEach((l) => console.log("   " + l));
  infoLines.forEach((l) => console.log("   " + l));
  if (failLines.length) failedFiles.push(name);
}

// ---- 触摸探针：走 CDP 发真实触摸，跑法跟上面完全不同 ----
let probeCount = probes.length;
for (const tp of touchProbes) {
  if (!hit(tp.file, tp.tag)) continue;

  // 断言源码改了就要重新生成探针页 —— 手工两步太容易只做一步。
  if (tp.src && fs.existsSync(path.join(DIR, tp.src))) {
    spawnSync(process.execPath, [
      path.join(ROOT, "tools", "make-probe.js"),
      ".workbuddy/" + tp.src,
      ".workbuddy/" + tp.file,
      tp.file.replace(/\.html$/, "")
    ], { encoding: "utf8" });
  }

  for (const [w, h] of tp.sizes) {
    probeCount++;

    const res = spawnSync(
      process.execPath,
      [path.join(ROOT, "tools", "probe-touch.js"), ".workbuddy/" + tp.file, String(w), String(h)],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );

    const text = res.stdout || "";
    const m = text.match(/(\d+) passed, (\d+) failed/);

    if (!m) {
      console.log(`\n✗ ${tp.file} @ ${w}x${h}  —— 没跑到结果（真实触摸探针）`);
      text.split("\n").filter((l) => l.trim()).forEach((l) => console.log("   " + l.trim()));
      totalFail++;
      failedFiles.push(tp.file);
      continue;
    }

    const pass = Number(m[1]);
    const fail = Number(m[2]);
    totalPass += pass;
    totalFail += fail;

    console.log(`\n${fail ? "✗" : "✓"} ${tp.file} @ ${w}x${h}  ${pass} passed, ${fail} failed   (真实触摸)`);
    text.split("\n")
      .filter((l) => /^\s+(FAIL|INFO)/.test(l) && !/INFO (事件序列|手势\d)/.test(l))
      .forEach((l) => console.log(l));
    if (fail) failedFiles.push(`${tp.file}@${w}`);
  }
}

console.log("\n" + "=".repeat(60));
console.log(`合计：${totalPass} passed, ${totalFail} failed（${probeCount} 个探针）`);
if (failedFiles.length) console.log("有失败的探针：" + failedFiles.join(", "));

process.exit(totalFail === 0 ? 0 : 1);
