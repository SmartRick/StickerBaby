/**
 * 钞票特效：钞票雨 / 底部喷发 / 侧边喷钞枪，共用同一套双面钞票渲染与空气动力学。
 *
 * 注意：人民币图样的使用受《人民币图样使用管理办法》限制，正式上线前需替换为合规的
 * 虚拟票面（或获得授权），此处仅用于技术演示。
 *
 * 图集 banknotes：[0 100元正, 1 100元背, 2 20元正, 3 20元背, 4 10元正, 5 10元背, 6 5元正, 7 5元背]
 */
import type { FxContext } from "../core/fx";
import { atlas } from "../core/assets";
import { rand } from "../core/layer";
import { BaseFx, durationOf, smokePuff } from "./base";

const GRAVITY = 520;
const STRIPS = 14;

export class Banknote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 显示宽度（px） */
  w: number;
  depth: number;
  /** 0=100 1=20 2=10 3=5 */
  denom: number;
  /** 翻面角（绕票面长轴），cos>0 正面 */
  flip = rand(0, Math.PI * 2);
  flipV = rand(2, 6) * (Math.random() < 0.5 ? -1 : 1);
  rot = rand(-Math.PI, Math.PI);
  vr = rand(-1.5, 1.5);
  /** 左右摆荡 */
  sway = rand(0, Math.PI * 2);
  swayF = rand(1.2, 2.4);
  swayA = rand(120, 260);
  /** 纸张弯曲 / 抖动相位 */
  bend = rand(0, Math.PI * 2);
  bendF = rand(4, 9);
  bendA = rand(0.06, 0.14);
  /** 空气阻力系数（1/s），越大越“飘” */
  drag = rand(1.8, 2.6);
  age = 0;

  constructor(x: number, y: number, vx: number, vy: number, depth = rand(0.4, 1)) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.depth = depth;
    this.w = 120 + 80 * depth;
    const r = Math.random();
    this.denom = r < 0.6 ? 0 : r < 0.74 ? 1 : r < 0.87 ? 2 : 3;
  }

  update(dt: number) {
    this.age += dt;
    const speed = Math.hypot(this.vx, this.vy);
    // 二次阻力 + 线性阻力：高速飞出时迅速减速，之后接近终端速度缓缓飘落
    const k = Math.exp(-(this.drag + speed * 0.0016) * dt);
    this.vx *= k;
    this.vy = this.vy * k + GRAVITY * (0.55 + this.depth * 0.45) * dt;
    // 慢速时纸片的侧向摆荡（落叶式）
    const slow = Math.max(0, 1 - speed / 700);
    this.sway += this.swayF * dt;
    this.vx += Math.cos(this.sway) * this.swayA * slow * dt;
    // 摆到两端时下落变慢、翻面加快
    this.vy -= Math.abs(Math.sin(this.sway)) * 60 * slow * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.flip += this.flipV * dt * (0.4 + Math.min(1.5, speed / 600));
    this.rot += this.vr * dt + Math.sin(this.sway) * 0.4 * slow * dt;
    this.bend += this.bendF * dt;
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number, alpha: number) {
    const a = atlas("banknotes");
    if (!a) return;
    const ff = a.frame(this.denom * 2);
    const fb = a.frame(this.denom * 2 + 1);
    const W = this.w;
    const H = (W * ff.h) / ff.w;
    const dw = W / STRIPS;
    const curl = this.bendA * 5;
    const far = (1 - this.depth) * 0.22;

    // 绕票面短轴翻转：每一条有各自的翻转角（整体翻面 + 正弦卷曲），
    // 投影宽度 = dw·cos(角)，各条首尾相接累加 —— 上下边始终是连续直线（类似翻书页），
    // cos<0 的条显示背面（背面条序镜像），卷曲处自然出现正反面交界
    const xs = this.xs;
    const angs = this.angs;
    xs[0] = 0;
    for (let i = 0; i < STRIPS; i++) {
      angs[i] = this.flip + Math.sin(this.bend + ((i + 0.5) / STRIPS) * Math.PI * 1.3) * curl;
      xs[i + 1] = xs[i] + dw * Math.cos(angs[i]);
    }
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cos = Math.cos(this.rot);
    const sin = Math.sin(this.rot);

    if (this.depth > 0.6) {
      ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, this.x * dpr, this.y * dpr);
      ctx.globalAlpha = alpha * 0.1;
      ctx.fillStyle = "#000";
      const ext = Math.max(...xs) - Math.min(...xs);
      ctx.fillRect(-ext / 2 + 6, -H / 2 + 10, ext, H);
    }

    // 卷曲带来的纵深：中线轻微起伏（用切变保持连续）
    const yc = (i: number) => Math.sin(angs[Math.min(i, STRIPS - 1)]) * H * 0.05 * (i === STRIPS ? 1 : 1);
    for (let i = 0; i < STRIPS; i++) {
      const c = Math.cos(angs[i]);
      const x0 = Math.min(xs[i], xs[i + 1]) - cx;
      const w = Math.abs(xs[i + 1] - xs[i]);
      if (w < 0.05) continue;
      const front = c >= 0;
      const fr = front ? ff : fb;
      const si = front ? i : STRIPS - 1 - i;
      const sw = fr.w / STRIPS;
      const y0 = yc(i);
      const k = (yc(i + 1) - y0) / Math.max(w, 1);
      ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, this.x * dpr, this.y * dpr);
      ctx.transform(1, front ? k : -k, 0, 1, x0, y0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(a.image, fr.x + si * sw, fr.y, sw, fr.h, -0.35, -H / 2, w + 0.7, H);
      const shade = (1 - Math.abs(c)) * 0.55 + far;
      if (shade > 0.02) {
        ctx.globalAlpha = alpha * Math.min(0.75, shade);
        ctx.fillStyle = "#141414";
        ctx.fillRect(-0.35, -H / 2, w + 0.7, H);
      }
      const spec = Math.max(0, Math.sin(angs[i] * 2 + 0.6)) * 0.14 * Math.abs(c);
      if (spec > 0.02) {
        ctx.globalAlpha = alpha * spec;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-0.35, -H / 2, w + 0.7, H);
      }
    }
  }

  private xs = new Float32Array(STRIPS + 1);
  private angs = new Float32Array(STRIPS);
}

/** 一捆钞票：整体下落，空中散开成多张 */
class Bundle {
  vr = rand(-2, 2);
  rot = rand(-0.5, 0.5);
  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public burstY: number,
  ) {}
}

abstract class MoneyFx extends BaseFx {
  protected notes: Banknote[] = [];

  protected stepNotes(dt: number) {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      n.update(dt);
      if (n.y > this.h + n.w || n.x < -n.w * 2 || n.x > this.w + n.w * 2) this.notes.splice(i, 1);
    }
  }

  protected add(n: Banknote) {
    if (this.notes.length < 320) {
      this.notes.push(n);
      // 按景深排序（远的先画）；插入排序保持近似有序即可
      let i = this.notes.length - 1;
      while (i > 0 && this.notes[i - 1].depth > n.depth) {
        this.notes[i] = this.notes[i - 1];
        i--;
      }
      this.notes[i] = n;
    }
  }

  protected renderNotes(ctx: CanvasRenderingContext2D) {
    for (const n of this.notes) n.draw(ctx, this.dpr, this.fade);
    this.resetTransform(ctx);
    ctx.globalAlpha = 1;
  }

  protected finished() {
    return this.notes.length === 0;
  }
}

// ---------------- 钞票雨：从天而降，部分成捆在空中散开 ----------------
class MoneyRain extends MoneyFx {
  private bundles: Bundle[] = [];
  private acc = 0;
  private bundleAcc = 0;

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.8, 7);
  }

  protected step(dt: number) {
    if (this.spawning) {
      this.acc += dt * 14 * (0.4 + this.intensity);
      while (this.acc >= 1) {
        this.acc--;
        this.add(new Banknote(rand(-60, this.w + 60), -120, rand(-60, 60), rand(60, 160)));
      }
      this.bundleAcc += dt * 0.9 * (0.4 + this.intensity);
      while (this.bundleAcc >= 1) {
        this.bundleAcc--;
        this.bundles.push(new Bundle(rand(this.w * 0.1, this.w * 0.9), -80, rand(-80, 80), rand(150, 260), rand(this.h * 0.15, this.h * 0.45)));
      }
    }
    for (let i = this.bundles.length - 1; i >= 0; i--) {
      const b = this.bundles[i];
      b.vy += GRAVITY * 0.8 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > b.burstY) {
        const count = Math.round(rand(9, 15));
        for (let k = 0; k < count; k++) {
          const ang = rand(0, Math.PI * 2);
          const sp = rand(150, 520);
          this.add(new Banknote(b.x, b.y, b.vx + Math.cos(ang) * sp, b.vy * 0.3 + Math.sin(ang) * sp - 120, rand(0.6, 1)));
        }
        this.bundles.splice(i, 1);
      }
    }
    this.stepNotes(dt);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    this.renderNotes(ctx);
    const a = atlas("banknotes");
    if (!a) return;
    // 成捆钞票：多张叠放 + 中间腰封
    for (const b of this.bundles) {
      const f = a.frame(0);
      const W = 170;
      const H = (W * f.h) / f.w;
      this.place(ctx, b.x, b.y, b.rot);
      ctx.globalAlpha = this.fade * 0.18;
      ctx.fillStyle = "#000";
      ctx.fillRect(-W / 2 + 8, -H / 2 + 12, W, H + 10);
      ctx.globalAlpha = this.fade;
      for (let k = 5; k >= 0; k--) a.draw(ctx, 0, k * 0.6, k * 1.6, W, H);
      ctx.fillStyle = "#f4f1e6";
      ctx.fillRect(-12, -H / 2 - 1, 24, H + 10);
      ctx.fillStyle = "rgba(160,30,40,0.8)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("壹万", 0, 3);
    }
    this.resetTransform(ctx);
  }

  protected finished() {
    return this.notes.length === 0 && this.bundles.length === 0;
  }
}

// ---------------- 底部喷发：一股股钞票冲天而起，再飘落 ----------------
class MoneyBurst extends MoneyFx {
  private pulse = 0;
  private jets: number[];

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 4), 0.8, 7);
    this.jets =
      fx.options.x !== undefined
        ? [fx.options.x]
        : this.intensity > 0.55
          ? [this.w * 0.22, this.w * 0.5, this.w * 0.78]
          : [this.w * 0.5];
  }

  protected step(dt: number) {
    if (this.spawning) {
      this.pulse -= dt;
      if (this.pulse <= 0) {
        this.pulse = rand(0.55, 0.85);
        for (const jx of this.jets) {
          const n = Math.round(rand(12, 20) * (0.5 + this.intensity * 0.7) / Math.sqrt(this.jets.length));
          for (let k = 0; k < n; k++) {
            const ang = -Math.PI / 2 + rand(-0.32, 0.32);
            const sp = rand(1300, 2100) * (this.h / 1100);
            this.add(new Banknote(jx + rand(-30, 30), this.h + 60, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(0.45, 1)));
          }
        }
      }
    }
    this.stepNotes(dt);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    this.renderNotes(ctx);
  }
}

// ---------------- 侧边喷钞枪 ----------------
let gunSprite: HTMLCanvasElement | null = null;
const GUN_W = 300;
const GUN_H = 190;
/** 枪口在枪图中的位置（右向），用于发射点 */
const MUZZLE = { x: 292, y: 58 };

function drawGun(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = GUN_W * 2;
  c.height = GUN_H * 2;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  const gold = g.createLinearGradient(0, 0, 0, 40);
  gold.addColorStop(0, "#fff1b0");
  gold.addColorStop(0.5, "#e2b13c");
  gold.addColorStop(1, "#9a6a12");
  const body = g.createLinearGradient(0, 30, 0, 100);
  body.addColorStop(0, "#3a3a3e");
  body.addColorStop(0.45, "#151517");
  body.addColorStop(1, "#050506");

  // 弹仓里的一摞钞票（侧视：粉红色纸边 + 腰封）
  g.fillStyle = "#e9a3ac";
  g.fillRect(70, 6, 150, 30);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? "#d9828f" : "#f3c1c8";
    g.fillRect(70, 7 + i * 2.4, 150, 1.2);
  }
  g.fillStyle = "#f4f1e6";
  g.fillRect(136, 4, 18, 34);

  // 枪身
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(40, 36);
  g.lineTo(270, 36);
  g.quadraticCurveTo(286, 36, 288, 50);
  g.lineTo(288, 70);
  g.quadraticCurveTo(286, 82, 270, 84);
  g.lineTo(150, 86);
  g.lineTo(40, 86);
  g.quadraticCurveTo(26, 62, 40, 36);
  g.fill();
  // 枪管口金色圈
  g.fillStyle = gold;
  g.fillRect(278, 44, 14, 28);
  g.fillStyle = "#050506";
  g.fillRect(286, 48, 8, 20);
  // 金色饰条与 logo
  g.fillStyle = gold;
  g.fillRect(48, 52, 210, 5);
  g.font = "bold 16px sans-serif";
  g.fillText("$ MONEY GUN", 120, 78);
  // 握把
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(70, 84);
  g.lineTo(122, 84);
  g.lineTo(108, 182);
  g.quadraticCurveTo(84, 188, 62, 180);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(80 - i * 1.2, 100 + i * 10);
    g.lineTo(112 - i * 1.4, 100 + i * 10);
    g.stroke();
  }
  // 扳机与护圈
  g.strokeStyle = gold;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(140, 98, 18, 0.2, Math.PI);
  g.stroke();
  g.fillStyle = gold;
  g.fillRect(134, 86, 6, 18);
  // 高光
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.fillRect(44, 38, 230, 6);
  return c;
}

interface Gun {
  side: -1 | 1;
  y: number;
  /** 进出场 0..1 */
  slide: number;
  recoil: number;
  fireAcc: number;
  phase: number;
}

let puffSprite: HTMLCanvasElement | null = null;

class MoneyGun extends MoneyFx {
  private guns: Gun[] = [];
  private puffs: { x: number; y: number; age: number; s: number }[] = [];

  constructor(fx: FxContext) {
    super(fx, durationOf(fx, 5), 0.8, 7);
    if (!gunSprite) gunSprite = drawGun();
    if (!puffSprite) puffSprite = smokePuff(128, "255,255,255", 10, 0.2);
    const both = this.intensity > 0.5;
    this.guns.push({ side: 1, y: this.h * rand(0.45, 0.62), slide: 0, recoil: 0, fireAcc: 0, phase: 0 });
    if (both) this.guns.push({ side: -1, y: this.h * rand(0.3, 0.45), slide: 0, recoil: 0, fireAcc: -0.4, phase: Math.PI });
  }

  /** 枪在屏幕上的姿态：side=1 在左边朝右，-1 在右边朝左 */
  private pose(g: Gun) {
    const scale = Math.min(1.2, this.h / 900);
    const inX = 0.42 * GUN_W * scale;
    const outX = -GUN_W * scale;
    const ease = 1 - Math.pow(1 - g.slide, 3);
    const edge = outX + (inX - outX) * ease - g.recoil * 30;
    const x = g.side === 1 ? edge : this.w - edge;
    const aim = -0.08 + Math.sin(this.t * 1.7 + g.phase) * 0.1 - g.recoil * 0.25;
    return { x, y: g.y + Math.sin(this.t * 2.3 + g.phase) * 14, aim, scale };
  }

  private muzzle(g: Gun) {
    const p = this.pose(g);
    const mx = (MUZZLE.x - GUN_W / 2) * p.scale;
    const my = (MUZZLE.y - GUN_H / 2) * p.scale;
    const a = g.side === 1 ? p.aim : Math.PI - p.aim;
    const cos = Math.cos(p.aim);
    const sin = Math.sin(p.aim);
    const lx = mx * cos - my * sin;
    const ly = mx * sin + my * cos;
    return { x: p.x + lx * g.side, y: p.y + ly, angle: a };
  }

  protected step(dt: number) {
    const active = this.spawning;
    for (const g of this.guns) {
      g.slide = active ? Math.min(1, g.slide + dt / 0.45) : Math.max(0, g.slide - dt / 0.45);
      g.recoil = Math.max(0, g.recoil - dt * 7);
      if (active && g.slide > 0.9) {
        g.fireAcc += dt * (12 + 10 * this.intensity);
        while (g.fireAcc >= 1) {
          g.fireAcc--;
          const m = this.muzzle(g);
          const ang = m.angle + rand(-0.22, 0.18);
          const sp = rand(1100, 1700) * (this.w / 2000);
          const n = new Banknote(m.x, m.y, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(0.55, 1));
          n.rot = ang + rand(-0.3, 0.3);
          n.flipV = rand(6, 12) * (Math.random() < 0.5 ? -1 : 1);
          this.add(n);
          g.recoil = Math.min(1, g.recoil + 0.45);
          if (Math.random() < 0.5) this.puffs.push({ x: m.x, y: m.y, age: 0, s: rand(40, 80) });
        }
      }
    }
    for (const p of this.puffs) {
      p.age += dt;
      p.y -= 20 * dt;
    }
    this.puffs = this.puffs.filter((p) => p.age < 0.5);
    this.stepNotes(dt);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    this.renderNotes(ctx);
    for (const p of this.puffs) {
      ctx.globalAlpha = (1 - p.age / 0.5) * 0.6 * this.fade;
      const s = p.s * (1 + p.age * 3);
      ctx.drawImage(puffSprite!, p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const g of this.guns) {
      if (g.slide <= 0) continue;
      const p = this.pose(g);
      ctx.globalAlpha = this.fade;
      this.place(ctx, p.x, p.y, g.side === 1 ? p.aim : -p.aim, g.side * p.scale, p.scale);
      ctx.drawImage(gunSprite!, -GUN_W / 2, -GUN_H / 2, GUN_W, GUN_H);
    }
    this.resetTransform(ctx);
  }

  protected finished() {
    return this.notes.length === 0 && this.guns.every((g) => g.slide <= 0);
  }
}

export const moneyRain = (fx: FxContext) => new MoneyRain(fx);
export const moneyBurst = (fx: FxContext) => new MoneyBurst(fx);
export const moneyGun = (fx: FxContext) => new MoneyGun(fx);
