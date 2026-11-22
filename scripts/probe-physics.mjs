// 调试：在悬浮层里切到指定模式，等刚体静止后统计贴纸之间的重叠（按刚体实际碰撞形状）。
// node scripts/probe-physics.mjs gravity
const mode = process.argv[2] ?? "gravity";
const expr = `(async () => {
  const { useAppStore } = await import('/src/lib/store.ts');
  const st = useAppStore.getState();
  st.setSettings({ stickerMode: '${mode}', overlayVisible: true, passthrough: false });
  // 撒到上半屏，让它们一起落下
  useAppStore.setState((s) => ({ pets: s.pets.map((p, i) => ({ ...p, layer: 'floating', passthrough: false, x: 0.35 + (i % 4) * 0.08, y: 0.15 + Math.floor(i / 4) * 0.15, angle: 0 })) }));
  await new Promise((r) => setTimeout(r, 5000));
  const layer = __sb.stickers;
  const world = layer.world;
  if (!world) return 'no world';
  const Matter = (await import('/node_modules/.vite/deps/matter-js.js')).default;
  const entries = [...world.entries.values()];
  const out = { bodies: entries.length, mask: entries.map((e) => e.body.collisionFilter.mask), parts: entries.map((e) => e.body.parts.length - 1), overlaps: [] };
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      let depth = 0;
      for (const a of entries[i].body.parts.slice(entries[i].body.parts.length > 1 ? 1 : 0))
        for (const b of entries[j].body.parts.slice(entries[j].body.parts.length > 1 ? 1 : 0)) {
          const c = Matter.Collision.collides(a, b);
          if (c && c.collided) depth = Math.max(depth, c.depth);
        }
      if (depth > 1) out.overlaps.push([entries[i].spec.id.slice(-4), entries[j].spec.id.slice(-4), Math.round(depth)]);
    }
  out.sleeping = entries.map((e) => e.body.isSleeping);
  out.ys = entries.map((e) => Math.round(e.body.position.y));
  return JSON.stringify(out);
})()`;
const port = process.env.CDP_PORT ?? 9222;
const t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((x) => x.url.includes("layer=floating"));
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id === 1) {
    console.log(msg.result?.result?.value ?? JSON.stringify(msg.result).slice(0, 500));
    ws.close();
  }
};
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } }));
