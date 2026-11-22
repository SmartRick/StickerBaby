/**
 * 苍蝇：fly_parts 部件图集拼装。
 *   0-5 腿节、6-11 胫节、12-17 跗节、18 头（红色复眼）、19 胸、20 腹、21/22 左右翅、23/24 触角
 * 飞行：翅膀高频振动（多重残影模拟运动模糊），腿收拢，带离地阴影；
 * 停落：翅膀折叠成 V 形盖在腹部上，六足着地，不时搓前足；鼠标靠近即起飞。
 */
import { type Atlas, atlas } from "../../core/assets";
import { clamp, rand } from "../../core/layer";
import { TAU, dist } from "../base";
import { type BoneDef, drawBone, ik2, manualBone, toWorld, verticalBone } from "./bone";
import { Critter, type World } from "./critter";

interface Rig {
  at: Atlas;
  femur: BoneDef[];
  tibia: BoneDef[];
  tarsus: BoneDef[];
  wingL: BoneDef;
  wingR: BoneDef;
}
let RIG: Rig | null = null;
function rig(): Rig | null {
  if (RIG) return RIG;
  const at = atlas("fly_parts");
  if (!at) return null;
  const vb = (i: number) => verticalBone(at, i);
  RIG = {
    at,
    femur: [0, 1, 2, 3, 4, 5].map(vb),
    tibia: [6, 7, 8, 9, 10, 11].map(vb),
    tarsus: [12, 13, 14, 15, 16, 17].map(vb),
    // 翅根在窄端：21 右上角（左翅），22 左上角（右翅）
    wingL: manualBone(at, 21, 0.96, 0.05, 0.12, 0.88),
    wingR: manualBone(at, 22, 0.04, 0.05, 0.88, 0.88),
  };
  return RIG;
}

// 体坐标（单位 = 体长）：髋、静止足端、膝盖弯向
const LEGS = [0, 1, 2].flatMap((pair) =>
  ([-1, 1] as const).map((side) => ({
    pair,
    side,
    hx: [0.1, 0.04, -0.03][pair],
    hy: [0.06, 0.08, 0.08][pair] * side,
    fx: [0.42, 0.02, -0.38][pair],
    fy: [0.3, 0.44, 0.38][pair] * side,
    bend: [-1, -1, 1][pair] * side,
  })),
);

export class Fly extends Critter {
  vx = 0;
  vy = 0;
  tx = 0;
  ty = 0;
  landed = false;
  stateT = rand(2, 5);
  private L = rand(34, 42);
  private lift = 1;
  private rubT = 0;

  place(x: number, y: number) {
    super.place(x, y);
    this.tx = x;
    this.ty = y;
    // 指定位置出现时先停在那里
    this.landed = true;
    this.lift = 0;
  }
  spawnAtEdge(W: number, H: number) {
    super.spawnAtEdge(W, H);
    this.tx = rand(100, W - 100);
    this.ty = rand(100, H - 100);
  }

  update(dt: number, w: World) {
    super.update(dt, w);
    this.lift += ((this.landed || this.dead ? 0 : 1) - this.lift) * Math.min(1, dt * 10);
    if (this.landed && !this.dead) {
      this.rubT -= dt;
      if (this.rubT < -rand(1, 3)) this.rubT = rand(0.8, 1.8);
    }
  }

  hit(x: number, y: number) {
    return !this.dead && dist(x, y, this.x, this.y) < this.L * 0.45 + 6;
  }

  protected steer(dt: number, w: World) {
    const c = w.cursor;
    const near = c.inside && dist(c.x, c.y, this.x, this.y) < 130;
    this.stateT -= dt;
    if (this.landed) {
      if (near || this.scareT > 0 || this.stateT <= 0) {
        this.landed = false;
        this.stateT = rand(2.5, 6);
        const a = near ? Math.atan2(this.y - c.y, this.x - c.x) : rand(0, TAU);
        this.vx = Math.cos(a) * 380;
        this.vy = Math.sin(a) * 380;
        this.tx = clamp(this.x + Math.cos(a) * 300, 60, w.W - 60);
        this.ty = clamp(this.y + Math.sin(a) * 300, 60, w.H - 60);
      } else if (Math.random() < dt * 0.4) {
        // 停着时偶尔原地转个身 / 挪一小步
        this.heading += rand(-0.8, 0.8);
      }
      this.scareT = Math.max(0, this.scareT - dt);
      return;
    }
    if (this.stateT <= 0) {
      this.landed = true;
      this.stateT = rand(2, 6);
      this.vx = this.vy = 0;
      this.rubT = 0;
      return;
    }
    if (dist(this.x, this.y, this.tx, this.ty) < 40 || Math.random() < dt * 0.8) {
      this.tx = rand(60, w.W - 60);
      this.ty = rand(60, w.H - 60);
    }
    const a = Math.atan2(this.ty - this.y, this.tx - this.x);
    this.vx += Math.cos(a) * 900 * dt + rand(-1, 1) * 2600 * dt;
    this.vy += Math.sin(a) * 900 * dt + rand(-1, 1) * 2600 * dt;
    if (near) {
      const fa = Math.atan2(this.y - c.y, this.x - c.x);
      this.vx += Math.cos(fa) * 3000 * dt;
      this.vy += Math.sin(fa) * 3000 * dt;
    }
    const sp = Math.hypot(this.vx, this.vy);
    const max = 420;
    if (sp > max) {
      this.vx *= max / sp;
      this.vy *= max / sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // 飞行朝向平滑跟随速度
    const want = Math.atan2(this.vy, this.vx);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, dt * 12);
    this.scareT = Math.max(0, this.scareT - dt);
  }

  protected drawAlive(ctx: CanvasRenderingContext2D) {
    const R = rig();
    if (!R) return;
    const at = R.at;
    const lift = this.lift;
    const L = this.L * (1 + lift * 0.15);
    const { heading } = this;
    const x = this.x;
    const y = this.y - lift * 6;
    const s = L / 420;

    // 阴影：飞得越高越远越淡
    ctx.save();
    ctx.translate(this.x + 3 + lift * 10, this.y + 4 + lift * 16);
    ctx.rotate(heading);
    ctx.fillStyle = `rgba(0,0,0,${0.32 - lift * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.42, L * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 腿：停落时着地，飞行时收拢
    const legScale = s * 0.5;
    for (const leg of LEGS) {
      const i = leg.pair * 2 + (leg.side < 0 ? 0 : 1);
      let fx = leg.fx;
      let fy = leg.fy;
      if (leg.pair === 0 && this.landed && this.rubT > 0) {
        // 搓前足：两只前足收到身前中线附近来回摩擦
        fx = 0.48 + Math.sin(this.t * 24) * 0.04;
        fy = leg.side * (0.07 + Math.sin(this.t * 24 + (leg.side > 0 ? Math.PI : 0)) * 0.03);
      }
      const tuck = lift;
      fx = fx * (1 - tuck * 0.35) - tuck * 0.15;
      fy = fy * (1 - tuck * 0.55);
      const [hx, hy] = toWorld(x, y, heading, leg.hx * L, leg.hy * L);
      const [px, py] = toWorld(x, y, heading, fx * L, fy * L);
      const fem = R.femur[i];
      const tib = R.tibia[i];
      const tar = R.tarsus[i];
      const l1 = fem.len * legScale;
      const l2 = tib.len * legScale;
      const l3 = tar.len * legScale * 0.8;
      const k = ik2(hx, hy, px, py, l1, l2 + l3 * 0.9, leg.bend);
      drawBone(ctx, at, fem, hx, hy, k.a1, l1, 1.1);
      drawBone(ctx, at, tib, k.kx, k.ky, k.a2, l2, 1.1);
      drawBone(ctx, at, tar, k.kx + Math.cos(k.a2) * l2, k.ky + Math.sin(k.a2) * l2, k.a2 - leg.bend * 0.3, l3, 1.1);
    }

    // 身体：腹 -> 胸 -> 头
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading + Math.PI / 2);
    at.draw(ctx, 20, 0, L * 0.27, 115 * s * 1.05);
    at.draw(ctx, 19, 0, -L * 0.06, 140 * s);
    at.draw(ctx, 18, 0, -L * 0.34, 137 * s * 0.92);
    ctx.restore();

    // 翅膀
    const flying = lift > 0.3 && !this.dead;
    for (const side of [-1, 1] as const) {
      const [bx, by] = toWorld(x, y, heading, L * 0.02, side * L * 0.1);
      const bone = side < 0 ? R.wingL : R.wingR;
      if (flying) {
        const base = heading + side * 1.6;
        const copies = 4;
        const a0 = ctx.globalAlpha;
        for (let k = 0; k < copies; k++) {
          const ph = this.t * 190 + (k / copies) * TAU;
          ctx.globalAlpha = a0 * 0.32;
          drawBone(ctx, at, bone, bx, by, base + side * Math.sin(ph) * 0.55 - side * 0.35, L * 0.78, 0.9);
        }
        ctx.globalAlpha = a0;
      } else {
        // 停落：V 形折叠压在腹部上
        const spread = this.dead ? 0.9 : 0.32;
        drawBone(ctx, at, bone, bx, by, heading + Math.PI - side * spread, L * 0.78, 0.85);
      }
    }
  }

  protected drawDead(ctx: CanvasRenderingContext2D) {
    this.drawAlive(ctx);
  }
}
