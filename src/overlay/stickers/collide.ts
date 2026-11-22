/**
 * 贴纸之间的碰撞检测（桌面模式开启“贴纸之间碰撞”时使用）。
 *
 * 桌面模式不进 Matter 物理世界——滑行与撞墙的手感由贴纸自己实现（sticker.ts 的 slide），
 * 互撞只在滑行 / 拖拽时用 SAT 检查 alpha 轮廓凸包的交叠，再按面积质量做一次冲量交换，
 * 被撞的贴纸获得速度、进入自己的滑行。这样打开碰撞不会改变原有的滑行与撞墙手感。
 */
import type { Pt } from "./mask";

export interface ConvexShape {
  /** 中心（px）与旋转（rad） */
  x: number;
  y: number;
  rot: number;
  width: number;
  height: number;
  /** 凸包（相对中心、归一化到整图尺寸，x ∈ [-0.5, 0.5]） */
  hull: Pt[];
  flipped: boolean;
}

/** 凸包的世界坐标顶点（绕中心旋转，翻转时镜像 x） */
export function worldVertices(s: ConvexShape): Pt[] {
  const cos = Math.cos(s.rot);
  const sin = Math.sin(s.rot);
  const sx = s.flipped ? -1 : 1;
  return s.hull.map((p) => {
    const lx = p.x * s.width * sx;
    const ly = p.y * s.height;
    return { x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos };
  });
}

/** 外接圆半径，用于快速排除明显不相交的对 */
export function boundRadius(s: ConvexShape) {
  return 0.5 * Math.hypot(s.width, s.height);
}

export interface MTV {
  /** 从 a 指向 b 的单位法线 */
  nx: number;
  ny: number;
  /** 重叠深度（px） */
  depth: number;
}

function centroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/** SAT：两个凸多边形的最小平移向量，不相交返回 null */
export function satMTV(a: Pt[], b: Pt[]): MTV | null {
  let minDepth = Infinity;
  let nx = 0;
  let ny = 0;
  const project = (poly: Pt[], ax: number, ay: number) => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of poly) {
      const d = p.x * ax + p.y * ay;
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return [min, max] as const;
  };
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;
      const len = Math.hypot(ex, ey);
      if (len < 1e-6) continue;
      const ax = ey / len;
      const ay = -ex / len;
      const [minA, maxA] = project(a, ax, ay);
      const [minB, maxB] = project(b, ax, ay);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return null;
      if (overlap < minDepth) {
        minDepth = overlap;
        nx = ax;
        ny = ay;
      }
    }
  }
  // 法线统一指向 a → b（按质心连线方向）
  const ca = centroid(a);
  const cb = centroid(b);
  if ((cb.x - ca.x) * nx + (cb.y - ca.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny, depth: minDepth };
}
