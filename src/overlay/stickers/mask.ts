/**
 * 贴纸图片的 alpha 遮罩（按 src 缓存，多张同款贴纸 / 切换姿势时复用）。
 *
 * - 像素级命中测试：透明区域不拦截鼠标
 * - 可见区域包围盒：手势定位、贴边计算
 * - 碰撞轮廓：把不透明像素按行合并成矩形，供物理引擎拼成复合刚体
 *
 * 坐标约定：u, v ∈ [0, 1) 为图片内归一化坐标；轮廓 / 包围盒用以中心为原点的
 * [-0.5, 0.5] 归一化坐标，x 乘贴纸宽、y 乘贴纸高即为像素。
 */

const MASK_W = 128;
const HULL_MAX = 20;
const ALPHA_HIT = 24;
const ALPHA_SOLID = 40;

export interface Rect01 {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const FULL_RECT: Rect01 = { left: -0.5, top: -0.5, right: 0.5, bottom: 0.5 };

export interface Pt {
  x: number;
  y: number;
}

export const FULL_HULL: Pt[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

/** Andrew 单调链凸包（顺时针，屏幕坐标系） */
function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** 逐个去掉“贡献面积”最小的顶点，直到不超过 max 个（凸包保持凸） */
function simplify(hull: Pt[], max: number): Pt[] {
  const h = [...hull];
  const area = (i: number) => {
    const a = h[(i - 1 + h.length) % h.length];
    const b = h[i];
    const c = h[(i + 1) % h.length];
    return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  };
  while (h.length > max) {
    let min = 0;
    for (let i = 1; i < h.length; i++) if (area(i) < area(min)) min = i;
    h.splice(min, 1);
  }
  return h;
}

export class AlphaMask {
  private hullCache: Pt[] | null = null;
  readonly bounds: Rect01;

  constructor(
    readonly w: number,
    readonly h: number,
    /** 每像素一个 alpha 字节 */
    readonly alpha: Uint8Array,
    /** 高 / 宽 */
    readonly aspect: number,
  ) {
    this.bounds = this.measure();
  }

  hit(u: number, v: number) {
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    return this.alpha[Math.floor(v * this.h) * this.w + Math.floor(u * this.w)] > ALPHA_HIT;
  }

  private measure(): Rect01 {
    let l = this.w, t = this.h, r = -1, b = -1;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha[y * this.w + x] <= ALPHA_HIT) continue;
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
    if (r < 0) return FULL_RECT;
    return {
      left: l / this.w - 0.5,
      top: t / this.h - 0.5,
      right: (r + 1) / this.w - 0.5,
      bottom: (b + 1) / this.h - 0.5,
    };
  }

  /**
   * 碰撞轮廓：不透明像素的凸包（化简到不超过 HULL_MAX 个顶点）。
   *
   * 不用“逐行条带拼复合刚体”：两个条带复合体互相嵌入时，各条带的推力方向相互抵消，
   * 求解器分不开它们，叠在一起就直接休眠了。单个凸多边形在 Matter 里堆叠、弹开都很稳，
   * 而模切贴纸本身就接近凸形。
   */
  get hull(): Pt[] {
    if (this.hullCache) return this.hullCache;
    const pts: Pt[] = [];
    for (let y = 0; y < this.h; y++) {
      let l = -1;
      let r = -1;
      for (let x = 0; x < this.w; x++) {
        if (this.alpha[y * this.w + x] <= ALPHA_SOLID) continue;
        if (l < 0) l = x;
        r = x;
      }
      if (l < 0) continue;
      pts.push({ x: l / this.w - 0.5, y: y / this.h - 0.5 }, { x: (r + 1) / this.w - 0.5, y: y / this.h - 0.5 });
      pts.push({ x: l / this.w - 0.5, y: (y + 1) / this.h - 0.5 }, { x: (r + 1) / this.w - 0.5, y: (y + 1) / this.h - 0.5 });
    }
    const hull = simplify(convexHull(pts), HULL_MAX);
    this.hullCache = hull.length >= 3 ? hull : FULL_HULL;
    return this.hullCache;
  }

}

const cache = new Map<string, Promise<AlphaMask | null>>();

/** 从已加载的图片 / 画布生成遮罩 */
export function maskFrom(source: CanvasImageSource, sw: number, sh: number): AlphaMask | null {
  if (!sw || !sh) return null;
  const aspect = sh / sw;
  const w = MASK_W;
  const h = Math.max(1, Math.round(w * aspect));
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    return new AlphaMask(w, h, alpha, aspect);
  } catch {
    return null; // 跨域等原因读不到像素时退化为矩形命中
  }
}

export function loadMask(url: string): Promise<AlphaMask | null> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      try {
        await img.decode();
      } catch {
        return null;
      }
      return maskFrom(img, img.naturalWidth, img.naturalHeight);
    })();
    cache.set(url, p);
  }
  return p;
}
