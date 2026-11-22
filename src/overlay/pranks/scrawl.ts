/**
 * 恐怖涂鸦（scrawl 图集）：3~6 个红色涂鸦依次“被写出来”，
 * 写完后底边慢慢流下细细的血线（末端带血珠）。全部完成后静止。
 */
import { atlas, type Atlas } from "../core/assets";
import type { FxContext } from "../core/fx";
import { clamp, easeInOutSine, pick, rand, randInt } from "../core/layer";
import { PrankBase, TAU } from "./base";

/** 圆形构图的涂鸦用径向揭示，其余从左到右书写 */
const RADIAL = new Set([0, 7, 8]);
const TEXTS = [9, 10, 11];

interface ScrawlDrip {
  /** 局部坐标（相对涂鸦中心，已缩放） */
  x: number;
  y: number;
  w: number;
  len: number;
  max: number;
  speed: number;
}

interface Item {
  frame: number;
  x: number;
  y: number;
  rot: number;
  scale: number;
  w: number;
  h: number;
  t: number;
  dur: number;
  /** 书写边缘的参差偏移 */
  edge: number[];
  drips: ScrawlDrip[];
  dripsReady: boolean;
}

/** 找出图像底部附近有颜料的列，作为血线起点（局部坐标，未缩放、以中心为原点） */
function dripSources(a: Atlas, frame: number): [number, number][] {
  const c = a.canvas(frame);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const data = g.getImageData(0, 0, w, h).data;
  const out: [number, number][] = [];
  const step = Math.max(2, Math.floor(w / 60));
  for (let x = step; x < w - step; x += step) {
    // 每一列从下往上找第一个不透明像素
    for (let y = h - 1; y > h * 0.35; y--) {
      if (data[(y * w + x) * 4 + 3] > 150) {
        out.push([x - w / 2, y - h / 2]);
        break;
      }
    }
  }
  // 只保留靠下的一批
  out.sort((p, q) => q[1] - p[1]);
  return out.slice(0, Math.max(3, Math.floor(out.length * 0.5)));
}

class Scrawl extends PrankBase {
  private items: Item[] = [];

  constructor(ctx: FxContext) {
    super(ctx);
    const a = atlas("scrawl");
    if (!a) return;
    const n = ctx.options.count ?? randInt(3, 6);
    const frames: number[] = [pick(TEXTS)];
    while (frames.length < n) {
      const f = randInt(0, a.count - 1);
      if (!frames.includes(f) || frames.length >= a.count) frames.push(f);
    }
    frames.sort(() => Math.random() - 0.5);
    const placed: [number, number, number][] = [];
    frames.forEach((frame, i) => {
      const f = a.frame(frame);
      const isText = TEXTS.includes(frame);
      const target = isText ? rand(300, 440) : rand(220, 360);
      const scale = target / Math.max(f.w, f.h);
      const w = f.w * scale;
      const h = f.h * scale;
      // 尽量不重叠
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 30; tries++) {
        x = i === 0 && ctx.options.x !== undefined ? ctx.options.x : rand(w / 2 + 20, this.W - w / 2 - 20);
        y = i === 0 && ctx.options.y !== undefined ? ctx.options.y : rand(h / 2 + 20, this.H - h / 2 - 60);
        if (placed.every(([px, py, pr]) => Math.hypot(px - x, py - y) > pr + Math.max(w, h) * 0.5)) break;
      }
      placed.push([x, y, Math.max(w, h) * 0.5]);
      const edge: number[] = [];
      for (let k = 0; k <= 24; k++) edge.push(rand(-1, 1));
      this.items.push({
        frame,
        x,
        y,
        rot: rand(-0.22, 0.22),
        scale,
        w,
        h,
        t: -i * rand(0.9, 1.4),
        dur: isText ? rand(1.2, 1.6) : rand(0.9, 1.3),
        edge,
        drips: [],
        dripsReady: false,
      });
    });
  }

  private makeDrips(it: Item, a: Atlas) {
    it.dripsReady = true;
    const src = dripSources(a, it.frame);
    const n = Math.min(src.length, randInt(2, 5));
    for (let i = 0; i < n; i++) {
      const [sx, sy] = src[Math.floor(Math.random() * src.length)];
      it.drips.push({
        x: sx * it.scale,
        y: sy * it.scale - 2,
        w: rand(1.6, 3.4),
        len: 0,
        max: rand(30, 150),
        speed: rand(10, 32),
      });
    }
  }

  protected step(dt: number) {
    const a = atlas("scrawl");
    for (const it of this.items) {
      it.t += dt;
      if (it.t > it.dur + 0.3 && !it.dripsReady && a) this.makeDrips(it, a);
      for (const d of it.drips) {
        if (d.len < d.max) {
          // 越往下越慢
          d.len = Math.min(d.max, d.len + d.speed * dt * (1 - (d.len / d.max) * 0.7));
        }
      }
    }
    return true;
  }

  protected animating() {
    return this.items.some((it) => it.t < it.dur + 0.4 || !it.dripsReady || it.drips.some((d) => d.len < d.max));
  }

  /** 书写揭示的裁剪区域（局部坐标） */
  private clipPath(ctx: CanvasRenderingContext2D, it: Item, p: number) {
    const { w, h } = it;
    ctx.beginPath();
    if (RADIAL.has(it.frame)) {
      // 绕中心扫一圈
      const r = Math.hypot(w, h);
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.closePath();
      return;
    }
    // 从左到右，边缘参差（像笔刷一笔一笔往右推）
    const x0 = -w / 2 - 20;
    const front = x0 + (w + 60) * p;
    ctx.moveTo(x0, -h / 2 - 10);
    const n = it.edge.length - 1;
    for (let k = 0; k <= n; k++) {
      const y = -h / 2 - 10 + ((h + 20) * k) / n;
      ctx.lineTo(front + it.edge[k] * 18, y);
    }
    ctx.lineTo(x0, h / 2 + 10);
    ctx.closePath();
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const a = atlas("scrawl");
    if (!a) return;
    const base = ctx.globalAlpha;
    for (const it of this.items) {
      if (it.t <= 0) continue;
      const p = clamp(it.t / it.dur, 0, 1);
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      // 血线（在涂鸦下层，便于与笔画衔接）
      for (const d of it.drips) {
        if (d.len <= 0.5) continue;
        const grd = ctx.createLinearGradient(0, d.y, 0, d.y + d.len);
        grd.addColorStop(0, "rgba(150,6,12,0.95)");
        grd.addColorStop(1, "rgba(110,0,6,0.9)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        // 顶部略宽、往下收细
        ctx.moveTo(d.x - d.w, d.y);
        ctx.lineTo(d.x + d.w, d.y);
        ctx.lineTo(d.x + d.w * 0.55, d.y + d.len);
        ctx.lineTo(d.x - d.w * 0.55, d.y + d.len);
        ctx.closePath();
        ctx.fill();
        // 末端血珠 + 高光
        const r = d.w * 1.25 * Math.min(1, d.len / 20);
        ctx.fillStyle = "rgba(120,0,8,0.95)";
        ctx.beginPath();
        ctx.ellipse(d.x, d.y + d.len, r, r * 1.25, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(255,170,170,0.45)";
        ctx.beginPath();
        ctx.arc(d.x - r * 0.35, d.y + d.len - r * 0.4, r * 0.3, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = base * 0.95;
      if (p < 1) {
        ctx.save();
        this.clipPath(ctx, it, easeInOutSine(p));
        ctx.clip();
        a.drawAnchored(ctx, it.frame, 0.5, 0.5, it.scale);
        ctx.restore();
      } else {
        a.drawAnchored(ctx, it.frame, 0.5, 0.5, it.scale);
      }
      ctx.globalAlpha = base;
      ctx.restore();
    }
  }
}

export const createScrawl = (ctx: FxContext) => new Scrawl(ctx);
