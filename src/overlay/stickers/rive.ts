/**
 * Rive 动态贴纸（悬浮层版）：画在贴纸内部的 canvas 上，点击时触发角色的 greet。
 * 所有实例共用一个 Rive rAF；静止且无需重绘时退出循环。桌面上动态贴纸超过 2 张时降到 30fps。
 */
import { RuntimeLoader } from "@rive-app/webgl2";
import wasmUrl from "@rive-app/webgl2/rive.wasm?url";
import wasmFallbackUrl from "@rive-app/webgl2/rive_fallback.wasm?url";

RuntimeLoader.setWasmUrl(wasmUrl);
RuntimeLoader.setWasmFallbackUrl(wasmFallbackUrl);

type RiveRuntime = Awaited<ReturnType<typeof RuntimeLoader.awaitInstance>>;
type RiveFile = Awaited<ReturnType<RiveRuntime["load"]>>;
type Frame = (now: number) => void;

const files = new Map<string, { ready: Promise<RiveFile>; users: number }>();
const frames = new Set<Frame>();
let nextFrame = 0;
let instances = 0;

function retain(src: string, runtime: RiveRuntime) {
  let entry = files.get(src);
  if (!entry) {
    const ready = fetch(src).then(async (r) => {
      if (!r.ok) throw new Error(`Rive asset ${r.status}`);
      return runtime.load(new Uint8Array(await r.arrayBuffer()), undefined, false);
    });
    entry = { ready, users: 0 };
    files.set(src, entry);
  }
  const shared = entry;
  shared.users++;
  return {
    ready: shared.ready,
    release() {
      shared.users--;
      void shared.ready.then(
        (file) => {
          if (shared.users || files.get(src) !== shared) return;
          files.delete(src);
          file?.unref();
        },
        () => {
          if (!shared.users && files.get(src) === shared) files.delete(src);
        },
      );
    },
  };
}

function enqueue(runtime: RiveRuntime, draw: Frame) {
  frames.add(draw);
  if (nextFrame) return;
  const run = (now: number) => {
    for (const f of frames) f(now);
    nextFrame = frames.size ? runtime.requestAnimationFrame(run) : 0;
  };
  nextFrame = runtime.requestAnimationFrame(run);
}

export class RiveView {
  readonly canvas = document.createElement("canvas");
  private disposed = false;
  private teardown: (() => void) | null = null;
  private release: (() => void) | null = null;
  private greetFn: (() => void) | null = null;
  private wake: (() => void) | null = null;

  /** onReady：首帧画出后回调（之前显示静态封面） */
  constructor(src: string, private onReady: (ok: boolean) => void) {
    this.canvas.className = "sb-rive";
    void this.setup(src).catch(() => !this.disposed && this.onReady(false));
  }

  private async setup(src: string) {
    const runtime = await RuntimeLoader.awaitInstance();
    if (this.disposed) return;
    const shared = retain(src, runtime);
    this.release = shared.release;
    const file = await shared.ready;
    if (this.disposed) return;
    const artboard = file?.artboardByName("Sticker");
    const def = artboard?.stateMachineByName("Sticker");
    if (!artboard || !def) {
      artboard?.delete();
      this.onReady(false);
      return;
    }
    const machine = new runtime.StateMachineInstance(def, artboard);
    const model = file.defaultArtboardViewModel(artboard)?.defaultInstance();
    if (model) machine.bindViewModelInstance(model);
    const greeting = model?.trigger("greet");
    const canvas = this.canvas;
    const renderer = runtime.makeRenderer(canvas, true);
    const bounds = artboard.bounds;
    instances++;
    let dirty = true;
    let drawn = false;
    let last = 0;
    let frameNo = -1;
    let pendingGreet = false;

    const draw = (now: number) => {
      try {
        const interval = 1000 / (instances > 2 ? 30 : 60);
        const frame = Math.floor((now + 0.75) / interval);
        if (!dirty && frame === frameNo) return;
        frameNo = frame;
        if (pendingGreet) {
          pendingGreet = false;
          greeting?.trigger();
        }
        const seconds = last ? Math.min(0.1, (now - last) / 1000) : 0;
        const changed = machine.advanceAndApply(seconds);
        if (dirty || changed) {
          renderer.clear();
          renderer.save();
          renderer.align(runtime.Fit.contain, runtime.Alignment.center, { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }, bounds);
          artboard.draw(renderer);
          renderer.restore();
          renderer.flush();
          dirty = false;
        }
        last = document.hidden ? 0 : now;
        if (!drawn) {
          drawn = true;
          this.onReady(true);
        }
      } catch {
        this.teardown?.();
        this.teardown = null;
        this.onReady(false);
      }
    };

    let sized = false;
    const resize = () => {
      sized = true;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const h = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      dirty = true;
    };
    const sync = () => {
      if (document.hidden) {
        frames.delete(draw);
        last = 0;
      } else enqueue(runtime, draw);
    };
    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      if (sized) {
        resizeTimer = window.setTimeout(() => {
          resize();
          sync();
        }, 150);
        return;
      }
      resize();
      sync();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    this.greetFn = () => {
      pendingGreet = true;
      sync();
    };
    this.wake = sync;
    this.teardown = () => {
      instances--;
      clearTimeout(resizeTimer);
      frames.delete(draw);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      renderer.delete();
      machine.delete();
      model?.unref();
      artboard.delete();
    };
    resize();
    sync();
  }

  greet() {
    this.greetFn?.();
  }

  resume() {
    this.wake?.();
  }

  dispose() {
    this.disposed = true;
    this.teardown?.();
    this.teardown = null;
    this.release?.();
    this.release = null;
    this.canvas.remove();
  }
}
