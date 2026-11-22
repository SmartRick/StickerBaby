/**
 * 写实壁虎（程序化绘制）：
 * - 跟随链脊柱 + 与步态耦合的 S 形扭动，尾巴自然甩动
 * - 四条腿两段 IK，对角线成对迈步（左前+右后 / 右前+左后），落脚点固定在地面
 * - 平滑身体轮廓（头-颈-躯干-渐细的尾），背部深色脊纹、斑点 / 尾环、侧光高光
 * - 竖瞳眼睛、五趾吸盘脚；停下时会转头、吐舌
 */
import { clamp, pick, rand } from "../../core/layer";
import { TAU, angleDiff, dist } from "../base";
import { Critter, type Params, type World } from "./critter";

const N = 26;

interface Palette {
  base: string;
  dark: string;
  belly: string;
  spot: string;
  light: string;
  spots: "spots" | "bands" | "red";
}

const PALETTES: Palette[] = [
  // 家壁虎：灰褐半透明，深色碎斑
  { base: "#bfae92", dark: "#8a7a62", belly: "#ddd2bd", spot: "#6f5f48", light: "#efe6d4", spots: "spots" },
  // 豹纹守宫：黄色底黑斑，尾巴有环纹
  { base: "#e6c25a", dark: "#b8902f", belly: "#f4e3b0", spot: "#2e2618", light: "#fff2c4", spots: "bands" },
  // 绿色日行守宫：亮绿带红点
  { base: "#58b847", dark: "#3b8a2f", belly: "#b7e3a3", spot: "#d8452c", light: "#c8f2b0", spots: "red" },
];

interface Foot {
  joint: number;
  side: -1 | 1;
  front: boolean;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** 迈步进度 0..1，<0 表示着地 */
  st: number;
}

interface SpinePt {
  x: number;
  y: number;
  a: number;
}

export class Gecko extends Critter {
  private pts: { x: number; y: number }[] = [];
  private spine: SpinePt[] = [];
  private feet: Foot[] = [];
  private gait = 0;
  private sc = rand(1.05, 1.35);
  private seg = 6.6;
  private pal = pick(PALETTES);
  private marks: { s: number; u: number; r: number; k: number }[] = [];
  private headTurn = 0;
  private headTurnTarget = 0;
  private tongue = 0;
  private blink = 0;

  constructor(P: Params) {
    super(P);
    this.seg = 6.6 * this.sc;
    // 斑点在身体坐标系（s=沿脊柱 0..1，u=横向 -1..1）中固定，随身体一起弯曲
    for (let i = 0; i < 46; i++) {
      this.marks.push({ s: rand(0.1, 0.92), u: rand(-0.8, 0.8), r: rand(0.8, 2.2), k: Math.random() });
    }
  }

  private init() {
    this.pts = [];
    for (let i = 0; i < N; i++) {
      this.pts.push({ x: this.x - Math.cos(this.heading) * i * this.seg, y: this.y - Math.sin(this.heading) * i * this.seg });
    }
    this.buildSpine(0);
    const legs: [number, -1 | 1, boolean][] = [
      [4, -1, true],
      [4, 1, true],
      [10, -1, false],
      [10, 1, false],
    ];
    this.feet = legs.map(([joint, side, front]) => {
      const f: Foot = { joint, side, front, x: 0, y: 0, fromX: 0, fromY: 0, toX: 0, toY: 0, st: -1 };
      [f.x, f.y] = this.ideal(f, 0);
      return f;
    });
  }

  spawnAtEdge(W: number, H: number) {
    super.spawnAtEdge(W, H);
    this.init();
  }

  place(x: number, y: number) {
    super.place(x, y);
    this.init();
  }

  /** 半宽轮廓：头 -> 颈 -> 躯干 -> 胯 -> 渐细的尾 */
  private halfWidth(i: number) {
    const s = this.sc;
    const prof: [number, number][] = [
      [0, 4.2],
      [1, 7.2],
      [2, 6.6],
      [3, 4.9],
      [4, 6.6],
      [6, 8.6],
      [8, 8.2],
      [10, 6.4],
      [11, 5.4],
      [14, 4.2],
      [19, 2.6],
      [25, 0.7],
    ];
    for (let k = 1; k < prof.length; k++) {
      if (i <= prof[k][0]) {
        const [i0, w0] = prof[k - 1];
        const [i1, w1] = prof[k];
        const t = (i - i0) / (i1 - i0);
        return (w0 + (w1 - w0) * (0.5 - 0.5 * Math.cos(Math.PI * t))) * s;
      }
    }
    return 0.7 * s;
  }

  /** 原地几乎转不动：转向速率随速度提高，避免身体对折 */
  protected steer(dt: number, w: World) {
    const h0 = this.heading;
    super.steer(dt, w);
    const maxTurn = (0.35 + this.speed / 100) * dt;
    this.heading = h0 + clamp(angleDiff(h0, this.heading), -maxTurn, maxTurn);
  }

  update(dt: number, w: World) {
    super.update(dt, w);
    if (this.dead || !this.pts.length) return;
    // 头部带动跟随链；每节相对前一节的弯曲角有上限，身体不会折叠
    this.pts[0].x = this.x;
    this.pts[0].y = this.y;
    let prevDir = this.heading + Math.PI; // 指向身后
    for (let i = 1; i < N; i++) {
      const p = this.pts[i - 1];
      const c = this.pts[i];
      let a = Math.atan2(c.y - p.y, c.x - p.x);
      const maxBend = i < 11 ? 0.12 : 0.2;
      a = prevDir + clamp(angleDiff(prevDir, a), -maxBend, maxBend);
      c.x = p.x + Math.cos(a) * this.seg;
      c.y = p.y + Math.sin(a) * this.seg;
      prevDir = a;
    }
    // 步态相位按移动距离推进
    this.gait += (this.speed * dt) / (14 * this.sc);
    // 停下时偶尔转头、吐舌、眨眼
    const still = this.speed < 8;
    if (still && Math.random() < dt * 0.8) this.headTurnTarget = rand(-0.6, 0.6);
    if (!still) this.headTurnTarget = 0;
    this.headTurn += (this.headTurnTarget - this.headTurn) * Math.min(1, dt * 6);
    if (still && this.tongue <= 0 && Math.random() < dt * 0.35) this.tongue = 0.35;
    this.tongue = Math.max(0, this.tongue - dt);
    if (this.blink <= 0 && Math.random() < dt * 0.25) this.blink = 0.18;
    this.blink = Math.max(0, this.blink - dt);
    this.buildSpine(dt);
    this.stepFeet(dt);
  }

  /** 跟随链 + 步态扭动 + 转头 -> 本帧脊柱 */
  private buildSpine(_dt: number) {
    const amp = clamp(this.speed / 120, 0, 1) * 4.2 * this.sc;
    const out: SpinePt[] = this.pts.map((p) => ({ x: p.x, y: p.y, a: 0 }));
    for (let i = 0; i < N; i++) {
      const prev = this.pts[Math.max(0, i - 1)];
      const next = this.pts[Math.min(N - 1, i + 1)];
      const a = Math.atan2(prev.y - next.y, prev.x - next.x);
      // S 形扭动：躯干段最明显，头部与尾尖衰减
      const env = i < 2 ? 0.2 : i < 13 ? 1 : Math.max(0.3, 1 - (i - 13) / 16);
      const lat = Math.sin(this.gait * Math.PI - i * 0.42) * amp * env;
      out[i].x += Math.cos(a + Math.PI / 2) * lat;
      out[i].y += Math.sin(a + Math.PI / 2) * lat;
    }
    // 转头：前三节绕颈部旋转
    if (Math.abs(this.headTurn) > 0.01) {
      const pivot = out[3];
      for (let i = 0; i < 3; i++) {
        const k = this.headTurn * (1 - i / 3);
        const dx = out[i].x - pivot.x;
        const dy = out[i].y - pivot.y;
        const c = Math.cos(k);
        const s = Math.sin(k);
        out[i].x = pivot.x + dx * c - dy * s;
        out[i].y = pivot.y + dx * s + dy * c;
      }
    }
    for (let i = 0; i < N; i++) {
      const p = out[Math.max(0, i - 1)];
      const n = out[Math.min(N - 1, i + 1)];
      out[i].a = Math.atan2(p.y - n.y, p.x - n.x);
    }
    this.spine = out;
  }

  /** 腿根位置 */
  private hip(f: Foot) {
    const p = this.spine[f.joint];
    const n = p.a + (f.side * Math.PI) / 2;
    const r = this.halfWidth(f.joint) * 0.75;
    return { x: p.x + Math.cos(n) * r, y: p.y + Math.sin(n) * r, a: p.a };
  }

  /** 理想落脚点（lead = 预判前移量） */
  private ideal(f: Foot, lead: number): [number, number] {
    const h = this.hip(f);
    const reach = 15 * this.sc;
    const fwd = (f.front ? 9 : -3) * this.sc + lead;
    const n = h.a + (f.side * Math.PI) / 2;
    return [
      h.x + Math.cos(n) * reach + Math.cos(h.a) * fwd,
      h.y + Math.sin(n) * reach + Math.sin(h.a) * fwd,
    ];
  }

  private stepFeet(dt: number) {
    const stepDur = clamp(0.16 - this.speed / 2500, 0.07, 0.16);
    const groupA = [this.feet[0], this.feet[3]]; // 左前 + 右后
    const groupB = [this.feet[1], this.feet[2]];
    const stepping = (g: Foot[]) => g.some((f) => f.st >= 0);
    for (const f of this.feet) {
      if (f.st >= 0) {
        f.st += dt / stepDur;
        const t = Math.min(1, f.st);
        const e = t * t * (3 - 2 * t);
        f.x = f.fromX + (f.toX - f.fromX) * e;
        f.y = f.fromY + (f.toY - f.fromY) * e;
        if (f.st >= 1) f.st = -1;
      }
    }
    for (const [g, other] of [
      [groupA, groupB],
      [groupB, groupA],
    ]) {
      if (stepping(g) || stepping(other)) continue;
      const need = g.some((f) => {
        const [ix, iy] = this.ideal(f, 0);
        return dist(f.x, f.y, ix, iy) > 10 * this.sc;
      });
      if (need) {
        for (const f of g) {
          const [tx, ty] = this.ideal(f, Math.min(10, this.speed * 0.08) * this.sc);
          f.fromX = f.x;
          f.fromY = f.y;
          f.toX = tx;
          f.toY = ty;
          f.st = 0;
        }
        break;
      }
    }
  }

  hit(x: number, y: number) {
    if (this.dead || !this.spine.length) return false;
    for (let i = 0; i < 14; i += 2) {
      const p = this.spine[i];
      if (dist(x, y, p.x, p.y) < this.halfWidth(i) + 7) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // 绘制
  // ---------------------------------------------------------------------------

  private outline(ctx: CanvasRenderingContext2D) {
    const sp = this.spine;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i < N; i++) {
      const p = sp[i];
      const w = this.halfWidth(i);
      const n = p.a + Math.PI / 2;
      left.push([p.x + Math.cos(n) * w, p.y + Math.sin(n) * w]);
      right.push([p.x - Math.cos(n) * w, p.y - Math.sin(n) * w]);
    }
    const h = sp[0];
    const tip: [number, number] = [h.x + Math.cos(h.a) * 4.5 * this.sc, h.y + Math.sin(h.a) * 4.5 * this.sc];
    const pts = [tip, ...left, ...right.reverse()];
    // 中点二次曲线平滑
    ctx.beginPath();
    const m0 = [(pts[pts.length - 1][0] + pts[0][0]) / 2, (pts[pts.length - 1][1] + pts[0][1]) / 2];
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    ctx.closePath();
  }

  /** 身体坐标 (s, u) -> 屏幕坐标 */
  private bodyPoint(s: number, u: number) {
    const f = s * (N - 1);
    const i = Math.min(N - 2, Math.floor(f));
    const t = f - i;
    const a = this.spine[i];
    const b = this.spine[i + 1];
    const ang = a.a + angleDiff(a.a, b.a) * t;
    const w = this.halfWidth(f) * u;
    const n = ang + Math.PI / 2;
    return { x: a.x + (b.x - a.x) * t + Math.cos(n) * w, y: a.y + (b.y - a.y) * t + Math.sin(n) * w, a: ang };
  }

  private drawLeg(ctx: CanvasRenderingContext2D, f: Foot) {
    const sc = this.sc;
    const h = this.hip(f);
    const l1 = 9 * sc;
    const l2 = 8.5 * sc;
    const dx = f.x - h.x;
    const dy = f.y - h.y;
    const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.1, l1 + l2 - 0.1);
    const base = Math.atan2(dy, dx);
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    // 前腿肘部朝后，后腿膝部朝前
    const bend = (f.front ? -1 : 1) * f.side;
    const ka = base + bend * Math.acos(cosA);
    const kx = h.x + Math.cos(ka) * l1;
    const ky = h.y + Math.sin(ka) * l1;
    const lift = f.st >= 0 ? Math.sin(Math.min(1, f.st) * Math.PI) : 0;
    const fx = h.x + Math.cos(base) * d;
    const fy = h.y + Math.sin(base) * d;

    ctx.lineCap = "round";
    ctx.strokeStyle = this.pal.dark;
    ctx.lineWidth = 7 * sc;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.strokeStyle = this.pal.base;
    ctx.lineWidth = 5.6 * sc;
    ctx.stroke();
    ctx.strokeStyle = this.pal.dark;
    ctx.lineWidth = 5.2 * sc;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.strokeStyle = this.pal.base;
    ctx.lineWidth = 3.9 * sc;
    ctx.stroke();

    // 五趾：以小腿方向为中轴扇形张开，末端圆形吸盘；抬脚时略收拢
    const fa = Math.atan2(fy - ky, fx - kx);
    const spread = 0.48 * (1 - lift * 0.4);
    const toe = 6.4 * sc;
    for (let k = -2; k <= 2; k++) {
      const ta = fa + k * spread;
      const ex = fx + Math.cos(ta) * toe * (k === 0 ? 1.1 : 1);
      const ey = fy + Math.sin(ta) * toe * (k === 0 ? 1.1 : 1);
      ctx.strokeStyle = this.pal.dark;
      ctx.lineWidth = 1.9 * sc;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = this.pal.belly;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 1.9 * sc, 1.5 * sc, ta, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  protected drawAlive(ctx: CanvasRenderingContext2D) {
    if (!this.spine.length) return;
    const sc = this.sc;
    const pal = this.pal;
    const sp = this.spine;

    // 投影
    ctx.save();
    ctx.translate(3 * sc, 5 * sc);
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = "#000";
    this.outline(ctx);
    ctx.fill();
    ctx.restore();

    for (const f of this.feet) this.drawLeg(ctx, f);

    // 身体底色：沿身体方向的渐变（头部稍深）
    this.outline(ctx);
    const h = sp[0];
    const t = sp[N - 1];
    const g = ctx.createLinearGradient(h.x, h.y, t.x, t.y);
    g.addColorStop(0, pal.dark);
    g.addColorStop(0.12, pal.base);
    g.addColorStop(0.6, pal.base);
    g.addColorStop(1, pal.dark);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // 背部脊纹（沿脊柱的深色宽带）
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = pal.dark;
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = 5.5 * sc;
    ctx.beginPath();
    ctx.moveTo(sp[2].x, sp[2].y);
    for (let i = 3; i < N; i++) ctx.lineTo(sp[i].x, sp[i].y);
    ctx.stroke();
    ctx.globalAlpha /= 0.55;

    // 侧光：一侧边缘提亮、另一侧压暗，营造圆柱体积
    for (const [side, col, alpha] of [
      [1, pal.light, 0.55],
      [-1, "#000", 0.22],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.globalAlpha *= alpha;
      ctx.lineWidth = 2.6 * sc;
      ctx.beginPath();
      for (let i = 1; i < N - 2; i++) {
        const q = this.bodyPoint(i / (N - 1), side * 0.72);
        if (i === 1) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      ctx.globalAlpha /= alpha;
    }

    // 花纹
    ctx.fillStyle = pal.spot;
    if (pal.spots === "bands") {
      // 豹纹守宫：躯干黑斑 + 尾巴环纹
      for (const m of this.marks) {
        if (m.s > 0.45) continue;
        const q = this.bodyPoint(m.s, m.u);
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, m.r * sc * 1.1, m.r * sc * 0.8, q.a, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = pal.spot;
      for (let s = 0.47; s < 0.95; s += 0.065) {
        const a = this.bodyPoint(s, -1.2);
        const b = this.bodyPoint(s, 1.2);
        ctx.lineWidth = 3.2 * sc * (1 - (s - 0.45));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    } else {
      for (const m of this.marks) {
        const q = this.bodyPoint(m.s, m.u);
        ctx.globalAlpha *= pal.spots === "red" ? 0.85 : 0.55 + m.k * 0.35;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, m.r * sc * (pal.spots === "red" ? 0.8 : 1.2), m.r * sc * 0.7, q.a + m.k, 0, TAU);
        ctx.fill();
        ctx.globalAlpha /= pal.spots === "red" ? 0.85 : 0.55 + m.k * 0.35;
      }
    }
    // 细密鳞纹颗粒
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 70; i++) {
      const s = ((i * 0.618) % 1) * 0.9 + 0.03;
      const u = (((i * 0.383) % 1) - 0.5) * 1.6;
      const q = this.bodyPoint(s, u);
      ctx.fillRect(q.x, q.y, 0.9 * sc, 0.9 * sc);
    }
    ctx.restore();

    // 轮廓线
    this.outline(ctx);
    ctx.strokeStyle = "rgba(40,30,20,0.35)";
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // 舌头（分叉）
    if (this.tongue > 0) {
      const k = Math.sin((this.tongue / 0.35) * Math.PI);
      const len = 14 * sc * k;
      const tx = h.x + Math.cos(h.a) * (4 * sc + len);
      const ty = h.y + Math.sin(h.a) * (4 * sc + len);
      ctx.strokeStyle = "#e8576a";
      ctx.lineWidth = 1.6 * sc;
      ctx.beginPath();
      ctx.moveTo(h.x + Math.cos(h.a) * 4 * sc, h.y + Math.sin(h.a) * 4 * sc);
      ctx.lineTo(tx, ty);
      for (const s of [-0.5, 0.5]) {
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(h.a + s) * 3 * sc, ty + Math.sin(h.a + s) * 3 * sc);
      }
      ctx.stroke();
    }

    // 眼睛：头部两侧鼓起，竖瞳 + 高光
    const eyeP = sp[1];
    for (const side of [-1, 1]) {
      const n = eyeP.a + (side * Math.PI) / 2;
      const r = this.halfWidth(1) * 0.78;
      const ex = eyeP.x + Math.cos(n) * r + Math.cos(eyeP.a) * 1.2 * sc;
      const ey = eyeP.y + Math.sin(n) * r + Math.sin(eyeP.a) * 1.2 * sc;
      const er = 2.7 * sc;
      ctx.fillStyle = pal.dark;
      ctx.beginPath();
      ctx.arc(ex, ey, er + 0.9 * sc, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.blink > 0 ? pal.base : "#c9a43a";
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fill();
      if (this.blink <= 0) {
        ctx.fillStyle = "#15110b";
        ctx.beginPath();
        ctx.ellipse(ex, ey, er * 0.82, er * 0.22, eyeP.a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(ex - 0.8 * sc, ey - 0.8 * sc, 0.75 * sc, 0, TAU);
        ctx.fill();
      }
    }
    // 鼻孔
    ctx.fillStyle = "rgba(30,20,10,0.6)";
    for (const side of [-1, 1]) {
      const n = h.a + (side * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(h.x + Math.cos(h.a) * 3 * sc + Math.cos(n) * 1.6 * sc, h.y + Math.sin(h.a) * 3 * sc + Math.sin(n) * 1.6 * sc, 0.6 * sc, 0, TAU);
      ctx.fill();
    }
  }
}
