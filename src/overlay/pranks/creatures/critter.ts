/**
 * 爬虫公共基类：随机游走 + 屏幕边缘回避 + 躲避鼠标 + 受惊逃散 + 随机停顿，点击拍死后留下溅射。
 */
import { clamp, rand, randInt } from "../../core/layer";
import type { Cursor } from "../../core/runtime";
import { TAU, dist, drawSplat, turnToward } from "../base";

export type Pt = [number, number];

export interface World {
  W: number;
  H: number;
  cursor: Readonly<Cursor>;
}

export interface Params {
  base: number;
  flee: number;
  fleeR: number;
  turn: number;
  wander: number;
  pause: number;
  radius: number;
  splat: string;
}

export abstract class Critter {
  x = 0;
  y = 0;
  heading = 0;
  speed = 0;
  t = rand(0, 100);
  p1 = rand(0, TAU);
  p2 = rand(0, TAU);
  dead = false;
  deadT = 0;
  scareT = 0;
  sx = 0;
  sy = 0;
  pauseT = 0;
  seed = randInt(1, 1e9);
  fleeing = false;

  constructor(readonly P: Params) {}

  /** 从屏幕外某条边进入 */
  spawnAtEdge(W: number, H: number) {
    const side = randInt(0, 3);
    const o = 40;
    this.x = side === 1 ? W + o : side === 3 ? -o : rand(0.1, 0.9) * W;
    this.y = side === 0 ? -o : side === 2 ? H + o : rand(0.1, 0.9) * H;
    this.heading = Math.atan2(H / 2 - this.y, W / 2 - this.x) + rand(-0.6, 0.6);
  }

  place(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.heading = rand(0, TAU);
  }

  scare(x: number, y: number) {
    this.scareT = 1.3;
    this.sx = x;
    this.sy = y;
    this.pauseT = 0;
  }

  update(dt: number, w: World) {
    this.t += dt;
    if (this.dead) {
      this.deadT += dt;
      return;
    }
    this.steer(dt, w);
  }

  protected steer(dt: number, w: World) {
    const P = this.P;
    const wob = (Math.sin(this.t * 0.9 + this.p1) + 0.6 * Math.sin(this.t * 2.3 + this.p2)) * P.wander;
    let desired = this.heading + wob;
    let target = P.base;
    let turn = P.turn;
    const m = 70;
    if (this.x < m || this.x > w.W - m || this.y < m || this.y > w.H - m) {
      desired = Math.atan2(w.H / 2 - this.y, w.W / 2 - this.x);
      turn *= 1.6;
    }
    this.fleeing = false;
    const c = w.cursor;
    if (c.inside && dist(c.x, c.y, this.x, this.y) < P.fleeR) {
      desired = Math.atan2(this.y - c.y, this.x - c.x);
      target = P.flee;
      turn = P.turn * 3;
      this.fleeing = true;
    }
    if (this.scareT > 0) {
      this.scareT -= dt;
      desired = Math.atan2(this.y - this.sy, this.x - this.sx);
      target = P.flee;
      turn = P.turn * 3;
      this.fleeing = true;
    }
    if (!this.fleeing && P.pause > 0) {
      if (this.pauseT > 0) {
        this.pauseT -= dt;
        target = 0;
      } else if (Math.random() < dt * P.pause) {
        this.pauseT = rand(0.4, 2.2);
      }
    } else this.pauseT = 0;
    this.heading = turnToward(this.heading, desired, turn * dt);
    this.speed += (target - this.speed) * Math.min(1, dt * 6);
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;
  }

  hit(x: number, y: number) {
    return !this.dead && dist(x, y, this.x, this.y) < this.P.radius + 6;
  }

  /** 死亡后溅射位置 */
  splatPos(): Pt {
    return [this.x, this.y];
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.dead) {
      const fade = this.deadT > 3 ? clamp(1 - (this.deadT - 3), 0, 1) : 1;
      if (fade <= 0) return;
      const base = ctx.globalAlpha;
      ctx.globalAlpha = base * fade * 0.9;
      const [sx, sy] = this.splatPos();
      drawSplat(ctx, sx, sy, this.P.radius * 0.9, this.P.splat, this.seed);
      ctx.globalAlpha = base * fade;
      this.drawDead(ctx);
      ctx.globalAlpha = base;
      return;
    }
    this.drawAlive(ctx);
  }

  get gone() {
    return this.dead && this.deadT > 4;
  }

  protected abstract drawAlive(ctx: CanvasRenderingContext2D): void;
  protected drawDead(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(1.1, 1.25);
    ctx.translate(-this.x, -this.y);
    this.drawAlive(ctx);
    ctx.restore();
  }
}

