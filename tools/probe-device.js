/**
 * 用真机尺寸跑探针（CDP 设备模拟）。
 *
 * 为什么要这个：Edge 的 --window-size 有窗口最小宽度限制（实测约 490px），
 * 390 宽的 iPhone 尺寸根本给不到 —— 传 390 拿到的是 492。用 CDP 的
 * Emulation.setDeviceMetricsOverride 才能真正把视口设成任意尺寸，
 * 也才能模拟 mobile 的 meta viewport 行为。
 *
 * 用法：
 *   node tools/probe-device.js                                 默认 390×844 + 探针
 *   node tools/probe-device.js probes/probe-phase-mobile.html 768 1024
 *   node tools/probe-device.js <探针> 390 844 截图.png          顺便存一张截图
 *
 * 退出码：探针有没有 FAIL（0 = 全过）。
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const PROFILE = path.join(ROOT, ".cdp-profile");

const argv = process.argv.slice(2);
const probeRel = argv[0] || "probes/probe-phase-mobile.html";
const width = Number(argv[1]) || 390;
const height = Number(argv[2]) || 844;
const shotRel = argv[3] || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fileUrl(rel) {
  return "file:///" + path.resolve(ROOT, rel).replace(/\\/g, "/");
}

async function findPageTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (err) {
      // 端口还没起来，继续等
    }
    await sleep(150);
  }
  throw new Error("CDP 端口没起来");
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    const pending = new Map();

    ws.addEventListener("open", () => {
      resolve({
        send(method, params) {
          return new Promise((res) => {
            const id = ++seq;
            pending.set(id, res);
            ws.send(JSON.stringify({ id, method, params: params || {} }));
          });
        },
        close() {
          try { ws.close(); } catch (err) { /* 已经关了 */ }
        }
      });
    });

    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    });

    ws.addEventListener("error", reject);
  });
}

async function main() {
  fs.mkdirSync(PROFILE, { recursive: true });

  const browser = spawn(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
    // 独立 profile：否则会连到你正在用的那个 Edge 实例上
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank"
  ], { stdio: "ignore" });

  let cdp = null;
  let code = 1;

  try {
    cdp = await connect(await findPageTarget());

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 820
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: width < 820, maxTouchPoints: 5 });

    // 开跑前清掉 file:// 源的 localStorage，否则上一次探针留下的元素会叠在画布上
    try {
      await cdp.send("Storage.clearDataForOrigin", { origin: "file://", storageTypes: "local_storage" });
    } catch (err) {
      // 清不掉不致命
    }

    await cdp.send("Page.navigate", { url: fileUrl(probeRel) });

    // 探针要把结果写进 <pre id="probe-out">，轮询到它出现为止。
    let text = "";
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      const r = await cdp.send("Runtime.evaluate", {
        expression: "var n=document.getElementById('probe-out'); n ? n.textContent : ''",
        returnByValue: true
      });
      const value = r.result && r.result.result && r.result.result.value;
      if (value && /(PASS|FAIL)\s/.test(value)) { text = value; break; }
    }

    if (!text) {
      console.log(`✗ ${probeRel} @ ${width}x${height} —— 没抓到结果节点（页面可能在探针落地前就挂了）`);
    } else {
      const pass = (text.match(/^PASS/gm) || []).length;
      const fails = text.split("\n").filter((l) => l.startsWith("FAIL"));
      const infos = text.split("\n").filter((l) => l.startsWith("INFO"));

      console.log(`\n${fails.length ? "✗" : "✓"} ${probeRel} @ ${width}x${height}  ${pass} passed, ${fails.length} failed`);
      infos.forEach((l) => console.log("   " + l));
      fails.forEach((l) => console.log("   " + l));
      code = fails.length ? 1 : 0;
    }

    if (shotRel) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      const data = shot.result && shot.result.data;
      if (data) {
        fs.writeFileSync(path.resolve(ROOT, shotRel), Buffer.from(data, "base64"));
        console.log(`   screenshot -> ${shotRel}`);
      }
    }
  } catch (err) {
    console.log("✗ 出错了：" + err.message);
  } finally {
    if (cdp) cdp.close();
    browser.kill();
  }

  process.exit(code);
}

main();
