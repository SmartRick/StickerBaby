/**
 * 图集部件骨骼工具：把一张部件图（腿节、触角、翅膀……）当作一根“骨头”，
 * 已知它在图中的两端（A = 关节端，B = 末端），就能把它画到世界坐标中任意两点之间。
 *
 * 腿节的 A/B 由 alpha 自动检测：图集中腿节都是“关节在上、末端在下”，
 * 取不透明像素最上方 / 最下方一小段的质心即可，不需要逐帧手工标注。
 */
import type { Atlas } from "../../core/assets";

export interface BoneDef {
  frame: number;
  /** 帧内像素坐标 */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** |AB|（帧像素） */
  len: number;
}

const cache = new Map<string, BoneDef>();

/** 自动检测纵向部件的上下两端 */
export function verticalBone(at: Atlas, frame: number): BoneDef {
  const key = `${at.name}|${frame}|v`;
  let b = cache.get(key);
  if (b) return b;
  const c = at.canvas(frame);
  const w = c.width;
  const h = c.height;
  const data = c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  let top = h;
  let bottom = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 96) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  const band = Math.max(2, Math.round((bottom - top) * 0.07));
  const centroid = (y0: number, y1: number) => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < w; x++)
        if (data[(y * w + x) * 4 + 3] > 96) {
          sx += x;
          sy += y;
          n++;
        }
    return n ? [sx / n, sy / n] : [w / 2, (y0 + y1) / 2];
  };
  const [ax, ay] = centroid(top, top + band);
  const [bx, by] = centroid(bottom - band, bottom);
  b = { frame, ax, ay, bx, by, len: Math.hypot(bx - ax, by - ay) };
  cache.set(key, b);
  return b;
}

/** 手工指定两端（0..1 相对坐标） */
export function manualBone(at: Atlas, frame: number, ax: number, ay: number, bx: number, by: number): BoneDef {
  const key = `${at.name}|${frame}|${ax},${ay},${bx},${by}`;
  let b = cache.get(key);
  if (!b) {
    const f = at.frame(frame);
    const A = [ax * f.w, ay * f.h];
    const B = [bx * f.w, by * f.h];
    b = { frame, ax: A[0], ay: A[1], bx: B[0], by: B[1], len: Math.hypot(B[0] - A[0], B[1] - A[1]) };
    cache.set(key, b);
  }
  return b;
}

/**
 * 把骨头画成从 (px,py) 指向角度 angle、世界长度 len 的样子。
 * thick：横向缩放倍率（相对于沿骨方向的缩放），用于让细长部件更粗/更细。
 * mirror：横向镜像（左右对称部件复用同一帧）
 */
export function drawBone(
  ctx: CanvasRenderingContext2D,
  at: Atlas,
  b: BoneDef,
  px: number,
  py: number,
  angle: number,
  len: number,
  thick = 1,
  mirror = false,
) {
  const f = at.frame(b.frame);
  const s = len / b.len;
  const boneAng = Math.atan2(b.by - b.ay, b.bx - b.ax);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle - boneAng);
  // 在骨头自身坐标系中横向缩放
  ctx.rotate(boneAng);
  ctx.scale(1, (mirror ? -1 : 1) * thick);
  ctx.rotate(-boneAng);
  ctx.scale(s, s);
  ctx.drawImage(at.image, f.x, f.y, f.w, f.h, -b.ax, -b.ay, f.w, f.h);
  ctx.restore();
}

/**
 * 两骨 IK：根 (x0,y0)，目标 (tx,ty)，骨长 l1/l2，bend=±1 决定膝盖弯向哪侧。
 * 返回膝盖位置与两段角度；目标过远时伸直指向目标。
 */
export function ik2(x0: number, y0: number, tx: number, ty: number, l1: number, l2: number, bend: number) {
  const dx = tx - x0;
  const dy = ty - y0;
  let d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a1 = base - bend * Math.acos(Math.max(-1, Math.min(1, cosA)));
  const kx = x0 + Math.cos(a1) * l1;
  const ky = y0 + Math.sin(a1) * l1;
  const ex = x0 + Math.cos(base) * d;
  const ey = y0 + Math.sin(base) * d;
  const a2 = Math.atan2(ey - ky, ex - kx);
  return { kx, ky, a1, a2, ex, ey };
}

/** 把体坐标（前 = +x，右 = +y）变换到世界坐标 */
export function toWorld(x: number, y: number, heading: number, lx: number, ly: number): [number, number] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return [x + lx * c - ly * s, y + lx * s + ly * c];
}

/** 平滑噪声（几个正弦叠加），用于触角摆动、游走等 */
export function wobble(t: number, seed: number) {
  return (
    Math.sin(t * 1.3 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 1.7) * 0.3 + Math.sin(t * 5.3 + seed * 2.3) * 0.2
  );
}
