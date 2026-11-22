// 开发调试：通过 WebView2 远程调试端口在指定页面执行 JS。
// 启动应用前设置 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
// 用法：node scripts/cdp.mjs overlay "__sb.handle({type:'effect.play',kind:'fireworks'})"
const [, , page = "overlay", expr = "1+1"] = process.argv;
const port = process.env.CDP_PORT ?? 9222;

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const t = targets.find((x) => x.type === "page" && x.url.includes(page));
if (!t) {
  console.error("targets:", targets.map((x) => x.url));
  process.exit(1);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg);
  else if (msg.method === "Runtime.consoleAPICalled")
    logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  else if (msg.method === "Runtime.exceptionThrown") logs.push("[exception] " + JSON.stringify(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await send("Runtime.enable");
const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
await new Promise((r) => setTimeout(r, Number(process.env.CDP_WAIT ?? 300)));
console.log(JSON.stringify(res.result?.result?.value ?? res.result?.exceptionDetails ?? res.result, null, 0));
if (logs.length) console.log(logs.join("\n"));
ws.close();
