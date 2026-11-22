/** 元宝雨：16 帧翻滚元宝 + 少量金币，落地弹跳两次并迸出“叮”的闪光 */
import type { FxContext } from "../core/fx";
import { atlas } from "../core/assets";
import { rand } from "../core/layer";
import { BaseFx, durationOf } from "./base";
import { drawCoin, drawGlint, makeCoin, type ImgCoin } from "./rains";

interface Ingot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  depth: number;
  phase: number;
  /** 翻滚速度（帧/秒），落地后减速 */
  spin: number;
  rot: number;
  vr: number;
  bounces: number;
}

interface Clink {
  x: number;
  y: number;
  age: number;
  size: number;
  small: boolean;
}

class IngotRain extends BaseFx {
  private ingots: Ingot[] = [];
  private coins: ImgCoin[] = [];
  private clinks: Clink[] = [];
  private acc = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.8, 3.5);
  }

  protected step(dt: number) {
    if (this.spawning) {
      this.acc += dt * 20 * (0.4 + this.intensity);
      while (this.acc >= 1 && this.ingots.length < 260) {
        this.acc--;
        if (Math.random() < 0.18) {
          this.coins.push(makeCoin(this.w));
          continue;
        }
        const depth = rand(0.35, 1);
        const size = 50 + 80 * depth;
        this.ingots.push({
          x: rand(0, this.w),
          y: -size,
          vx: rand(-50, 50),
          vy: rand(40, 180) * (0.5 + depth * 0.7),
          size,
          depth,
          phase: rand(0, 16),
          spin: rand(8, 18) * (Math.random() < 0.5 ? -1 : 1),
          rot: rand(-0.3, 0.3),
          vr: rand(-1.2, 1.2),
          bounces: 0,
        });
      }
      this.ingots.sort((a, b) => a.depth - b.depth);
    }

    const floor = this.h;
    for (let i = this.ingots.length - 1; i >= 0; i--) {
      const g = this.ingots[i];
      g.vy += 1100 * (0.55 + g.depth * 0.45) * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.rot += g.vr * dt;
      g.phase += g.spin * dt;
      const ground = floor - g.size * 0.32;
      // 近景元宝落地弹两次（越弹越低），远景直接穿过画面底部
      if (g.depth > 0.5 && g.bounces < 2 && g.y > ground && g.vy > 0) {
        g.y = ground;
        g.vy = -g.vy * (g.bounces === 0 ? rand(0.32, 0.45) : rand(0.15, 0.22));
        g.vx = g.vx * 0.6 + rand(-80, 80);
        g.vr = rand(-2.5, 2.5);
        g.spin *= 0.6;
        g.bounces++;
        this.clinks.push({ x: g.x + rand(-g.size * 0.3, g.size * 0.3), y: ground - g.size * 0.15, age: 0, size: g.size * 0.9, small: false });
        this.clinks.push({ x: g.x + rand(-g.size * 0.4, g.size * 0.4), y: ground - g.size * 0.25, age: -0.05, size: g.size * 0.4, small: true });
      } else if (g.y > floor + g.size) {
        this.ingots.splice(i, 1);
      }
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.vy += 900 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.phase += c.spin * dt;
      if (c.y > floor + c.size) this.coins.splice(i, 1);
    }

    for (const c of this.clinks) c.age += dt;
    this.clinks = this.clinks.filter((c) => c.age < 0.35);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("ingots");
    for (const c of this.coins) {
      ctx.globalAlpha = this.fade * (0.5 + 0.5 * c.depth);
      this.place(ctx, c.x, c.y, c.rot);
      drawCoin(ctx, c);
    }
    if (a) {
      for (const g of this.ingots) {
        ctx.globalAlpha = this.fade * (0.55 + 0.45 * g.depth);
        this.place(ctx, g.x, g.y, g.rot);
        const i = ((Math.floor(g.phase) % 16) + 16) % 16;
        const f = a.frame(i);
        // 帧已裁边、尺寸不一：按最大边归一化，保持元宝整体大小稳定
        const k = g.size / 132;
        a.draw(ctx, i, 0, 0, f.w * k, f.h * k);
      }
    }
    this.resetTransform(ctx);
    ctx.globalCompositeOperation = "lighter";
    for (const c of this.clinks) {
      if (c.age < 0) continue;
      const k = Math.sin((c.age / 0.35) * Math.PI);
      ctx.globalAlpha = this.fade * k;
      drawGlint(ctx, c.x, c.y, c.size, k, c.small);
    }
  }

  protected finished() {
    return this.ingots.length === 0 && this.coins.length === 0 && this.clinks.length === 0;
  }
}

export const ingotRain = (fx: FxContext) => new IngotRain(fx);
