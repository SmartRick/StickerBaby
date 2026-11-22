/**
 * 恶作剧实体的公共基类与工具。
 * - stop() 统一淡出（~0.7s）
 * - 子类实现 step/render；静态内容通过 animating() 返回 false 让图层停止逐帧重绘
 */
import type { FxContext } from "../core/fx";
import type { FxEntity } from "../core/layer";

export abstract class PrankBase implements FxEntity {
  z = 0;
  protected alpha = 1;
  protected stopping = false;
  protected age = 0;

  constructor(protected ctx: FxContext) {}

  get W() {
    return this.ctx.rt.width;
  }
  get H() {
    return this.ctx.rt.height;
  }

  stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.ctx.layer.invalidate();
  }

  update(dt: number, now: number): boolean {
    this.age += dt;
    if (this.stopping) {
      this.alpha -= dt * 1.5;
      if (this.alpha <= 0) return false;
    }
    return this.step(dt, now);
  }

  isAnimating() {
    return this.stopping || this.animating();
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.alpha <= 0) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
    this.render(ctx);
  }

  /** 返回 false 结束生命周期 */
  protected abstract step(dt: number, now: number): boolean;
  protected abstract render(ctx: CanvasRenderingContext2D): void;
  protected animating(): boolean {
    return true;
  }
}

export const TAU = Math.PI * 2;

/** 角度差，结果在 (-PI, PI] */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function turnToward(cur: number, target: number, maxDelta: number) {
  const d = angleDiff(cur, target);
  return cur + Math.max(-maxDelta, Math.min(maxDelta, d));
}

export function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/** 在屏幕范围内或给定坐标取位置 */
export function posOr(ctx: FxContext, margin = 80): [number, number] {
  const { x, y } = ctx.options;
  const W = ctx.rt.width;
  const H = ctx.rt.height;
  return [
    x ?? margin + Math.random() * Math.max(1, W - margin * 2),
    y ?? margin + Math.random() * Math.max(1, H - margin * 2),
  ];
}

/** 简单的确定性伪随机（用于预渲染纹理的可重复细节） */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** 不规则斑块路径（用于污渍 / 血迹 / 溅射） */
export function blobPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rough = 0.25,
  points = 24,
  rnd: () => number = Math.random,
) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * TAU;
    const rr = r * (1 + (rnd() * 2 - 1) * rough);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // 经过相邻点中点的二次曲线，得到平滑的不规则轮廓
  const mid = (i: number) => {
    const a = pts[i % points];
    const b = pts[(i + 1) % points];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  ctx.beginPath();
  const m0 = mid(points - 1);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < points; i++) {
    const m = mid(i);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

/** 绘制一个溅射（拍死虫子时的残留） */
export function drawSplat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  seed: number,
) {
  const rnd = seeded(seed);
  ctx.fillStyle = color;
  blobPath(ctx, x, y, r, 0.35, 18, rnd);
  ctx.fill();
  const n = 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const d = r * (1.1 + rnd() * 1.4);
    const s = r * (0.08 + rnd() * 0.2);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU);
    ctx.fill();
    // 溅射拖尾
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.lineWidth = s * 0.9;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.25, r * 0.12, -0.6, 0, TAU);
  ctx.fill();
}
