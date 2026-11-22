/** 流星雨 / 魔法阵 / 彩带礼花 */
import type { FxContext } from "../core/fx";
import { clamp, easeOutCubic, offscreen, pick, rand } from "../core/layer";
import { sprite } from "../core/sprites";
import { BaseFx, durationOf, envelope } from "./base";

// ---------------- 流星雨 ----------------

interface Meteor {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  age: number;
  life: number;
  len: number;
  width: number;
  color: string;
  big: boolean;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

class MeteorShower extends BaseFx {
  private meteors: Meteor[] = [];
  private stars: Star[] = [];
  private acc = 0;
  private sparkAcc = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 6), 1, 2);
    for (let i = 0; i < 70; i++)
      this.stars.push({ x: rand(0, this.w), y: rand(0, this.h * 0.7), r: rand(0.6, 1.6), phase: rand(0, 6.28) });
  }

  private spawn() {
    const theta = rand(0.45, 0.72);
    const big = Math.random() < 0.1;
    const speed = big ? rand(700, 1000) : rand(950, 1700);
    this.meteors.push({
      x: rand(this.w * 0.15, this.w * 1.25),
      y: rand(-this.h * 0.25, this.h * 0.3),
      dx: -Math.cos(theta),
      dy: Math.sin(theta),
      speed,
      age: 0,
      life: rand(0.7, 1.4),
      len: speed * rand(0.14, 0.24),
      width: big ? rand(4, 6) : rand(1.6, 3.2),
      color: pick(["#bde0fe", "#ffffff", "#ffd6a5", "#caffbf", "#e0c3fc"]),
      big,
    });
  }

  protected step(dt: number) {
    if (this.spawning) {
      this.acc += dt * 7 * (0.4 + this.intensity);
      while (this.acc >= 1) {
        this.acc--;
        this.spawn();
      }
    }
    this.sparkAcc += dt;
    const emitSparks = this.sparkAcc > 0.05;
    if (emitSparks) this.sparkAcc = 0;
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.age += dt;
      m.x += m.dx * m.speed * dt;
      m.y += m.dy * m.speed * dt;
      if (m.big && emitSparks)
        this.fx.particles.emit(m.x, m.y, {
          kind: "sparkle",
          color: "#ffe8a3",
          count: 2,
          angle: [0, Math.PI * 2],
          speed: [20, 70],
          life: [0.3, 0.7],
          size: [6, 12],
          gravity: 60,
          blend: "lighter",
        });
      if (m.age > m.life || m.y > this.h + 200 || m.x < -400) this.meteors.splice(i, 1);
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const total = this.duration! + 1;
    const env = envelope(this.t, total, 0.8, 1.2) * this.fade;
    // 极淡的边缘暗角，保留桌面可见
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.6);
    vg.addColorStop(0, "rgba(5,10,30,0)");
    vg.addColorStop(1, "rgba(5,10,30,0.3)");
    ctx.globalAlpha = env;
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ffffff";
    for (const s of this.stars) {
      ctx.globalAlpha = env * (0.15 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 3 + s.phase)));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    ctx.lineCap = "round";
    for (const m of this.meteors) {
      const t = m.age / m.life;
      const a = (t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1) * this.fade;
      const tx = m.x - m.dx * m.len;
      const ty = m.y - m.dy * m.len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, m.color);
      g.addColorStop(0.3, m.color + "88");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = a;
      ctx.strokeStyle = g;
      ctx.lineWidth = m.width;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      const hs = m.width * (m.big ? 9 : 7);
      ctx.drawImage(sprite("glow", m.color), m.x - hs / 2, m.y - hs / 2, hs, hs);
    }
  }

  protected finished() {
    return this.meteors.length === 0;
  }
}

// ---------------- 魔法阵 ----------------

/** 确定性随机，用于生成符文 */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function drawGlyph(ctx: CanvasRenderingContext2D, size: number, rnd: () => number) {
  const pts: [number, number][] = [];
  for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) pts.push([gx * size * 0.4, gy * size * 0.5]);
  const strokes = 2 + Math.floor(rnd() * 3);
  ctx.beginPath();
  for (let i = 0; i < strokes; i++) {
    const a = pts[Math.floor(rnd() * pts.length)];
    const b = pts[Math.floor(rnd() * pts.length)];
    if (rnd() < 0.3) {
      ctx.moveTo(a[0] + size * 0.18, a[1]);
      ctx.arc(a[0], a[1], size * 0.18, 0, Math.PI * 2);
    } else {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
  }
  ctx.stroke();
}

function ringCanvas(R: number, color: string, paint: (ctx: CanvasRenderingContext2D) => void) {
  const pad = 30;
  const size = R * 2 + pad * 2;
  const { canvas, ctx } = offscreen(size, size);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  paint(ctx);
  return { canvas, size };
}

function polygonStar(ctx: CanvasRenderingContext2D, r: number, n: number, step: number) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = ((i * step) / n) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.stroke();
}

class MagicCircle extends BaseFx {
  private cx: number;
  private cy: number;
  private R: number;
  private color: string;
  private layers: { canvas: HTMLCanvasElement; size: number; speed: number }[] = [];
  private beam: HTMLCanvasElement;
  private sparkAcc = 0;
  private flared = false;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.8, 0.1);
    this.cx = fx.options.x ?? this.w / 2;
    this.cy = fx.options.y ?? this.h / 2;
    this.R = Math.min(this.w, this.h) * 0.28 * (0.8 + this.intensity * 0.4);
    this.color = pick(["#7df9ff", "#c77dff", "#ffd166", "#80ffdb"]);
    const R = this.R;
    const rnd = seeded(Math.floor(Math.random() * 1e9));

    this.layers.push({
      speed: 0.25,
      ...ringCanvas(R, this.color, (ctx) => {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        // 刻度
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const l = i % 6 === 0 ? 0.035 : 0.015;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * (1 - l), Math.sin(a) * R * (1 - l));
          ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.stroke();
        }
        // 符文环
        const n = 24;
        ctx.lineWidth = 1.8;
        for (let i = 0; i < n; i++) {
          ctx.save();
          ctx.rotate((i / n) * Math.PI * 2);
          ctx.translate(0, -R * 0.93);
          drawGlyph(ctx, R * 0.06, rnd);
          ctx.restore();
        }
      }),
    });
    this.layers.push({
      speed: -0.4,
      ...ringCanvas(R, this.color, (ctx) => {
        ctx.lineWidth = 2.2;
        const r = R * 0.78;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        // 六芒星：两个互相旋转 60° 的三角形
        ctx.save();
        ctx.rotate(Math.PI / 3);
        polygonStar(ctx, r, 3, 1);
        ctx.restore();
        polygonStar(ctx, r, 3, 1);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.05, 0, Math.PI * 2);
          ctx.stroke();
        }
      }),
    });
    this.layers.push({
      speed: 0.8,
      ...ringCanvas(R, this.color, (ctx) => {
        ctx.lineWidth = 2;
        const r = R * 0.42;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        polygonStar(ctx, r, 8, 3);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          ctx.save();
          ctx.rotate((i / 8) * Math.PI * 2);
          ctx.translate(0, -r * 0.72);
          drawGlyph(ctx, R * 0.045, rnd);
          ctx.restore();
        }
      }),
    });

    const bw = R * 0.7;
    const bh = this.cy + 20;
    const b = offscreen(bw, Math.max(1, bh));
    const g = b.ctx.createLinearGradient(0, bh, 0, 0);
    g.addColorStop(0, this.color);
    g.addColorStop(1, "rgba(255,255,255,0)");
    const hg = b.ctx.createLinearGradient(0, 0, bw, 0);
    hg.addColorStop(0, "rgba(0,0,0,0)");
    hg.addColorStop(0.5, "rgba(0,0,0,1)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    b.ctx.fillStyle = g;
    b.ctx.fillRect(0, 0, bw, bh);
    b.ctx.globalCompositeOperation = "destination-in";
    b.ctx.fillStyle = hg;
    b.ctx.fillRect(0, 0, bw, bh);
    this.beam = b.canvas;
  }

  protected step(dt: number) {
    const D = this.duration!;
    if (this.t < D - 0.6) {
      this.sparkAcc += dt * 45 * (0.5 + this.intensity);
      while (this.sparkAcc >= 1) {
        this.sparkAcc--;
        const a = rand(0, Math.PI * 2);
        const r = this.R * rand(0.3, 1) * this.appear();
        this.fx.particles.emit(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, {
          kind: ["sparkle", "star"],
          color: Math.random() < 0.5 ? this.color : "#ffffff",
          count: 1,
          angle: [-Math.PI / 2 - 0.3, -Math.PI / 2 + 0.3],
          speed: [40, 140],
          life: [0.8, 1.6],
          size: [8, 18],
          gravity: -120,
          drag: 0.8,
          blend: "lighter",
        });
      }
    }
    if (!this.flared && this.t > D - 0.7) {
      this.flared = true;
      this.fx.particles.emit(this.cx, this.cy, {
        kind: ["sparkle", "glow"],
        color: this.color,
        count: 70,
        angle: [0, Math.PI * 2],
        speed: [250, 700],
        life: [0.6, 1.2],
        size: [10, 24],
        gravity: 0,
        drag: 0.3,
        spread: this.R * 0.2,
        blend: "lighter",
      });
    }
    if (this.t > D) this.stopping = true;
  }

  private appear() {
    return easeOutCubic(clamp(this.t / 0.9, 0, 1));
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const D = this.duration!;
    const p = this.appear();
    const outro = clamp((this.t - (D - 0.7)) / 0.7, 0, 1);
    const scale = (0.4 + 0.6 * p) * (1 + outro * 0.3);
    const alpha = this.fade * (1 - outro) * clamp(this.t / 0.3, 0, 1);
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 5);
    ctx.globalCompositeOperation = "lighter";

    // 光柱
    ctx.globalAlpha = alpha * 0.35 * pulse * p;
    const bw = this.R * 0.7;
    ctx.drawImage(this.beam, this.cx - bw / 2, -20, bw, this.cy + 20);

    // 中心辉光
    ctx.globalAlpha = alpha * 0.45 * pulse;
    const gs = this.R * 2.2 * scale;
    ctx.drawImage(sprite("glow", this.color), this.cx - gs / 2, this.cy - gs / 2, gs, gs);

    for (const l of this.layers) {
      ctx.save();
      ctx.globalAlpha = alpha * pulse;
      this.place(ctx, this.cx, this.cy, this.t * l.speed, scale, scale);
      if (p < 1) {
        // 出场时按扇形“画”出来
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, l.size, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        ctx.closePath();
        ctx.clip();
      }
      ctx.drawImage(l.canvas, -l.size / 2, -l.size / 2, l.size, l.size);
      ctx.restore();
    }
  }
}

// ---------------- 彩带礼花 ----------------

class Confetti extends BaseFx {
  private volleys: number[];
  private fired = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.3, 0.1);
    this.volleys = this.intensity > 0.6 ? [0, 0.35, 0.9, 1.6] : [0, 0.4, 1.1];
  }

  private fire() {
    const k = this.h / 1080;
    const n = Math.round(90 * (0.5 + this.intensity));
    const base = {
      kind: ["confetti", "confetti", "confetti", "star"] as ("confetti" | "star")[],
      count: n,
      speed: [900 * k, 1650 * k] as [number, number],
      life: [2.8, 4.2] as [number, number],
      size: [14, 22] as [number, number],
      sizeEnd: 0.9,
      gravity: 380,
      drag: 0.32,
      spin: [-8, 8] as [number, number],
      sway: 70,
      flip: true,
      spread: 20,
    };
    this.fx.particles.emit(10, this.h + 10, { ...base, angle: [-1.3, -0.85] });
    this.fx.particles.emit(this.w - 10, this.h + 10, { ...base, angle: [-Math.PI + 0.85, -Math.PI + 1.3] });
  }

  protected step() {
    while (!this.stopping && this.fired < this.volleys.length && this.t >= this.volleys[this.fired]) {
      this.fire();
      this.fired++;
    }
    if (this.t > this.duration!) this.stopping = true;
  }

  protected render() {}
}

export const meteorShower = (fx: FxContext) => new MeteorShower(fx);
export const magic = (fx: FxContext) => new MagicCircle(fx);
export const confetti = (fx: FxContext) => new Confetti(fx);
