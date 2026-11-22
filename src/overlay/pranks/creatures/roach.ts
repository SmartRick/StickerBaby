/**
 * 蟑螂：用 roach_parts（德国小蠊）/ roach2_parts（美洲大蠊）部件图集拼装的骨骼动画。
 *
 * 部件帧（两套图集布局相同）：
 *   0-5 基节+腿节、6-11 胫节、12-17 跗节（每 2 帧一对：前/中/后足 × 左右）
 *   18 身体俯视（前胸背板在上）、20/21 前翅、22/23 尾须、25/27 左右触角
 * 身体用实拍图（roach_body，素材/蟑螂/美洲大蠊.png 去掉腿和触须），腿、触角、尾须用部件骨骼动画。
 * 步态：交替三足（左前+右中+左后 / 右前+左中+右后），相位由行进距离驱动，
 *       支撑相足端相对地面不动，摆动相快速前移。
 */
import { type Atlas, atlas } from "../../core/assets";
import { clamp, rand } from "../../core/layer";
import { TAU, angleDiff } from "../base";
import { type BoneDef, drawBone, ik2, manualBone, toWorld, verticalBone, wobble } from "./bone";
import { Critter, type World } from "./critter";

type Variant = "roach_parts" | "roach2_parts";

interface LegDef {
  /** 髋关节（体坐标，单位 = 体长） */
  hx: number;
  hy: number;
  /** 静止足端 */
  fx: number;
  fy: number;
  /** 膝盖弯向：+1 / -1（相对于左右侧再取符号） */
  bend: number;
  /** 三足组 0 / 1 */
  group: number;
  pair: 0 | 1 | 2;
  side: -1 | 1;
}

// 体坐标：+x 向前，+y 向右；单位 = 体长
const LEGS: LegDef[] = [];
for (const side of [-1, 1] as const) {
  LEGS.push({ pair: 0, side, hx: 0.2, hy: 0.1 * side, fx: 0.6, fy: 0.5 * side, bend: -1, group: side < 0 ? 0 : 1 });
  LEGS.push({ pair: 1, side, hx: 0.06, hy: 0.13 * side, fx: 0.02, fy: 0.72 * side, bend: -1, group: side < 0 ? 1 : 0 });
  LEGS.push({ pair: 2, side, hx: -0.06, hy: 0.13 * side, fx: -0.62, fy: 0.62 * side, bend: 1, group: side < 0 ? 0 : 1 });
}

interface Rig {
  at: Atlas;
  femur: BoneDef[];
  tibia: BoneDef[];
  tarsus: BoneDef[];
  antL: BoneDef;
  antR: BoneDef;
  cercL: BoneDef;
  cercR: BoneDef;
  wingL: BoneDef;
  wingR: BoneDef;
  bodyH: number;
  bodyW: number;
}

const rigs = new Map<Variant, Rig>();

function rig(v: Variant): Rig | null {
  const hit = rigs.get(v);
  if (hit) return hit;
  const at = atlas(v);
  if (!at) return null;
  const vb = (i: number) => verticalBone(at, i);
  const horizontalWings = at.frame(20).w > at.frame(20).h;
  const r: Rig = {
    at,
    femur: [0, 1, 2, 3, 4, 5].map(vb),
    tibia: [6, 7, 8, 9, 10, 11].map(vb),
    tarsus: [12, 13, 14, 15, 16, 17].map(vb),
    // 触角：25 关节端在左下，弧线凸向弦的左侧 -> 左触角；27 对称
    antL: manualBone(at, 25, 0.02, 0.97, 0.98, 0.03),
    antR: manualBone(at, 27, 0.98, 0.97, 0.02, 0.03),
    cercL: vb(22),
    cercR: vb(23),
    wingL: horizontalWings ? manualBone(at, 20, 0.97, 0.5, 0.03, 0.5) : manualBone(at, 20, 0.5, 0.02, 0.5, 0.98),
    wingR: horizontalWings ? manualBone(at, 21, 0.03, 0.5, 0.97, 0.5) : manualBone(at, 21, 0.5, 0.02, 0.5, 0.98),
    bodyH: at.frame(18).h,
    bodyW: at.frame(18).w,
  };
  rigs.set(v, r);
  return r;
}

export class Cockroach extends Critter {
  /** 腿和触角统一用美洲大蠊部件，与实拍身体颜色一致 */
  private variant: Variant = "roach2_parts";
  /** 体长（px） */
  private L = rand(50, 72);
  private gait = rand(0, TAU);
  /** 本帧转向角速度（rad/s），转身时腿也要迈步 */
  private omega = 0;
  /** 0..1 腿部动作强度（平移 + 转身） */
  private activity = 0;
  private seedA = rand(0, 100);
  private ant = [rand(-0.2, 0.2), rand(-0.2, 0.2)];
  private antTarget = [0, 0];
  private antTimer = 0;

  /** 转向速率与移动速度挂钩：几乎静止时只能慢慢转，不会原地打转 */
  protected steer(dt: number, w: World) {
    const h0 = this.heading;
    super.steer(dt, w);
    const maxTurn = (0.8 + this.speed / 25) * dt;
    this.heading = h0 + clamp(angleDiff(h0, this.heading), -maxTurn, maxTurn);
    this.omega = angleDiff(h0, this.heading) / Math.max(dt, 1e-3);
  }

  update(dt: number, w: World) {
    super.update(dt, w);
    if (this.dead) return;
    // 步幅约 0.32 体长：相位由“平移距离 + 转身时足端绕行的距离”共同推进
    const travel = this.speed + Math.abs(this.omega) * this.L * 0.45;
    this.gait += (travel * dt) / (this.L * 0.32) * Math.PI;
    this.activity += (Math.min(1, travel / 40) - this.activity) * Math.min(1, dt * 10);
    // 触角：随机选新的探索方向，平滑转过去；停下时探得更频繁、幅度更大
    this.antTimer -= dt;
    if (this.antTimer <= 0) {
      const idle = this.speed < 15;
      this.antTimer = idle ? rand(0.25, 0.7) : rand(0.5, 1.2);
      const amp = idle ? 0.55 : 0.3;
      this.antTarget = [rand(-amp, amp), rand(-amp, amp)];
    }
    for (let i = 0; i < 2; i++) this.ant[i] += (this.antTarget[i] - this.ant[i]) * Math.min(1, dt * 7);
  }

  hit(x: number, y: number) {
    if (this.dead) return false;
    // 体坐标下的椭圆命中
    const c = Math.cos(-this.heading);
    const s = Math.sin(-this.heading);
    const dx = x - this.x;
    const dy = y - this.y;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    return (lx / (this.L * 0.6)) ** 2 + (ly / (this.L * 0.35)) ** 2 < 1;
  }

  protected drawAlive(ctx: CanvasRenderingContext2D) {
    const R = rig(this.variant);
    if (!R) return;
    const L = this.L;
    const { x, y, heading } = this;
    const at = R.at;
    const bodyScale = L / R.bodyH;
    const legScale = bodyScale * 0.5;
    const moving = this.dead ? 0 : this.activity;

    // 接地阴影
    ctx.save();
    ctx.translate(x + 2, y + 3);
    ctx.rotate(heading);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.scale(1, 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, L * 0.55, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 触角：从头部前端伸出，两根独立探索 + 高频细颤；逃跑时向后贴
    const tw = this.t * (this.fleeing ? 6 : 3);
    for (const side of [-1, 1] as const) {
      const [bx, by] = toWorld(x, y, heading, L * 0.47, side * L * 0.045);
      const i = side < 0 ? 0 : 1;
      const tremble = wobble(tw, this.seedA + side * 3) * 0.08;
      const spread = this.fleeing ? 0.16 : 0.42;
      const ang = heading + side * spread + (this.fleeing ? 0 : this.ant[i]) + tremble + (this.dead ? side * 0.6 : 0);
      drawBone(ctx, at, side < 0 ? R.antR : R.antL, bx, by, ang, L * 1.2, 1.4);
    }
    // 尾须
    for (const side of [-1, 1] as const) {
      const [bx, by] = toWorld(x, y, heading, -L * 0.46, side * L * 0.05);
      drawBone(ctx, at, side < 0 ? R.cercL : R.cercR, bx, by, heading + Math.PI - side * 0.4, L * 0.22);
    }

    // 腿：支撑相足端后移（相对身体），摆动相快速前移
    const stride = 0.3;
    for (const leg of LEGS) {
      const i = leg.pair * 2 + (leg.side < 0 ? 0 : 1);
      const u = (((this.gait / TAU + leg.group * 0.5) % 1) + 1) % 1;
      let off: number;
      let lift = 0;
      if (u < 0.55) off = stride * (0.5 - u / 0.55);
      else {
        const v = (u - 0.55) / 0.45;
        off = stride * (-0.5 + v);
        lift = Math.sin(v * Math.PI);
      }
      off *= moving;
      lift *= moving;
      const splay = this.dead ? 1.18 : 1;
      const [hx, hy] = toWorld(x, y, heading, leg.hx * L, leg.hy * L);
      const [fx, fy] = toWorld(
        x,
        y,
        heading,
        (leg.fx + off) * L * splay,
        leg.fy * L * splay * (1 - lift * 0.12),
      );
      const fem = R.femur[i];
      const tib = R.tibia[i];
      const tar = R.tarsus[i];
      const l1 = fem.len * legScale;
      const l2 = tib.len * legScale;
      const l3 = tar.len * legScale * 0.85;
      const k = ik2(hx, hy, fx, fy, l1, l2 + l3 * 0.9, leg.bend * leg.side);
      drawBone(ctx, at, fem, hx, hy, k.a1, l1, 1.15);
      // 胫节沿第二骨方向，跗节再向外弯一点
      const tarBend = leg.side * leg.bend * -0.35;
      const tx = k.kx + Math.cos(k.a2 - tarBend * 0.3) * l2;
      const ty = k.ky + Math.sin(k.a2 - tarBend * 0.3) * l2;
      drawBone(ctx, at, tib, k.kx, k.ky, k.a2 - tarBend * 0.3, l2, 1.25);
      drawBone(ctx, at, tar, tx, ty, k.a2 + tarBend, l3, 1.2);
    }

    // 身体（实拍）：跑动时轻微左右摆
    const body = atlas("roach_body");
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading + Math.PI / 2 + Math.sin(this.gait) * 0.035 * moving);
    if (body) {
      const f = body.frame(0);
      body.draw(ctx, 0, 0, 0, (L * 1.08 * f.w) / f.h, L * 1.08);
    } else {
      at.draw(ctx, 18, 0, 0, R.bodyW * bodyScale, L);
    }
    ctx.restore();
  }

  protected drawDead(ctx: CanvasRenderingContext2D) {
    this.drawAlive(ctx);
  }
}

