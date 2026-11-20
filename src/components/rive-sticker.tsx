import { useEffect, useRef, useState, type ReactNode } from "react";
import { RuntimeLoader } from "@rive-app/webgl2";
import wasmUrl from "@rive-app/webgl2/rive.wasm?url";
import wasmFallbackUrl from "@rive-app/webgl2/rive_fallback.wasm?url";

RuntimeLoader.setWasmUrl(wasmUrl);
RuntimeLoader.setWasmFallbackUrl(wasmFallbackUrl);

type Runtime = Awaited<ReturnType<typeof RuntimeLoader.awaitInstance>>;
type RiveFile = Awaited<ReturnType<Runtime["load"]>>;
type RenderFrame = (now: number) => void;

const files = new Map<string, { ready: Promise<RiveFile>; users: number }>();
const frames = new Set<RenderFrame>();
let nextFrame = 0;
let desktopInstances = 0;

function retainFile(src: string, runtime: Runtime) {
  let entry = files.get(src);
  if (!entry) {
    const ready = fetch(src).then(async (response) => {
      if (!response.ok) throw new Error(`Rive asset returned ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return runtime.load(bytes, undefined, false);
    });
    entry = { ready, users: 0 };
    files.set(src, entry);
  }
  const shared = entry;
  shared.users += 1;
  return {
    ready: shared.ready,
    release: () => {
      shared.users -= 1;
      void shared.ready.then(
        (file) => {
          if (shared.users || files.get(src) !== shared) return;
          files.delete(src);
          file?.unref();
        },
        () => {
          if (!shared.users && files.get(src) === shared) files.delete(src);
        }
      );
    },
  };
}

function enqueue(runtime: Runtime, draw: RenderFrame) {
  frames.add(draw);
  if (nextFrame) return;
  const run = (now: number) => {
    for (const frame of frames) frame(now);
    nextFrame = frames.size ? runtime.requestAnimationFrame(run) : 0;
  };
  nextFrame = runtime.requestAnimationFrame(run);
}

interface RiveStickerProps {
  src: string;
  name: string;
  className?: string;
  poster: ReactNode;
  paused: boolean;
  greet: number;
  desktop: boolean;
}

export default function RiveSticker({ src, name, className, poster, paused, greet, desktop }: RiveStickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const refreshPlayback = useRef<(() => void) | null>(null);
  const behavior = useRef({ paused, greet });
  const greeted = useRef(greet);
  const [ready, setReady] = useState(false);
  behavior.current = { paused, greet };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let releaseFile: (() => void) | undefined;
    let teardown: (() => void) | undefined;

    const setup = async () => {
      const runtime = await RuntimeLoader.awaitInstance();
      if (disposed) return;
      const shared = retainFile(src, runtime);
      releaseFile = shared.release;
      const file = await shared.ready;
      if (disposed) return;

      const artboard = file?.artboardByName("Sticker");
      const definition = artboard?.stateMachineByName("Sticker");
      if (!artboard || !definition) {
        artboard?.delete();
        return;
      }
      const machine = new runtime.StateMachineInstance(definition, artboard);
      const model = file.defaultArtboardViewModel(artboard)?.defaultInstance();
      if (model) machine.bindViewModelInstance(model);
      const greeting = model?.trigger("greet");
      const renderer = runtime.makeRenderer(canvas, true);
      const bounds = artboard.bounds;
      if (desktop) desktopInstances += 1;
      let running = false;
      let dirty = true;
      let drawn = false;
      let last = 0;
      let frameNumber = -1;

      const drawFrame = (now: number) => {
        const interval = 1000 / (desktop && desktopInstances > 2 ? 30 : 60);
        // Batch canvas changes so the transparent overlay can composite them together.
        const frame = Math.floor((now + 0.75) / interval);
        if (!dirty && frame === frameNumber) return;
        frameNumber = frame;
        if (running && greeted.current !== behavior.current.greet) {
          greeted.current = behavior.current.greet;
          greeting?.trigger();
        }
        const seconds = running && last ? Math.min(0.1, (now - last) / 1000) : 0;
        const changed = machine.advanceAndApply(seconds);
        if (dirty || changed) {
          renderer.clear();
          renderer.save();
          renderer.align(runtime.Fit.contain, runtime.Alignment.center, {
            minX: 0,
            minY: 0,
            maxX: canvas.width,
            maxY: canvas.height,
          }, bounds);
          artboard.draw(renderer);
          renderer.restore();
          renderer.flush();
          dirty = false;
        }

        if (running) {
          last = now;
        } else {
          frames.delete(draw);
          last = 0;
        }
        if (!drawn) {
          drawn = true;
          setReady(true);
        }
      };

      const draw = (now: number) => {
        try {
          drawFrame(now);
        } catch {
          teardown?.();
          teardown = undefined;
          setReady(false);
        }
      };

      const resize = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, desktop ? 1.25 : 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
        dirty = true;
        if (!document.hidden) enqueue(runtime, draw);
      };

      const sync = () => {
        const active = !behavior.current.paused && !document.hidden;
        if (!active) last = 0;
        running = active;
        if (document.hidden || (!running && !dirty)) {
          frames.delete(draw);
        } else {
          enqueue(runtime, draw);
        }
      };

      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      window.addEventListener("resize", resize);
      document.addEventListener("visibilitychange", sync);
      refreshPlayback.current = sync;
      teardown = () => {
        if (desktop) desktopInstances -= 1;
        refreshPlayback.current = null;
        frames.delete(draw);
        observer.disconnect();
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", sync);
        renderer.delete();
        machine.delete();
        model?.unref();
        artboard.delete();
      };
      resize();
      sync();
    };

    void setup().catch(() => {
      if (!disposed) setReady(false);
    });
    return () => {
      disposed = true;
      teardown?.();
      releaseFile?.();
    };
  }, [desktop, src]);

  useEffect(() => {
    refreshPlayback.current?.();
  }, [greet, paused]);

  return (
    <div className={className} role="img" aria-label={name}>
      <div className="relative h-full w-full">
        {!ready && <div className="absolute inset-0" aria-hidden>{poster}</div>}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 block h-full w-full"
          style={{ visibility: ready ? "visible" : "hidden" }}
          aria-hidden
        />
      </div>
    </div>
  );
}
