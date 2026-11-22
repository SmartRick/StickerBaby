/**
 * 屏幕表面类恶作剧：污渍（可擦除）、花屏、涂鸦、胶带（可撕掉）。
 */
import { atlas } from "../core/assets";
import type { FxContext } from "../core/fx";
import { offscreen, pick, rand, randInt } from "../core/layer";
import { PrankBase, TAU, blobPath, dist, posOr } from "./base";

type Pt = [number, number];

// ============================================================================
// 污渍：咖啡渍 / 油污 / 指纹 / 手印。鼠标在上面来回移动即可擦掉
// ============================================================================

type StainKind = "coffee" | "smudge" | "finger" | "hand";

interface StainItem {
  x: number;
  y: number;
  r: number;
  S: number;
  tex: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  rub: number;
  need: number;
  alpha: number;
  fading: boolean;
}

function fingerprint(g: CanvasRenderingContext2D, cx: number, cy: number, scale: number, rot: number) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(scale, scale);
  g.lineWidth = 1.1;
  for (let k = 0; k < 13; k++) {
    const rx = 3 + k * 1.9;
    const ry = rx * 1.4;
    let a = rand(0, 0.6);
    while (a < TAU) {
      const len = rand(0.6, 2.2);
      g.beginPath();
      g.ellipse(0, k * 0.25, rx, ry, 0, a, Math.min(TAU, a + len));
      g.strokeStyle = `rgba(90,82,70,${rand(0.14, 0.26)})`;
      g.stroke();
      a += len + rand(0.08, 0.3);
    }
  }
  g.restore();
}

function makeStainTex(kind: StainKind): { tex: HTMLCanvasElement; g: CanvasRenderingContext2D; r: number; S: number } {
  const r = kind === "hand" ? rand(85, 110) : kind === "coffee" ? rand(55, 95) : rand(55, 85);
  const S = Math.ceil(r * 2.6);
  const { canvas, ctx: g } = offscreen(S, S);
  const c = S / 2;
  switch (kind) {
    case "coffee": {
      const grd = g.createRadialGradient(c, c, 0, c, c, r * 1.05);
      grd.addColorStop(0, "rgba(130,80,35,0.07)");
      grd.addColorStop(0.75, "rgba(120,70,30,0.16)");
      grd.addColorStop(0.93, "rgba(95,50,18,0.55)");
      grd.addColorStop(1, "rgba(90,45,15,0.0)");
      g.fillStyle = grd;
      blobPath(g, c, c, r, 0.06, 40);
      g.fill();
      // 杯子第二次放下留下的半圈
      g.beginPath();
      const ox = rand(-0.3, 0.3) * r;
      const oy = rand(-0.3, 0.3) * r;
      g.arc(c + ox, c + oy, r * rand(0.9, 1.0), rand(0, TAU), rand(0, TAU) + rand(1.5, 3.5));
      g.strokeStyle = "rgba(95,50,18,0.32)";
      g.lineWidth = 2.5;
      g.stroke();
      // 溅出的小点
      for (let i = 0; i < randInt(3, 7); i++) {
        const a = rand(0, TAU);
        const d = r * rand(1.05, 1.25);
        g.beginPath();
        g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, rand(1.5, 5), 0, TAU);
        g.fillStyle = "rgba(100,55,20,0.4)";
        g.fill();
      }
      break;
    }
    case "smudge": {
      for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU);
        const d = rand(0, r * 0.5);
        const rr = rand(r * 0.3, r * 0.6);
        const grd = g.createRadialGradient(c + Math.cos(a) * d, c + Math.sin(a) * d, 0, c + Math.cos(a) * d, c + Math.sin(a) * d, rr);
        grd.addColorStop(0, "rgba(225,220,205,0.20)");
        grd.addColorStop(1, "rgba(225,220,205,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, S, S);
      }
      // 手指抹过的弧形油痕
      g.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        const y = c + rand(-r * 0.5, r * 0.5);
        g.moveTo(c - r * 0.8, y);
        g.quadraticCurveTo(c, y + rand(-30, 30), c + r * 0.8, y + rand(-20, 20));
        g.strokeStyle = `rgba(70,65,55,${rand(0.05, 0.1)})`;
        g.lineWidth = rand(8, 18);
        g.stroke();
        g.strokeStyle = "rgba(255,255,255,0.08)";
        g.lineWidth = 2;
        g.stroke();
      }
      break;
    }
    case "finger": {
      for (let i = 0; i < randInt(2, 4); i++) {
        fingerprint(g, c + rand(-r * 0.5, r * 0.5), c + rand(-r * 0.5, r * 0.5), rand(0.9, 1.3), rand(-0.8, 0.8));
      }
      break;
    }
    case "hand": {
      g.save();
      g.translate(c, c + r * 0.25);
      g.rotate(rand(-0.4, 0.4));
      g.fillStyle = "rgba(190,180,160,0.16)";
      blobPath(g, 0, 0, r * 0.45, 0.12, 20);
      g.fill();
      const fingers: [number, number, number][] = [
        [-0.42, -0.55, 0.42],
        [-0.17, -0.82, 0.5],
        [0.08, -0.86, 0.52],
        [0.32, -0.74, 0.46],
        [0.6, -0.1, 0.36],
      ];
      for (const [fx, fy, fl] of fingers) {
        g.save();
        g.translate(fx * r, fy * r);
        g.rotate(fx * 0.6);
        g.beginPath();
        g.ellipse(0, -fl * r * 0.35, r * 0.1, fl * r * 0.5, 0, 0, TAU);
        g.fill();
        fingerprint(g, 0, -fl * r * 0.6, 0.55, 0);
        g.restore();
      }
      g.restore();
      break;
    }
  }
  return { tex: canvas, g, r, S };
}

class Stain extends PrankBase {
  private items: StainItem[] = [];
  private current: StainItem | null = null;
  private last: Pt | null = null;

  constructor(ctx: FxContext) {
    super(ctx);
    const n = ctx.options.count ?? randInt(3, 5);
    const kinds: StainKind[] = ["coffee", "hand", "finger", "smudge"];
    for (let i = 0; i < n; i++) {
      const [x, y] = i === 0 ? posOr(ctx, 120) : posOr({ ...ctx, options: {} }, 120);
      const t = makeStainTex(kinds[i % kinds.length]);
      this.items.push({ x, y, ...t, rub: 0, need: t.r * 9, alpha: 1, fading: false });
    }
  }

  hitTest(x: number, y: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.fading && dist(x, y, it.x, it.y) < it.r) {
        this.current = it;
        return true;
      }
    }
    this.current = null;
    return false;
  }

  hover(x: number, y: number) {
    const it = this.current;
    if (!it) {
      this.last = null;
      return;
    }
    if (this.last) {
      const d = dist(this.last[0], this.last[1], x, y);
      if (d > 0 && d < 150) {
        this.erase(it, this.last[0], this.last[1], x, y, d);
        it.rub += d;
        if (it.rub > it.need) it.fading = true;
        this.ctx.layer.invalidate();
      }
    }
    this.last = [x, y];
  }

  leave() {
    this.last = null;
    this.current = null;
  }

  private erase(it: StainItem, x0: number, y0: number, x1: number, y1: number, d: number) {
    const g = it.g;
    const ox = it.x - it.S / 2;
    const oy = it.y - it.S / 2;
    g.save();
    g.globalCompositeOperation = "destination-out";
    const steps = Math.max(1, Math.ceil(d / 6));
    for (let i = 1; i <= steps; i++) {
      const px = x0 + ((x1 - x0) * i) / steps - ox;
      const py = y0 + ((y1 - y0) * i) / steps - oy;
      const grd = g.createRadialGradient(px, py, 0, px, py, 26);
      grd.addColorStop(0, "rgba(0,0,0,0.16)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(px - 26, py - 26, 52, 52);
    }
    g.restore();
  }

  protected step(dt: number) {
    for (const it of this.items) if (it.fading) it.alpha -= dt * 2;
    this.items = this.items.filter((it) => it.alpha > 0);
    if (!this.items.length) return false;
    return true;
  }

  protected animating() {
    return this.items.some((i) => i.fading);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const base = ctx.globalAlpha;
    for (const it of this.items) {
      ctx.globalAlpha = base * it.alpha;
      ctx.drawImage(it.tex, it.x - it.S / 2, it.y - it.S / 2, it.S, it.S);
    }
  }
}

// ============================================================================
// 花屏（参考：素材/花屏效果参…png）：屏幕排线损坏的 LCD 观感
// - 1~2 个损坏区：参差斜边以下整片黑屏，里面是密集的彩色竖线
// - 其他位置散落少量贯穿整屏的单根彩线、带噪点纹理的黑色竖块
// - 静态部分预渲染；每帧只重绘少数闪烁 / 跳动的线
// ============================================================================

const LCD_COLORS = ["#2b4dff", "#3d6bff", "#ff2fb4", "#ff2838", "#1fd162", "#27e6ff", "#f4f4ff", "#7b3dff", "#1838ff"];

interface GLine {
  x: number;
  w: number;
  c: string;
  y0: number;
  a: number;
}

class GlitchScreen extends PrankBase {
  private tex: HTMLCanvasElement;
  private flick: GLine[] = [];
  private flickState: { on: boolean; dx: number }[] = [];
  private nextFlick = 0;
  private shimmer = 0;
  private nextShimmer = 0;
  private reveal = 0;
  private reveals: { x0: number; x1: number }[] = [];

  constructor(ctx: FxContext) {
    super(ctx);
    const k = ctx.options.intensity ?? 0.6;
    const W = this.W;
    const H = this.H;
    const { canvas, ctx: g } = offscreen(W, H);
    const all: GLine[] = [];

    // 损坏区
    const nZones = Math.random() < 0.35 + k * 0.3 ? 2 : 1;
    for (let z = 0; z < nZones; z++) {
      const zw = W * rand(0.14, 0.24 + k * 0.16);
      const x0 = z === 0 ? (ctx.options.x !== undefined ? ctx.options.x - zw / 2 : rand(W * 0.05, W * 0.95 - zw)) : rand(0, W - zw);
      const x1 = x0 + zw;
      this.reveals.push({ x0, x1 });
      // 参差的斜向上边界：一端贴顶，另一端下垂
      const fromLeft = Math.random() < 0.5;
      const sag = H * rand(0.15, 0.55);
      const top = (x: number) => {
        const t = (x - x0) / zw;
        const base = (fromLeft ? t : 1 - t) * sag;
        return Math.max(0, base + Math.sin(x * 0.05) * 6 + (Math.random() < 0.08 ? rand(0, 50) : 0));
      };
      // 黑底
      g.fillStyle = "rgba(2,2,6,0.97)";
      g.beginPath();
      g.moveTo(x0, H);
      for (let x = x0; x <= x1; x += 6) g.lineTo(x, top(x));
      g.lineTo(x1, top(x1));
      g.lineTo(x1, H);
      g.closePath();
      g.fill();
      // 密集竖线，成簇分布
      let x = x0 + rand(0, 6);
      while (x < x1) {
        const cluster = Math.random() < 0.35;
        const n = cluster ? randInt(3, 9) : 1;
        const c0 = pick(LCD_COLORS);
        for (let i = 0; i < n && x < x1; i++) {
          const c = Math.random() < 0.7 ? c0 : pick(LCD_COLORS);
          const w = pick([1, 1, 1.5, 2, 2, 3]);
          all.push({ x, w, c, y0: Math.random() < 0.18 ? 0 : top(x) + rand(0, 30), a: rand(0.65, 1) });
          x += w + rand(1.5, 4);
        }
        x += rand(4, 26);
      }
      // 区内偶尔一块亮白的宽条（损坏像素列）
      if (Math.random() < 0.6) {
        const bx = rand(x0, x1 - 20);
        const bw = rand(6, 18);
        const by = top(bx);
        const grd = g.createLinearGradient(bx, 0, bx + bw, 0);
        grd.addColorStop(0, "rgba(230,235,255,0.0)");
        grd.addColorStop(0.3, "rgba(235,240,255,0.85)");
        grd.addColorStop(1, "rgba(200,210,255,0.2)");
        g.fillStyle = grd;
        g.fillRect(bx, by, bw, H * rand(0.2, 0.5));
      }
      // 区顶角落的小裂纹（屏幕被压坏的起点）
      const crack = atlas("crack_b");
      if (crack) {
        g.save();
        g.translate(fromLeft ? x0 : x1, 0);
        g.rotate(rand(0, TAU));
        g.globalAlpha = 0.85;
        const f = crack.frame(0);
        const s = rand(140, 220) / f.w;
        g.drawImage(crack.canvas(0), -f.w * s * 0.505, -f.h * s * 0.493, f.w * s, f.h * s);
        g.restore();
      }
    }

    // 区外：散落的贯穿整屏单线
    const nLoose = Math.round(4 + k * 10);
    for (let i = 0; i < nLoose; i++) {
      all.push({ x: rand(0, W), w: pick([1, 1, 2]), c: pick(LCD_COLORS), y0: 0, a: rand(0.55, 0.95) });
    }
    // 带噪点的黑色竖块
    const nBlocks = randInt(1, 2 + Math.round(k * 2));
    for (let i = 0; i < nBlocks; i++) {
      const bw = rand(14, 90);
      const bx = rand(0, W - bw);
      const by = Math.random() < 0.5 ? 0 : rand(0, H * 0.5);
      g.fillStyle = "rgba(3,3,6,0.95)";
      g.fillRect(bx, by, bw, H - by);
      g.fillStyle = "rgba(120,130,160,0.35)";
      const dots = Math.floor((bw * (H - by)) / 900);
      for (let d = 0; d < dots; d++) g.fillRect(bx + rand(0, bw), by + rand(0, H - by), 1, rand(1, 3));
    }

    // 画线（每根线带亮芯 + 微弱辉光）
    for (const l of all) {
      g.globalAlpha = l.a * 0.35;
      g.fillStyle = l.c;
      g.fillRect(l.x - 1, l.y0, l.w + 2, H - l.y0);
      g.globalAlpha = l.a;
      g.fillRect(l.x, l.y0, l.w, H - l.y0);
    }
    g.globalAlpha = 1;
    // LCD 子像素纹理：每 3px 一行轻微挖空
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "rgba(0,0,0,0.28)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    g.globalCompositeOperation = "source-over";
    this.tex = canvas;

    // 会闪烁 / 跳动的线
    for (let i = 0; i < 6 + k * 6; i++) {
      const l = pick(all);
      this.flick.push(l);
      this.flickState.push({ on: true, dx: 0 });
    }
  }

  protected step(dt: number, now: number) {
    if (this.reveal < 1) this.reveal = Math.min(1, this.reveal + dt / 0.18);
    if (now > this.nextFlick) {
      this.nextFlick = now + rand(60, 260);
      for (const s of this.flickState) {
        if (Math.random() < 0.25) {
          s.on = Math.random() < 0.6;
          s.dx = Math.random() < 0.3 ? rand(-4, 4) : 0;
        }
      }
    }
    if (now > this.nextShimmer) {
      this.nextShimmer = now + rand(1800, 5000);
      this.shimmer = rand(0.05, 0.12);
    }
    this.shimmer = Math.max(0, this.shimmer - dt);
    return true;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const base = ctx.globalAlpha;
    const H = this.H;
    if (this.reveal < 1) {
      // 出现：损坏区从上往下“漏”出来
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.W, H * this.reveal);
      ctx.clip();
    }
    // 偶发的整体横向抖一下
    const off = this.shimmer > 0 ? rand(-3, 3) : 0;
    ctx.drawImage(this.tex, off, 0, this.W, H);
    if (this.reveal < 1) ctx.restore();
    this.flick.forEach((l, i) => {
      const s = this.flickState[i];
      if (!s.on) {
        // 熄灭：用黑色盖住（仅在损坏区内的线；散线则直接不画亮芯）
        ctx.globalAlpha = base * 0.9;
        ctx.fillStyle = "#020206";
        ctx.fillRect(l.x - 1, l.y0, l.w + 2, H - l.y0);
      } else if (s.dx) {
        ctx.globalAlpha = base * l.a;
        ctx.fillStyle = l.c;
        ctx.fillRect(l.x + s.dx, l.y0, l.w, H - l.y0);
      }
    });
    ctx.globalAlpha = base;
  }
}

// ============================================================================
// 涂鸦：喷漆笔画逐笔绘制（带流挂和飞溅），文字从左到右喷出
// ============================================================================

interface Stroke {
  pts: Pt[];
  color: string;
  width: number;
}
interface TextItem {
  tex: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}
type GItem = { stroke: Stroke } | { text: TextItem };

const SPRAY = ["#ff2d95", "#39ff14", "#00e5ff", "#ffe600", "#ff3b30", "#111111", "#a259ff"];
const WORDS = ["到此一游", "摸鱼中", "老板来了!", "我是谁 我在哪", "WAKE UP", "已阅", "加油鸭"];

function resample(pts: Pt[], step = 4, jitter = 1.2): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(dist(ax, ay, bx, by) / step));
    for (let j = 1; j <= n; j++) out.push([ax + ((bx - ax) * j) / n + rand(-jitter, jitter), ay + ((by - ay) * j) / n + rand(-jitter, jitter)]);
  }
  return out;
}

function circlePts(cx: number, cy: number, r: number, from = 0, to = TAU, n = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * r * rand(0.97, 1.03), cy + Math.sin(a) * r * rand(0.97, 1.03)]);
  }
  return pts;
}

function motif(cx: number, cy: number, color: string): Stroke[] {
  const s = rand(0.8, 1.5);
  const w = rand(7, 12);
  const mk = (pts: Pt[], width = w): Stroke => ({ pts: resample(pts), color, width });
  switch (randInt(0, 4)) {
    case 0: {
      // 笑脸
      const r = 70 * s;
      return [
        mk(circlePts(cx, cy, r, -Math.PI / 2, Math.PI * 1.55)),
        mk([[cx - r * 0.35, cy - r * 0.35], [cx - r * 0.33, cy - r * 0.1]]),
        mk([[cx + r * 0.35, cy - r * 0.35], [cx + r * 0.33, cy - r * 0.1]]),
        mk(circlePts(cx, cy + r * 0.05, r * 0.55, 0.3, Math.PI - 0.3, 20)),
      ];
    }
    case 1: {
      // 爱心
      const pts: Pt[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = (i / 60) * TAU;
        pts.push([cx + 16 * Math.pow(Math.sin(t), 3) * 4 * s, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 4 * s]);
      }
      return [mk(pts)];
    }
    case 2: {
      // 箭头
      const a = rand(0, TAU);
      const L = 160 * s;
      const ex = cx + Math.cos(a) * L;
      const ey = cy + Math.sin(a) * L;
      const mx = (cx + ex) / 2 + Math.cos(a + Math.PI / 2) * 25;
      const my = (cy + ey) / 2 + Math.sin(a + Math.PI / 2) * 25;
      const curve: Pt[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        curve.push([(1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * my + t * t * ey]);
      }
      const ha = Math.atan2(ey - my, ex - mx);
      return [
        mk(curve),
        mk([[ex + Math.cos(ha + 2.6) * 40 * s, ey + Math.sin(ha + 2.6) * 40 * s], [ex, ey], [ex + Math.cos(ha - 2.6) * 40 * s, ey + Math.sin(ha - 2.6) * 40 * s]]),
      ];
    }
    case 3: {
      // 五角星
      const pts: Pt[] = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * ((TAU * 2) / 5);
        pts.push([cx + Math.cos(a) * 70 * s, cy + Math.sin(a) * 70 * s]);
      }
      return [mk(pts)];
    }
    default: {
      // 螺旋
      const pts: Pt[] = [];
      for (let i = 0; i < 90; i++) {
        const a = i * 0.2;
        pts.push([cx + Math.cos(a) * i * 0.9 * s, cy + Math.sin(a) * i * 0.9 * s]);
      }
      return [mk(pts, w * 0.8)];
    }
  }
}

function sprayText(word: string, color: string): { tex: HTMLCanvasElement; w: number; h: number } {
  const size = rand(64, 104);
  const font = `900 ${size}px "Segoe Script","Comic Sans MS","Microsoft YaHei",cursive`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(word).width + 40);
  const h = Math.ceil(size * 1.9);
  const { canvas, ctx: g } = offscreen(w, h);
  g.font = font;
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = size * 0.12;
  g.fillStyle = color;
  g.fillText(word, 20, size * 0.65);
  g.shadowBlur = 0;
  // 流挂
  g.strokeStyle = color;
  g.lineCap = "round";
  for (let i = 0; i < randInt(3, 6); i++) {
    const x = rand(30, w - 30);
    const y0 = size * 0.85;
    const len = rand(15, h - y0 - 6);
    g.lineWidth = rand(2, 4);
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y0 + len);
    g.stroke();
    g.beginPath();
    g.arc(x, y0 + len, g.lineWidth * 0.9, 0, TAU);
    g.fillStyle = color;
    g.fill();
  }
  return { tex: canvas, w, h };
}

class Graffiti extends PrankBase {
  private acc: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private queue: GItem[] = [];
  private idx = 0;
  /** 当前笔画已绘制到的点 */
  private drawn = 0;
  private textT = 0;
  private done = false;

  constructor(ctx: FxContext) {
    super(ctx);
    const { canvas, ctx: g } = offscreen(this.W, this.H);
    this.acc = canvas;
    this.g = g;
    const n = ctx.options.count ?? randInt(4, 6);
    for (let i = 0; i < n; i++) {
      const [x, y] = i === 0 ? posOr(ctx, 160) : posOr({ ...ctx, options: {} }, 160);
      const color = pick(SPRAY);
      for (const s of motif(x, y, color)) {
        this.queue.push({ stroke: s });
        // 喷漆流挂：从笔画最低处向下滴
        if (Math.random() < 0.7) {
          const low = s.pts.reduce((m, p) => (p[1] > m[1] ? p : m), s.pts[0]);
          this.queue.push({ stroke: { pts: resample([low, [low[0] + rand(-2, 2), low[1] + rand(20, 70)]], 3, 0.3), color, width: s.width * 0.45 } });
        }
      }
    }
    const words = [...WORDS].sort(() => Math.random() - 0.5).slice(0, randInt(1, 2));
    for (const w of words) {
      const t = sprayText(w, pick(SPRAY));
      const [x, y] = posOr({ ...ctx, options: {} }, 200);
      this.queue.push({ text: { ...t, x: x - t.w / 2, y: y - t.h / 2, angle: rand(-0.25, 0.25) } });
    }
  }

  private sprayDot(x: number, y: number, color: string, w: number) {
    const g = this.g;
    g.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      const d = w * rand(0.6, 1.8);
      g.globalAlpha = rand(0.2, 0.7);
      g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.5, 1.5);
    }
    g.globalAlpha = 1;
  }

  private drawText(g: CanvasRenderingContext2D, t: TextItem, frac: number) {
    g.save();
    g.translate(t.x + t.w / 2, t.y + t.h / 2);
    g.rotate(t.angle);
    g.beginPath();
    g.rect(-t.w / 2, -t.h / 2, t.w * frac, t.h);
    g.clip();
    g.drawImage(t.tex, -t.w / 2, -t.h / 2, t.w, t.h);
    g.restore();
  }

  protected step(dt: number) {
    if (this.done) return true;
    let budget = 1400 * dt; // 每秒绘制的像素长度
    while (budget > 0 && this.idx < this.queue.length) {
      const item = this.queue[this.idx];
      if ("text" in item) {
        this.textT += dt / 0.9;
        budget = 0;
        if (this.textT >= 1) {
          this.drawText(this.g, item.text, 1);
          this.textT = 0;
          this.idx++;
        }
        continue;
      }
      const s = item.stroke;
      const g = this.g;
      g.strokeStyle = s.color;
      g.lineWidth = s.width;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.shadowColor = s.color;
      g.shadowBlur = s.width * 0.7;
      while (budget > 0 && this.drawn < s.pts.length - 1) {
        const a = s.pts[this.drawn];
        const b = s.pts[this.drawn + 1];
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        budget -= dist(a[0], a[1], b[0], b[1]);
        this.drawn++;
        g.shadowBlur = 0;
        this.sprayDot(b[0], b[1], s.color, s.width);
        g.shadowBlur = s.width * 0.7;
      }
      g.shadowBlur = 0;
      if (this.drawn >= s.pts.length - 1) {
        this.idx++;
        this.drawn = 0;
      }
    }
    if (this.idx >= this.queue.length) this.done = true;
    return true;
  }

  protected animating() {
    return !this.done;
  }

  protected render(ctx: CanvasRenderingContext2D) {
    ctx.drawImage(this.acc, 0, 0, this.W, this.H);
    const item = this.queue[this.idx];
    if (item && "text" in item) this.drawText(ctx, item.text, this.textT);
  }
}

// ============================================================================
// 胶带：点击撕掉（从点击一端卷起，然后飞走）
// ============================================================================

type TapeKind = "masking" | "duct" | "warning" | "clear";

interface Strip {
  x: number;
  y: number;
  angle: number;
  len: number;
  w: number;
  tex: HTMLCanvasElement;
  /** -1 未撕；0..1 卷起进度 */
  peel: number;
  /** 从哪一端撕：1 右端 / -1 左端 */
  side: number;
  fly: number;
  vx: number;
  vy: number;
  vr: number;
}

function tapeTex(kind: TapeKind, len: number, w: number) {
  const pad = 8;
  const { canvas, ctx: g } = offscreen(len + pad * 2, w + pad * 2);
  g.translate(pad, pad);
  // 撕裂边缘的轮廓
  const path = () => {
    g.beginPath();
    g.moveTo(rand(0, 6), 0);
    for (let x = 0; x <= len; x += 12) g.lineTo(x, rand(-0.6, 0.6));
    for (let y = 0; y <= w; y += 5) g.lineTo(len - rand(0, 8), y);
    for (let x = len; x >= 0; x -= 12) g.lineTo(x, w + rand(-0.6, 0.6));
    for (let y = w; y >= 0; y -= 5) g.lineTo(rand(0, 8), y);
    g.closePath();
  };
  path();
  g.save();
  g.shadowColor = "rgba(0,0,0,0.28)";
  g.shadowBlur = 6;
  g.shadowOffsetY = 2;
  g.fillStyle =
    kind === "masking" ? "rgba(233,218,172,0.93)" : kind === "duct" ? "rgba(178,182,188,0.96)" : kind === "warning" ? "rgba(255,206,0,0.94)" : "rgba(255,255,255,0.16)";
  g.fill();
  g.restore();
  g.save();
  path();
  g.clip();
  if (kind === "masking") {
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(120,100,60,${rand(0.03, 0.12)})`;
      g.fillRect(rand(0, len), rand(0, w), rand(1, 3), 1);
    }
    for (let y = 3; y < w; y += 4) {
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.beginPath();
      g.moveTo(0, y + rand(-1, 1));
      g.lineTo(len, y + rand(-1, 1));
      g.stroke();
    }
  } else if (kind === "duct") {
    g.strokeStyle = "rgba(90,95,100,0.18)";
    g.lineWidth = 1;
    for (let x = -w; x < len; x += 5) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + w, w);
      g.moveTo(x + w, 0);
      g.lineTo(x, w);
      g.stroke();
    }
    const sheen = g.createLinearGradient(0, 0, 0, w);
    sheen.addColorStop(0, "rgba(255,255,255,0.35)");
    sheen.addColorStop(0.4, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(0,0,0,0.15)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, len, w);
  } else if (kind === "warning") {
    g.fillStyle = "rgba(20,20,20,0.92)";
    for (let x = -w; x < len + w; x += 44) {
      g.beginPath();
      g.moveTo(x, w);
      g.lineTo(x + 22, w);
      g.lineTo(x + 22 + w, 0);
      g.lineTo(x + w, 0);
      g.closePath();
      g.fill();
    }
  } else {
    const sheen = g.createLinearGradient(0, 0, 0, w);
    sheen.addColorStop(0, "rgba(255,255,255,0.45)");
    sheen.addColorStop(0.25, "rgba(255,255,255,0.05)");
    sheen.addColorStop(1, "rgba(255,255,255,0.12)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, len, w);
  }
  g.restore();
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 1;
  path();
  g.stroke();
  return { tex: canvas, pad };
}

class Tape extends PrankBase {
  private strips: Strip[] = [];
  private target: Strip | null = null;
  private pad = 8;

  constructor(ctx: FxContext) {
    super(ctx);
    const n = ctx.options.count ?? randInt(1, 3);
    const W = this.W;
    const H = this.H;
    const corners: [number, number, number][] = [
      [0, 0, Math.PI / 4],
      [W, 0, -Math.PI / 4],
      [0, H, -Math.PI / 4],
      [W, H, Math.PI / 4],
    ].sort(() => Math.random() - 0.5) as [number, number, number][];
    const kinds: TapeKind[] = ["masking", "duct", "warning", "clear"];
    const kind = pick(kinds);
    for (let i = 0; i < n; i++) {
      const len = rand(280, 440);
      const w = rand(48, 70);
      let x: number;
      let y: number;
      let angle: number;
      if (i === 0 && ctx.options.x !== undefined) {
        x = ctx.options.x;
        y = ctx.options.y ?? H / 2;
        angle = rand(-0.5, 0.5);
      } else if (i < 4 && Math.random() < 0.75) {
        const [cx, cy, a] = corners[i];
        const inset = len * 0.28;
        x = cx === 0 ? inset : W - inset;
        y = cy === 0 ? inset : H - inset;
        angle = a + rand(-0.12, 0.12);
      } else {
        x = rand(W * 0.2, W * 0.8);
        y = rand(H * 0.15, H * 0.85);
        angle = rand(-0.6, 0.6);
      }
      const { tex, pad } = tapeTex(i === 0 ? kind : pick(kinds), len, w);
      this.pad = pad;
      this.strips.push({ x, y, angle, len, w, tex, peel: -1, side: 1, fly: 0, vx: 0, vy: 0, vr: 0 });
    }
  }

  private local(s: Strip, x: number, y: number): Pt {
    const dx = x - s.x;
    const dy = y - s.y;
    const c = Math.cos(-s.angle);
    const sn = Math.sin(-s.angle);
    return [dx * c - dy * sn, dx * sn + dy * c];
  }

  hitTest(x: number, y: number) {
    for (let i = this.strips.length - 1; i >= 0; i--) {
      const s = this.strips[i];
      if (s.peel >= 0) continue;
      const [lx, ly] = this.local(s, x, y);
      if (Math.abs(lx) < s.len / 2 && Math.abs(ly) < s.w / 2) {
        this.target = s;
        return true;
      }
    }
    this.target = null;
    return false;
  }

  pointerDown(p: { x: number; y: number }) {
    const s = this.target;
    if (!s || s.peel >= 0) return;
    const [lx] = this.local(s, p.x, p.y);
    s.side = lx >= 0 ? 1 : -1;
    s.peel = 0;
    this.ctx.layer.invalidate();
  }

  protected step(dt: number) {
    for (const s of this.strips) {
      if (s.peel < 0) continue;
      if (s.peel < 1) {
        s.peel = Math.min(1, s.peel + dt / 0.45);
        if (s.peel >= 1) {
          const a = s.angle + (s.side > 0 ? 0 : Math.PI);
          s.vx = Math.cos(a) * 900 + rand(-200, 200);
          s.vy = Math.sin(a) * 900 - 400;
          s.vr = rand(-6, 6);
        }
      } else {
        s.fly += dt / 0.6;
        s.vy += 1600 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.angle += s.vr * dt;
      }
    }
    this.strips = this.strips.filter((s) => s.fly < 1);
    return this.strips.length > 0;
  }

  protected animating() {
    return this.strips.some((s) => s.peel >= 0);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const base = ctx.globalAlpha;
    const pad = this.pad;
    for (const s of this.strips) {
      const tw = s.len + pad * 2;
      const th = s.w + pad * 2;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      if (s.peel <= 0 || s.fly > 0) {
        ctx.globalAlpha = base * (1 - s.fly);
        if (s.fly > 0) ctx.scale(1 - s.fly * 0.3, 1 - s.fly * 0.5);
        ctx.drawImage(s.tex, -tw / 2, -th / 2, tw, th);
        ctx.restore();
        continue;
      }
      if (s.side < 0) ctx.scale(-1, 1);
      // 平贴部分：从远端到卷起线
      const X = s.len / 2 - s.len * s.peel;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-tw / 2, -th / 2, X + tw / 2, th);
      ctx.clip();
      ctx.drawImage(s.tex, -tw / 2, -th / 2, tw, th);
      ctx.restore();
      // 卷起部分：沿卷起线翻折（背面更暗、略抬起）
      const L = s.len * s.peel;
      ctx.save();
      ctx.translate(X, -6 * s.peel);
      ctx.scale(-0.85, 1.04);
      ctx.translate(-X, 0);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 6;
      ctx.beginPath();
      ctx.rect(X, -th / 2, L + pad, th);
      ctx.clip();
      ctx.drawImage(s.tex, -tw / 2, -th / 2, tw, th);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(X, -s.w / 2, L, s.w);
      ctx.restore();
      ctx.restore();
    }
  }
}

export const createStain = (ctx: FxContext) => new Stain(ctx);
export const createGlitchScreen = (ctx: FxContext) => new GlitchScreen(ctx);
export const createGraffiti = (ctx: FxContext) => new Graffiti(ctx);
export const createTape = (ctx: FxContext) => new Tape(ctx);
