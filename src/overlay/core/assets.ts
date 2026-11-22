/**
 * 图集加载（public/assets/<name>.webp + .json，由 scripts/build_assets.py 生成）。
 *
 * 悬浮层启动时 preloadAssets() 预加载全部图集，工厂函数是同步的，可直接用 atlas(name)
 * 取已加载的图集；极端情况下尚未加载完成时返回 null，实体应跳过绘制而不是报错。
 */

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Atlas {
  constructor(
    readonly name: string,
    readonly image: HTMLImageElement,
    readonly frames: Frame[],
  ) {}

  get count() {
    return this.frames.length;
  }

  frame(i: number): Frame {
    return this.frames[((i % this.frames.length) + this.frames.length) % this.frames.length];
  }

  /** 以 (x, y) 为中心绘制第 i 帧；只给 w 时按比例算高 */
  draw(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, w?: number, h?: number) {
    const f = this.frame(i);
    const dw = w ?? f.w;
    const dh = h ?? (w !== undefined ? (dw * f.h) / f.w : f.h);
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h, x - dw / 2, y - dh / 2, dw, dh);
  }

  /** 以帧内锚点 (ax, ay ∈ 0..1) 为原点绘制，用于骨骼部件（例如腿根部在 0.5, 0） */
  drawAnchored(
    ctx: CanvasRenderingContext2D,
    i: number,
    ax: number,
    ay: number,
    scale = 1,
  ) {
    const f = this.frame(i);
    const w = f.w * scale;
    const h = f.h * scale;
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h, -ax * w, -ay * h, w, h);
  }

  /** 单帧导出为独立 canvas（缓存），用于 pattern / 像素读取 / 作为粒子精灵 */
  canvas(i: number, size?: number): HTMLCanvasElement {
    const key = `${i}|${size ?? 0}`;
    let c = this.canvasCache.get(key);
    if (!c) {
      const f = this.frame(i);
      c = document.createElement("canvas");
      if (size) {
        // 等比缩放后居中到正方形画布
        c.width = c.height = size;
        const s = size / Math.max(f.w, f.h);
        const w = f.w * s;
        const h = f.h * s;
        c.getContext("2d")!.drawImage(this.image, f.x, f.y, f.w, f.h, (size - w) / 2, (size - h) / 2, w, h);
      } else {
        c.width = f.w;
        c.height = f.h;
        c.getContext("2d")!.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      }
      this.canvasCache.set(key, c);
    }
    return c;
  }

  private canvasCache = new Map<string, HTMLCanvasElement>();
}

export const ATLAS_NAMES = [
  "coin_spin",
  "coin_star",
  "hearts",
  "ingots",
  "particles",
  "emoji3d",
  "blood",
  "ghosts",
  "hacker",
  "scrawl",
  "roach_parts",
  "roach2_parts",
  "fly_parts",
  "crack_a",
  "crack_b",
  "crack_c",
  "crack_d",
  "shatter_a",
  "ultraman_fist",
  "ultraman_fly",
  "butterfly",
  "fish",
  "banknotes",
  "panda",
  "roach_body",
] as const;
export type AtlasName = (typeof ATLAS_NAMES)[number];

const loaded = new Map<string, Atlas>();
const pending = new Map<string, Promise<Atlas>>();

export function loadAtlas(name: AtlasName): Promise<Atlas> {
  const hit = loaded.get(name);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(name);
  if (!p) {
    p = (async () => {
      const meta = (await (await fetch(`/assets/${name}.json`)).json()) as { image: string; frames: Frame[] };
      const img = new Image();
      img.decoding = "async";
      img.src = `/assets/${meta.image}`;
      await img.decode();
      const a = new Atlas(name, img, meta.frames);
      loaded.set(name, a);
      return a;
    })();
    pending.set(name, p);
  }
  return p;
}

/** 同步获取已加载的图集；未加载时触发加载并返回 null */
export function atlas(name: AtlasName): Atlas | null {
  const a = loaded.get(name);
  if (!a) void loadAtlas(name).catch((e) => console.error(`[assets] ${name}`, e));
  return a ?? null;
}

export async function preloadAssets() {
  const t = performance.now();
  const res = await Promise.allSettled(ATLAS_NAMES.map(loadAtlas));
  res.forEach((r, i) => r.status === "rejected" && console.error(`[assets] ${ATLAS_NAMES[i]}`, r.reason));
  console.info(`[assets] ${ATLAS_NAMES.length} atlases in ${Math.round(performance.now() - t)}ms`);
}
