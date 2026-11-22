/**
 * 全屏烟花（参考 素材/烟花参考.jpg）：
 * - 火箭升空沿途撒下闪烁的金色亮粉
 * - 炸型：金色闪烁牡丹（红色频闪尾梢）、金柳（长拖尾下垂）、彩色牡丹、菊花（密集长迹）、环形、噼啪、爱心
 * - 每颗火花保留最近位置的折线拖尾（越旧越细越淡），并持续撒下随机明灭的亮粉
 * - 火花核心叠加预渲染辉光；爆点留下淡淡的烟雾
 */
import type { FxContext } from "../core/fx";
import { pick, rand } from "../core/layer";
import { sprite } from "../core/sprites";
import { BaseFx, durationOf, smokePuff } from "./base";

const GOLD = ["#ffd27a", "#ffe3a3", "#ffc35c", "#fff1c9"];
const COLORS = ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#b388ff", "#ff9e00", "#f72585", "#80ffdb"];
type Shell = "glitter" | "willow" | "peony" | "chrysanthemum" | "ring" | "crackle" | "heart";
const SHELLS: Shell[] = ["glitter", "glitter", "willow", "peony", "peony", "chrysanthemum", "ring", "crackle", "heart"];

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ty: number;
  shell: Shell;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: string;
  size: number;
  drag: number;
  g: number;
  /** 最近位置（拖尾），[x0,y0,x1,y1,...] 最新在末尾 */
  hist: number[];
  histLen: number;
  /** 每秒撒亮粉数量 */
  glitter: number;
  glitterAcc: number;
  crackle: boolean;
  /** 尾梢颜色（生命末段切换，频闪） */
  tip: string | null;
}

interface Glitter {
  x: number;
  y: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

interface Haze {
  x: number;
  y: number;
  age: number;
  size: number;
}

const MAX_SPARKS = 2200;
const MAX_GLITTER = 7000;
const ROCKET_G = 520;

let hazeSprite: HTMLCanvasElement | null = null;

class Fireworks extends BaseFx {
  private rockets: Rocket[] = [];
  private sparks: Spark[] = [];
  private glitter: Glitter[] = [];
  private flashes: { x: number; y: number; age: number; color: string; size: number }[] = [];
  private haze: Haze[] = [];
  private nextLaunch = 0;
  private launched = 0;
  private readonly maxRockets: number;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 6), 1, 4.5);
    this.maxRockets = fx.options.count ?? Infinity;
    if (!hazeSprite) hazeSprite = smokePuff(256, "190,175,160", 16, 0.12);
    if (fx.options.x !== undefined && fx.options.y !== undefined) this.launch(fx.options.x, fx.options.y);
  }

  private launch(tx?: number, ty?: number) {
    const x0 = tx !== undefined ? tx + rand(-60, 60) : rand(this.w * 0.12, this.w * 0.88);
    const targetY = ty ?? rand(this.h * 0.12, this.h * 0.45);
    const vy = -Math.sqrt(2 * ROCKET_G * (this.h + 10 - targetY));
    const flight = -vy / ROCKET_G;
    const targetX = tx ?? x0 + rand(-this.w * 0.06, this.w * 0.06);
    this.rockets.push({
      x: x0,
      y: this.h + 10,
      vx: (targetX - x0) / flight,
      vy,
      ty: targetY,
      shell: pick(SHELLS),
      color: pick(COLORS),
    });
    this.launched++;
  }

  private addSpark(x: number, y: number, angle: number, speed: number, o: Partial<Spark>) {
    if (this.sparks.length >= MAX_SPARKS) return;
    this.sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: rand(1.2, 1.8),
      color: "#fff",
      size: rand(5, 8),
      drag: 0.3,
      g: 200,
      hist: [],
      histLen: 6,
      glitter: 0,
      glitterAcc: Math.random(),
      crackle: false,
      tip: null,
      ...o,
    });
  }

  private explode(r: Rocket) {
    const scale = Math.min(this.w, this.h) / 1080;
    const base = rand(240, 360) * (0.75 + scale * 0.35);
    const n = Math.round(rand(90, 140) * (0.6 + this.intensity * 0.6));
    const color2 = pick(COLORS);
    const ring = (count: number, speedK: [number, number], o: Partial<Spark>) => {
      for (let i = 0; i < count; i++) {
        // 球面均匀分布投影到平面：中心更密，接近真实烟花的体积感
        const a = rand(0, Math.PI * 2);
        const z = Math.sqrt(1 - Math.pow(rand(-1, 1), 2));
        this.addSpark(r.x, r.y, a, base * rand(speedK[0], speedK[1]) * (0.35 + 0.65 * z), o);
      }
    };

    switch (r.shell) {
      case "glitter":
        ring(n, [0.85, 1], {
          color: pick(GOLD),
          life: rand(1.6, 2.2),
          histLen: 10,
          glitter: 34,
          drag: 0.33,
          g: 150,
          tip: Math.random() < 0.6 ? "#ff3b3b" : null,
        });
        break;
      case "willow":
        ring(n * 1.1, [0.6, 0.85], {
          color: pick(GOLD),
          life: rand(2.6, 3.4),
          drag: 0.45,
          g: 110,
          histLen: 16,
          glitter: 26,
          size: rand(4, 6),
        });
        break;
      case "chrysanthemum":
        ring(n * 1.2, [0.9, 1], { color: r.color, life: rand(1.4, 1.9), histLen: 14, glitter: 10, drag: 0.32 });
        break;
      case "peony":
        ring(n, [0.85, 1], { color: r.color, histLen: 5, tip: Math.random() < 0.5 ? color2 : null });
        ring(n * 0.35, [0.3, 0.45], { color: color2, histLen: 4, size: rand(4, 6) });
        break;
      case "ring": {
        const tilt = rand(0, Math.PI);
        const squash = rand(0.3, 0.7);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const lx = Math.cos(a) * base;
          const ly = Math.sin(a) * base * squash;
          const vx = lx * Math.cos(tilt) - ly * Math.sin(tilt);
          const vy = lx * Math.sin(tilt) + ly * Math.cos(tilt);
          this.addSpark(r.x, r.y, Math.atan2(vy, vx), Math.hypot(vx, vy), { color: r.color, histLen: 6 });
        }
        ring(24, [0.1, 0.25], { color: pick(GOLD), glitter: 20 });
        break;
      }
      case "crackle":
        ring(n, [0.6, 0.95], { color: pick(GOLD), crackle: true, life: rand(0.9, 1.3), histLen: 6, glitter: 12 });
        break;
      case "heart":
        for (let i = 0; i < n; i++) {
          const t = (i / n) * Math.PI * 2;
          const hx = 16 * Math.pow(Math.sin(t), 3);
          const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          this.addSpark(r.x, r.y, Math.atan2(hy, hx), Math.hypot(hx, hy) * (base / 17), {
            color: pick(["#ff4d6d", "#ff8fab", "#ffb3c6"]),
            drag: 0.3,
            g: 110,
            histLen: 5,
          });
        }
        break;
    }
    const gold = r.shell === "glitter" || r.shell === "willow" || r.shell === "crackle";
    this.flashes.push({ x: r.x, y: r.y, age: 0, color: gold ? "#ffe8b0" : r.color, size: base * 0.9 });
    this.haze.push({ x: r.x, y: r.y, age: 0, size: base * 1.6 });
  }

  protected step(dt: number) {
    if (this.spawning && this.launched < this.maxRockets) {
      this.nextLaunch -= dt;
      if (this.nextLaunch <= 0) {
        this.launch();
        if (Math.random() < 0.35 * this.intensity) this.launch();
        this.nextLaunch = rand(0.3, 0.7) / (0.5 + this.intensity);
      }
    }

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.vy += ROCKET_G * dt;
      r.x += r.vx * dt + Math.sin(this.t * 30 + i) * 0.4;
      r.y += r.vy * dt;
      // 升空沿途撒亮粉
      for (let k = 0; k < 3 && this.glitter.length < MAX_GLITTER; k++)
        this.glitter.push({ x: r.x + rand(-2, 2), y: r.y + rand(0, 6), vy: rand(10, 50), age: 0, life: rand(0.4, 0.9), size: rand(1.2, 2.4), color: pick(GOLD) });
      if (r.vy >= -30 || r.y <= r.ty) {
        this.explode(r);
        this.rockets.splice(i, 1);
      }
    }

    const sp = this.sparks;
    let w = 0;
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i];
      s.age += dt;
      if (s.age >= s.life) {
        if (s.crackle) {
          // 噼啪：生命结束时迸出一簇细小白色火花 + 闪点
          for (let k = 0; k < 5; k++)
            this.addSpark(s.x, s.y, rand(0, Math.PI * 2), rand(40, 120), {
              color: "#fffbe6",
              life: rand(0.12, 0.28),
              size: 3,
              histLen: 2,
              g: 60,
            });
          this.flashes.push({ x: s.x, y: s.y, age: 0.25, color: "#fff6d8", size: 26 });
        }
        continue;
      }
      s.hist.push(s.x, s.y);
      if (s.hist.length > s.histLen * 2) s.hist.splice(0, 2);
      const k = Math.pow(s.drag, dt);
      s.vx *= k;
      s.vy = s.vy * k + s.g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.glitter > 0 && s.age < s.life * 0.9) {
        s.glitterAcc += s.glitter * dt;
        while (s.glitterAcc >= 1 && this.glitter.length < MAX_GLITTER) {
          s.glitterAcc--;
          this.glitter.push({
            x: s.x + rand(-1.5, 1.5),
            y: s.y + rand(-1.5, 1.5),
            vy: rand(15, 45),
            age: 0,
            life: rand(0.5, 1.3),
            size: rand(1, 2.2),
            color: Math.random() < 0.3 ? "#fffaf0" : s.color,
          });
        }
      }
      sp[w++] = s;
    }
    sp.length = w;

    const gl = this.glitter;
    w = 0;
    for (let i = 0; i < gl.length; i++) {
      const g = gl[i];
      g.age += dt;
      if (g.age >= g.life) continue;
      g.y += g.vy * dt;
      gl[w++] = g;
    }
    gl.length = w;

    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < 0.45);
    for (const h of this.haze) h.age += dt;
    this.haze = this.haze.filter((h) => h.age < 3.5);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const fade = this.fade;

    // 烟雾（普通混合，极淡）
    for (const h of this.haze) {
      const a = Math.min(1, h.age / 0.4) * (1 - h.age / 3.5) * 0.5 * fade;
      const s = h.size * (1 + h.age * 0.25);
      ctx.globalAlpha = a;
      ctx.drawImage(hazeSprite!, h.x - s / 2, h.y - s / 2 + h.age * 12, s, s);
    }

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const f of this.flashes) {
      const a = (1 - f.age / 0.45) * 0.6 * fade;
      const s = f.size * (0.6 + f.age * 2.2);
      ctx.globalAlpha = a;
      ctx.drawImage(sprite("glow", f.color), f.x - s / 2, f.y - s / 2, s, s);
    }

    // 亮粉：随机明灭（每帧约一半点亮），这是“闪烁拖尾”的关键
    for (const g of this.glitter) {
      if (Math.random() < 0.45) continue;
      const t = g.age / g.life;
      ctx.globalAlpha = (1 - t) * fade * rand(0.6, 1);
      ctx.fillStyle = g.color;
      const s = g.size * (1 - t * 0.5);
      ctx.fillRect(g.x - s / 2, g.y - s / 2, s, s);
    }

    for (const r of this.rockets) {
      ctx.globalAlpha = fade;
      ctx.drawImage(sprite("glow", "#ffe8a3"), r.x - 10, r.y - 10, 20, 20);
    }

    for (const s of this.sparks) {
      const t = s.age / s.life;
      let a = t < 0.65 ? 1 : (1 - t) / 0.35;
      a *= fade;
      if (a <= 0.01) continue;
      const strobe = s.tip !== null && t > 0.72;
      const color = strobe ? s.tip! : s.color;
      if (strobe && Math.sin(s.age * 55 + s.x) < 0) continue;
      // 折线拖尾：分两段，越旧越细越淡
      const h = s.hist;
      const n = h.length / 2;
      if (n > 1) {
        ctx.strokeStyle = color;
        const mid = Math.floor(n / 2);
        ctx.globalAlpha = a * 0.25;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(h[0], h[1]);
        for (let i = 1; i <= mid; i++) ctx.lineTo(h[i * 2], h[i * 2 + 1]);
        ctx.stroke();
        ctx.globalAlpha = a * 0.7;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(h[mid * 2], h[mid * 2 + 1]);
        for (let i = mid + 1; i < n; i++) ctx.lineTo(h[i * 2], h[i * 2 + 1]);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      const sz = s.size * (1 - t * 0.4) * (strobe ? 1.4 : 1);
      ctx.drawImage(sprite("glow", color), s.x - sz / 2, s.y - sz / 2, sz, sz);
    }
  }

  protected finished() {
    return (
      this.rockets.length === 0 &&
      this.sparks.length === 0 &&
      this.glitter.length === 0 &&
      this.flashes.length === 0
    );
  }
}

export const fireworks = (fx: FxContext) => new Fireworks(fx);
