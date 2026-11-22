/** 常驻环境特效：下雪 / 下雨 / 雷雨 / 樱花 / 萤火虫（直到 stop） */
import type { FxContext } from "../core/fx";
import { clamp, pick, rand } from "../core/layer";
import { PALETTES, sprite } from "../core/sprites";
import { BaseFx, softDot } from "./base";

const FADE_IN = 1.5;

let farFlake: HTMLCanvasElement | null = null;
let fireflyGlow: HTMLCanvasElement | null = null;

// ---------------- 下雪 ----------------

interface Flake {
  x: number;
  y: number;
  z: number;
  size: number;
  vy: number;
  phase: number;
  sway: number;
  rot: number;
  vr: number;
}

class Snow extends BaseFx {
  private flakes: Flake[] = [];

  constructor(fx: FxContext) {
    super(fx, null, 1);
    farFlake ??= softDot(32, [
      [0, "rgba(255,255,255,1)"],
      [0.4, "rgba(255,255,255,0.7)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    const n = Math.min(650, Math.round(((this.w * this.h) / 1e4) * (0.4 + 1.2 * this.intensity)));
    for (let i = 0; i < n; i++) this.flakes.push(this.make(rand(-this.h * 0.6, this.h)));
  }

  private make(y: number): Flake {
    const z = Math.random();
    const near = z > 0.6;
    return {
      x: rand(-50, this.w + 50),
      y,
      z,
      size: near ? rand(10, 22) : rand(2, 5) + z * 4,
      vy: near ? rand(60, 120) : rand(25, 60),
      phase: rand(0, Math.PI * 2),
      sway: rand(10, 35),
      rot: rand(0, 6.28),
      vr: rand(-1, 1),
    };
  }

  protected step(dt: number) {
    const wind = Math.sin(this.t * 0.15) * 30 + Math.sin(this.t * 0.53) * 15;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.y += f.vy * dt;
      f.x += (wind * (0.5 + f.z) + Math.sin(this.t * 1.2 + f.phase) * f.sway) * dt;
      f.rot += f.vr * dt;
      if (f.y > this.h + 30) this.flakes[i] = this.make(rand(-40, -10));
      else if (f.x < -60) f.x += this.w + 120;
      else if (f.x > this.w + 60) f.x -= this.w + 120;
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const env = clamp(this.t / FADE_IN, 0, 1) * this.fade;
    const near = sprite("snowflake", "#ffffff");
    for (const f of this.flakes) {
      ctx.globalAlpha = env * (0.45 + 0.5 * f.z);
      if (f.z > 0.6) {
        this.place(ctx, f.x, f.y, f.rot);
        ctx.drawImage(near, -f.size / 2, -f.size / 2, f.size, f.size);
      } else {
        this.resetTransform(ctx);
        const s = f.size * 2;
        ctx.drawImage(farFlake!, f.x - s / 2, f.y - s / 2, s, s);
      }
    }
  }
}

// ---------------- 下雨 ----------------

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  layer: number;
}

interface Splash {
  x: number;
  age: number;
}

const RAIN_LAYERS = [
  { width: 1, alpha: 0.25, speed: [700, 900], len: [10, 18] },
  { width: 1.3, alpha: 0.35, speed: [950, 1200], len: [16, 26] },
  { width: 1.8, alpha: 0.45, speed: [1250, 1500], len: [24, 38] },
] as const;

/** 雨滴系统：分三层深度，每层一次 stroke 批量绘制 */
class RainSystem {
  drops: Drop[] = [];
  splashes: Splash[] = [];
  slant = 0.18;

  constructor(
    private fx: BaseFx,
    count: number,
  ) {
    for (let i = 0; i < count; i++) this.drops.push(this.make(rand(-fx.h, fx.h)));
  }

  private make(y: number): Drop {
    const layer = Math.floor(Math.random() * 3);
    const L = RAIN_LAYERS[layer];
    return {
      x: rand(-this.fx.w * 0.1, this.fx.w * 1.15),
      y,
      len: rand(L.len[0], L.len[1]),
      speed: rand(L.speed[0], L.speed[1]),
      layer,
    };
  }

  step(dt: number, t: number) {
    this.slant = 0.18 + Math.sin(t * 0.3) * 0.05;
    const h = this.fx.h;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y += d.speed * dt;
      d.x -= d.speed * this.slant * dt;
      if (d.y > h) {
        if (d.layer > 0 && Math.random() < 0.35 && this.splashes.length < 300)
          this.splashes.push({ x: d.x, age: 0 });
        this.drops[i] = this.make(rand(-120, -10));
      }
    }
    for (const s of this.splashes) s.age += dt;
    this.splashes = this.splashes.filter((s) => s.age < 0.3);
  }

  render(ctx: CanvasRenderingContext2D, env: number) {
    ctx.lineCap = "round";
    for (let l = 0; l < 3; l++) {
      const L = RAIN_LAYERS[l];
      ctx.globalAlpha = L.alpha * env;
      ctx.strokeStyle = "#cfdcec";
      ctx.lineWidth = L.width;
      ctx.beginPath();
      for (const d of this.drops) {
        if (d.layer !== l) continue;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * this.slant, d.y - d.len);
      }
      ctx.stroke();
    }
    const h = this.fx.h;
    ctx.strokeStyle = "#dfe9f5";
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.5 * env;
    ctx.beginPath();
    for (const s of this.splashes) {
      const k = s.age / 0.3;
      const rx = 2 + k * 10;
      ctx.moveTo(s.x + rx, h - 3);
      ctx.ellipse(s.x, h - 3, rx, 1 + k * 3, 0, Math.PI, Math.PI * 2);
    }
    ctx.stroke();
  }
}

class Rain extends BaseFx {
  protected rain: RainSystem;

  constructor(fx: FxContext, heavy = 1) {
    super(fx, null, 1);
    const n = Math.round(((this.w * this.h) / 5000) * (0.3 + 0.9 * this.intensity) * heavy);
    this.rain = new RainSystem(this, Math.min(1400, n));
  }

  protected step(dt: number) {
    this.rain.step(dt, this.t);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    this.rain.render(ctx, clamp(this.t / FADE_IN, 0, 1) * this.fade);
  }
}

// ---------------- 雷雨 ----------------

type Seg = [number, number, number, number];

/** 中点位移法生成带分叉的闪电 */
function bolt(x0: number, y0: number, x1: number, y1: number, depth: number, out: Seg[][], branchChance: number) {
  let pts: [number, number][] = [
    [x0, y0],
    [x1, y1],
  ];
  let disp = Math.hypot(x1 - x0, y1 - y0) * 0.22;
  for (let k = 0; k < 7; k++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      next.push([(ax + bx) / 2 + rand(-disp, disp), (ay + by) / 2 + rand(-disp, disp) * 0.3], [bx, by]);
    }
    pts = next;
    disp *= 0.55;
  }
  const segs: Seg[] = [];
  for (let i = 1; i < pts.length; i++) {
    segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    if (depth < 2 && Math.random() < branchChance) {
      const [bx, by] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0) * rand(0.15, 0.35) / (depth + 1);
      const a = Math.atan2(y1 - y0, x1 - x0) + rand(-0.9, 0.9);
      bolt(bx, by, bx + Math.cos(a) * len, by + Math.abs(Math.sin(a)) * len, depth + 1, out, branchChance * 0.5);
    }
  }
  out.push(segs);
}

class Thunderstorm extends Rain {
  private next = 1.2;
  private strike: { segs: Seg[][]; age: number } | null = null;

  constructor(fx: FxContext) {
    super(fx, 1.6);
  }

  protected step(dt: number) {
    super.step(dt);
    if (this.strike) {
      this.strike.age += dt;
      if (this.strike.age > 0.7) this.strike = null;
    }
    this.next -= dt;
    if (this.next <= 0 && !this.stopping) {
      const x0 = rand(this.w * 0.1, this.w * 0.9);
      const segs: Seg[][] = [];
      bolt(x0, -10, x0 + rand(-this.w * 0.2, this.w * 0.2), rand(this.h * 0.55, this.h * 0.9), 0, segs, 0.08);
      this.strike = { segs, age: 0 };
      this.next = rand(2.5, 7) / (0.5 + this.intensity);
    }
  }

  /** 频闪曲线：亮-暗-亮-渐隐 */
  private flicker(age: number) {
    if (age < 0.07) return 1;
    if (age < 0.13) return 0.25;
    if (age < 0.28) return 0.9;
    return Math.max(0, 1 - (age - 0.28) / 0.42) * 0.7;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const env = clamp(this.t / FADE_IN, 0, 1) * this.fade;
    // 轻微压暗，营造阴天氛围
    ctx.globalAlpha = 0.1 * env;
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(0, 0, this.w, this.h);
    this.rain.render(ctx, env);

    if (!this.strike) return;
    const f = this.flicker(this.strike.age) * env;
    ctx.globalAlpha = f * 0.18;
    ctx.fillStyle = "#eef3ff";
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const passes: [number, number, string][] = [
      [10, 0.15, "#8fb3ff"],
      [4, 0.45, "#c9dcff"],
      [1.6, 1, "#ffffff"],
    ];
    for (const [lw, a, col] of passes) {
      ctx.strokeStyle = col;
      this.strike.segs.forEach((branch, bi) => {
        const main = bi === this.strike!.segs.length - 1; // 主干最后入栈
        ctx.globalAlpha = f * a * (main ? 1 : 0.6);
        ctx.lineWidth = main ? lw : lw * 0.55;
        ctx.beginPath();
        for (const [ax, ay, bx, by] of branch) {
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      });
    }
  }
}

// ---------------- 樱花 ----------------

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  flip: number;
  flipSpeed: number;
  phase: number;
  color: string;
}

class Sakura extends BaseFx {
  private petals: Petal[] = [];

  constructor(fx: FxContext) {
    super(fx, null, 1);
    const n = Math.round(((this.w * this.h) / 3e4) * (0.4 + 1.2 * this.intensity));
    for (let i = 0; i < Math.min(220, n); i++) this.petals.push(this.make(rand(-this.h * 0.5, this.h)));
  }

  private make(y: number): Petal {
    return {
      x: rand(0, this.w * 1.3),
      y,
      vx: rand(-60, -20),
      vy: rand(40, 90),
      size: rand(12, 24),
      rot: rand(0, 6.28),
      vr: rand(-1.5, 1.5),
      flip: rand(0, 6.28),
      flipSpeed: rand(1.5, 4),
      phase: rand(0, 6.28),
      color: pick(PALETTES.petal!),
    };
  }

  protected step(dt: number) {
    const gust = 1 + 0.6 * Math.max(0, Math.sin(this.t * 0.4));
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.x += (p.vx * gust + Math.sin(this.t * 1.5 + p.phase) * 25) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.flipSpeed * dt;
      if (p.y > this.h + 30 || p.x < -40) this.petals[i] = this.make(rand(-60, -10));
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = clamp(this.t / FADE_IN, 0, 1) * this.fade * 0.95;
    for (const p of this.petals) {
      const fx = Math.cos(p.flip);
      this.place(ctx, p.x, p.y, p.rot, Math.abs(fx) < 0.1 ? 0.1 : fx, 1);
      ctx.drawImage(sprite("petal", p.color), -p.size / 2, -p.size / 2, p.size, p.size);
    }
  }
}

// ---------------- 萤火虫 ----------------

interface Fly {
  x: number;
  y: number;
  heading: number;
  turn: number;
  speed: number;
  phase: number;
  rate: number;
  size: number;
}

class Fireflies extends BaseFx {
  private flies: Fly[] = [];

  constructor(fx: FxContext) {
    super(fx, null, 1);
    fireflyGlow ??= softDot(64, [
      [0, "rgba(255,255,220,1)"],
      [0.15, "rgba(230,255,120,0.9)"],
      [0.45, "rgba(190,255,80,0.25)"],
      [1, "rgba(160,255,60,0)"],
    ]);
    const n = Math.round(30 * (0.5 + this.intensity) * Math.max(1, (this.w * this.h) / (1920 * 1080)));
    for (let i = 0; i < n; i++)
      this.flies.push({
        x: rand(0, this.w),
        y: rand(this.h * 0.2, this.h),
        heading: rand(0, 6.28),
        turn: 0,
        speed: rand(18, 50),
        phase: rand(0, 6.28),
        rate: rand(1.2, 2.6),
        size: rand(22, 40),
      });
  }

  protected step(dt: number) {
    const c = this.fx.rt.cursor;
    for (const f of this.flies) {
      f.turn += rand(-3, 3) * dt;
      f.turn *= Math.pow(0.3, dt);
      f.heading += f.turn * dt * 2;
      let vx = Math.cos(f.heading) * f.speed;
      let vy = Math.sin(f.heading) * f.speed;
      // 轻轻躲开鼠标
      if (c.inside) {
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 140 && d > 0.1) {
          const push = (1 - d / 140) * 160;
          vx += (dx / d) * push;
          vy += (dy / d) * push;
        }
      }
      // 软边界：靠近边缘时把朝向往中间拉
      const m = 40;
      if (f.x < m || f.x > this.w - m || f.y < m || f.y > this.h - m) {
        const toC = Math.atan2(this.h / 2 - f.y, this.w / 2 - f.x);
        f.heading += Math.sin(toC - f.heading) * dt * 2;
      }
      f.x += vx * dt;
      f.y += vy * dt;
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const env = clamp(this.t / FADE_IN, 0, 1) * this.fade;
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.flies) {
      const pulse = Math.pow(Math.max(0, Math.sin(this.t * f.rate + f.phase)), 2);
      ctx.globalAlpha = env * (0.2 + 0.8 * pulse);
      const s = f.size * (0.7 + 0.3 * pulse);
      ctx.drawImage(fireflyGlow!, f.x - s / 2, f.y - s / 2, s, s);
    }
  }
}

export const snow = (fx: FxContext) => new Snow(fx);
export const rain = (fx: FxContext) => new Rain(fx);
export const thunderstorm = (fx: FxContext) => new Thunderstorm(fx);
export const sakura = (fx: FxContext) => new Sakura(fx);
export const fireflies = (fx: FxContext) => new Fireflies(fx);
