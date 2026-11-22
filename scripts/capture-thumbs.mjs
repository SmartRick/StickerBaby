// 生成玩法卡片缩略图：在无头 Chrome 里打开悬浮层页面（Tauri 接口打桩、截屏用一张壁纸代替），
// 逐个播放玩法并截一帧，保存到 src/assets/playables/<engine>-<kind>.webp。
// 先启动 `pnpm dev`，再运行：node scripts/capture-thumbs.mjs [id 前缀过滤...]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9341;
const W = 960;
const H = 540;
const OUT = new URL("../src/assets/playables/", import.meta.url);
const filters = process.argv.slice(2);

// [engine, kind, 截图前等待 ms, 鼠标轨迹?]
const ITEMS = [
  ["effect", "fireworks", 3000], ["effect", "confetti", 1300], ["effect", "heart-rain", 1800], ["effect", "magic", 1400],
  ["effect", "coin-rain", 1600], ["effect", "money-rain", 1800], ["effect", "money-burst", 1200], ["effect", "money-gun", 1300],
  ["effect", "ingot-rain", 1600], ["effect", "snow", 6000], ["effect", "rain", 3500], ["effect", "thunderstorm", 3200],
  ["effect", "sakura", 6000], ["effect", "fireflies", 5000], ["effect", "meteor-shower", 2400], ["effect", "fire", 3000],
  ["effect", "flood", 4000, true], ["effect", "freeze", 3000, true], ["effect", "sandstorm", 3000], ["effect", "ripple", 1500, true],
  ["effect", "ultraman", 1400], ["effect", "ultraman-tiga", 1400], ["effect", "missile", 1300], ["combo", "missile-strike", 2600],
  ["effect", "smoke", 1700], ["prank", "goldfish", 2500], ["prank", "butterfly", 2500],
  ["prank", "crack", 1500], ["prank", "shatter", 1200], ["prank", "stain", 1200], ["prank", "glitch-screen", 1000],
  ["prank", "graffiti", 3000], ["prank", "tape", 1800], ["prank", "error-popups", 2600], ["prank", "panda-virus", 4500],
  ["effect", "hacker", 2600], ["effect", "tv-static", 700],
  ["prank", "cockroach", 2500], ["prank", "centipede", 2500], ["prank", "millipede", 2500], ["prank", "maggot", 2500],
  ["prank", "gecko", 2500], ["prank", "fly", 2500], ["prank", "ant", 3500],
  ["prank", "horror-blood", 4500], ["prank", "horror-eyes", 2200, true], ["prank", "horror-hands", 2800],
  ["prank", "horror-ghost", 2500], ["prank", "horror-scrawl", 3500],
  ...["shake", "explosion-shake", "sway", "bob", "tilt", "wave", "bulge", "stretch", "swirl", "rgb-shift", "tear", "noise",
    "flash", "digital-glitch", "flip", "color-shift", "blur"].map((k) => ["distort", k, 1100, k === "bulge"]),
];

const STUB = `
(() => {
  let cb = 0;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "pet" }, currentWebview: { label: "pet", windowLabel: "pet" } },
    transformCallback(fn) { const id = ++cb; window["_" + id] = fn; return id; },
    unregisterCallback() {},
    convertFileSrc: (s) => s,
    async invoke(cmd) {
      if (cmd === "capture_screen") return window.__fakeCapture();
      if (cmd === "desktop_foreground") return true;
      if (cmd === "desktop_icons") return true;
      if (cmd === "list_created_stickers") return [];
      return null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  localStorage.setItem("deskpet-state-v1", JSON.stringify({ version: 1, state: { pets: [], onboarded: true, settings: { overlayVisible: false } } }));
  const wall = "/src/assets/rooms/room-2.webp";
  // 壁纸压暗一些，烟花、萤火虫这类亮色特效更清楚
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "html,body{background:linear-gradient(rgba(12,22,44,.42),rgba(12,22,44,.42)),url(" + wall + ") center/cover no-repeat !important}";
    document.head.appendChild(style);
  });
  // 屏幕扰动的“截屏”：把壁纸画成 BGRA
  window.__fakeCapture = async () => {
    const img = new Image(); img.src = wall; await img.decode();
    const w = innerWidth, h = innerHeight;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    const s = Math.max(w / img.width, h / img.height);
    g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    g.fillStyle = "rgba(12,22,44,.42)"; g.fillRect(0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(8 + px.length);
    const dv = new DataView(out.buffer); dv.setUint32(0, w, true); dv.setUint32(4, h, true);
    for (let i = 0; i < px.length; i += 4) { out[8+i] = px[i+2]; out[9+i] = px[i+1]; out[10+i] = px[i]; out[11+i] = 255; }
    return out.buffer;
  };
})();
`;

const profile = join(tmpdir(), `sb-thumbs-${Date.now()}`);
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, `--user-data-dir=${profile}`,
  "--force-device-scale-factor=1", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    if (targets.some((t) => t.type === "page")) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  else if (msg.method === "Runtime.exceptionThrown") console.warn("[page]", msg.params.exceptionDetails.exception?.description?.slice(0, 200));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
await send("Page.navigate", { url: "http://localhost:1420/overlay.html?layer=floating" });
for (let i = 0; i < 100 && !(await run("!!window.__sb && !!document.querySelector('canvas')")); i++) await sleep(200);
await sleep(2500); // 等图集预加载

mkdirSync(OUT, { recursive: true });
for (const [engine, kind, wait, mouse] of ITEMS) {
  const key = `${engine}-${kind}`;
  if (filters.length && !filters.some((f) => key.startsWith(f))) continue;
  await run(`__sb.handle({type:'clear.all'})`);
  await sleep(300);
  const cmd =
    engine === "effect" ? `{type:'effect.play',kind:'${kind}',options:{intensity:1}}` :
    engine === "prank" ? `{type:'prank.start',kind:'${kind}',options:{intensity:1${kind === "ant" ? "" : ",count:6"}}}` :
    engine === "distort" ? `{type:'distort.play',kind:'${kind}',options:{intensity:1}}` :
    `{type:'combo.play',kind:'${kind}',options:{x:${W / 2},y:${H / 2}}}`;
  // 鼠标轨迹：在画面中部画圈（水波、融冰、眼睛跟随、局部弯曲）
  const trail = mouse
    ? `(()=>{let t=0;const h=setInterval(()=>{t+=0.12;__sb.rt.pushCursor({x:${W / 2}+Math.cos(t)*220,y:${H / 2}+Math.sin(t*1.3)*120,down:false,inside:true});if(t>40)clearInterval(h)},30)})()`
    : `__sb.rt.pushCursor({x:${W * 0.62},y:${H * 0.55},down:false,inside:true})`;
  await run(`${trail}; __sb.handle(${cmd}); 1`);
  await sleep(wait);
  const shot = await send("Page.captureScreenshot", { format: "webp", quality: 72, clip: { x: 0, y: 0, width: W, height: H, scale: 0.4 } });
  writeFileSync(new URL(`${key}.webp`, OUT), Buffer.from(shot.result.data, "base64"));
  console.log("ok", key);
}

ws.close();
chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch {}
