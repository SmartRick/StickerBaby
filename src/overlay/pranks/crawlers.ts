/**
 * 爬行类恶作剧：蜈蚣、千足虫、蟑螂、蛆、壁虎、苍蝇、蚂蚁队列。
 *
 * 公共行为（Critter.steer）：随机游走 + 屏幕边缘回避 + 躲避鼠标 + 受惊逃散 + 随机停顿。
 * 点击虫子 = 拍死：留下溅射痕迹，几秒后淡出，附近同伴受惊四散。
 * 光标位置来自 Rust 全局轮询，所以即便悬浮层处于穿透状态，虫子也能躲鼠标。
 */
import type { PrankKind } from "../../shared/protocol";
import type { FxContext } from "../core/fx";
import { clamp, rand } from "../core/layer";
import type { PointerInfo } from "../core/runtime";
import { PrankBase, TAU, dist } from "./base";
import { Critter, type Params, type Pt, type World } from "./creatures/critter";
import { Fly } from "./creatures/fly";
import { Segmented } from "./creatures/segmented";
import { Gecko } from "./creatures/gecko";
import { Cockroach } from "./creatures/roach";

// ---------------------------------------------------------------------------
// 蛆（蠕动）
// ---------------------------------------------------------------------------

class Maggot extends Critter {
  scale = rand(0.8, 1.2);

  protected steer(dt: number, w: World) {
    super.steer(dt, w);
    // 一伸一缩的蠕动推进
    const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(this.t * 7 + this.p1));
    this.x -= Math.cos(this.heading) * this.speed * dt * (1 - pulse);
    this.y -= Math.sin(this.heading) * this.speed * dt * (1 - pulse);
  }

  protected drawAlive(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);
    ctx.scale(this.scale, this.scale);
    const n = 10;
    const t = this.dead ? 0 : this.t;
    for (let i = n - 1; i >= 0; i--) {
      const u = i / (n - 1);
      const x = (0.5 - u) * 26 * (1 + 0.12 * Math.sin(t * 7 + this.p1 - u * 4));
      const y = Math.sin(t * 4 - u * 5) * 1.6;
      const r = 4.6 * Math.pow(Math.sin(Math.PI * (u * 0.9 + 0.08)), 0.55);
      const g = ctx.createRadialGradient(x - 1, y - 1.5, 0.5, x, y, r);
      g.addColorStop(0, "#fffaf0");
      g.addColorStop(0.7, "#eee2c2");
      g.addColorStop(1, "#c9b68e");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#3a2a1a";
    ctx.beginPath();
    ctx.arc(13.5, Math.sin(t * 4) * 1.6, 1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 蚂蚁队列：沿一条穿越屏幕的曲线行进，遇到鼠标会绕开
// ---------------------------------------------------------------------------

class AntPath {
  pts: Pt[] = [];
  cum: number[] = [];
  length = 0;

  constructor(W: number, H: number) {
    const horizontal = Math.random() < 0.6;
    const ctrl: Pt[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      if (horizontal) ctrl.push([-60 + u * (W + 120), H * rand(0.2, 0.8)]);
      else ctrl.push([W * rand(0.2, 0.8), -60 + u * (H + 120)]);
    }
    if (Math.random() < 0.5) ctrl.reverse();
    // Catmull-Rom 采样
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)];
      const p1 = ctrl[i];
      const p2 = ctrl[i + 1];
      const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      for (let k = 0; k < 24; k++) {
        const t = k / 24;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        this.pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    this.pts.push(ctrl[ctrl.length - 1]);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + dist(this.pts[i - 1][0], this.pts[i - 1][1], this.pts[i][0], this.pts[i][1]));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** 返回 [x, y, 切线角] */
  at(s: number): [number, number, number] {
    s = clamp(s, 0, this.length);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < s) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    const a = this.pts[lo];
    const b = this.pts[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
}

class Ant extends Critter {
  s = 0;
  lat = 0;
  latTarget = 0;
  pace = rand(50, 70);
  phase = rand(0, TAU);

  constructor(
    P: Params,
    private path: AntPath,
    s: number,
  ) {
    super(P);
    this.s = s;
    this.x = -999;
    this.y = -999;
  }

  protected steer(dt: number, w: World) {
    const c = w.cursor;
    let sp = this.pace;
    this.latTarget = Math.sin(this.t * 1.3 + this.p1) * 3;
    if (c.inside && dist(c.x, c.y, this.x, this.y) < 80) {
      const [px, py, a] = this.path.at(this.s);
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const side = (c.x - px) * nx + (c.y - py) * ny > 0 ? -1 : 1;
      this.latTarget = side * 70;
      sp *= 1.8;
    }
    if (this.scareT > 0) {
      this.scareT -= dt;
      this.latTarget = (this.p1 > Math.PI ? 1 : -1) * 90;
      sp *= 2.5;
    }
    this.lat += (this.latTarget - this.lat) * Math.min(1, dt * 4);
    this.s += sp * dt;
    if (this.s > this.path.length) this.s = 0;
    this.phase += sp * dt * 0.6;
    const [px, py, a] = this.path.at(this.s);
    this.x = px - Math.sin(a) * this.lat;
    this.y = py + Math.cos(a) * this.lat;
    this.heading = a;
    this.speed = sp;
  }

  hit(x: number, y: number) {
    return this.s > 0 && super.hit(x, y);
  }

  protected drawAlive(ctx: CanvasRenderingContext2D) {
    if (this.s <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);
    ctx.strokeStyle = "#1c120c";
    ctx.lineWidth = 0.9;
    for (const side of [-1, 1]) {
      for (const [k, ba] of [
        [0, 0.8],
        [1, 1.6],
        [0, 2.4],
      ] as [number, number][]) {
        const g = side < 0 ? k : 1 - k;
        const sw = this.dead ? 0 : Math.sin(this.phase + g * Math.PI) * 0.4;
        const a = side * (ba + sw);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 7, Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(5.5, side * 1);
      ctx.quadraticCurveTo(8, side * 4, 10.5, side * 3);
      ctx.stroke();
    }
    ctx.fillStyle = "#24170f";
    ctx.beginPath();
    ctx.ellipse(-5.5, 0, 4.6, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.8, 1.8, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4.5, 0, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.ellipse(-6, -1.4, 2, 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 群体实体
// ---------------------------------------------------------------------------

class Swarm extends PrankBase {
  private target: Critter | null = null;

  constructor(
    ctx: FxContext,
    private critters: Critter[],
  ) {
    super(ctx);
  }

  hitTest(x: number, y: number) {
    for (let i = this.critters.length - 1; i >= 0; i--) {
      if (this.critters[i].hit(x, y)) {
        this.target = this.critters[i];
        return true;
      }
    }
    this.target = null;
    return false;
  }

  pointerDown(p: PointerInfo) {
    const c = this.target;
    if (!c || c.dead) return;
    c.dead = true;
    this.target = null;
    for (const o of this.critters) {
      if (o !== c && !o.dead && dist(o.x, o.y, p.x, p.y) < 280) o.scare(p.x, p.y);
    }
    this.ctx.rt.hit.reevaluate();
  }

  protected step(dt: number) {
    const w: World = { W: this.W, H: this.H, cursor: this.ctx.rt.cursor };
    for (const c of this.critters) c.update(dt, w);
    this.critters = this.critters.filter((c) => !c.gone);
    return this.critters.length > 0;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    // 死的在下面
    for (const c of this.critters) if (c.dead) c.draw(ctx);
    for (const c of this.critters) if (!c.dead) c.draw(ctx);
  }
}

const PARAMS: Record<string, Params> = {
  centipede: { base: 75, flee: 230, fleeR: 130, turn: 2.4, wander: 0.9, pause: 0.05, radius: 8, splat: "rgba(150,110,20,0.85)" },
  millipede: { base: 32, flee: 70, fleeR: 100, turn: 1.6, wander: 0.7, pause: 0, radius: 7, splat: "rgba(70,60,20,0.85)" },
  cockroach: { base: 95, flee: 440, fleeR: 170, turn: 3.2, wander: 0.9, pause: 0.35, radius: 20, splat: "rgba(185,160,80,0.9)" },
  maggot: { base: 14, flee: 26, fleeR: 80, turn: 2, wander: 1.2, pause: 0, radius: 10, splat: "rgba(235,225,170,0.9)" },
  gecko: { base: 130, flee: 420, fleeR: 150, turn: 3, wander: 0.8, pause: 0.7, radius: 18, splat: "rgba(150,170,90,0.85)" },
  fly: { base: 0, flee: 0, fleeR: 130, turn: 0, wander: 0, pause: 0, radius: 9, splat: "rgba(120,10,10,0.85)" },
  ant: { base: 60, flee: 120, fleeR: 80, turn: 0, wander: 0, pause: 0, radius: 6, splat: "rgba(60,40,20,0.8)" },
};

function swarm(kind: PrankKind, ctx: FxContext): Swarm {
  const W = ctx.rt.width;
  const H = ctx.rt.height;
  const { x, y } = ctx.options;
  const list: Critter[] = [];
  const defaults: Partial<Record<PrankKind, number>> = { centipede: 1, millipede: 2, cockroach: 3, maggot: 8, gecko: 1, fly: 2, ant: 25 };
  const n = Math.min(ctx.options.count ?? defaults[kind] ?? 1, kind === "ant" ? 80 : 30);
  if (kind === "ant") {
    const path = new AntPath(W, H);
    let s = 0;
    for (let i = 0; i < n; i++) {
      list.push(new Ant(PARAMS.ant, path, s));
      s -= rand(16, 38);
    }
    return new Swarm(ctx, list);
  }
  for (let i = 0; i < n; i++) {
    let c: Critter;
    switch (kind) {
      case "centipede":
        c = new Segmented(PARAMS.centipede, 22, 8, false);
        break;
      case "millipede":
        c = new Segmented(PARAMS.millipede, 34, 6.2, true);
        break;
      case "cockroach":
        c = new Cockroach(PARAMS.cockroach);
        break;
      case "maggot":
        c = new Maggot(PARAMS.maggot);
        break;
      case "gecko":
        c = new Gecko(PARAMS.gecko);
        break;
      default:
        c = new Fly(PARAMS.fly);
    }
    if (x !== undefined && y !== undefined) {
      // 蛆成团出现
      const spread = kind === "maggot" ? 50 : 10;
      c.place(x + rand(-spread, spread), y + rand(-spread, spread));
    } else if (kind === "maggot" && i > 0) {
      const first = list[0];
      c.place(first.x + rand(-50, 50), first.y + rand(-50, 50));
    } else if (kind === "maggot") {
      c.place(rand(120, W - 120), rand(120, H - 120));
    } else {
      c.spawnAtEdge(W, H);
    }
    list.push(c);
  }
  return new Swarm(ctx, list);
}

export const crawler = (kind: PrankKind) => (ctx: FxContext) => swarm(kind, ctx);
