/**
 * 粒子精灵：
 * - 优先使用美术图集（public/assets/particles、emoji3d）中的 3D 图标
 * - 指定颜色（特效需要染色）或图集未加载时，退回程序化绘制
 * 每种 (kind, color) 只生成一次离屏 canvas 并缓存，粒子渲染时只做 drawImage。
 */
import type { ParticleKind } from "../../shared/protocol";
import { atlas, type AtlasName } from "./assets";

const SIZE = 64;
const cache = new Map<string, HTMLCanvasElement>();

/** 图片粒子：图集名 + 帧号 */
export const IMAGE_SPRITES: Partial<Record<ParticleKind, [AtlasName, number]>> = {
  bone: ["particles", 0],
  bubble: ["particles", 1],
  "bubble-bone": ["particles", 2],
  paw: ["particles", 3],
  snowflake: ["particles", 4],
  ice: ["particles", 5],
  star: ["particles", 7],
  sparkle: ["particles", 8],
  heart: ["particles", 9],
  coin: ["particles", 10],
  petal: ["particles", 11],
  leaf: ["particles", 12],
  fishbone: ["particles", 13],
  drop: ["particles", 14],
  "sparkle-purple": ["particles", 15],
  ribbon: ["emoji3d", 0],
  streamer: ["emoji3d", 1],
  gift: ["emoji3d", 2],
  gem: ["emoji3d", 3],
  moon: ["emoji3d", 4],
  fire: ["emoji3d", 5],
  lightning: ["emoji3d", 6],
  cloud: ["emoji3d", 7],
  flower: ["emoji3d", 8],
  butterfly: ["emoji3d", 9],
  bee: ["emoji3d", 10],
  shell: ["emoji3d", 11],
  lips: ["emoji3d", 12],
  note: ["emoji3d", 13],
  tornado: ["emoji3d", 14],
  bell: ["emoji3d", 15],
};

const IMAGE_SIZE = 96;

/** 图片精灵（不染色）；图集未就绪时返回 null */
export function imageSprite(kind: ParticleKind): HTMLCanvasElement | null {
  const def = IMAGE_SPRITES[kind];
  if (!def) return null;
  return atlas(def[0])?.canvas(def[1], IMAGE_SIZE) ?? null;
}

export const PALETTES: Partial<Record<ParticleKind, string[]>> = {
  heart: ["#ff4d6d", "#ff758f", "#ff8fab", "#e5383b"],
  star: ["#ffd166", "#ffe066", "#fff3b0"],
  bubble: ["#a2d2ff", "#bde0fe", "#cdb4db"],
  petal: ["#ffc8dd", "#ffafcc", "#ffd6e0"],
  snowflake: ["#ffffff", "#e3f2fd"],
  sparkle: ["#fff8d6", "#ffffff", "#ffe08a"],
  bone: ["#fdf6e3"],
  paw: ["#f4a261", "#e76f51", "#8d6e63"],
  coin: ["#ffc300"],
  fishbone: ["#90caf9", "#b0bec5"],
  leaf: ["#80ed99", "#57cc99", "#38a3a5"],
  ice: ["#caf0f8", "#90e0ef", "#ade8f4"],
  confetti: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#ff99c8"],
  glow: ["#ffffff", "#ffe8a3", "#a0c4ff", "#ffadad"],
};

export function sprite(kind: ParticleKind, color?: string): HTMLCanvasElement {
  if (!color) {
    const img = imageSprite(kind);
    if (img) return img;
  }
  const draw = DRAW[kind] ?? DRAW.glow!;
  const c = color ?? (PALETTES[kind] ?? PALETTES.glow!)[0];
  const key = `${kind}|${c}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = cv.height = SIZE;
    const ctx = cv.getContext("2d")!;
    ctx.translate(SIZE / 2, SIZE / 2);
    draw(ctx, c);
    cache.set(key, cv);
  }
  return cv;
}

/** 随机外观：有图片用图片，否则随机取调色板颜色 */
export function randomSprite(kind: ParticleKind) {
  const img = imageSprite(kind);
  if (img) return img;
  const pal = PALETTES[kind] ?? PALETTES.glow!;
  return sprite(kind, pal[Math.floor(Math.random() * pal.length)]);
}

type Draw = (ctx: CanvasRenderingContext2D, color: string) => void;

const outline = (ctx: CanvasRenderingContext2D, w = 2.5) => {
  ctx.lineWidth = w;
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.stroke();
};

function heartPath(ctx: CanvasRenderingContext2D, s: number) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.5, -s * 1.05, 0, -s * 0.45);
  ctx.bezierCurveTo(s * 0.5, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, r: number, inner: number, n = 5) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rr = i % 2 ? inner : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

const DRAW: Partial<Record<ParticleKind, Draw>> = {
  heart(ctx, c) {
    ctx.translate(0, 6);
    heartPath(ctx, 30);
    const g = ctx.createRadialGradient(-8, -12, 2, 0, 0, 34);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.25, c);
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
  },
  star(ctx, c) {
    starPath(ctx, 28, 12);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.lineJoin = "round";
    outline(ctx);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(-6, -6, 4, 0, Math.PI * 2);
    ctx.fill();
  },
  bubble(ctx, c) {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 14, 0, 0, 26);
    g.addColorStop(0, "rgba(255,255,255,0.05)");
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-9, -10, 7, 4, -0.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
  },
  petal(ctx, c) {
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.bezierCurveTo(22, -14, 18, 18, 0, 26);
    ctx.bezierCurveTo(-18, 18, -22, -14, 0, -26);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 20);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  },
  snowflake(ctx, c) {
    ctx.strokeStyle = c;
    ctx.lineCap = "round";
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -26);
      ctx.moveTo(0, -14);
      ctx.lineTo(-7, -20);
      ctx.moveTo(0, -14);
      ctx.lineTo(7, -20);
      ctx.stroke();
      ctx.restore();
    }
  },
  sparkle(ctx, c) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, c);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.quadraticCurveTo(3, -3, 30, 0);
    ctx.quadraticCurveTo(3, 3, 0, 30);
    ctx.quadraticCurveTo(-3, 3, -30, 0);
    ctx.quadraticCurveTo(-3, -3, 0, -30);
    ctx.fill();
  },
  bone(ctx, c) {
    ctx.rotate(-0.6);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(-18, -6, 36, 12, 4);
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        ctx.moveTo(sx * 20 + 8, sy * 6);
        ctx.arc(sx * 20, sy * 6, 8, 0, Math.PI * 2);
      }
    ctx.fill();
    outline(ctx, 2);
  },
  paw(ctx, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(0, 8, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [
      [-16, -8],
      [-6, -18],
      [6, -18],
      [16, -8],
    ]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  coin(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(-26, -26, 26, 26);
    g.addColorStop(0, "#fff3a3");
    g.addColorStop(0.45, "#ffc300");
    g.addColorStop(1, "#c98a00");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#a86f00";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(168,111,0,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#a86f00";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("¥", 0, 1);
  },
  fishbone(ctx, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(16, 0);
    for (let i = -14; i <= 8; i += 7) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 4, -10);
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 4, 10);
    }
    ctx.moveTo(-22, 0);
    ctx.lineTo(-28, -8);
    ctx.moveTo(-22, 0);
    ctx.lineTo(-28, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(20, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  },
  leaf(ctx, c) {
    ctx.rotate(0.5);
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.quadraticCurveTo(22, 0, 0, 26);
    ctx.quadraticCurveTo(-22, 0, 0, -26);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,60,30,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, 24);
    ctx.stroke();
  },
  ice(ctx, c) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
    }
    ctx.closePath();
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(4, -4);
    ctx.stroke();
  },
  confetti(ctx, c) {
    ctx.fillStyle = c;
    ctx.fillRect(-12, -20, 24, 40);
  },
  glow(ctx, c) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, c);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-32, -32, 64, 64);
  },
};
