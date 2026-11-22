/**
 * 每种扰动的逐帧参数。所有效果在 p=0 和 p=1 时都是恒等变换，
 * 保证“真实桌面 -> 冻结截图 -> 真实桌面”的切换不可见。
 */
import type { DistortKind } from "../../shared/protocol";

export interface FrameParams {
  amt: number;
  offset: [number, number];
  rot: number;
  scale: [number, number];
  persp: [number, number];
  clamp: boolean;
  flash: [number, number, number, number];
  colorFx: [number, number, number];
  vignette: number;
}

export interface FrameInput {
  /** 已播放秒数 */
  t: number;
  /** 0..1 */
  p: number;
  durationSec: number;
  intensity: number;
  dpr: number;
  /** 每次播放的随机数，用于方向、相位 */
  r: number[];
}

type Program = (f: FrameParams, i: FrameInput) => void;

export const DEFAULT_DURATION: Record<DistortKind, number> = {
  shake: 900,
  "explosion-shake": 1400,
  sway: 1800,
  bob: 1600,
  tilt: 2200,
  wave: 2000,
  bulge: 1800,
  stretch: 1400,
  swirl: 1800,
  "rgb-shift": 1200,
  tear: 1200,
  noise: 1600,
  flash: 1200,
  "digital-glitch": 1500,
  flip: 2600,
  "color-shift": 2400,
  blur: 1600,
};

export function baseFrame(): FrameParams {
  return {
    amt: 0,
    offset: [0, 0],
    rot: 0,
    scale: [1, 1],
    persp: [0, 0],
    clamp: false,
    flash: [1, 1, 1, 0],
    colorFx: [0, 0, 0],
    vignette: 0,
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 淡入淡出包络 */
const env = (p: number, fin = 0.12, fout = 0.2) => smooth(0, fin, p) * (1 - smooth(1 - fout, 1, p));
/** 以 c 为中心、半宽 w 的平滑凸起 */
const bump = (p: number, c: number, w: number) => smooth(c - w, c, p) * (1 - smooth(c, c + w, p));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 平滑伪随机：几组无理频率正弦叠加，-1..1 */
const wobble = (t: number, ph: number) =>
  (Math.sin(t * 1.0 + ph) + 0.6 * Math.sin(t * 2.31 + ph * 1.7) + 0.35 * Math.sin(t * 4.77 + ph * 2.9)) / 1.95;
const sign = (r: number) => (r < 0.5 ? -1 : 1);

export const PROGRAMS: Record<DistortKind, Program> = {
  shake(f, { t, p, intensity: I, dpr, r }) {
    const d = Math.pow(1 - p, 1.5) * smooth(0, 0.04, p);
    const amp = (8 + 28 * I) * dpr * d;
    f.offset = [wobble(t * 38, r[0] * 9) * amp, wobble(t * 41, r[1] * 9) * amp];
    f.rot = wobble(t * 30, r[2] * 9) * 0.004 * I * d;
    f.vignette = 0.45 * d;
  },

  "explosion-shake"(f, { t, p, intensity: I, dpr, r }) {
    const d = Math.exp(-p * 5) * (1 - smooth(0.85, 1, p)) * smooth(0, 0.02, p);
    const amp = (30 + 60 * I) * dpr * d;
    f.offset = [wobble(t * 45, r[0] * 9) * amp, wobble(t * 47, r[1] * 9) * amp];
    f.rot = wobble(t * 35, r[2] * 9) * 0.03 * I * d;
    const z = 1 + 0.05 * I * Math.exp(-p * 8) * smooth(0, 0.02, p);
    f.scale = [z, z];
    const fl = Math.exp(-t * 9) * smooth(0, 0.02, p);
    f.flash = [1, 0.8, 0.5, 0.85 * fl];
    f.vignette = 0.6 * d;
  },

  sway(f, { t, p, intensity: I, dpr, r }) {
    const e = env(p, 0.15, 0.3);
    const s = Math.sin(t * Math.PI * 2 * 1.4 + (r[0] < 0.5 ? 0 : Math.PI));
    f.offset = [s * (20 + 50 * I) * dpr * e, 0];
    f.rot = s * 0.02 * I * e;
    f.vignette = 0.3 * e;
  },

  bob(f, { t, p, intensity: I, dpr }) {
    const e = env(p, 0.15, 0.3);
    f.offset = [0, Math.sin(t * Math.PI * 2 * 2) * (15 + 40 * I) * dpr * e];
    f.vignette = 0.3 * e;
  },

  tilt(f, { p, intensity: I, r }) {
    const target = (((2 + 6 * I) * Math.PI) / 180) * sign(r[0]);
    let a: number;
    if (p < 0.25) a = target * (1 - Math.pow(1 - p / 0.25, 3));
    else if (p < 0.6) a = target;
    else {
      const q = (p - 0.6) / 0.4;
      a = target * Math.exp(-4 * q) * Math.cos(14 * q) * (1 - q);
    }
    f.rot = a;
    // 稍微放大，减少露出的黑角
    const z = 1 + Math.abs(a) * 0.6;
    f.scale = [z, z];
    f.vignette = 0.25 * Math.abs(a / target);
  },

  wave(f, { p, intensity: I }) {
    f.amt = env(p, 0.15, 0.25) * (0.4 + I);
    f.clamp = true;
  },

  bulge(f, { p, intensity: I }) {
    f.amt = env(p, 0.2, 0.3) * (0.4 + 0.6 * I);
    f.clamp = true;
  },

  stretch(f, { t, p, intensity: I }) {
    const e = Math.exp(-3 * p) * smooth(0, 0.05, p) * (1 - smooth(0.85, 1, p));
    const s = Math.sin(t * Math.PI * 2 * 2.6) * 0.22 * (0.3 + I) * e;
    f.scale = [1 + s, 1 - s * 0.6];
  },

  swirl(f, { p, intensity: I }) {
    f.amt = env(p, 0.25, 0.35) * (0.5 + I);
    f.clamp = true;
  },

  "rgb-shift"(f, { p, intensity: I }) {
    f.amt = env(p, 0.1, 0.25) * (0.5 + I);
  },

  tear(f, { p, intensity: I }) {
    f.amt = env(p, 0.05, 0.15) * (0.5 + I);
    f.clamp = true;
  },

  noise(f, { p, intensity: I }) {
    f.amt = env(p, 0.1, 0.2) * (0.5 + I);
    f.clamp = true;
  },

  flash(f, { t, durationSec, intensity: I }) {
    // 闪烁间隔 >= 0.35s（< 3 次/秒），避免光敏风险
    const n = Math.max(1, Math.floor(durationSec / 0.4));
    const gap = durationSec / n;
    for (let k = 0; k < n; k++) {
      const local = t - (k * gap + gap * 0.25);
      if (local >= 0 && local < 0.09) {
        const a = Math.sin((local / 0.09) * Math.PI);
        if (k % 2 === 1) f.colorFx = [0, a, 0];
        else f.flash = [1, 1, 1, (0.35 + 0.55 * I) * a];
      }
    }
  },

  "digital-glitch"(f, { t, p, intensity: I, r }) {
    const burst = Math.abs(Math.sin(Math.floor(t * 10) * 12.9898 + r[0] * 100)) * 1e4 % 1 > 0.35 ? 1 : 0.2;
    f.amt = env(p, 0.05, 0.15) * (0.5 + I) * burst;
    f.clamp = true;
  },

  flip(f, { p, r }) {
    let th: number;
    if (p < 0.3) th = Math.PI * easeInOut(p / 0.3);
    else if (p < 0.7) th = Math.PI;
    else th = Math.PI * (1 - easeInOut((p - 0.7) / 0.3));
    const c = Math.cos(th);
    const s = Math.sign(c || 1) * Math.max(Math.abs(c), 0.001);
    const persp = Math.sin(th) * 0.35;
    if (r[0] < 0.5) {
      // 上下翻转（绕水平轴）
      f.scale = [1, s];
      f.persp = [persp, 0];
    } else {
      // 左右镜像（绕竖直轴）
      f.scale = [s, 1];
      f.persp = [0, persp];
    }
    f.vignette = 0.4 * Math.sin(th);
  },

  "color-shift"(f, { p }) {
    const e = env(p, 0.1, 0.15);
    f.colorFx = [p * Math.PI * 4 * e, bump(p, 0.45, 0.12), bump(p, 0.72, 0.12)];
  },

  blur(f, { p, intensity: I }) {
    f.amt = env(p, 0.3, 0.3) * (0.4 + 0.6 * I);
    f.clamp = true;
  },
};
