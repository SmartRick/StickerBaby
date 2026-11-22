/**
 * 大场面一次性特效：奥特曼登场、黑客入侵、电视雪花屏。
 */
import type { FxContext } from "../core/fx";
import { atlas } from "../core/assets";
import { clamp, easeOutCubic, lerp, pick, rand, randInt } from "../core/layer";
import { BaseFx, softDot } from "./base";

const easeIn = (t: number) => t * t * t;

// ---------------------------------------------------------------------------
// 奥特曼登场：远处出现 -> 越飞越近 -> 贴着镜头冲过画面（不砸屏）
// 两个特效共用同一段动画，只是图片不同。
// 注意：奥特曼为圆谷制作版权角色，此处仅作技术演示，正式上线需取得授权。
// ---------------------------------------------------------------------------

const ARRIVE = 2.4; // 飞到镜头前的时刻
const PASS = 0.45; // 冲出画面用时

class Ultraman extends BaseFx {
  private start: { x: number; y: number };
  private end: { x: number; y: number };
  private lines: { a: number; len: number; w: number; off: number }[] = [];
  private glow = softDot(128, [
    [0, "rgba(255,255,255,1)"],
    [0.25, "rgba(200,230,255,0.8)"],
    [1, "rgba(120,170,255,0)"],
  ]);

  constructor(
    fx: FxContext,
    private image: "ultraman_fly" | "ultraman_fist",
  ) {
    super(fx, ARRIVE + PASS + 0.2, 0.5, 0.6);
    this.start = { x: this.w * rand(0.3, 0.7), y: this.h * rand(0.3, 0.45) };
    // 最终冲向画面中心附近，冲出时略偏向一侧
    this.end = { x: fx.options.x ?? this.w * rand(0.42, 0.58), y: fx.options.y ?? this.h * rand(0.45, 0.58) };
    for (let i = 0; i < 70; i++) this.lines.push({ a: rand(0, Math.PI * 2), len: rand(0.2, 0.6), w: rand(1, 4), off: rand(0, 1) });
  }

  protected step() {}

  protected render(ctx: CanvasRenderingContext2D) {
    const img = atlas(this.image);
    if (!img) return;
    const t = this.t;
    const base = ctx.globalAlpha;
    const H = this.h;
    const p = clamp(t / ARRIVE, 0, 1);
    const pass = clamp((t - ARRIVE) / PASS, 0, 1);
    // 透视放大：远处几乎不动，越近放大越快；到达后继续急速放大冲出画面
    const size = H * (lerp(0.05, 0.95, Math.pow(p, 2.6)) + easeIn(pass) * 2.6);
    const cx = lerp(this.start.x, this.end.x, easeIn(p)) + (this.end.x - this.w / 2) * pass * 1.5;
    const cy = lerp(this.start.y, this.end.y, easeIn(p)) + pass * H * 0.25;
    const alpha = clamp(t / 0.25, 0, 1) * (1 - easeIn(pass));

    // 速度线：从角色中心向外辐射，越接近越密越亮
    const R = Math.hypot(this.w, H);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    const la = (0.12 + 0.5 * p) * (1 - pass);
    for (const l of this.lines) {
      const k = (l.off + t * (1.2 + p * 3)) % 1;
      const r0 = R * (0.08 + k * 0.7);
      const r1 = r0 + R * l.len * 0.25 * (0.5 + p);
      ctx.globalAlpha = base * la * (1 - k);
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0);
      ctx.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1);
      ctx.stroke();
    }

    // 远处出现时的闪光
    if (t < 0.7) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = base * (1 - t / 0.7);
      const g = 260 * (0.4 + t);
      ctx.drawImage(this.glow, cx - g / 2, cy - g / 2, g, g);
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.globalAlpha = base * alpha;
    ctx.save();
    ctx.translate(cx + Math.sin(t * 9) * 4 * (1 - p), cy + Math.cos(t * 7) * 3 * (1 - p));
    ctx.rotate(Math.sin(t * 2) * 0.04);
    const f = img.frame(0);
    img.draw(ctx, 0, 0, 0, (size * f.w) / f.h, size);
    ctx.restore();
    ctx.globalAlpha = base;
  }

  protected finished() {
    return this.t > ARRIVE + PASS;
  }
}

// ---------------------------------------------------------------------------
// 黑客入侵：代码雨 -> 黑客现身 -> 警告弹窗 -> 进度条 -> 故障退出
// ---------------------------------------------------------------------------

const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789ABCDEF";
const GLYPH = 18;

function glyphSheet() {
  const c = document.createElement("canvas");
  const scale = 2;
  c.width = GLYPHS.length * GLYPH * scale;
  c.height = GLYPH * scale * 2;
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  g.font = `bold ${GLYPH - 3}px "MS Gothic", "Consolas", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < GLYPHS.length; i++) {
    // 第一行：普通绿色；第二行：亮白绿（雨滴头部）
    g.fillStyle = "#22ff66";
    g.shadowColor = "#00ff55";
    g.shadowBlur = 4;
    g.fillText(GLYPHS[i], i * GLYPH + GLYPH / 2, GLYPH / 2);
    g.fillStyle = "#e8ffe8";
    g.shadowColor = "#aaffaa";
    g.fillText(GLYPHS[i], i * GLYPH + GLYPH / 2, GLYPH * 1.5);
  }
  return c;
}

interface Column {
  x: number;
  y: number;
  speed: number;
  len: number;
  chars: number[];
}

interface Popup {
  frame: number;
  x: number;
  y: number;
  at: number;
  size: number;
  blink?: boolean;
}

const TERMINAL = [
  "> ssh root@192.168.1.1 -p 22",
  "> bypassing firewall............ OK",
  "> cracking password hash [sha256]",
  "> injecting payload into kernel32.dll",
  "> uploading desktop.zip  ██████████",
  "> disabling antivirus... done",
  "> 正在读取你的聊天记录...",
  "> 你的电脑已被我接管 :)",
];

class Hacker extends BaseFx {
  private sheet = glyphSheet();
  private cols: Column[] = [];
  private popups: Popup[] = [];
  private figure = randInt(0, 2);
  private glitch = 0;

  constructor(fx: FxContext) {
    super(fx, 6.5, 0.5, 0.5);
    const n = Math.ceil(this.w / GLYPH);
    for (let i = 0; i < n; i++) {
      this.cols.push({
        x: i * GLYPH + GLYPH / 2,
        y: rand(-this.h, 0),
        speed: rand(180, 520),
        len: randInt(8, 28),
        chars: Array.from({ length: 40 }, () => randInt(0, GLYPHS.length - 1)),
      });
    }
    const W = this.w;
    const H = this.h;
    this.popups = [
      { frame: 3, x: W * 0.22, y: H * 0.28, at: 1.6, size: 360 },
      { frame: 4, x: W * 0.5, y: H * 0.78, at: 2.3, size: 440, blink: true },
      { frame: 5, x: W * 0.8, y: H * 0.3, at: 2.9, size: 170 },
      { frame: 7, x: W * 0.17, y: H * 0.66, at: 3.4, size: 210 },
      { frame: 8, x: W * 0.82, y: H * 0.66, at: 3.8, size: 200 },
    ];
  }

  protected step(dt: number) {
    for (const c of this.cols) {
      c.y += c.speed * dt;
      if (c.y - c.len * GLYPH > this.h) {
        c.y = rand(-200, 0);
        c.speed = rand(180, 520);
      }
      if (Math.random() < dt * 4) c.chars[randInt(0, c.chars.length - 1)] = randInt(0, GLYPHS.length - 1);
    }
    // 黑客现身、结尾故障
    const t = this.t;
    this.glitch = (t > 1 && t < 1.5) || t > 5.7 ? 1 : Math.random() < dt * 1.5 ? 0.6 : Math.max(0, this.glitch - dt * 4);
  }

  private drawGlitched(ctx: CanvasRenderingContext2D, img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) {
    if (this.glitch <= 0.05) {
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      return;
    }
    // 横向切片错位
    const slices = 12;
    for (let i = 0; i < slices; i++) {
      const off = Math.random() < 0.35 ? rand(-30, 30) * this.glitch : 0;
      ctx.drawImage(img, sx, sy + (sh * i) / slices, sw, sh / slices, x + off, y + (h * i) / slices, w, h / slices);
    }
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const t = this.t;
    const base = ctx.globalAlpha;
    const W = this.w;
    const H = this.h;
    const outro = t > 5.9 ? clamp((6.5 - t) / 0.6, 0, 1) : 1;

    // 暗色底
    ctx.globalAlpha = base * clamp(t / 0.6, 0, 1) * 0.42 * outro;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // 代码雨
    const s = 2;
    for (const c of this.cols) {
      for (let k = 0; k < c.len; k++) {
        const y = c.y - k * GLYPH;
        if (y < -GLYPH || y > H + GLYPH) continue;
        const ch = c.chars[(Math.floor(c.y / GLYPH) - k + 400) % c.chars.length];
        ctx.globalAlpha = base * (1 - k / c.len) * 0.85 * outro;
        ctx.drawImage(this.sheet, ch * GLYPH * s, k === 0 ? GLYPH * s : 0, GLYPH * s, GLYPH * s, c.x - GLYPH / 2, y - GLYPH / 2, GLYPH, GLYPH);
      }
    }

    const hk = atlas("hacker");
    if (hk && t > 1) {
      // 黑客人物
      const f = hk.frame(this.figure);
      const hh = H * 0.42 * (0.9 + 0.1 * easeOutCubic(clamp((t - 1) / 0.5, 0, 1)));
      const hw = (hh * f.w) / f.h;
      ctx.globalAlpha = base * clamp((t - 1) / 0.4, 0, 1) * outro;
      this.drawGlitched(ctx, hk.image, f.x, f.y, f.w, f.h, W / 2 - hw / 2, H * 0.42 - hh / 2, hw, hh);
      // 警告元素
      for (const p of this.popups) {
        if (t < p.at) continue;
        const q = clamp((t - p.at) / 0.25, 0, 1);
        const pop = 0.6 + 0.4 * easeOutCubic(q) + Math.sin(q * Math.PI) * 0.15;
        if (p.blink && Math.floor(t * 4) % 2 === 1) continue;
        const pf = hk.frame(p.frame);
        const pw = p.size * pop;
        const ph = (pw * pf.h) / pf.w;
        ctx.globalAlpha = base * q * outro;
        const jx = Math.random() < 0.1 ? rand(-6, 6) : 0;
        this.drawGlitched(ctx, hk.image, pf.x, pf.y, pf.w, pf.h, p.x - pw / 2 + jx, p.y - ph / 2, pw, ph);
      }
    }

    // 终端打字
    ctx.globalAlpha = base * outro;
    ctx.font = '15px "Consolas", "Microsoft YaHei UI", monospace';
    ctx.textBaseline = "top";
    const chars = Math.floor(clamp(t - 0.4, 0, 99) * 38);
    let used = 0;
    const x0 = 40;
    let y0 = H - 40 - TERMINAL.length * 22;
    for (const line of TERMINAL) {
      if (used >= chars) break;
      const vis = line.slice(0, chars - used);
      used += line.length;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x0 - 6, y0 - 2, ctx.measureText(vis).width + 12, 21);
      ctx.fillStyle = "#33ff77";
      ctx.fillText(vis + (used > chars && Math.floor(t * 3) % 2 ? "▌" : ""), x0, y0);
      y0 += 22;
    }

    // 进度条
    if (t > 2 && t < 6) {
      const prog = clamp((t - 2) / 3, 0, 1);
      const bw = Math.min(520, W * 0.4);
      const bx = W / 2 - bw / 2;
      const by = H * 0.66;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(bx - 12, by - 32, bw + 24, 66);
      ctx.strokeStyle = "#33ff77";
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, 18);
      ctx.fillStyle = "#33ff77";
      ctx.fillRect(bx + 3, by + 3, (bw - 6) * prog, 12);
      ctx.font = 'bold 15px "Consolas", "Microsoft YaHei UI", monospace';
      ctx.fillText(`正在上传你的桌面... ${Math.floor(prog * 100)}%`, bx, by - 24);
    }

    // 结尾整屏故障条
    if (t > 5.7) {
      for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = base * rand(0.2, 0.6) * outro;
        ctx.fillStyle = pick(["#00ff66", "#ff0044", "#ffffff", "#000000"]);
        ctx.fillRect(0, rand(0, H), W, rand(2, 24));
      }
    }
    ctx.globalAlpha = base;
  }

  protected finished() {
    return this.t >= 6.5;
  }
}

// ---------------------------------------------------------------------------
// 电视雪花屏：彩色随机噪点 + 滚动亮带 + 扫描线
// ---------------------------------------------------------------------------

const NOISE_SCALE = 3; // 每个噪点占 3×3 CSS 像素

class TvStatic extends BaseFx {
  private small = document.createElement("canvas");
  private sctx: CanvasRenderingContext2D;
  private img: ImageData;
  private pool: Uint32Array;
  private scan: HTMLCanvasElement;
  private total: number;

  constructor(fx: FxContext) {
    const total = (fx.options.durationMs ?? 2600) / 1000;
    super(fx, total, 0.3, 0.2);
    this.total = total;
    const w = Math.ceil(this.w / NOISE_SCALE);
    const h = Math.ceil(this.h / NOISE_SCALE);
    this.small.width = w;
    this.small.height = h;
    this.sctx = this.small.getContext("2d")!;
    this.img = this.sctx.createImageData(w, h);
    // 预生成两倍大小的随机彩色像素池，每帧随机偏移取一段，避免逐像素调用 Math.random
    this.pool = new Uint32Array(w * h * 2);
    for (let i = 0; i < this.pool.length; i++) {
      const v = Math.random();
      const r = (Math.random() * 255) | 0;
      const g = (Math.random() * 255) | 0;
      const b = (Math.random() * 255) | 0;
      // 让亮度分布偏两极，更像模拟信号雪花
      const k = v < 0.5 ? 0.35 : 1;
      this.pool[i] = (255 << 24) | (((b * k) | 0) << 16) | (((g * k) | 0) << 8) | ((r * k) | 0);
    }
    this.scan = document.createElement("canvas");
    this.scan.width = 4;
    this.scan.height = 4;
    const sg = this.scan.getContext("2d")!;
    sg.fillStyle = "rgba(0,0,0,0.35)";
    sg.fillRect(0, 0, 4, 2);
  }

  protected step() {
    const n = this.img.width * this.img.height;
    const off = randInt(0, this.pool.length - n - 1);
    new Uint32Array(this.img.data.buffer).set(this.pool.subarray(off, off + n));
    this.sctx.putImageData(this.img, 0, 0);
  }

  protected render(ctx: CanvasRenderingContext2D) {
    const t = this.t;
    const W = this.w;
    const H = this.h;
    const base = ctx.globalAlpha;
    const env = Math.min(clamp(t / 0.15, 0, 1), clamp((this.total - t) / 0.3, 0, 1));
    ctx.globalAlpha = base * env * 0.88;
    ctx.imageSmoothingEnabled = false;
    // 轻微垂直滚动
    const roll = (t * 90) % NOISE_SCALE;
    ctx.drawImage(this.small, 0, -roll, W, H + NOISE_SCALE);
    ctx.imageSmoothingEnabled = true;
    // 扫描线
    ctx.globalAlpha = base * env;
    ctx.fillStyle = ctx.createPattern(this.scan, "repeat")!;
    ctx.fillRect(0, 0, W, H);
    // 滚动亮带 / 暗带
    for (const [speed, hgt, col] of [
      [0.35, 0.12, "rgba(255,255,255,0.18)"],
      [0.6, 0.06, "rgba(0,0,0,0.35)"],
    ] as const) {
      const y = ((t * speed) % 1.2 - 0.1) * H;
      const g = ctx.createLinearGradient(0, y, 0, y + H * hgt);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, col);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W, H * hgt);
    }
    ctx.globalAlpha = base;
  }

  protected finished() {
    return this.t >= this.total;
  }
}

export const ultraman = (fx: FxContext) => new Ultraman(fx, "ultraman_fly");
export const ultramanTiga = (fx: FxContext) => new Ultraman(fx, "ultraman_fist");
export const hacker = (fx: FxContext) => new Hacker(fx);
export const tvStatic = (fx: FxContext) => new TvStatic(fx);
