/**
 * Canvas 图层 + 实体模型。
 *
 * 每个图层是一张全屏 canvas，持有一组 Entity。只要有实体处于动画状态就逐帧重绘，
 * 全部静止（如裂痕、胶带画好后）则停止循环，等实体调用 invalidate() 再画一帧。
 * 图层本身注册为 Interactive，把命中测试和指针事件转发给可交互实体。
 */
import type { Interactive, PointerInfo, Runtime } from "./runtime";

export interface Entity {
  /** 返回 false 表示生命周期结束，将被移除并调用 dispose */
  update(dt: number, now: number): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
  /** 是否需要逐帧重绘；不实现视为 true。静态实体返回 false 以节省开销 */
  isAnimating?(): boolean;
  /** 同层内绘制顺序，越大越靠上 */
  z?: number;
  hitTest?(x: number, y: number): boolean;
  pointerDown?(p: PointerInfo): void;
  pointerMove?(p: PointerInfo): void;
  pointerUp?(p: PointerInfo): void;
  hover?(x: number, y: number): void;
  leave?(): void;
  dispose?(): void;
}

/** 可被管理器停止的实体（全屏特效 / 恶作剧） */
export interface FxEntity extends Entity {
  /** 优雅结束（淡出）；之后 update 应在若干帧内返回 false */
  stop(): void;
}

export class CanvasLayer implements Interactive {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private entities: Entity[] = [];
  private running = false;
  private broken = new Set<Entity>();
  /** tick 期间新增的实体（例如特效在 update 里第一次发射粒子），tick 结束后再并入 */
  private inTick = false;
  private pending: Entity[] = [];
  private removals = new Set<Entity>();
  private target: Entity | null = null;
  private hovered: Entity | null = null;

  constructor(
    readonly rt: Runtime,
    readonly name: string,
    zIndex: number,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = `layer layer-${name}`;
    this.canvas.style.zIndex = String(zIndex);
    document.getElementById("stage")!.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.resize();
    rt.onResize(() => {
      this.resize();
      this.invalidate();
    });
    rt.hit.register(zIndex, this);
  }

  get width() {
    return this.rt.width;
  }
  get height() {
    return this.rt.height;
  }
  get count() {
    return this.entities.length;
  }

  add<T extends Entity>(e: T): T {
    if (this.inTick) {
      this.pending.push(e);
      return e;
    }
    this.entities.push(e);
    this.entities.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    this.invalidate();
    return e;
  }

  remove(e: Entity) {
    const pi = this.pending.indexOf(e);
    if (pi >= 0) {
      this.pending.splice(pi, 1);
      e.dispose?.();
      return;
    }
    if (this.inTick) {
      // tick 遍历中：延后到本次遍历的过滤阶段移除
      this.removals.add(e);
      return;
    }
    const i = this.entities.indexOf(e);
    if (i >= 0) {
      this.entities.splice(i, 1);
      e.dispose?.();
      this.invalidate();
    }
  }

  has(e: Entity) {
    return this.entities.includes(e) || this.pending.includes(e);
  }

  clear() {
    for (const e of [...this.entities, ...this.pending]) e.dispose?.();
    this.entities = [];
    this.pending = [];
    this.target = this.hovered = null;
    this.invalidate();
  }

  /** 请求重绘（静态实体内容变化后调用） */
  invalidate() {
    if (!this.running) {
      this.running = true;
      this.rt.ticker.add(this.tick);
    }
  }

  private resize() {
    const { width, height, dpr } = this.rt;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private tick = (dt: number, now: number) => {
    const ctx = this.ctx;
    const before = this.entities.length;
    this.inTick = true;
    this.entities = this.entities.filter((e) => {
      let alive: boolean;
      try {
        alive = !this.removals.has(e) && e.update(dt, now) && !this.removals.has(e);
      } catch (err) {
        // 单个实体异常只移除它自己，不影响同层其他内容
        console.error(`[layer:${this.name}] update`, err);
        alive = false;
      }
      if (!alive) {
        try {
          e.dispose?.();
        } catch (err) {
          console.error(`[layer:${this.name}] dispose`, err);
        }
        if (this.target === e) this.target = null;
        if (this.hovered === e) this.hovered = null;
      }
      return alive;
    });
    this.inTick = false;
    this.removals.clear();
    if (this.pending.length) {
      // 新实体本帧也参与绘制（下一帧开始 update）
      this.entities.push(...this.pending);
      this.pending = [];
      this.entities.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const dpr = this.rt.dpr;
    for (const e of this.entities) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      try {
        e.draw(ctx);
      } catch (err) {
        console.error(`[layer:${this.name}] draw`, err);
        this.broken.add(e);
      }
      ctx.restore();
    }
    if (this.broken.size) {
      for (const e of this.broken) this.remove(e);
      this.broken.clear();
    }
    if (before !== this.entities.length) this.rt.hit.reevaluate();
    const animating = this.entities.some((e) => e.isAnimating?.() ?? true);
    if (!animating) {
      this.running = false;
      return false;
    }
    return true;
  };

  // ---- Interactive：转发给最上层命中的实体 ----
  hitTest(x: number, y: number): boolean {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.hitTest?.(x, y)) {
        this.target = e;
        return true;
      }
    }
    this.target = null;
    return false;
  }

  pointerDown(p: PointerInfo) {
    this.target?.pointerDown?.(p);
  }
  pointerMove(p: PointerInfo) {
    this.target?.pointerMove?.(p);
  }
  pointerUp(p: PointerInfo) {
    this.target?.pointerUp?.(p);
  }
  hover(x: number, y: number) {
    if (this.hovered !== this.target) {
      this.hovered?.leave?.();
      this.hovered = this.target;
    }
    this.target?.hover?.(x, y);
  }
  leave() {
    this.hovered?.leave?.();
    this.hovered = null;
  }
}

// ---- 小工具 ----
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** 生成一张离屏 canvas（用于预渲染静态内容） */
export function offscreen(w: number, h: number, dpr = window.devicePixelRatio || 1) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return { canvas: c, ctx };
}
