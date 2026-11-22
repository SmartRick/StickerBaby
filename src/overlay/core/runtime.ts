/**
 * 悬浮层运行时：
 * - Ticker：全局唯一 rAF 循环，没有订阅者时自动停止（静态内容零持续渲染开销）
 * - HitManager：把 Rust 推来的全局光标做命中测试，决定悬浮层是否点击穿透，
 *   并把 DOM 指针事件路由给命中的对象（贴纸、虫子、污渍……）
 */
import { invoke } from "@tauri-apps/api/core";

export interface Cursor {
  x: number;
  y: number;
  down: boolean;
  inside: boolean;
}

export interface PointerInfo {
  x: number;
  y: number;
  button: number;
  shift: boolean;
  ctrl: boolean;
  time: number;
}

/** 可交互对象。所有坐标均为悬浮层 CSS 像素 */
export interface Interactive {
  hitTest(x: number, y: number): boolean;
  pointerDown?(p: PointerInfo): void;
  pointerMove?(p: PointerInfo): void;
  pointerUp?(p: PointerInfo): void;
  /** 光标悬停移动（即使处于穿透状态也会收到，来自全局光标轮询） */
  hover?(x: number, y: number): void;
  leave?(): void;
  wheel?(p: PointerInfo, deltaY: number): void;
  contextMenu?(p: PointerInfo): void;
  /** 中键按下 */
  auxDown?(p: PointerInfo): void;
  /** 为 true 时右键按下也走 pointerDown/Move/Up（右键拖拽缩放），由对象自己决定何时弹菜单 */
  rightDrag?: boolean;
}

export type TickFn = (dt: number, now: number) => void | boolean;

export class Ticker {
  private fns = new Set<TickFn>();
  private raf = 0;
  private last = 0;

  /** 订阅帧回调；回调返回 false 自动退订。返回退订函数 */
  add(fn: TickFn): () => void {
    this.fns.add(fn);
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
    return () => this.fns.delete(fn);
  }

  has(fn: TickFn) {
    return this.fns.has(fn);
  }

  private loop = (now: number) => {
    // rAF 时间戳是帧开始时间，可能早于 add() 时记录的 performance.now()，需钳制为非负
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    for (const fn of [...this.fns]) {
      try {
        if (fn(dt, now) === false) this.fns.delete(fn);
      } catch (e) {
        // 单个动画异常不能拖垮整个悬浮层
        console.error("[ticker]", e);
        this.fns.delete(fn);
      }
    }
    this.raf = this.fns.size ? requestAnimationFrame(this.loop) : 0;
  };
}

export class HitManager {
  private providers: { z: number; p: Interactive }[] = [];
  private interactive = false;
  private captured: Interactive | null = null;
  private hovered: Interactive | null = null;
  /** 在其他应用里按下鼠标后拖进悬浮层：直到松开都不接管 */
  private downOutside = false;
  private last: Cursor = { x: -1, y: -1, down: false, inside: false };
  /** 调试：强制保持穿透 */
  frozen = false;

  constructor() {
    const info = (e: PointerEvent | WheelEvent | MouseEvent): PointerInfo => ({
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      time: performance.now(),
    });
    window.addEventListener("pointerdown", (e) => {
      const hit = this.topAt(e.clientX, e.clientY);
      if (!hit) return;
      if (e.button === 1) {
        e.preventDefault(); // 屏蔽 WebView2 的中键自动滚动
        hit.auxDown?.(info(e));
        return;
      }
      if (e.button === 2 && !hit.rightDrag) {
        hit.contextMenu?.(info(e));
        return;
      }
      if (this.captured) return;
      this.captured = hit;
      hit.pointerDown?.(info(e));
    });
    window.addEventListener("pointermove", (e) => {
      this.captured?.pointerMove?.(info(e));
    });
    const up = (e: PointerEvent) => {
      const c = this.captured;
      this.captured = null;
      c?.pointerUp?.(info(e));
      this.reevaluate();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener(
      "wheel",
      (e) => {
        this.topAt(e.clientX, e.clientY)?.wheel?.(info(e), e.deltaY);
      },
      { passive: true },
    );
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousedown", (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }

  /** z 越大越靠上 */
  register(z: number, p: Interactive): () => void {
    const entry = { z, p };
    this.providers.push(entry);
    this.providers.sort((a, b) => b.z - a.z);
    return () => {
      this.providers = this.providers.filter((x) => x !== entry);
      if (this.captured === p) this.captured = null;
      if (this.hovered === p) this.hovered = null;
      this.reevaluate();
    };
  }

  get cursor(): Readonly<Cursor> {
    return this.last;
  }

  topAt(x: number, y: number): Interactive | null {
    for (const { p } of this.providers) {
      if (p.hitTest(x, y)) return p;
    }
    return null;
  }

  onCursor(c: Cursor) {
    this.last = c;
    if (this.captured) return;
    if (!c.inside) {
      this.setHovered(null);
      this.setInteractive(false);
      return;
    }
    if (c.down && !this.interactive) this.downOutside = true;
    if (!c.down) this.downOutside = false;
    if (this.downOutside) return;

    const hit = this.frozen ? null : this.topAt(c.x, c.y);
    this.setHovered(hit);
    hit?.hover?.(c.x, c.y);
    // 按住鼠标时不切换回穿透，避免拖拽中途丢事件
    if (hit || !c.down) this.setInteractive(!!hit);
  }

  /** 内容变化（如对象移走、被删除）后重新判定 */
  reevaluate() {
    if (!this.captured) this.onCursor(this.last);
  }

  releaseAll() {
    this.captured = null;
    this.setHovered(null);
    this.setInteractive(false);
  }

  private setHovered(h: Interactive | null) {
    if (h === this.hovered) return;
    this.hovered?.leave?.();
    this.hovered = h;
  }

  private setInteractive(v: boolean) {
    if (v === this.interactive) return;
    this.interactive = v;
    document.documentElement.classList.toggle("interactive", v);
    invoke("overlay_set_interactive", { interactive: v }).catch(console.error);
  }
}

export class Runtime {
  readonly ticker = new Ticker();
  readonly hit = new HitManager();
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  private resizeFns = new Set<() => void>();
  private cursorFns = new Set<(c: Cursor) => void>();

  constructor() {
    window.addEventListener("resize", () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = window.devicePixelRatio || 1;
      this.resizeFns.forEach((f) => f());
    });
  }

  get cursor() {
    return this.hit.cursor;
  }

  onResize(fn: () => void) {
    this.resizeFns.add(fn);
    return () => this.resizeFns.delete(fn);
  }

  /** 订阅全局光标（穿透状态下同样有效） */
  onCursor(fn: (c: Cursor) => void) {
    this.cursorFns.add(fn);
    return () => this.cursorFns.delete(fn);
  }

  pushCursor(c: Cursor) {
    this.hit.onCursor(c);
    this.cursorFns.forEach((f) => f(c));
  }
}
