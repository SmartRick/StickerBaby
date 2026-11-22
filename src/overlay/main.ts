/**
 * 悬浮层入口（置顶层 `pet` 与桌面层 `pet-desktop` 共用，?layer=floating|desktop）。
 *
 * 图层顺序（由下到上）：
 *   stickers(10, DOM) < scene(20, 恶作剧/爬虫) < fx(30, 粒子/全屏特效) < distort(50, WebGL) < menu(1000)
 * 桌面层只承载取消置顶的贴纸（以及它们的粒子），特效 / 恶作剧 / 扰动都在置顶层。
 */
import "./overlay.css";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAppStore } from "@/lib/store";
import {
  EV,
  type DistortKind,
  type EffectKind,
  type OverlayCommand,
  type OverlayStateSnapshot,
  type PlayOptions,
  type PrankKind,
  type RunningItem,
} from "../shared/protocol";
import type { FxBus, FxFactory } from "./core/fx";
import { CanvasLayer, type FxEntity } from "./core/layer";
import { ParticleSystem } from "./core/particles";
import { type Cursor, Runtime } from "./core/runtime";
import { preloadAssets } from "./core/assets";
import { DistortEngine } from "./distort/engine";
import { EFFECT_FACTORIES } from "./effects";
import { PRANK_FACTORIES } from "./pranks";
import { type LayerKind, StickerLayer } from "./stickers/layer";

const kind: LayerKind = new URLSearchParams(location.search).get("layer") === "desktop" ? "desktop" : "floating";
const top = kind === "floating";
document.title = top ? "贴纸宝宝 Overlay" : "贴纸宝宝 Desktop";

const rt = new Runtime();
const scene = new CanvasLayer(rt, "scene", 20);
const fx = new CanvasLayer(rt, "fx", 30);
const particles = new ParticleSystem(fx);
const stickers = new StickerLayer(rt, particles, kind, 10);
const distort = new DistortEngine(rt, {
  setLayersHidden(hidden) {
    // 截图里已包含贴纸和恶作剧层，扰动期间隐藏它们；fx 层提到扰动画面之上继续实时播放
    // （例如导弹命中：爆炸火球在震屏的同时继续动画）
    const els = [scene.canvas, ...document.querySelectorAll<HTMLElement>(".layer-gl")];
    for (const el of els) el.style.visibility = hidden ? "hidden" : "";
    stickers.root.style.visibility = hidden || !useAppStore.getState().settings.overlayVisible ? "hidden" : "";
    fx.canvas.style.zIndex = hidden ? "60" : "30";
  },
});

// ---------------- 运行中的特效 / 恶作剧 ----------------
type Running<K extends string> = Map<string, { kind: K; entity: FxEntity; layer: CanvasLayer }>;
const pranks: Running<PrankKind> = new Map();
const effects: Running<EffectKind> = new Map();
let seq = 0;

const bus: FxBus = {
  distort: (k, o) => void playDistort(k, o),
  prank: (k, o) => void start(pranks, PRANK_FACTORIES[k], k, scene, o),
  effect: (k, o) => void start(effects, EFFECT_FACTORIES[k], k, fx, o),
};

function start<K extends string>(
  registry: Running<K>,
  factory: FxFactory | undefined,
  k: K,
  layer: CanvasLayer,
  options: PlayOptions = {},
) {
  if (!factory) {
    console.warn(`[overlay] ${k} 尚未实现`);
    return null;
  }
  const id = `${k}-${++seq}`;
  let entity: FxEntity;
  try {
    entity = factory({ rt, layer, particles, options, bus });
  } catch (e) {
    console.error(`[overlay] 创建 ${k} 失败`, e);
    return null;
  }
  // 实体生命周期结束（自然结束或被 stop）时自动从运行表移除
  const origDispose = entity.dispose?.bind(entity);
  entity.dispose = () => {
    try {
      origDispose?.();
    } finally {
      registry.delete(id);
      broadcast();
    }
  };
  registry.set(id, { kind: k, entity, layer });
  layer.add(entity);
  broadcast();
  return id;
}

function stop<K extends string>(registry: Running<K>, id?: string, k?: K) {
  for (const [rid, r] of registry) {
    if ((id && rid === id) || (k && r.kind === k) || (!id && !k)) {
      r.entity.stop();
      r.layer.invalidate();
    }
  }
}

function hardClear() {
  distort.stop();
  for (const r of [...pranks.values(), ...effects.values()]) r.layer.remove(r.entity);
  pranks.clear();
  effects.clear();
  particles.clear();
  rt.hit.releaseAll();
  broadcast();
}

async function playDistort(k: DistortKind, o?: PlayOptions) {
  try {
    const p = distort.play(k, o);
    broadcast();
    await p;
  } catch (e) {
    console.error("[distort]", e);
  } finally {
    broadcast();
  }
}

// ---------------- 状态广播 ----------------
function snapshot(): OverlayStateSnapshot {
  const list = <K extends string>(r: Running<K>): RunningItem<K>[] => [...r].map(([id, v]) => ({ id, kind: v.kind }));
  return { pranks: list(pranks), effects: list(effects), distorting: distort.active };
}

let broadcastQueued = false;
function broadcast() {
  if (!top || broadcastQueued) return;
  broadcastQueued = true;
  queueMicrotask(() => {
    broadcastQueued = false;
    emit(EV.state, snapshot()).catch(() => {});
  });
}

// ---------------- 指令 ----------------
function handle(cmd: OverlayCommand) {
  switch (cmd.type) {
    case "sticker.gesture":
      stickers.gesture(cmd.petId, cmd.gesture);
      return;
    case "sticker.react":
      stickers.react(cmd.petId);
      return;
  }
  if (!top) return;
  switch (cmd.type) {
    case "prank.start":
      bus.prank(cmd.kind, cmd.options);
      break;
    case "prank.stop":
      stop(pranks, cmd.id, cmd.kind);
      break;
    case "effect.play":
      bus.effect(cmd.kind, cmd.options);
      break;
    case "effect.stop":
      stop(effects, cmd.id, cmd.kind);
      break;
    case "distort.play":
      bus.distort(cmd.kind, cmd.options);
      break;
    case "combo.play":
      // 导弹飞入 -> 爆炸 -> 屏幕震荡 -> 裂痕（后两步由导弹特效在命中时通过 bus 触发）
      bus.effect("missile", {
        x: rt.width * (0.3 + Math.random() * 0.4),
        y: rt.height * (0.3 + Math.random() * 0.4),
        ...cmd.options,
      });
      break;
    case "clear.all":
      hardClear();
      break;
    case "state.request":
      broadcast();
      break;
  }
}

async function boot() {
  // 全局 listen 会收到发给任何窗口的事件；光标流必须只收发给本窗口的那一份
  const self = getCurrentWebviewWindow();
  await self.listen<Cursor>(EV.cursor, (e) => rt.pushCursor(e.payload));
  await listen<OverlayCommand>(EV.command, (e) => {
    try {
      handle(e.payload);
    } catch (err) {
      console.error("[overlay] 指令执行失败", e.payload, err);
    }
  });
  await listen(EV.panic, hardClear);
  if (top) await self.listen("sb://activity", () => stickers.activity());
  await preloadAssets();
  broadcast();
}

window.addEventListener("error", (e) => console.error("[overlay]", e.error));
boot();

// 调试入口（devtools / scripts/cdp.mjs 中使用）
Object.assign(window, { __sb: { rt, scene, fx, particles, stickers, distort, handle } });
