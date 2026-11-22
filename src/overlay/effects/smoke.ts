/** 全屏烟雾 + 导弹飞行（导弹 -> 爆炸 -> 屏幕震荡 -> 裂痕 的 PRD 联动示例） */
import type { FxContext } from "../core/fx";
import { clamp, offscreen, pick, rand } from "../core/layer";
import { sprite } from "../core/sprites";
import { BaseFx, durationOf, smokePuff } from "./base";

let lightPuffs: HTMLCanvasElement[] | null = null;
let darkPuffs: HTMLCanvasElement[] | null = null;
const getLightPuffs = () =>
  (lightPuffs ??= [0, 1, 2, 3].map(() => smokePuff(256, pick(["235,235,238", "220,222,228", "200,202,208"]), 16, 0.16)));
const getDarkPuffs = () =>
  (darkPuffs ??= [0, 1, 2].map(() => smokePuff(256, pick(["90,88,86", "70,68,66", "120,116,112"]), 14, 0.2)));

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  grow: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
  alpha: number;
  img: HTMLCanvasElement;
}

function updatePuffs(puffs: Puff[], dt: number) {
  let w = 0;
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i];
    p.age += dt;
    if (p.age >= p.life) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.6, dt);
    p.vy *= Math.pow(0.6, dt);
    p.rot += p.vr * dt;
    p.size += p.grow * dt;
    puffs[w++] = p;
  }
  puffs.length = w;
}

// ---------------- 全屏烟雾 ----------------

class Smoke extends BaseFx {
  private puffs: Puff[] = [];
  private acc = 0;
  private readonly total: number;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 6.5), 1.2, 0.1);
    this.total = Math.round(90 * (0.5 + this.intensity));
  }

  protected step(dt: number) {
    const D = this.duration!;
    const spawnWindow = D * 0.45;
    if (!this.stopping && this.t < spawnWindow) {
      this.acc += (dt * this.total) / spawnWindow;
      const imgs = getLightPuffs();
      while (this.acc >= 1) {
        this.acc--;
        const fromBottom = Math.random() < 0.55;
        const size = rand(280, 620) * (Math.max(this.w, this.h) / 1920);
        this.puffs.push({
          x: rand(-0.1, 1.1) * this.w,
          y: fromBottom ? this.h + rand(0, size * 0.4) : rand(0, this.h),
          vx: rand(-25, 45),
          vy: fromBottom ? rand(-160, -60) : rand(-30, 10),
          size,
          grow: rand(30, 80),
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.15, 0.15),
          age: 0,
          life: D * 2,
          alpha: rand(0.45, 0.8),
          img: pick(imgs),
        });
      }
    }
    for (const p of this.puffs) p.vx += 6 * dt; // 微风
    updatePuffs(this.puffs, dt);
    if (this.t > D) this.stopping = true;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const D = this.duration!;
    // 先变浓再散开
    const env = clamp(this.t / 1.2, 0, 1) * clamp((D - this.t) / (D * 0.4), 0, 1) * this.fade;
    for (const p of this.puffs) {
      const a = p.alpha * env * clamp(p.age / 1.0, 0, 1);
      if (a < 0.01) continue;
      ctx.globalAlpha = a;
      this.place(ctx, p.x, p.y, p.rot);
      ctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
    }
  }
}

// ---------------- 导弹 ----------------

const MISSILE_W = 130;
const MISSILE_H = 34;
let missileSprite: HTMLCanvasElement | null = null;

function getMissile() {
  if (missileSprite) return missileSprite;
  const { canvas, ctx } = offscreen(MISSILE_W, MISSILE_H, 2);
  const cy = MISSILE_H / 2;
  // 尾翼
  ctx.fillStyle = "#3d4450";
  ctx.beginPath();
  ctx.moveTo(8, cy - 5);
  ctx.lineTo(0, 1);
  ctx.lineTo(24, cy - 5);
  ctx.moveTo(8, cy + 5);
  ctx.lineTo(0, MISSILE_H - 1);
  ctx.lineTo(24, cy + 5);
  ctx.fill();
  // 弹体
  const g = ctx.createLinearGradient(0, cy - 7, 0, cy + 7);
  g.addColorStop(0, "#f4f6f8");
  g.addColorStop(0.5, "#c9ced6");
  g.addColorStop(1, "#7f8794");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(6, cy - 7, 96, 14, 3);
  ctx.fill();
  // 弹头
  ctx.fillStyle = "#d62828";
  ctx.beginPath();
  ctx.moveTo(100, cy - 7);
  ctx.quadraticCurveTo(MISSILE_W, cy, 100, cy + 7);
  ctx.closePath();
  ctx.fill();
  // 条纹与中翼
  ctx.fillStyle = "#d62828";
  ctx.fillRect(30, cy - 7, 5, 14);
  ctx.fillStyle = "#3d4450";
  ctx.beginPath();
  ctx.moveTo(60, cy - 6);
  ctx.lineTo(52, cy - 13);
  ctx.lineTo(72, cy - 6);
  ctx.moveTo(60, cy + 6);
  ctx.lineTo(52, cy + 13);
  ctx.lineTo(72, cy + 6);
  ctx.fill();
  missileSprite = canvas;
  return canvas;
}

class Missile extends BaseFx {
  private sx: number;
  private sy: number;
  private cx: number;
  private cy: number;
  private tx: number;
  private ty: number;
  private flight: number;
  private x = 0;
  private y = 0;
  private angle = 0;
  private puffs: Puff[] = [];
  private exploded = false;
  private explodeAt = 0;
  private puffAcc = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 4.5), 0.8, 2);
    const fromLeft = Math.random() < 0.5;
    this.sx = fromLeft ? -120 : this.w + 120;
    this.sy = rand(this.h * 0.1, this.h * 0.5);
    this.tx = fx.options.x ?? rand(this.w * 0.3, this.w * 0.7);
    this.ty = fx.options.y ?? rand(this.h * 0.35, this.h * 0.7);
    this.cx = (this.sx + this.tx) / 2 + rand(-this.w * 0.1, this.w * 0.1);
    this.cy = Math.min(this.sy, this.ty) - this.h * rand(0.15, 0.3);
    this.flight = rand(1.4, 1.8);
    this.x = this.sx;
    this.y = this.sy;
    getMissile();
  }

  private pos(u: number) {
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    return {
      x: a * this.sx + b * this.cx + c * this.tx,
      y: a * this.sy + b * this.cy + c * this.ty,
    };
  }

  private explode() {
    this.exploded = true;
    this.explodeAt = this.t;
    const { x, y } = { x: this.tx, y: this.ty };
    const k = 0.7 + this.intensity * 0.5;
    this.fx.bus.distort("explosion-shake", { x, y, intensity: this.intensity, durationMs: 900 });
    this.fx.bus.prank("crack", { x, y });
    const P = this.fx.particles;
    P.emit(x, y, {
      kind: "glow",
      color: "#ff9e00",
      count: Math.round(70 * k),
      angle: [0, Math.PI * 2],
      speed: [300, 950],
      life: [0.5, 1.3],
      size: [8, 18],
      sizeEnd: 0.3,
      gravity: 700,
      drag: 0.5,
      blend: "lighter",
    });
    P.emit(x, y, {
      kind: "sparkle",
      color: "#fff3b0",
      count: Math.round(40 * k),
      angle: [0, Math.PI * 2],
      speed: [200, 700],
      life: [0.3, 0.8],
      size: [10, 22],
      gravity: 300,
      drag: 0.4,
      blend: "lighter",
    });
    const imgs = getDarkPuffs();
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 260) * k;
      this.puffs.push({
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        size: rand(120, 260) * k,
        grow: rand(60, 140),
        rot: rand(0, 6.28),
        vr: rand(-0.4, 0.4),
        age: 0,
        life: rand(1.8, 3),
        alpha: rand(0.5, 0.8),
        img: pick(imgs),
      });
    }
  }

  protected step(dt: number) {
    if (!this.exploded) {
      const u = Math.min(1, Math.pow(this.t / this.flight, 1.5));
      const p = this.pos(u);
      const ahead = this.pos(Math.min(1, u + 0.01));
      this.angle = Math.atan2(ahead.y - p.y, ahead.x - p.x) || this.angle;
      this.x = p.x;
      this.y = p.y;
      this.puffAcc += dt * 70;
      const tailX = this.x - Math.cos(this.angle) * 50;
      const tailY = this.y - Math.sin(this.angle) * 50;
      const imgs = getLightPuffs();
      while (this.puffAcc >= 1) {
        this.puffAcc--;
        this.puffs.push({
          x: tailX + rand(-3, 3),
          y: tailY + rand(-3, 3),
          vx: -Math.cos(this.angle) * 40 + rand(-10, 10),
          vy: -Math.sin(this.angle) * 40 + rand(-15, 5),
          size: rand(18, 30),
          grow: rand(40, 70),
          rot: rand(0, 6.28),
          vr: rand(-0.5, 0.5),
          age: 0,
          life: rand(1.2, 1.8),
          alpha: 0.6,
          img: pick(imgs),
        });
      }
      if (u >= 1) this.explode();
    }
    updatePuffs(this.puffs, dt);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    for (const p of this.puffs) {
      const lt = p.age / p.life;
      ctx.globalAlpha = p.alpha * (1 - lt) * Math.min(1, p.age * 8) * this.fade;
      this.place(ctx, p.x, p.y, p.rot);
      ctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
    }
    this.resetTransform(ctx);

    if (!this.exploded) {
      // 尾焰
      ctx.globalCompositeOperation = "lighter";
      const fl = 1 + 0.25 * Math.sin(this.t * 60);
      this.place(ctx, this.x, this.y, this.angle);
      ctx.globalAlpha = this.fade;
      ctx.drawImage(sprite("glow", "#ff9e00"), -MISSILE_W / 2 - 46 * fl, -16 * fl, 52 * fl, 32 * fl);
      ctx.drawImage(sprite("glow", "#fff3b0"), -MISSILE_W / 2 - 22, -9, 26, 18);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(getMissile(), -MISSILE_W / 2, -MISSILE_H / 2, MISSILE_W, MISSILE_H);
      this.resetTransform(ctx);
      return;
    }

    const e = this.t - this.explodeAt;
    const x = this.tx;
    const y = this.ty;
    // 白闪
    if (e < 0.18) {
      ctx.globalAlpha = (1 - e / 0.18) * 0.3 * this.fade;
      ctx.fillStyle = "#fff8e7";
      ctx.fillRect(0, 0, this.w, this.h);
    }
    // 火球
    if (e < 0.9) {
      ctx.globalCompositeOperation = "lighter";
      const k = e / 0.9;
      const layers: [string, number][] = [
        ["#c1121f", 420],
        ["#ff6d00", 300],
        ["#ffd166", 190],
        ["#ffffff", 110],
      ];
      for (const [c, r] of layers) {
        const s = r * (0.3 + 0.9 * Math.sqrt(k)) * (0.7 + this.intensity * 0.5);
        ctx.globalAlpha = (1 - k) * this.fade;
        ctx.drawImage(sprite("glow", c), x - s / 2, y - s / 2, s, s);
      }
    }
    // 冲击波
    if (e < 0.6) {
      const k = e / 0.6;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = (1 - k) * 0.6 * this.fade;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 10 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(x, y, 30 + k * 520, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  protected finished() {
    return this.exploded && this.t - this.explodeAt > 1 && this.puffs.length === 0;
  }
}

export const smoke = (fx: FxContext) => new Smoke(fx);
export const missile = (fx: FxContext) => new Missile(fx);
