/**
 * 用**真实触摸事件**跑探针（CDP Input.dispatchTouchEvent）。
 *
 * 为什么不能只用合成事件：`new PointerEvent(...)` + dispatchEvent 直接跳到页面
 * 的事件处理器，完全绕过了浏览器的手势仲裁。而移动端"拖不动"绝大多数时候
 * 正是栽在仲裁上 —— touch-action 没允许、滚动容器抢走手势、浏览器发
 * pointercancel 把拖动打断。这些问题在合成事件下**永远不会复现**，探针会
 * 一路全绿，真机上却纹丝不动。
 *
 * dispatchTouchEvent 走的是浏览器的真实输入管线：会做手势识别、会遵守
 * touch-action、该发 pointercancel 时就发。所以它才测得出这类问题。
 *
 * 页面侧约定（写在探针里）：
 *   window.__READY__           = true       —— 前置状态就绪，可以开始发触摸了
 *   window.__GESTURES__        = [{x, y, dx, dy, steps}]  —— 依次执行的手势。
 *                                每个手势开始前会重新读一次，所以页面可以中途改坐标。
 *   window.__betweenGestures__ = function(i){}  —— 第 i 个手势开跑前的回调（可选）。
 *                                用来在两个手势之间换场景。
 *   window.__afterGestures__   = function(){}  —— 全部手势跑完的回调，在这里算结论、
 *                                                写 #probe-out
 *   #probe-out                 —— 结果节点，本工具读它
 *
 * 用法：
 *   node tools/probe-touch.js probes/probe-crop-touch.html 390 844 [截图.png]
 *
 * 退出码：探针有没有 FAIL（0 = 全过）。
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9334;
const PROFILE = path.join(ROOT, ".cdp-profile-touch");

const argv = process.argv.slice(2);
const probeRel = argv[0] || "probes/probe-crop-touch.html";
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
      // 端口还没起来
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

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    // 页面里抛异常时，把异常正文带回来 —— 否则只能看到一个 undefined
    includeCommandLineAPI: false
  });
  const res = r.result || {};
  if (res.exceptionDetails) {
    const d = res.exceptionDetails;
    const text = (d.exception && (d.exception.description || d.exception.value)) || d.text;
    throw new Error("页面内执行出错: " + text);
  }
  return res.result ? res.result.value : undefined;
}

// 触摸点：id 全程不变，浏览器才认得出这是"同一根手指在移动"。
function point(x, y) {
  return { x: Math.round(x), y: Math.round(y), id: 1, radiusX: 12, radiusY: 12, force: 1 };
}

async function runGesture(cdp, g) {
  const steps = g.steps || 8;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(g.x, g.y)] });

  for (let i = 1; i <= steps; i++) {
    await sleep(24);
    const t = i / steps;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(g.x + (g.dx || 0) * t, g.y + (g.dy || 0) * t)]
    });
  }

  await sleep(24);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(80);
}

/**
 * 逼出一帧。
 *
 * 无头环境基本不出合成帧，而**触摸滚动是合成器做的**：滚动确实发生了，
 * 但主线程要等下一次提交才知道新的 scrollTop（并派发 scroll 事件）。没有帧，
 * 页面读到的 scrollTop 永远是 0、scroll 事件一次也不来 —— 于是"手指一滑，
 * 页面滚了没有"这件事在无头里根本量不到，看起来像产品滚动坏了。
 *
 * 截图是强制产生一帧最省的办法。这里不看图，只是借它把合成器的状态推给主线程。
 */
async function forceFrame(cdp) {
  try {
    await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 10 });
    await sleep(40);
  } catch (err) {
    // 逼帧失败不致命，只是滚动量会读成 0
  }
}

async function main() {
  fs.mkdirSync(PROFILE, { recursive: true });
  const browser = spawn(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
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
      mobile: true
    });
    // 不开这个，dispatchTouchEvent 发出去的事件不会生成对应的 pointer 事件
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

    // 开跑前清掉 file:// 源的 localStorage。不清的话，上一次运行里探针建的元素
    // 会被 saveState 存下来，下次跑就叠在画布上 —— 表现是"画布里冒出一堆不属于
    // 本次探针的元素"，很容易误判成产品 bug。
    try {
      await cdp.send("Storage.clearDataForOrigin", { origin: "file://", storageTypes: "local_storage" });
    } catch (err) {
      // 清不掉不致命，探针自己也会重置状态
    }

    await cdp.send("Page.navigate", { url: fileUrl(probeRel) });

    let ready = false;
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      if (await evaluate(cdp, "window.__READY__ === true")) { ready = true; break; }
    }

    if (!ready) {
      console.log(`✗ ${probeRel} @ ${width}x${height} —— 没等到 __READY__（探针准备阶段就挂了）`);
    } else {
      const count = Number(await evaluate(cdp, "(window.__GESTURES__ || []).length")) || 0;
      console.log(`  发 ${count} 个真实触摸手势 @ ${width}x${height}`);

      for (let i = 0; i < count; i++) {
        // 允许页面在两个手势之间改状态（比如把框缩小，换成"图片比框大"的场景），
        // 顺便改掉下一个手势的起点 —— 所以每步都重新读一次坐标，不一次性缓存。
        if (i > 0) await evaluate(cdp, `window.__betweenGestures__ && window.__betweenGestures__(${i})`);

        const g = JSON.parse(await evaluate(cdp, `JSON.stringify((window.__GESTURES__ || [])[${i}] || null)`) || "null");
        if (!g) break;
        await runGesture(cdp, g);
        await forceFrame(cdp);
      }

      await evaluate(cdp, "window.__afterGestures__ && window.__afterGestures__()");
      await sleep(120);

      const text = (await evaluate(cdp, "var n=document.getElementById('probe-out'); n ? n.textContent : ''")) || "";

      if (!/(PASS|FAIL|INFO)\s/.test(text)) {
        const dbg = await evaluate(cdp, `JSON.stringify({
          ready: window.__READY__ === true,
          hasAfter: typeof window.__afterGestures__,
          gestures: (window.__GESTURES__ || []).length,
          lastChild: document.body.lastElementChild
            ? (document.body.lastElementChild.id || document.body.lastElementChild.className)
            : "(none)"
        })`);
        console.log(`✗ ${probeRel} —— 没抓到结果节点`);
        console.log("   诊断: " + dbg);
      } else {
        const pass = (text.match(/^PASS/gm) || []).length;
        const fails = text.split("\n").filter((l) => l.startsWith("FAIL"));
        const infos = text.split("\n").filter((l) => l.startsWith("INFO"));

        console.log(`\n${fails.length ? "✗" : "✓"} ${probeRel} @ ${width}x${height}  ${pass} passed, ${fails.length} failed`);
        infos.forEach((l) => console.log("   " + l));
        fails.forEach((l) => console.log("   " + l));
        code = fails.length ? 1 : 0;
      }
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
