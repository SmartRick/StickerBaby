/** 掉落类一次性特效：金币雨 / 爱心雨（钞票雨见 money.ts） */
import type { FxContext } from "../core/fx";
import { atlas } from "../core/assets";
import { pick, rand, randInt } from "../core/layer";
import { PALETTES, sprite } from "../core/sprites";
import { BaseFx, durationOf } from "./base";

// ---------------- 金币雨 ----------------

/** 图片金币：coin_spin 为 16 帧完整自转（正面 → 侧边 → 正面），coin_star 0-5 为星币翻面 */
export interface ImgCoin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 0..1 景深：越小越远（更小、更慢、更淡） */
  depth: number;
  /** 帧相位（帧数） */
  phase: number;
  /** 帧/秒 */
  spin: number;
  rot: number;
  star: boolean;
  bounces: number;
  glint: number;
}

export function makeCoin(w: number, depth = rand(0.35, 1), star = Math.random() < 0.22): ImgCoin {
  const size = 26 + 64 * depth;
  return {
    x: rand(-20, w + 20),
    y: -size,
    vx: rand(-40, 40),
    vy: rand(60, 220) * (0.5 + depth * 0.7),
    size,
    depth,
    phase: rand(0, 16),
    spin: rand(14, 30) * (Math.random() < 0.5 ? -1 : 1),
    rot: rand(-0.35, 0.35),
    star,
    bounces: 0,
    glint: -1,
  };
}

const STAR_SEQ = [0, 1, 2, 3, 4, 5];

/** 绘制一枚图片金币（调用前 ctx 已经放到金币中心） */
export function drawCoin(ctx: CanvasRenderingContext2D, c: ImgCoin) {
  if (c.star) {
    const a = atlas("coin_star");
    if (!a) return;
    const i = STAR_SEQ[((Math.floor(c.phase * 0.6) % 6) + 6) % 6];
    const f = a.frame(i);
    const h = c.size;
    a.draw(ctx, i, 0, 0, (h * f.w) / f.h, h);
  } else {
    const a = atlas("coin_spin");
    if (!a) return;
    a.draw(ctx, ((Math.floor(c.phase) % 16) + 16) % 16, 0, 0, c.size * 1.12, c.size * 1.12);
  }
}

/** 金币闪光（叠加模式） */
export function drawGlint(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, k: number, small = false) {
  const a = atlas("coin_star");
  if (!a || k <= 0) return;
  a.draw(ctx, small ? 7 : 6, x, y, size * k, size * k * (small ? 1.08 : 1.12));
}

class CoinRain extends BaseFx {
  private coins: ImgCoin[] = [];
  private acc = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.8, 3);
  }

  protected step(dt: number) {
    if (this.spawning) {
      this.acc += dt * 46 * (0.4 + this.intensity);
      while (this.acc >= 1 && this.coins.length < 520) {
        this.acc--;
        this.coins.push(makeCoin(this.w));
      }
      this.coins.sort((a, b) => a.depth - b.depth);
    }
    const floor = this.h;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.vy += 900 * (0.55 + c.depth * 0.45) * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.phase += c.spin * dt;
      if (c.glint >= 0) {
        c.glint += dt;
        if (c.glint > 0.4) c.glint = -1;
      } else if (c.depth > 0.6 && Math.random() < dt * 0.35) c.glint = 0;
      // 近处的金币落地弹一下（远处的直接穿过，营造纵深）
      if (c.depth > 0.55 && c.bounces < 1 && c.y > floor - c.size * 0.45) {
        c.y = floor - c.size * 0.45;
        c.vy = -c.vy * rand(0.25, 0.42);
        c.vx += rand(-120, 120);
        c.spin *= 1.5;
        c.bounces++;
        c.glint = 0;
      } else if (c.y > floor + c.size) {
        this.coins.splice(i, 1);
      }
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    for (const c of this.coins) {
      ctx.globalAlpha = this.fade * (0.5 + 0.5 * c.depth);
      this.place(ctx, c.x, c.y, c.rot);
      drawCoin(ctx, c);
    }
    this.resetTransform(ctx);
    ctx.globalCompositeOperation = "lighter";
    for (const c of this.coins) {
      if (c.glint < 0) continue;
      const k = Math.sin((c.glint / 0.4) * Math.PI);
      ctx.globalAlpha = this.fade * k;
      drawGlint(ctx, c.x + c.size * 0.22, c.y - c.size * 0.22, c.size * 0.9, k);
    }
  }

  protected finished() {
    return this.coins.length === 0;
  }
}

// ---------------- 爱心雨 ----------------

interface Heart {
  x: number;
  y: number;
  vy: number;
  size: number;
  phase: number;
  sway: number;
  rot: number;
  /** 0..1 景深 */
  depth: number;
  /** 远景小爱心用程序化精灵 */
  tiny: string | null;
  frame: number;
  popY: number;
  big: boolean;
}

const HEART_COLORS = [...PALETTES.heart!, "#ff006e", "#ffb3c6", "#ff70a6"];

class HeartRain extends BaseFx {
  private hearts: Heart[] = [];
  private acc = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.8, 4);
  }

  protected step(dt: number) {
    if (this.spawning) {
      this.acc += dt * 30 * (0.4 + this.intensity);
      while (this.acc >= 1 && this.hearts.length < 420) {
        this.acc--;
        const tiny = Math.random() < 0.35;
        const big = !tiny && Math.random() < 0.09;
        const depth = tiny ? rand(0.15, 0.4) : rand(0.45, 1);
        const size = big ? rand(90, 130) : tiny ? rand(12, 22) : 28 + 44 * depth;
        this.hearts.push({
          x: rand(0, this.w),
          y: -size,
          vy: big ? rand(90, 130) : (80 + 180 * depth) * rand(0.85, 1.15),
          size,
          phase: rand(0, Math.PI * 2),
          sway: rand(20, 60),
          rot: rand(-0.3, 0.3),
          depth,
          tiny: tiny ? pick(HEART_COLORS) : null,
          frame: randInt(0, 15),
          popY: !big && !tiny && Math.random() < 0.15 ? rand(this.h * 0.3, this.h * 0.8) : Infinity,
          big,
        });
      }
      this.hearts.sort((a, b) => a.depth - b.depth);
    }
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.phase += dt * 2;
      h.x += Math.cos(h.phase) * h.sway * dt;
      h.y += h.vy * dt;
      if (h.y > h.popY) {
        this.fx.particles.emit(h.x, h.y, {
          kind: ["sparkle", "heart"],
          count: 7,
          angle: [0, Math.PI * 2],
          speed: [60, 180],
          life: [0.4, 0.8],
          size: [10, 20],
          gravity: 80,
        });
        this.hearts.splice(i, 1);
      } else if (h.y > this.h + h.size) {
        this.hearts.splice(i, 1);
      }
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("hearts");
    for (const h of this.hearts) {
      const beat = h.big ? 1 + 0.09 * Math.max(0, Math.sin(this.t * 7 + h.phase)) : 1;
      const s = h.size * beat;
      ctx.globalAlpha = this.fade * (h.tiny ? 0.55 : 0.75 + 0.25 * h.depth);
      this.place(ctx, h.x, h.y, h.rot + Math.sin(h.phase) * 0.25);
      if (h.tiny || !a) {
        ctx.drawImage(sprite("heart", h.tiny ?? HEART_COLORS[0]), -s / 2, -s / 2, s, s);
      } else {
        // 16 帧是同一颗 3D 爱心的不同角度：来回摆动形成立体转动感
        const k = Math.sin(h.phase * 1.3) * 0.5 + 0.5;
        const i = (h.frame + Math.round(k * 7)) % 16;
        a.draw(ctx, i, 0, 0, s * 1.25, s * 1.25);
      }
    }
  }

  protected finished() {
    return this.hearts.length === 0;
  }
}

export const coinRain = (fx: FxContext) => new CoinRain(fx);
export const heartRain = (fx: FxContext) => new HeartRain(fx);

export { moneyRain } from "./money";
