/**
 * 全屏特效基类：统一处理时长、生成阶段、优雅淡出。
 *
 * - duration = null 表示常驻特效（直到 stop）
 * - 一次性特效在 duration 内持续生成内容，之后进入“收尾”阶段，等内容自然消失（finished）
 *   或超过 maxDrain 秒后强制淡出
 * - stop() 在 fadeTime 秒内淡出后结束
 */
import type { FxContext } from "../core/fx";
import { clamp, type FxEntity } from "../core/layer";

export abstract class BaseFx implements FxEntity {
  z = 0;
  /** 已运行时间（秒） */
  t = 0;
  /** stop() 后的整体淡出系数 */
  fade = 1;
  stopping = false;
  readonly intensity: number;

  constructor(
    protected fx: FxContext,
    readonly duration: number | null,
    protected fadeTime = 0.8,
    protected maxDrain = 4,
  ) {
    this.intensity = clamp(fx.options.intensity ?? 0.6, 0.05, 1);
  }

  get w() {
    return this.fx.layer.width;
  }
  get h() {
    return this.fx.layer.height;
  }
  get dpr() {
    return this.fx.rt.dpr;
  }

  /** 是否仍在生成新内容 */
  get spawning() {
    return !this.stopping && (this.duration === null || this.t < this.duration);
  }

  stop() {
    this.stopping = true;
  }

  update(dt: number, now: number): boolean {
    this.t += dt;
    if (this.stopping) {
      this.fade -= dt / this.fadeTime;
      if (this.fade <= 0) return false;
    } else if (this.duration !== null && this.t > this.duration + this.maxDrain) {
      this.stopping = true;
    }
    this.step(dt, now);
    if (this.duration !== null && this.t >= this.duration && this.finished()) return false;
    return true;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.fade;
    this.render(ctx);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** 以 CSS 像素坐标放置一个旋转/缩放的局部坐标系（考虑 dpr） */
  protected place(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rot = 0,
    sx = 1,
    sy = 1,
  ) {
    const d = this.dpr;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    ctx.setTransform(c * sx * d, s * sx * d, -s * sy * d, c * sy * d, x * d, y * d);
  }

  protected resetTransform(ctx: CanvasRenderingContext2D) {
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  protected abstract step(dt: number, now: number): void;
  protected abstract render(ctx: CanvasRenderingContext2D): void;
  /** 收尾阶段：内容已全部消失 */
  protected finished(): boolean {
    return false;
  }
}

/** 读取时长（秒） */
export function durationOf(fx: FxContext, defaultSec: number) {
  return (fx.options.durationMs ?? defaultSec * 1000) / 1000;
}

/** 0→1→0 的进出包络 */
export function envelope(t: number, total: number, fadeIn = 0.6, fadeOut = 1) {
  const a = clamp(t / fadeIn, 0, 1);
  const b = clamp((total - t) / fadeOut, 0, 1);
  return Math.min(a, b);
}

/** 预渲染柔和圆点（灰度/彩色辉光），用于远景雪、萤火虫等 */
export function softDot(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** 预渲染一团不规则烟雾（多个随机径向斑块叠加） */
export function smokePuff(size: number, rgb: string, blobs = 14, seedAlpha = 0.14) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r * 0.42;
    const x = r + Math.cos(a) * d;
    const y = r + Math.sin(a) * d;
    const br = r * (0.3 + Math.random() * 0.28);
    const grad = g.createRadialGradient(x, y, 0, x, y, br);
    const al = seedAlpha * (0.6 + Math.random() * 0.8);
    grad.addColorStop(0, `rgba(${rgb},${al})`);
    grad.addColorStop(0.6, `rgba(${rgb},${al * 0.45})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, br, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}
