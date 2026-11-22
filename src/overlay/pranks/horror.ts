/**
 * 恐怖元素：血迹流淌、偷窥的眼睛（跟随鼠标）、血手印、鬼影闪现。
 * 所有效果都避免高频强闪（不做癫痫级频闪）。
 */
import { atlas } from "../core/assets";
import type { FxContext } from "../core/fx";
import { createBloodFlow } from "./bloodflow";
import { clamp, easeOutCubic, pick, rand, randInt } from "../core/layer";
import { PrankBase, TAU } from "./base";

// ============================================================================
// 血迹从屏幕顶部流下
// ============================================================================

interface Drip {
  x: number;
  w: number;
  len: number;
  target: number;
  speed: number;
}
interface Drop {
  x: number;
  y: number;
  vy: number;
  r: number;
}

class Blood extends PrankBase {
  private drips: Drip[] = [];
  private drops: Drop[] = [];
  private band: number[] = [];
  private bandH = 0;

  constructor(ctx: FxContext) {
    super(ctx);
    const k = ctx.options.intensity ?? 0.6;
    const n = ctx.options.count ?? Math.round((this.W / 110) * (0.6 + k));
    for (let i = 0; i < n; i++) {
      this.drips.push({
        x: rand(0, this.W),
        w: rand(5, 18),
        len: 0,
        target: rand(this.H * 0.08, this.H * (0.25 + k * 0.45)),
        speed: rand(30, 90),
      });
    }
    for (let x = 0; x <= this.W + 40; x += 40) this.band.push(rand(6, 26));
  }

  protected step(dt: number) {
    this.bandH = Math.min(1, this.bandH + dt / 1.2);
    for (const d of this.drips) {
      if (d.len < d.target) {
        // 越接近终点越慢，带一点随机的“停顿 - 涌出”
        const remain = (d.target - d.len) / d.target;
        d.len += d.speed * dt * (0.25 + remain) * (Math.random() < 0.05 ? 3 : 1);
        if (Math.random() < dt * 0.06) this.drops.push({ x: d.x, y: d.len + d.w, vy: 0, r: d.w * 0.45 });
      }
    }
    for (const p of this.drops) {
      p.vy += 1200 * dt;
      p.y += p.vy * dt;
    }
    this.drops = this.drops.filter((p) => p.y < this.H + 20);
    return true;
  }

  protected animating() {
    return this.bandH < 1 || this.drops.length > 0 || this.drips.some((d) => d.len < d.target);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const grd = ctx.createLinearGradient(0, 0, 0, this.H * 0.8);
    grd.addColorStop(0, "#4a0004");
    grd.addColorStop(0.15, "#8a0010");
    grd.addColorStop(1, "#b3101c");
    ctx.fillStyle = grd;
    // 顶部血带
    ctx.beginPath();
    ctx.moveTo(0, 0);
    this.band.forEach((h, i) => ctx.lineTo(i * 40, h * this.bandH));
    ctx.lineTo(this.W, 0);
    ctx.closePath();
    ctx.fill();
    for (const d of this.drips) {
      if (d.len <= 0) continue;
      const top = d.w * 1.6;
      ctx.beginPath();
      ctx.moveTo(d.x - top, 0);
      ctx.quadraticCurveTo(d.x - d.w * 0.5, d.w, d.x - d.w * 0.45, Math.min(d.len, d.w * 2));
      ctx.lineTo(d.x - d.w * 0.4, d.len);
      ctx.arc(d.x, d.len, d.w * 0.62, Math.PI, 0, true);
      ctx.lineTo(d.x + d.w * 0.45, Math.min(d.len, d.w * 2));
      ctx.quadraticCurveTo(d.x + d.w * 0.5, d.w, d.x + top, 0);
      ctx.closePath();
      ctx.fill();
      // 光泽高光
      ctx.strokeStyle = "rgba(255,140,140,0.35)";
      ctx.lineWidth = Math.max(1, d.w * 0.15);
      ctx.beginPath();
      ctx.moveTo(d.x - d.w * 0.2, d.w * 1.5);
      ctx.lineTo(d.x - d.w * 0.2, d.len - d.w * 0.2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,180,180,0.4)";
      ctx.beginPath();
      ctx.arc(d.x - d.w * 0.22, d.len - d.w * 0.05, d.w * 0.14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = grd;
    }
    for (const p of this.drops) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 1.5, 0, 0, TAU);
      ctx.fill();
    }
  }
}

// ============================================================================
// 黑暗中偷窥的眼睛：眨眼，瞳孔跟随全局鼠标
// ============================================================================

interface EyePair {
  x: number;
  y: number;
  s: number;
  gap: number;
  open: number;
  blinkT: number;
  blinking: number;
  appear: number;
  hue: string;
}

class Eyes extends PrankBase {
  private pairs: EyePair[] = [];

  constructor(ctx: FxContext) {
    super(ctx);
    const n = ctx.options.count ?? randInt(3, 5);
    const W = this.W;
    const H = this.H;
    for (let i = 0; i < n; i++) {
      // 靠近四周边缘/角落
      const edge = randInt(0, 3);
      const m = rand(50, 110);
      const x = edge === 1 ? W - m : edge === 3 ? m : rand(80, W - 80);
      const y = edge === 0 ? m : edge === 2 ? H - m : rand(80, H - 80);
      this.pairs.push({
        x: i === 0 && ctx.options.x !== undefined ? ctx.options.x : x,
        y: i === 0 && ctx.options.y !== undefined ? ctx.options.y : y,
        s: rand(0.6, 1.3),
        gap: rand(48, 62),
        open: 0,
        blinkT: rand(1, 5),
        blinking: -1,
        appear: -i * 0.6,
        hue: Math.random() < 0.5 ? "#c7a000" : "#b01818",
      });
    }
  }

  protected step(dt: number) {
    for (const p of this.pairs) {
      p.appear += dt;
      if (p.appear < 0) continue;
      if (p.blinking >= 0) {
        p.blinking += dt / 0.2;
        if (p.blinking >= 1) p.blinking = -1;
      } else {
        p.blinkT -= dt;
        if (p.blinkT <= 0) {
          p.blinking = 0;
          p.blinkT = Math.random() < 0.25 ? 0.3 : rand(2, 6);
        }
      }
      const blink = p.blinking >= 0 ? Math.abs(Math.cos(p.blinking * Math.PI)) : 1;
      p.open = clamp(p.appear / 1.5, 0, 1) * blink;
    }
    return true;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const c = this.ctx.rt.cursor;
    const base = ctx.globalAlpha;
    for (const p of this.pairs) {
      if (p.appear < 0) continue;
      const fade = clamp(p.appear / 1.5, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.s, p.s);
      // 周围的黑暗
      ctx.globalAlpha = base * fade * 0.85;
      const dark = ctx.createRadialGradient(0, 0, 10, 0, 0, 140);
      dark.addColorStop(0, "rgba(0,0,0,0.95)");
      dark.addColorStop(0.55, "rgba(0,0,0,0.6)");
      dark.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = dark;
      ctx.fillRect(-140, -140, 280, 280);
      ctx.globalAlpha = base * fade;
      for (const side of [-1, 1]) {
        const ex = (side * p.gap) / 2;
        const lx = (c.x - (p.x + ex * p.s)) / p.s;
        const ly = (c.y - p.y) / p.s;
        const d = Math.hypot(lx, ly) || 1;
        const k = Math.min(1, d / 300);
        this.eye(ctx, ex, 0, p.open, (lx / d) * 9 * k, (ly / d) * 4 * k, p.hue, side);
      }
      ctx.restore();
    }
  }

  private eye(ctx: CanvasRenderingContext2D, x: number, y: number, open: number, px: number, py: number, hue: string, side: number) {
    if (open < 0.04) {
      ctx.strokeStyle = "rgba(60,40,40,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 20, y);
      ctx.quadraticCurveTo(x, y + 4, x + 20, y);
      ctx.stroke();
      return;
    }
    const h = 11 * open;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 21, y + side * 1);
    ctx.quadraticCurveTo(x, y - h * 1.6, x + 21, y - side * 1);
    ctx.quadraticCurveTo(x, y + h * 1.4, x - 21, y + side * 1);
    ctx.closePath();
    const white = ctx.createRadialGradient(x, y, 2, x, y, 22);
    white.addColorStop(0, "#f2ead8");
    white.addColorStop(1, "#9c8070");
    ctx.fillStyle = white;
    ctx.shadowColor = "rgba(255,230,200,0.35)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    // 血丝
    ctx.strokeStyle = "rgba(170,20,20,0.5)";
    ctx.lineWidth = 0.8;
    for (const a of [0.3, 2.7, 3.5, 5.9]) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 21, y + Math.sin(a) * 8);
      ctx.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 4 + 1);
      ctx.stroke();
    }
    const iris = ctx.createRadialGradient(x + px, y + py, 1, x + px, y + py, 9);
    iris.addColorStop(0, "#111");
    iris.addColorStop(0.35, hue);
    iris.addColorStop(1, "#2a0a00");
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(x + px, y + py, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x + px, y + py, 2.2, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.arc(x + px - 3, y + py - 3, 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================================
// 血手印（blood 图集）：
// - 手印逐个“拍”上（快速缩放落定 + 旁边溅点），部分缓慢下滑留下拖痕
// - 变体：一串脚印 / 靴印一步一步走过屏幕
// - 顶部偶尔出现下流的血滴
// ============================================================================

const BLOOD = { hand: 0, handSmear: 1, fingers: 2, footA: 3, footB: 4, boot: 5, claw: 6, drips: 7, splat: 8 };

interface Print {
  frame: number;
  x: number;
  y: number;
  rot: number;
  /** 目标高度（px） */
  size: number;
  flip: boolean;
  t: number;
  slide: number;
  slideMax: number;
  alpha: number;
}

interface TopDrip {
  x: number;
  size: number;
  t: number;
  dur: number;
}

class Hands extends PrankBase {
  private prints: Print[] = [];
  private drips: TopDrip[] = [];
  private mode: "hands" | "steps";
  // 脚印行走状态
  private walk = { x: 0, y: 0, a: 0, n: 0, max: 0, next: 0, frame: 3, boot: false, stride: 110 };

  constructor(ctx: FxContext) {
    super(ctx);
    this.mode = Math.random() < 0.6 ? "hands" : "steps";
    const W = this.W;
    const H = this.H;
    if (this.mode === "hands") {
      const n = ctx.options.count ?? randInt(4, 7);
      for (let i = 0; i < n; i++) {
        const frame = pick([BLOOD.hand, BLOOD.hand, BLOOD.handSmear, BLOOD.hand, BLOOD.fingers]);
        const x = i === 0 && ctx.options.x !== undefined ? ctx.options.x : rand(120, W - 120);
        const y = i === 0 && ctx.options.y !== undefined ? ctx.options.y : rand(120, H - 200);
        const t = -i * rand(0.55, 0.9);
        this.prints.push({
          frame,
          x,
          y,
          rot: rand(-0.7, 0.7),
          size: frame === BLOOD.fingers ? rand(150, 200) : rand(170, 240),
          flip: Math.random() < 0.5,
          t,
          slide: 0,
          slideMax: frame !== BLOOD.fingers && Math.random() < 0.4 ? rand(60, 200) : 0,
          alpha: rand(0.85, 0.95),
        });
        // 拍上去时旁边溅出的血点
        if (Math.random() < 0.6) {
          const a = rand(0, TAU);
          this.prints.push({
            frame: BLOOD.splat,
            x: x + Math.cos(a) * rand(80, 130),
            y: y + Math.sin(a) * rand(80, 130),
            rot: rand(0, TAU),
            size: rand(50, 95),
            flip: false,
            t: t - 0.06,
            slide: 0,
            slideMax: 0,
            alpha: rand(0.75, 0.9),
          });
        }
      }
    } else {
      // 从屏幕一侧走进来
      const fromLeft = Math.random() < 0.5;
      const w = this.walk;
      w.x = fromLeft ? -40 : W + 40;
      w.y = ctx.options.y ?? rand(H * 0.25, H * 0.8);
      w.a = (fromLeft ? 0 : Math.PI) + rand(-0.35, 0.35);
      w.boot = Math.random() < 0.25;
      w.frame = w.boot ? BLOOD.boot : pick([BLOOD.footA, BLOOD.footB]);
      // 相邻左右脚印的间距约为脚长的 2 倍以上，避免脚印重叠成一条带
      w.stride = w.boot ? rand(230, 260) : rand(200, 230);
      w.max = Math.ceil((W + 160) / (w.stride * Math.abs(Math.cos(w.a)) + 1)) + 1;
      w.next = 0.3;
    }
    const nd = this.mode === "hands" ? randInt(0, 2) : randInt(1, 2);
    for (let i = 0; i < nd; i++) {
      this.drips.push({ x: rand(60, W - 60), size: rand(150, 260), t: -rand(0.5, 4), dur: rand(2.5, 4.5) });
    }
  }

  protected step(dt: number) {
    for (const p of this.prints) {
      p.t += dt;
      if (p.t > 0.9 && p.slide < p.slideMax) p.slide = Math.min(p.slideMax, p.slide + dt * rand(12, 26));
    }
    for (const d of this.drips) d.t += dt;
    const w = this.walk;
    if (this.mode === "steps" && w.n < w.max) {
      w.next -= dt;
      if (w.next <= 0) {
        w.next = rand(0.45, 0.6);
        // 轻微左右摆动的行走方向
        w.a += rand(-0.12, 0.12);
        const side = w.n % 2 === 0 ? -1 : 1;
        const nx = -Math.sin(w.a);
        const ny = Math.cos(w.a);
        w.x += Math.cos(w.a) * w.stride;
        w.y += Math.sin(w.a) * w.stride;
        this.prints.push({
          frame: w.frame,
          x: w.x + nx * side * 30,
          y: w.y + ny * side * 30,
          rot: w.a + Math.PI / 2 + rand(-0.08, 0.08),
          size: w.boot ? 110 : rand(88, 100),
          flip: side > 0,
          t: 0,
          slide: 0,
          slideMax: 0,
          // 越往后血越少
          alpha: Math.max(0.35, 0.95 - w.n * 0.025),
        });
        w.n++;
      }
    }
    return true;
  }

  protected animating() {
    return (
      (this.mode === "steps" && this.walk.n < this.walk.max) ||
      this.prints.some((p) => p.t < 0.3 || p.slide < p.slideMax) ||
      this.drips.some((d) => d.t < d.dur)
    );
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("blood");
    if (!a) return;
    const base = ctx.globalAlpha;
    for (const d of this.drips) {
      if (d.t <= 0) continue;
      const f = a.frame(BLOOD.drips);
      const s = d.size / f.h;
      const k = easeOutCubic(clamp(d.t / d.dur, 0, 1));
      ctx.save();
      ctx.beginPath();
      ctx.rect(d.x - f.w * s, 0, f.w * s * 2, f.h * s * k);
      ctx.clip();
      ctx.globalAlpha = base * 0.9;
      ctx.translate(d.x, 0);
      a.drawAnchored(ctx, BLOOD.drips, 0.5, 0, s);
      ctx.restore();
    }
    for (const p of this.prints) {
      if (p.t < 0) continue;
      const f = a.frame(p.frame);
      const s = p.size / Math.max(f.w, f.h);
      const k = clamp(p.t / 0.1, 0, 1);
      // 拍上：从 1.18 倍快速落到 1
      const sc = s * (1.18 - 0.18 * easeOutCubic(k));
      if (p.slide > 0) {
        // 下滑拖痕：沿路径叠印逐渐变淡的副本
        const n = Math.ceil(p.slide / 10);
        for (let i = 0; i < n; i++) {
          const yy = p.y + (p.slide * i) / n;
          ctx.globalAlpha = base * p.alpha * 0.13 * (1 - i / n) + base * 0.05;
          ctx.save();
          ctx.translate(p.x, yy);
          ctx.rotate(p.rot);
          ctx.scale(p.flip ? -s * 0.92 : s * 0.92, s * 1.05);
          a.drawAnchored(ctx, p.frame, 0.5, 0.5, 1);
          ctx.restore();
        }
      }
      ctx.globalAlpha = base * p.alpha * k;
      ctx.save();
      ctx.translate(p.x, p.y + p.slide);
      ctx.rotate(p.rot);
      ctx.scale(p.flip ? -sc : sc, sc);
      a.drawAnchored(ctx, p.frame, 0.5, 0.5, 1);
      ctx.restore();
    }
    ctx.globalAlpha = base;
  }
}

// ============================================================================
// 鬼影（ghosts 图集）：每隔 3~7 秒出现一次
// - stand：远处站着的人影，缓慢浮现、轻微摇晃
// - peek：从屏幕边缘探出半张脸，停一下再缩回去
// - approach（少见）：从小到大快速逼近后消失
// 去色 + 低透明度 + 偶发的切片错位与 RGB 分离（不做高频频闪）
// ============================================================================

const ghostCache = new Map<string, HTMLCanvasElement>();
/** 去色版本 / 红色 / 青色分离版本 */
function ghostTexture(frame: number, variant: "gray" | "red" | "cyan"): HTMLCanvasElement | null {
  const a = atlas("ghosts");
  if (!a) return null;
  const key = `${frame}|${variant}`;
  let c = ghostCache.get(key);
  if (!c) {
    const src = a.canvas(frame);
    c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d")!;
    g.filter = "grayscale(1) contrast(1.15) brightness(0.92)";
    g.drawImage(src, 0, 0);
    g.filter = "none";
    if (variant !== "gray") {
      g.globalCompositeOperation = "source-in";
      g.fillStyle = variant === "red" ? "rgb(255,40,60)" : "rgb(40,230,255)";
      g.fillRect(0, 0, c.width, c.height);
    }
    ghostCache.set(key, c);
  }
  return c;
}

type GhostMode = "stand" | "peek" | "approach";

interface Apparition {
  mode: GhostMode;
  frame: number;
  x: number;
  y: number;
  /** 显示高度 */
  h: number;
  t: number;
  dur: number;
  maxAlpha: number;
  /** peek：从哪条边探出 */
  side: -1 | 1;
  glitchUntil: number;
}

class Ghost extends PrankBase {
  private ap: Apparition | null = null;
  private timer: number | undefined;
  private count = 0;

  constructor(ctx: FxContext) {
    super(ctx);
    this.schedule(0.6);
  }

  private schedule(sec: number) {
    this.timer = window.setTimeout(() => {
      if (this.stopping) return;
      this.spawn();
      this.ctx.layer.invalidate();
    }, sec * 1000);
  }

  private spawn() {
    const W = this.W;
    const H = this.H;
    this.count++;
    const r = Math.random();
    const mode: GhostMode = this.count > 1 && r < 0.15 ? "approach" : r < 0.55 ? "stand" : "peek";
    let ap: Apparition;
    if (mode === "stand") {
      const h = rand(180, 320);
      ap = {
        mode,
        frame: pick([0, 0, 1, 3]),
        x: this.ctx.options.x ?? (Math.random() < 0.5 ? rand(W * 0.06, W * 0.3) : rand(W * 0.7, W * 0.94)),
        y: this.ctx.options.y ?? rand(H * 0.35, H * 0.85) - h / 2,
        h,
        t: 0,
        dur: rand(3.5, 5.5),
        maxAlpha: rand(0.25, 0.45),
        side: 1,
        glitchUntil: 0,
      };
    } else if (mode === "peek") {
      const side = Math.random() < 0.5 ? -1 : 1;
      ap = {
        mode,
        frame: pick([8, 8, 4, 2]),
        x: side < 0 ? 0 : W,
        y: rand(H * 0.2, H * 0.75),
        h: rand(260, 380),
        t: 0,
        dur: rand(3, 4.5),
        maxAlpha: rand(0.4, 0.6),
        side,
        glitchUntil: 0,
      };
    } else {
      ap = {
        mode,
        frame: pick([4, 5, 6, 7]),
        x: rand(W * 0.35, W * 0.65),
        y: rand(H * 0.35, H * 0.6),
        h: H * rand(0.6, 0.8),
        t: 0,
        dur: 0.95,
        maxAlpha: rand(0.45, 0.6),
        side: 1,
        glitchUntil: 0,
      };
    }
    this.ap = ap;
  }

  protected step(dt: number, now: number) {
    const ap = this.ap;
    if (!ap) return true;
    ap.t += dt;
    // 偶发的信号干扰（持续 80~180ms，间隔远大于 1/3 秒）
    if (now > ap.glitchUntil + 400 && Math.random() < dt * 0.9) ap.glitchUntil = now + rand(80, 180);
    if (ap.t >= ap.dur) {
      this.ap = null;
      this.schedule(rand(3, 7));
    }
    return true;
  }

  protected animating() {
    return this.ap !== null;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const ap = this.ap;
    if (!ap) return;
    const tex = ghostTexture(ap.frame, "gray");
    if (!tex) return;
    const base = ctx.globalAlpha;
    const p = ap.t / ap.dur;
    let alpha = 0;
    let scale = ap.h / tex.height;
    let x = ap.x;
    let y = ap.y;
    let flip = false;
    if (ap.mode === "stand") {
      alpha = ap.maxAlpha * Math.min(1, ap.t / 1.2, (ap.dur - ap.t) / 1.0);
      x += Math.sin(ap.t * 1.3) * 4;
      y += Math.sin(ap.t * 0.9) * 2;
    } else if (ap.mode === "peek") {
      // 探出 -> 停留 -> 缩回
      const out = p < 0.25 ? easeOutCubic(p / 0.25) : p > 0.8 ? 1 - easeOutCubic((p - 0.8) / 0.2) : 1;
      const w = tex.width * scale;
      const visible = w * 0.5 * out;
      x = ap.side < 0 ? -w / 2 + visible : ap.x + w / 2 - visible;
      flip = ap.side < 0;
      alpha = ap.maxAlpha * Math.min(1, out * 1.5);
    } else {
      // 逼近：0.6s 内从 0.15 倍放大到 1 倍，然后迅速消失
      const k = Math.min(1, ap.t / 0.6);
      scale *= 0.15 + 0.85 * k * k;
      alpha = ap.maxAlpha * (ap.t < 0.6 ? 0.6 + 0.4 * k : Math.max(0, 1 - (ap.t - 0.6) / 0.25));
      // 轻微的亮度抖动（不是开关式频闪）
      alpha *= 0.85 + 0.15 * Math.sin(ap.t * 40);
    }
    if (alpha <= 0) return;
    const dw = tex.width * scale;
    const dh = tex.height * scale;
    const glitch = performance.now() < ap.glitchUntil;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    if (glitch) {
      // RGB 分离
      const red = ghostTexture(ap.frame, "red");
      const cyan = ghostTexture(ap.frame, "cyan");
      const off = rand(4, 10);
      ctx.globalCompositeOperation = "lighter";
      if (red) {
        ctx.globalAlpha = base * alpha * 0.35;
        ctx.drawImage(red, -dw / 2 - off, -dh / 2, dw, dh);
      }
      if (cyan) {
        ctx.globalAlpha = base * alpha * 0.35;
        ctx.drawImage(cyan, -dw / 2 + off, -dh / 2, dw, dh);
      }
      ctx.globalCompositeOperation = "source-over";
      // 水平切片错位
      ctx.globalAlpha = base * alpha;
      const slices = 10;
      for (let i = 0; i < slices; i++) {
        const sy = (tex.height / slices) * i;
        const o = Math.random() < 0.4 ? rand(-dw * 0.08, dw * 0.08) : 0;
        ctx.drawImage(tex, 0, sy, tex.width, tex.height / slices, -dw / 2 + o, -dh / 2 + (dh / slices) * i, dw, dh / slices);
      }
    } else {
      ctx.globalAlpha = base * alpha;
      ctx.drawImage(tex, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
    ctx.globalAlpha = base;
  }

  dispose() {
    window.clearTimeout(this.timer);
  }
}

/** 优先用 WebGL 液体血迹；不支持 WebGL2 时退回 2D 版本 */
export const createBlood = (ctx: FxContext) => {
  try {
    return createBloodFlow(ctx);
  } catch (e) {
    console.warn("[horror-blood] WebGL 液体不可用，使用 2D 版本", e);
    return new Blood(ctx);
  }
};
export const createEyes = (ctx: FxContext) => new Eyes(ctx);
export const createHands = (ctx: FxContext) => new Hands(ctx);
export const createGhost = (ctx: FxContext) => new Ghost(ctx);
