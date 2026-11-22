/**
 * 观赏类全屏桌面层：
 * - 金鱼 / 锦鲤：AI 生成的俯视写实素材（public/assets/fish），沿“鱼骨链”做连续网格蒙皮（WebGL），
 *   头部带动的跟随链让身体在转弯时自然弯曲，叠加从头到尾逐渐增大的摆尾波；
 *   柔和投影、受惊加速、点击猛冲并荡起水纹
 * - 蝴蝶：素材图拆成左右两片翅膀分别扇动，飘忽飞行、偶尔停落、受惊飞走
 */
import type { FxContext } from "../core/fx";
import { atlas, type Atlas } from "../core/assets";
import { clamp, rand, randInt } from "../core/layer";
import type { PointerInfo } from "../core/runtime";
import { PrankBase, TAU, angleDiff, dist } from "./base";
import { FishGL, type FishMesh } from "./fishgl";

// ---------------------------------------------------------------------------
// 金鱼
// ---------------------------------------------------------------------------

const JOINTS = 14;
/** 网格沿身体的分段数 */
const SEGS = 36;

interface Ring {
  x: number;
  y: number;
  age: number;
}

class Fish {
  /** 鱼骨链：joints[0] 为头 */
  joints: { x: number; y: number }[] = [];
  heading: number;
  speed: number;
  cruise: number;
  phase = rand(0, TAU);
  turnBias = 0;
  burst = 0;
  wanderT = 0;
  wanderTarget = 0;
  /** 本帧中心线（渲染与命中测试共用） */
  spine: { x: number; y: number; a: number }[] = [];

  constructor(
    readonly variant: number,
    readonly length: number,
    readonly width: number,
    x: number,
    y: number,
  ) {
    this.heading = rand(0, TAU);
    this.wanderTarget = this.heading;
    this.cruise = rand(38, 62) * (length / 180);
    this.speed = this.cruise;
    const seg = length / (JOINTS - 1);
    for (let i = 0; i < JOINTS; i++) {
      this.joints.push({ x: x - Math.cos(this.heading) * seg * i, y: y - Math.sin(this.heading) * seg * i });
    }
  }

  get head() {
    return this.joints[0];
  }

  update(dt: number, w: number, h: number, cursor: { x: number; y: number; inside: boolean }, school: Fish[]) {
    const head = this.head;
    // ---- 转向意图 ----
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = rand(1.5, 4);
      this.wanderTarget = this.heading + rand(-1.4, 1.4);
      // 偶尔来一次短冲刺
      if (Math.random() < 0.18) this.burst = Math.max(this.burst, rand(0.6, 1.2));
    }
    let desire = this.wanderTarget;
    let urgency = 0.9;

    // 避开屏幕边缘：朝屏幕中心方向偏转，越靠边越急
    const m = 140;
    const edge = Math.max(0, m - head.x, head.x - (w - m), m - head.y, head.y - (h - m)) / m;
    if (edge > 0) {
      desire = Math.atan2(h / 2 - head.y, w / 2 - head.x);
      urgency = 1.5 + edge * 2;
    }

    // 松散鱼群：分离 + 方向对齐
    let ax = 0;
    let ay = 0;
    for (const o of school) {
      if (o === this) continue;
      const d = dist(head.x, head.y, o.head.x, o.head.y);
      if (d < this.length * 0.9 && d > 0) {
        ax += (head.x - o.head.x) / d;
        ay += (head.y - o.head.y) / d;
      } else if (d < this.length * 3) {
        ax += Math.cos(o.heading) * 0.15;
        ay += Math.sin(o.heading) * 0.15;
      }
    }
    if (ax || ay) desire += angleDiff(desire, Math.atan2(ay, ax)) * 0.25;

    // 受惊：鼠标靠近就加速逃离
    if (cursor.inside) {
      const d = dist(head.x, head.y, cursor.x, cursor.y);
      if (d < 170) {
        desire = Math.atan2(head.y - cursor.y, head.x - cursor.x);
        urgency = 3.2;
        this.burst = Math.max(this.burst, 0.7);
      }
    }

    // 转向速率受速度限制（慢时转得慢，避免原地打转）
    const turnRate = urgency * (0.6 + this.speed / 140);
    const diff = angleDiff(this.heading, desire);
    const turn = clamp(diff, -turnRate * dt, turnRate * dt);
    this.heading += turn;
    this.turnBias = this.turnBias * 0.9 + (turn / Math.max(dt, 1e-3)) * 0.1;

    // ---- 速度：巡航 / 冲刺 / 滑行 ----
    this.burst = Math.max(0, this.burst - dt);
    const target = this.burst > 0 ? this.cruise * 4.2 : this.cruise;
    this.speed += (target - this.speed) * Math.min(1, dt * (this.burst > 0 ? 4 : 1.2));

    head.x += Math.cos(this.heading) * this.speed * dt;
    head.y += Math.sin(this.heading) * this.speed * dt;

    // ---- 跟随链：每节保持固定长度跟随前一节 -> 转弯时身体自然弯曲 ----
    const seg = this.length / (JOINTS - 1);
    let prevDir = this.heading + Math.PI;
    for (let i = 1; i < JOINTS; i++) {
      const p = this.joints[i - 1];
      const c = this.joints[i];
      let a = Math.atan2(c.y - p.y, c.x - p.x);
      // 每节弯曲角有上限：急转弯时身体也只弯成平滑弧线
      a = prevDir + clamp(angleDiff(prevDir, a), -0.17, 0.17);
      c.x = p.x + Math.cos(a) * seg;
      c.y = p.y + Math.sin(a) * seg;
      prevDir = a;
    }

    // 摆尾频率随速度提高
    this.phase += TAU * (1.1 + this.speed / 55) * dt;
    this.buildSpine();
  }

  /** 在跟随链上叠加摆尾波，得到本帧中心线 */
  private buildSpine() {
    const amp = this.length * clamp(0.04 + this.speed / 3200, 0.04, 0.08);
    const out: { x: number; y: number; a: number }[] = [];
    for (let i = 0; i < JOINTS; i++) {
      const s = i / (JOINTS - 1);
      const j = this.joints[i];
      const prev = this.joints[Math.max(0, i - 1)];
      const next = this.joints[Math.min(JOINTS - 1, i + 1)];
      // 链方向（从尾指向头）
      const dirA = Math.atan2(prev.y - next.y, prev.x - next.x);
      // 振幅从头到尾按平方增大，头部几乎不摆
      const lat = Math.sin(this.phase - s * 4.2) * amp * (0.06 + s * s * 0.94);
      out.push({ x: j.x + Math.cos(dirA + Math.PI / 2) * lat, y: j.y + Math.sin(dirA + Math.PI / 2) * lat, a: dirA });
    }
    // 用相邻点重新计算切线方向，让条带朝向与弯曲一致
    for (let i = 0; i < JOINTS; i++) {
      const p = out[Math.max(0, i - 1)];
      const n = out[Math.min(JOINTS - 1, i + 1)];
      out[i].a = Math.atan2(p.y - n.y, p.x - n.x);
    }
    this.spine = out;
  }

  /** 中心线上 s∈[0,1] 处的插值点 */
  private sample(s: number) {
    const f = s * (JOINTS - 1);
    const i = Math.min(JOINTS - 2, Math.floor(f));
    const t = f - i;
    const a = this.spine[i];
    const b = this.spine[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: a.a + angleDiff(a.a, b.a) * t };
  }

  /**
   * 网格蒙皮：素材头朝上，沿长度分 SEGS 段，每段两侧顶点放到中心线法线两侧，
   * 组成连续的三角带（素材 x 轴 -> 鱼体右侧法线，y 轴 -> 从头到尾）。
   */
  mesh(a: Atlas): FishMesh {
    const f = a.frame(this.variant);
    const iw = a.image.width;
    const ih = a.image.height;
    const data = new Float32Array((SEGS + 1) * 2 * 4);
    const hw = this.width / 2;
    let k = 0;
    for (let j = 0; j <= SEGS; j++) {
      const s = j / SEGS;
      const p = this.sample(s);
      const nx = Math.cos(p.a + Math.PI / 2);
      const ny = Math.sin(p.a + Math.PI / 2);
      const v = (f.y + s * f.h) / ih;
      // 左（素材 u 最小）
      data[k++] = p.x - nx * hw;
      data[k++] = p.y - ny * hw;
      data[k++] = f.x / iw;
      data[k++] = v;
      // 右
      data[k++] = p.x + nx * hw;
      data[k++] = p.y + ny * hw;
      data[k++] = (f.x + f.w) / iw;
      data[k++] = v;
    }
    return { data, count: (SEGS + 1) * 2 };
  }

  hit(x: number, y: number) {
    for (let i = 0; i < JOINTS; i += 2) {
      const p = this.spine[i];
      if (p && dist(x, y, p.x, p.y) < this.width * (i < JOINTS * 0.6 ? 0.32 : 0.18)) return true;
    }
    return false;
  }
}

class Goldfish extends PrankBase {
  private fish: Fish[] = [];
  private rings: Ring[] = [];
  private bubbles: { x: number; y: number; r: number; age: number; life: number }[] = [];
  private target: Fish | null = null;
  private gl: FishGL | null = null;

  constructor(ctx: FxContext) {
    super(ctx);
    try {
      this.gl = new FishGL(21);
    } catch (e) {
      console.error("[goldfish] WebGL 初始化失败", e);
    }
    const k = ctx.options.intensity ?? 0.6;
    const n = ctx.options.count ?? Math.round(3 + k * 4);
    const a = atlas("fish");
    for (let i = 0; i < n; i++) {
      const variant = i < 3 ? i : randInt(0, 2);
      const f = a?.frame(variant) ?? { w: 230, h: 575 };
      const len = rand(150, 230) * (0.8 + k * 0.4);
      // 从屏幕外游入；指定位置时在该点附近出现
      const x = ctx.options.x ?? rand(0.2, 0.8) * this.W;
      const y = ctx.options.y ?? rand(0.2, 0.8) * this.H;
      this.fish.push(new Fish(variant, len, (len * f.w) / f.h, x + rand(-80, 80), y + rand(-80, 80)));
    }
  }

  protected step(dt: number) {
    const c = this.ctx.rt.cursor;
    for (const f of this.fish) {
      f.update(dt, this.W, this.H, c, this.fish);
      // 偶尔从嘴边冒个泡
      if (Math.random() < dt * 0.25) {
        this.bubbles.push({ x: f.head.x, y: f.head.y, r: rand(2, 4), age: 0, life: rand(1.2, 2.2) });
      }
    }
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 1.4);
    for (const b of this.bubbles) b.age += dt;
    this.bubbles = this.bubbles.filter((b) => b.age < b.life);
    return true;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("fish");
    if (!a) return;
    const base = ctx.globalAlpha;
    // 鱼身与投影在独立的 WebGL 画布上渲染（连续网格，无接缝）
    this.gl?.render(a, this.fish.map((f) => f.mesh(a)), this.ctx.rt, base, { dx: 10, dy: 16, alpha: 0.14 });
    // 水纹：两道同心圆，向外扩散淡出
    for (const r of this.rings) {
      const t = r.age / 1.4;
      for (const k of [1, 0.6]) {
        ctx.globalAlpha = base * (1 - t) * 0.5 * k;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.2 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 10 + t * 120 * k, 0, TAU);
        ctx.stroke();
      }
    }
    for (const b of this.bubbles) {
      const t = b.age / b.life;
      ctx.globalAlpha = base * (1 - t) * 0.7;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (1 + t * 1.5), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = base;
  }

  hitTest(x: number, y: number) {
    this.target = this.fish.find((f) => f.hit(x, y)) ?? null;
    return !!this.target;
  }

  pointerDown(p: PointerInfo) {
    const f = this.target;
    if (!f) return;
    // 被点到：猛冲 + 水纹，附近的鱼一起受惊
    f.heading = Math.atan2(f.head.y - p.y, f.head.x - p.x) + rand(-0.5, 0.5);
    f.burst = 1.2;
    f.speed = f.cruise * 6;
    this.rings.push({ x: p.x, y: p.y, age: 0 });
    for (const o of this.fish) if (o !== f && dist(o.head.x, o.head.y, p.x, p.y) < 300) o.burst = 0.8;
  }

  dispose() {
    this.gl?.dispose();
  }
}

// ---------------------------------------------------------------------------
// 蝴蝶
// ---------------------------------------------------------------------------

const HUES = [0, 150, 260, -150];
const tintCache = new Map<number, HTMLCanvasElement>();
function tinted(a: Atlas, hue: number) {
  let c = tintCache.get(hue);
  if (!c) {
    const f = a.frame(0);
    c = document.createElement("canvas");
    c.width = f.w;
    c.height = f.h;
    const g = c.getContext("2d")!;
    if (hue) g.filter = `hue-rotate(${hue}deg) saturate(1.1)`;
    g.drawImage(a.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    tintCache.set(hue, c);
  }
  return c;
}

class Butterfly {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  heading = rand(0, TAU);
  phase = rand(0, TAU);
  size = rand(70, 110);
  hue = HUES[randInt(0, HUES.length - 1)];
  landed = 0;
  landTarget: { x: number; y: number } | null = null;
  t = rand(0, 100);

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  update(dt: number, w: number, h: number, cursor: { x: number; y: number; inside: boolean }) {
    this.t += dt;
    const near = cursor.inside && dist(this.x, this.y, cursor.x, cursor.y) < 150;
    if (this.landed > 0) {
      // 停落：慢慢开合翅膀
      this.landed -= dt;
      this.phase += TAU * 0.35 * dt;
      if (near) this.landed = 0;
      if (this.landed <= 0) {
        this.vx = Math.cos(this.heading) * 120;
        this.vy = -80;
      }
      return;
    }
    // 飞行：快速扇翅 + 噪声式飘忽
    this.phase += TAU * (near ? 13 : 9) * dt;
    const wx = Math.sin(this.t * 0.7 + this.size) * 0.8 + Math.sin(this.t * 1.9) * 0.5;
    const wy = Math.cos(this.t * 0.9 + this.size * 2) * 0.8 + Math.sin(this.t * 2.3) * 0.4;
    let ax = wx * 140;
    let ay = wy * 140;
    if (this.landTarget) {
      ax += (this.landTarget.x - this.x) * 1.5;
      ay += (this.landTarget.y - this.y) * 1.5;
      if (dist(this.x, this.y, this.landTarget.x, this.landTarget.y) < 8) {
        this.landed = rand(3, 7);
        this.landTarget = null;
        this.vx = this.vy = 0;
        return;
      }
    } else if (Math.random() < dt * 0.06) {
      this.landTarget = { x: rand(0.1, 0.9) * w, y: rand(0.1, 0.9) * h };
    }
    if (near) {
      const a = Math.atan2(this.y - cursor.y, this.x - cursor.x);
      ax += Math.cos(a) * 900;
      ay += Math.sin(a) * 900;
      this.landTarget = null;
    }
    // 边缘回推
    const m = 60;
    if (this.x < m) ax += 400;
    if (this.x > w - m) ax -= 400;
    if (this.y < m) ay += 400;
    if (this.y > h - m) ay -= 400;
    // 扇翅下拍时产生升力（速度随相位起伏）
    const lift = Math.max(0, Math.sin(this.phase)) * 60;
    this.vx = (this.vx + ax * dt) * Math.pow(0.35, dt);
    this.vy = (this.vy + (ay - lift) * dt) * Math.pow(0.35, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 10) this.heading += angleDiff(this.heading, Math.atan2(this.vy, this.vx)) * Math.min(1, dt * 3);
  }

  draw(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, dpr: number, alpha: number) {
    const W = this.size;
    const H = (W * img.height) / img.width;
    // 翅膀开合：1 = 完全展开，接近 0 = 竖起（俯视只见窄边）
    const open = this.landed > 0 ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(this.phase)) : 0.12 + 0.88 * (0.5 + 0.5 * Math.cos(this.phase));
    const rot = this.heading + Math.PI / 2;
    const c = Math.cos(rot) * dpr;
    const s = Math.sin(rot) * dpr;
    const half = img.width / 2;
    // 投影（飞行时离地更远，更淡更偏）
    const off = this.landed > 0 ? 4 : 18;
    ctx.globalAlpha = alpha * (this.landed > 0 ? 0.1 : 0.05);
    ctx.setTransform(c, s, -s, c, (this.x + off) * dpr, (this.y + off * 1.3) * dpr);
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 0, (W / 2) * open, H * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
    // 左右翅膀以身体中线为轴分别缩放
    for (const side of [-1, 1]) {
      ctx.setTransform(c * open, s * open, -s, c, this.x * dpr, this.y * dpr);
      const sx = side < 0 ? 0 : half;
      ctx.drawImage(img, sx, 0, half, img.height, side < 0 ? -W / 2 : 0, -H / 2, W / 2, H);
    }
    // 身体保持原宽度叠在中间
    ctx.setTransform(c, s, -s, c, this.x * dpr, this.y * dpr);
    const bw = img.width * 0.07;
    ctx.drawImage(img, half - bw / 2, img.height * 0.08, bw, img.height * 0.84, (-W * 0.07) / 2, -H * 0.42, W * 0.07, H * 0.84);
  }
}

class Butterflies extends PrankBase {
  private list: Butterfly[] = [];

  constructor(ctx: FxContext) {
    super(ctx);
    const n = ctx.options.count ?? Math.round(2 + (ctx.options.intensity ?? 0.6) * 3);
    for (let i = 0; i < n; i++) {
      this.list.push(new Butterfly(ctx.options.x ?? rand(0.2, 0.8) * this.W, ctx.options.y ?? rand(0.2, 0.8) * this.H));
    }
  }

  protected step(dt: number) {
    for (const b of this.list) b.update(dt, this.W, this.H, this.ctx.rt.cursor);
    return true;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("butterfly");
    if (!a) return;
    const dpr = this.ctx.rt.dpr;
    const base = ctx.globalAlpha;
    for (const b of this.list) b.draw(ctx, tinted(a, b.hue), dpr, base);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = base;
  }
}

export const createGoldfish = (ctx: FxContext) => new Goldfish(ctx);
export const createButterfly = (ctx: FxContext) => new Butterflies(ctx);
