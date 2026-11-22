/**
 * 玻璃类恶作剧：屏幕裂痕 / 屏幕破碎。
 * - 裂痕：以美术裂痕图为主（crack_a~d，随机旋转缩放），少量程序化裂痕作为变体
 * - 破碎：程序化碎片 + 中心蛛网裂痕图，或整屏手机碎屏图（shatter_a）
 * 一次性预渲染到离屏 canvas（白色裂纹 + 偏移的暗色阴影，保证在亮/暗背景上都可见），
 * 出现动画用圆形裁剪“扩散”，之后完全静止。
 */
import { atlas, type Atlas, type AtlasName } from "../core/assets";
import type { FxContext } from "../core/fx";
import { easeOutCubic, offscreen, pick, rand, randInt } from "../core/layer";
import { PrankBase, TAU, posOr } from "./base";

/** 裂痕图：图集名 + 撞击中心在图中的相对位置（由 alpha 密度峰值测得） */
const CRACK_IMAGES: [AtlasName, number, number][] = [
  ["crack_a", 0.582, 0.56],
  ["crack_b", 0.505, 0.493],
  ["crack_c", 0.6, 0.525],
  ["crack_d", 0.584, 0.563],
];

const darkCache = new Map<string, HTMLCanvasElement>();
/** 裂纹图的暗色版本（阴影） */
function darkVersion(a: Atlas): HTMLCanvasElement {
  let c = darkCache.get(a.name);
  if (!c) {
    const src = a.canvas(0);
    c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d")!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgba(10,12,18,0.75)";
    g.fillRect(0, 0, c.width, c.height);
    darkCache.set(a.name, c);
  }
  return c;
}

/** 在 g 的当前变换下，以 (ax, ay) 为锚点绘制裂纹图：暗影 + 白色裂纹 */
function stampCrackImage(g: CanvasRenderingContext2D, a: Atlas, ax: number, ay: number, scale: number, whiteAlpha = 1) {
  const f = a.frame(0);
  const w = f.w * scale;
  const h = f.h * scale;
  const x = -ax * w;
  const y = -ay * h;
  g.save();
  g.globalAlpha = 0.9;
  g.drawImage(darkVersion(a), x + 1.4, y + 1.6, w, h);
  g.globalAlpha = whiteAlpha;
  g.drawImage(a.canvas(0), x, y, w, h);
  g.restore();
}

/** 撞击瞬间的玻璃碎屑 */
function glassChips(ctx: FxContext, x: number, y: number, n = 14) {
  ctx.particles.emit(x, y, {
    kind: "confetti",
    color: "#e9f3ff",
    count: n,
    angle: [0, TAU],
    speed: [160, 520],
    size: [3, 8],
    sizeEnd: 0.8,
    life: [0.45, 0.9],
    gravity: 1100,
    drag: 0.6,
    spin: [-14, 14],
    flip: true,
  });
}

function impactFlash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  if (k <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.85 * k})`);
  g.addColorStop(0.35, `rgba(235,245,255,${0.35 * k})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

type Pt = [number, number];
interface Line {
  pts: Pt[];
  w: number;
}

/** 生成一条锯齿裂纹折线（相对原点），沿途可能分叉 */
function jaggedLine(
  x: number,
  y: number,
  base: number,
  len: number,
  w: number,
  out: Line[],
  depth: number,
  R: number,
): Pt[] {
  const pts: Pt[] = [[x, y]];
  let a = base;
  let d = 0;
  while (d < len) {
    const step = rand(5, 15);
    a += rand(-0.25, 0.25);
    a = base + Math.max(-0.4, Math.min(0.4, a - base));
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    d += step;
    pts.push([x, y]);
    if (depth > 0 && d > len * 0.15 && Math.random() < 0.1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      jaggedLine(x, y, a + side * rand(0.4, 0.95), (len - d) * rand(0.25, 0.6), w * 0.6, out, depth - 1, R);
    }
  }
  out.push({ pts, w });
  return pts;
}

/** 折线上距原点约 r 的点 */
function pointAtRadius(pts: Pt[], r: number): Pt | null {
  for (const p of pts) if (Math.hypot(p[0], p[1]) >= r) return p;
  return null;
}

function strokeLines(g: CanvasRenderingContext2D, lines: Line[]) {
  g.lineJoin = "round";
  g.lineCap = "round";
  const path = (l: Line) => {
    g.beginPath();
    g.moveTo(l.pts[0][0], l.pts[0][1]);
    for (let i = 1; i < l.pts.length; i++) g.lineTo(l.pts[i][0], l.pts[i][1]);
  };
  // 1) 折射光晕  2) 暗面阴影  3) 高光
  for (const l of lines) {
    path(l);
    g.strokeStyle = "rgba(220,235,255,0.07)";
    g.lineWidth = l.w * 5;
    g.stroke();
  }
  g.save();
  g.translate(0.9, 0.9);
  for (const l of lines) {
    path(l);
    g.strokeStyle = "rgba(0,0,0,0.38)";
    g.lineWidth = l.w + 1;
    g.stroke();
  }
  g.restore();
  for (const l of lines) {
    path(l);
    g.strokeStyle = "rgba(255,255,255,0.88)";
    g.lineWidth = Math.max(0.6, l.w * 0.65);
    g.stroke();
  }
}

function impactCenter(g: CanvasRenderingContext2D, r: number) {
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
  grd.addColorStop(0, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.4, "rgba(230,240,255,0.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, r * 2.2, 0, TAU);
  g.fill();
  // 碎屑小玻璃片
  const n = randInt(7, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.2, 0.2);
    const d0 = rand(2, r * 0.4);
    const d1 = rand(r * 0.6, r * 1.2);
    g.beginPath();
    g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
    g.lineTo(Math.cos(a + 0.35) * d1, Math.sin(a + 0.35) * d1);
    g.lineTo(Math.cos(a - 0.15) * d1 * 0.9, Math.sin(a - 0.15) * d1 * 0.9);
    g.closePath();
    g.fillStyle = `rgba(255,255,255,${rand(0.15, 0.4)})`;
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 0.7;
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, 2.5, 0, TAU);
  g.fillStyle = "rgba(20,20,25,0.8)";
  g.fill();
}

class Crack extends PrankBase {
  private cx: number;
  private cy: number;
  private R: number;
  private tex: HTMLCanvasElement;
  private S: number;
  private reveal = 0;

  constructor(ctx: FxContext) {
    super(ctx);
    [this.cx, this.cy] = posOr(ctx, 40);
    const k = 0.7 + (ctx.options.intensity ?? 0.6) * 0.8;
    this.R = rand(200, 330) * k;
    this.S = Math.ceil(this.R * 2.6);
    const { canvas, ctx: g } = offscreen(this.S, this.S);
    g.translate(this.S / 2, this.S / 2);
    this.build(g);
    this.tex = canvas;
  }

  private build(g: CanvasRenderingContext2D) {
    const R = this.R;
    const lines: Line[] = [];
    const n = randInt(8, 13);
    const radials: Pt[][] = [];
    for (let i = 0; i < n; i++) {
      const base = (i / n) * TAU + rand(-0.3, 0.3) * (TAU / n);
      radials.push(jaggedLine(0, 0, base, R * rand(0.45, 1.15), rand(1.6, 2.4), lines, 1, R));
    }
    // 蛛网状同心环：连接相邻径向裂纹
    for (const f of [0.1, 0.24, 0.42, 0.62]) {
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.28) continue;
        const r = R * f * rand(0.85, 1.15);
        const a = pointAtRadius(radials[i], r);
        const b = pointAtRadius(radials[(i + 1) % n], r * rand(0.9, 1.1));
        if (!a || !b) continue;
        const pts: Pt[] = [a];
        const steps = 3;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const mx = a[0] + (b[0] - a[0]) * t;
          const my = a[1] + (b[1] - a[1]) * t;
          const sag = 0.9 + rand(-0.05, 0.05); // 略向内凹
          pts.push([mx * sag + rand(-3, 3), my * sag + rand(-3, 3)]);
        }
        pts.push(b);
        lines.push({ pts, w: rand(0.8, 1.4) });
      }
    }
    strokeLines(g, lines);
    impactCenter(g, Math.min(26, R * 0.1));
  }

  protected step(dt: number) {
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.25);
    return true;
  }

  protected animating() {
    return this.reveal < 1;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const half = this.S / 2;
    if (this.reveal < 1) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, half * easeOutCubic(Math.max(0, this.reveal)) + 4, 0, TAU);
      ctx.clip();
    }
    ctx.drawImage(this.tex, this.cx - half, this.cy - half, this.S, this.S);
  }
}

class Shatter extends PrankBase {
  private cx: number;
  private cy: number;
  private tex: HTMLCanvasElement;
  private reveal = 0;
  private maxR: number;

  constructor(ctx: FxContext) {
    super(ctx);
    const W = this.W;
    const H = this.H;
    this.cx = ctx.options.x ?? rand(W * 0.3, W * 0.7);
    this.cy = ctx.options.y ?? rand(H * 0.3, H * 0.7);
    this.maxR = Math.hypot(Math.max(this.cx, W - this.cx), Math.max(this.cy, H - this.cy));
    const { canvas, ctx: g } = offscreen(W, H);
    this.build(g);
    this.tex = canvas;
  }

  private build(g: CanvasRenderingContext2D) {
    const { cx, cy, maxR } = this;
    const nr = randInt(13, 19);
    const angles: number[] = [];
    for (let i = 0; i < nr; i++) angles.push((i / nr) * TAU + rand(-0.35, 0.35) * (TAU / nr));
    const radii: number[] = [0];
    let r = rand(22, 34);
    while (r < maxR * 1.1) {
      radii.push(r);
      r *= rand(1.45, 1.75);
    }
    radii.push(maxR * 1.3);
    const K = radii.length;
    // 共享顶点网格 V[i][k]
    const V: Pt[][] = angles.map((a) =>
      radii.map((rr, k) => {
        if (k === 0) return [cx, cy] as Pt;
        const aa = a + rand(-0.08, 0.08);
        const r2 = rr * rand(0.9, 1.1);
        return [cx + Math.cos(aa) * r2, cy + Math.sin(aa) * r2] as Pt;
      }),
    );
    const shards: Pt[][] = [];
    for (let i = 0; i < nr; i++) {
      const j = (i + 1) % nr;
      for (let k = 0; k < K - 1; k++) {
        const a = V[i][k];
        const b = V[j][k];
        const c = V[j][k + 1];
        const d = V[i][k + 1];
        if (k === 0) shards.push([a, c, d]);
        else if (Math.random() < 0.4) {
          shards.push([a, b, c]);
          shards.push([a, c, d]);
        } else shards.push([a, b, c, d]);
      }
    }
    const poly = (s: Pt[]) => {
      g.beginPath();
      g.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i][0], s[i][1]);
      g.closePath();
    };
    g.lineJoin = "round";
    for (const s of shards) {
      const sx = s.reduce((v, p) => v + p[0], 0) / s.length;
      const sy = s.reduce((v, p) => v + p[1], 0) / s.length;
      const dc = Math.hypot(sx - cx, sy - cy);
      poly(s);
      if (dc > 60 && dc < maxR * 0.75 && Math.random() < 0.045) {
        // 缺失的碎片：露出屏幕背后的黑色
        g.fillStyle = "rgba(6,6,10,0.92)";
        g.fill();
        g.save();
        g.clip();
        g.strokeStyle = "rgba(255,255,255,0.12)";
        g.lineWidth = 6;
        poly(s);
        g.stroke();
        g.restore();
        continue;
      }
      // 每块碎片不同的偏色 + 斜向反光，模拟折射
      const tint = rand(0.015, 0.09);
      const grd = g.createLinearGradient(sx - 60, sy - 60, sx + 60, sy + 60);
      grd.addColorStop(0, `rgba(210,230,255,${tint * 1.8})`);
      grd.addColorStop(0.5, `rgba(255,255,255,${tint * 0.3})`);
      grd.addColorStop(1, `rgba(180,200,230,${tint})`);
      g.fillStyle = grd;
      g.fill();
    }
    // 边缘：暗面 + 高光
    g.save();
    g.translate(1, 1);
    g.strokeStyle = "rgba(0,0,0,0.42)";
    g.lineWidth = 2.2;
    for (const s of shards) {
      poly(s);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.78)";
    g.lineWidth = 1;
    for (const s of shards) {
      poly(s);
      g.stroke();
    }
    // 边缘闪光
    g.shadowColor = "rgba(255,255,255,0.9)";
    g.shadowBlur = 6;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 1.8;
    for (const s of shards) {
      if (Math.random() > 0.18) continue;
      const i = randInt(0, s.length - 1);
      const p = s[i];
      const q = s[(i + 1) % s.length];
      const t0 = rand(0.1, 0.5);
      const t1 = t0 + rand(0.1, 0.35);
      g.beginPath();
      g.moveTo(p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0);
      g.lineTo(p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1);
      g.stroke();
    }
    g.shadowBlur = 0;
    // 碎片内的细小发丝裂纹
    const hair: Line[] = [];
    for (let i = 0; i < 40; i++) {
      const a = rand(0, TAU);
      const d = rand(40, maxR * 0.8);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      jaggedLine(0, 0, rand(0, TAU), rand(15, 60), 0.6, hair, 0, 0);
      const l = hair[hair.length - 1];
      l.pts = l.pts.map(([px, py]) => [px + x, py + y]);
    }
    strokeLines(g, hair);
    g.save();
    g.translate(cx, cy);
    const web = atlas("crack_d");
    if (web) {
      // 撞击中心叠加真实蛛网裂纹
      g.rotate(rand(0, TAU));
      const f = web.frame(0);
      stampCrackImage(g, web, 0.584, 0.563, rand(620, 820) / Math.max(f.w, f.h));
    } else {
      impactCenter(g, 34);
    }
    g.restore();
    glassChips(this.ctx, cx, cy, 24);
  }

  protected step(dt: number) {
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.35);
    return true;
  }

  protected animating() {
    return this.reveal < 1;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    if (this.reveal < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.maxR * easeOutCubic(Math.max(0, this.reveal)) + 4, 0, TAU);
      ctx.clip();
      ctx.drawImage(this.tex, 0, 0, this.W, this.H);
      ctx.restore();
      // 碎裂瞬间的白闪
      ctx.globalAlpha *= (1 - this.reveal) * 0.35;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, this.W, this.H);
      return;
    }
    ctx.drawImage(this.tex, 0, 0, this.W, this.H);
  }
}

/** 美术裂痕图版本 */
class ImageCrack extends PrankBase {
  private cx: number;
  private cy: number;
  private tex: HTMLCanvasElement;
  private S: number;
  private R: number;
  private reveal = 0;

  constructor(ctx: FxContext, a: Atlas, ax: number, ay: number) {
    super(ctx);
    [this.cx, this.cy] = posOr(ctx, 40);
    const size = rand(420, 900) * (0.75 + (ctx.options.intensity ?? 0.6) * 0.45);
    const f = a.frame(0);
    const scale = size / Math.max(f.w, f.h);
    // 撞击点到图像最远角的距离决定纹理大小（任意旋转都不裁切）
    const far = Math.hypot(Math.max(ax, 1 - ax) * f.w, Math.max(ay, 1 - ay) * f.h) * scale;
    this.R = far;
    this.S = Math.ceil(far * 2 + 8);
    const { canvas, ctx: g } = offscreen(this.S, this.S);
    g.translate(this.S / 2, this.S / 2);
    g.rotate(rand(0, TAU));
    if (Math.random() < 0.5) g.scale(-1, 1);
    stampCrackImage(g, a, ax, ay, scale);
    this.tex = canvas;
    glassChips(ctx, this.cx, this.cy);
  }

  protected step(dt: number) {
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.2);
    return true;
  }

  protected animating() {
    return this.reveal < 1;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const half = this.S / 2;
    const r = Math.max(0, this.reveal);
    ctx.save();
    if (r < 1) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R * easeOutCubic(r) + 4, 0, TAU);
      ctx.clip();
    }
    ctx.drawImage(this.tex, this.cx - half, this.cy - half, this.S, this.S);
    ctx.restore();
    if (r < 1) impactFlash(ctx, this.cx, this.cy, 70, 1 - r);
  }
}

/** 整屏手机碎屏图（shatter_a，竖图；横屏时旋转 90° 铺满） */
class PhotoShatter extends PrankBase {
  private tex: HTMLCanvasElement;
  private cx = 0;
  private cy = 0;
  private maxR: number;
  private reveal = 0;

  constructor(ctx: FxContext, a: Atlas) {
    super(ctx);
    const W = this.W;
    const H = this.H;
    const f = a.frame(0);
    const rotate = W > H;
    const iw = rotate ? f.h : f.w;
    const ih = rotate ? f.w : f.h;
    const s = Math.max(W / iw, H / ih) * 1.02;
    // 撞击点（图内 0.624, 0.508）在屏幕上的位置
    let px = (0.624 - 0.5) * f.w * s;
    let py = (0.508 - 0.5) * f.h * s;
    if (rotate) [px, py] = [-py, px];
    // 指定了位置时，在保证铺满的前提下尽量把撞击点平移过去
    const slackX = (iw * s - W) / 2;
    const slackY = (ih * s - H) / 2;
    const tx = ctx.options.x !== undefined ? Math.max(-slackX, Math.min(slackX, ctx.options.x - (W / 2 + px))) : 0;
    const ty = ctx.options.y !== undefined ? Math.max(-slackY, Math.min(slackY, ctx.options.y - (H / 2 + py))) : 0;
    this.cx = W / 2 + px + tx;
    this.cy = H / 2 + py + ty;
    this.maxR = Math.hypot(Math.max(this.cx, W - this.cx), Math.max(this.cy, H - this.cy));
    const { canvas, ctx: g } = offscreen(W, H);
    g.translate(W / 2 + tx, H / 2 + ty);
    if (rotate) g.rotate(Math.PI / 2);
    stampCrackImage(g, a, 0.5, 0.5, s, 0.95);
    this.tex = canvas;
    glassChips(ctx, this.cx, this.cy, 26);
  }

  protected step(dt: number) {
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.35);
    return true;
  }

  protected animating() {
    return this.reveal < 1;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const r = Math.max(0, this.reveal);
    if (r < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.maxR * easeOutCubic(r) + 4, 0, TAU);
      ctx.clip();
      ctx.drawImage(this.tex, 0, 0, this.W, this.H);
      ctx.restore();
      ctx.globalAlpha *= (1 - r) * 0.3;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, this.W, this.H);
      return;
    }
    ctx.drawImage(this.tex, 0, 0, this.W, this.H);
  }
}

export const createCrack = (ctx: FxContext) => {
  const [name, ax, ay] = pick(CRACK_IMAGES);
  const a = atlas(name);
  // 以图片为主，少量程序化变体
  if (a && Math.random() < 0.85) return new ImageCrack(ctx, a, ax, ay);
  return new Crack(ctx);
};

export const createShatter = (ctx: FxContext) => {
  const photo = atlas("shatter_a");
  if (photo && Math.random() < 0.5) return new PhotoShatter(ctx, photo);
  return new Shatter(ctx);
};
