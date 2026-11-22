/**
 * 桌面上的一张贴纸（DOM 渲染，静止时零重绘开销）。
 *
 * 趣味反馈：
 * - 单击：挤压回弹 + 小跳 + 粒子 + 台词气泡（多状态角色切换反应姿势、Rive 角色打招呼）
 * - 双击：大跳转圈；中键：手势互动（摸摸 / 戳戳 / 托一托……）
 * - 抚摸：鼠标在贴纸上来回蹭 → 左右扭动 + 粒子（穿透状态下同样能识别）
 * - 拖拽：被拎起放大、按速度倾斜和拉伸；甩出后带惯性滑行、撞边回弹
 *   （太空 / 重力交给物理世界；桌面模式始终保持自己的滑行手感，
 *   开启“贴纸之间碰撞”时在滑行 / 拖拽中做凸包互撞，见 collide.ts）
 * - 右键拖动缩放，单击右键弹菜单；滚轮缩放，Shift+滚轮旋转
 *
 * DOM 结构：.sticker（位置 / 弹簧变形）> .sb-motion（手势变形）> .sb-idle（待机动画）
 *           > .sb-flip（左右翻转）> 图片 / Rive / 视频
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import type { StickerState } from "@/lib/stickers";
import type { StickerMode } from "@/lib/store";
import type { StickerGestureDefinition } from "@/lib/sticker-gestures";
import type { ChromaKey, ParticleKind } from "../../shared/protocol";
import { clamp } from "../core/layer";
import type { ParticleSystem } from "../core/particles";
import type { PointerInfo, Runtime } from "../core/runtime";
import { ChromaVideo } from "./chroma";
import { placeGesture, playGesture } from "./gesture";
import { type AlphaMask, FULL_HULL, FULL_RECT, loadMask, type Pt, type Rect01 } from "./mask";
import { type PoseVariant, PoseController } from "./poses";
import { RiveView } from "./rive";
import { Spring } from "./spring";

const DRAG_THRESHOLD = 4;
const THROW_SPEED = 700;
const IDLE_MOTIONS = ["float", "sway", "bob", "wiggle", "breathe"];

/** 本地绝对路径（自定义导入）走 asset 协议；站内路径原样使用 */
export function resolveSrc(src: string) {
  return /^[a-zA-Z]:[\\/]/.test(src) || src.startsWith("/Users/") || src.startsWith("/home/") ? convertFileSrc(src) : src;
}

/** 由共享状态 + 贴纸目录解析出的贴纸描述 */
export interface StickerSpec {
  id: string;
  stickerId: string;
  characterId: string;
  name: string;
  subtitle: string;
  /** 菜单里的小图（自制视频贴纸没有） */
  thumb: string;
  poses: PoseVariant[];
  pinned?: StickerState;
  riveSrc?: string;
  video?: { src: string; chroma: ChromaKey | null };
  /** 归一化中心坐标（0..1） */
  x: number;
  y: number;
  /** 相对默认尺寸的缩放 */
  scale: number;
  angle: number;
  z: number;
  locked: boolean;
  flipped: boolean;
  gesture: StickerGestureDefinition;
  particles: ParticleKind[];
  phrase: string;
}

export interface StickerEnv {
  /** 当前缩放对应的贴纸宽度（px） */
  widthFor(scale: number): number;
  reduceMotion: boolean;
  idleMotion: boolean;
  mode: StickerMode;
  /** 是否由物理世界接管运动（只有太空 / 重力） */
  simulated: boolean;
  /** 桌面模式开启了“贴纸之间碰撞”：滑行 / 拖拽时做凸包互撞 */
  collide: boolean;
  /** 太空 / 重力：弹簧拉着刚体走，贴纸位置完全来自刚体 */
  springDrag: boolean;
  /** 全局锁定 / 隐藏时贴纸不可交互 */
  interactive: boolean;
}

export interface StickerHost {
  rt: Runtime;
  particles: ParticleSystem;
  root: HTMLElement;
  env: StickerEnv;
  /** 持久化（归一化坐标、缩放、角度……） */
  commit(s: Sticker, patch: { x?: number; y?: number; scale?: number; angle?: number }): void;
  openMenu(s: Sticker, x: number, y: number): void;
  raise(s: Sticker): void;
  activity(): void;
  /** 物理世界钩子 */
  grab(s: Sticker, px: number, py: number): void;
  drag(s: Sticker, x: number, y: number): void;
  release(s: Sticker, vx: number, vy: number, moved: boolean): void;
  /** 位置被外部改动 */
  teleported(s: Sticker): void;
  /** 几何（尺寸 / 轮廓 / 翻转）变化，需要重建刚体 */
  geometryChanged(s: Sticker): void;
  /** 桌面互撞：与别的贴纸做凸包碰撞（只在使用自带滑行物理时调用） */
  collide(s: Sticker): void;
  phraseFor(s: Sticker, pose: PoseVariant | undefined): string;
}

export class Sticker {
  readonly el: HTMLDivElement;
  private motion: HTMLDivElement;
  private idleEl: HTMLDivElement;
  private flipEl: HTMLDivElement;
  private img: HTMLImageElement | null = null;
  private video: HTMLVideoElement | null = null;
  private chroma: ChromaVideo | null = null;
  private rive: RiveView | null = null;
  private mask: AlphaMask | null = null;
  private aspect = 1;
  private loaded = false;
  private poses: PoseController;
  private mediaKey = "";

  // 运行时位置（px）
  x = 0;
  y = 0;
  width = 0;
  rotation = 0;

  // 弹簧动画
  private sx = new Spring(1, 1, 420, 14);
  private sy = new Spring(1, 1, 420, 14);
  private rot = new Spring(0, 0, 260, 12);
  private jump = new Spring(0, 0, 200, 13);
  private spin = new Spring(0, 0, 90, 14);
  /** 放下时超出屏幕的部分弹回来（视觉偏移，逻辑位置已经在屏幕内） */
  private offX = new Spring(0, 0, 160, 18);
  private offY = new Spring(0, 0, 160, 18);
  private ticking = false;
  private unsub: (() => void) | null = null;

  // 交互状态
  private down: { x: number; y: number; t: number; ox: number; oy: number; button: number } | null = null;
  dragging = false;
  private resizing: { scale: number; moved: boolean } | null = null;
  private vel = { x: 0, y: 0 };
  private lastMove = { x: 0, y: 0, t: 0 };
  private sliding = false;
  private lastClick = 0;
  private hoverLast: { x: number; y: number; t: number; dx: number } | null = null;
  private rub = 0;
  private lastPet = 0;
  private gestureStop: (() => void) | null = null;
  private bubble: HTMLDivElement | null = null;
  private bubbleTimer = 0;
  private badge: HTMLDivElement | null = null;
  private idleClass = "";

  constructor(
    public spec: StickerSpec,
    private host: StickerHost,
  ) {
    this.el = document.createElement("div");
    this.el.className = "sticker";
    this.motion = this.child(this.el, "sb-motion");
    this.idleEl = this.child(this.motion, "sb-idle");
    this.flipEl = this.child(this.idleEl, "sb-flip");
    this.poses = new PoseController(spec.poses, spec.pinned, (pose) => this.showPose(pose));
    this.place(spec);
    this.createMedia();
    this.render();
  }

  private child(parent: HTMLElement, cls: string) {
    const d = document.createElement("div");
    d.className = cls;
    parent.appendChild(d);
    return d;
  }

  get id() {
    return this.spec.id;
  }

  get height() {
    return this.width * this.aspect;
  }

  get locked() {
    return this.spec.locked;
  }

  get pose() {
    return this.poses;
  }

  /** 可见区域（用于贴边、手势定位） */
  get bounds(): Rect01 {
    const b = this.chroma ? FULL_RECT : this.mask?.bounds ?? FULL_RECT;
    return this.spec.flipped ? { ...b, left: -b.right, right: -b.left } : b;
  }

  /** 碰撞轮廓 */
  get hull(): Pt[] {
    return this.chroma || !this.mask ? FULL_HULL : this.mask.hull;
  }

  /** 碰撞体描述（供桌面互撞的 SAT 检测） */
  shape() {
    return {
      x: this.x,
      y: this.y,
      rot: this.rotation,
      width: this.width,
      height: this.height,
      hull: this.hull,
      flipped: this.spec.flipped,
    };
  }

  /** 当前滑行速度（px/s） */
  velocity() {
    return { x: this.vel.x, y: this.vel.y };
  }

  /** 碰撞分离：直接平移（不改变速度） */
  nudge(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }

  /** 被别的贴纸撞上：获得速度并进入滑行（拖拽中 / 锁定的贴纸不动） */
  shove(vx: number, vy: number) {
    if (this.dragging || this.locked) return;
    this.vel.x = clamp(vx, -4000, 4000);
    this.vel.y = clamp(vy, -4000, 4000);
    if (Math.hypot(this.vel.x, this.vel.y) > 40) this.sliding = true;
    this.animate();
  }

  // ---------------- 状态同步 ----------------
  private place(spec: StickerSpec) {
    const { width: W, height: H } = this.host.rt;
    this.width = this.host.env.widthFor(spec.scale);
    this.x = spec.x * W;
    this.y = spec.y * H;
    this.rotation = spec.angle;
  }

  /** 共享状态变化（只传入真正变化了的字段，避免覆盖进行中的动画） */
  apply(spec: StickerSpec, changed: Set<keyof StickerSpec>) {
    const prev = this.spec;
    this.spec = spec;
    const { width: W, height: H } = this.host.rt;
    const moved = (changed.has("x") || changed.has("y") || changed.has("angle")) && !this.dragging && !this.sliding;
    if (moved) {
      // 自己刚提交的位置回声：与当前位置一致时不打断物理运动
      const nx = spec.x * W;
      const ny = spec.y * H;
      if (Math.abs(nx - this.x) > 1 || Math.abs(ny - this.y) > 1 || Math.abs(spec.angle - this.rotation) > 0.01) {
        this.x = nx;
        this.y = ny;
        this.rotation = spec.angle;
        this.host.teleported(this);
      }
    }
    if (changed.has("scale")) this.width = this.host.env.widthFor(spec.scale);
    if (changed.has("poses") || changed.has("pinned")) {
      if (changed.has("poses")) this.poses.setVariants(spec.poses, spec.pinned);
      else this.poses.setPinned(spec.pinned);
    }
    const mediaChanged = changed.has("riveSrc") || changed.has("video") || changed.has("stickerId");
    if (mediaChanged) this.createMedia();
    if (changed.has("scale") || changed.has("flipped") || mediaChanged) this.host.geometryChanged(this);
    if (changed.has("locked") && spec.locked) this.cancelInteraction();
    if (prev.video?.chroma !== spec.video?.chroma && this.chroma && spec.video?.chroma) this.chroma.setParams(spec.video.chroma);
    this.render();
  }

  /** 显示器 / 全局缩放变化 */
  relayout() {
    this.place(this.spec);
    this.host.geometryChanged(this);
    this.render();
  }

  /** 由物理世界驱动的位置 */
  setBodyPose(x: number, y: number, angle: number) {
    if (this.dragging && !this.host.env.springDrag) return;
    this.x = x;
    this.y = y;
    this.rotation = angle;
    this.render();
  }

  // ---------------- 媒体 ----------------
  private createMedia() {
    const s = this.spec;
    const key = s.video ? `v:${s.video.src}:${s.video.chroma ? 1 : 0}` : s.riveSrc ? `r:${s.riveSrc}` : `i:${s.stickerId}`;
    if (key === this.mediaKey) return;
    this.mediaKey = key;
    this.disposeMedia();
    if (s.video) {
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      v.crossOrigin = "anonymous";
      v.src = resolveSrc(s.video.src);
      v.onloadedmetadata = () => {
        this.aspect = v.videoHeight / v.videoWidth || 1;
        this.appear();
        this.host.geometryChanged(this);
      };
      v.play().catch((e) => console.warn("[sticker] video play", e));
      this.video = v;
      if (s.video.chroma) {
        try {
          this.chroma = new ChromaVideo(v, s.video.chroma);
          this.flipEl.appendChild(this.chroma.canvas);
          return;
        } catch (e) {
          console.error("[sticker] 抠像初始化失败，退化为原视频", e);
        }
      }
      this.flipEl.appendChild(v);
      return;
    }
    const img = document.createElement("img");
    img.draggable = false;
    img.decoding = "async";
    img.src = this.poses.shown.src;
    this.img = img;
    this.flipEl.appendChild(img);
    void this.loadMask(img.src);
    if (s.riveSrc && !this.host.env.reduceMotion) {
      const rive = new RiveView(s.riveSrc, (ok) => {
        if (this.rive !== rive) return;
        rive.canvas.style.visibility = ok ? "visible" : "hidden";
        if (this.img) this.img.style.visibility = ok ? "hidden" : "";
      });
      rive.canvas.style.visibility = "hidden";
      this.flipEl.appendChild(rive.canvas);
      this.rive = rive;
    }
  }

  private async loadMask(src: string) {
    const m = await loadMask(src);
    if (!this.img || this.img.src !== src) return;
    const aspectChanged = !this.mask || (m && Math.abs(m.aspect - this.aspect) > 0.001);
    this.mask = m;
    if (m) this.aspect = m.aspect;
    if (!this.loaded) this.appear();
    if (aspectChanged || this.loaded) this.host.geometryChanged(this);
    this.render();
  }

  private showPose(pose: PoseVariant) {
    if (!this.img || this.rive) return;
    const img = this.img;
    const next = new Image();
    next.src = pose.src;
    // 先解码再替换，固定尺寸的盒子里第一帧就是完整画面
    next.decode().catch(() => {}).finally(() => {
      if (this.img !== img || this.poses.shown !== pose) return;
      img.src = pose.src;
      void this.loadMask(img.src);
    });
  }

  private disposeMedia() {
    this.chroma?.dispose();
    this.chroma = null;
    this.rive?.dispose();
    this.rive = null;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }
    this.video = null;
    this.img = null;
    this.mask = null;
    this.flipEl.replaceChildren();
  }

  /** 出场动画 */
  private appear() {
    if (this.loaded) return;
    this.loaded = true;
    this.render();
    this.sx.x = 0.3;
    this.sy.x = 0.3;
    this.animate();
  }

  setVisible(visible: boolean) {
    if (!this.video) return;
    if (visible) void this.video.play().catch(() => {});
    else this.video.pause();
  }

  // ---------------- 渲染 ----------------
  render() {
    const w = this.width;
    const h = this.height;
    const s = this.el.style;
    s.width = `${w}px`;
    s.height = `${h}px`;
    s.zIndex = String(this.spec.z);
    const r = this.rotation + this.rot.x + this.spin.x;
    s.transform =
      `translate(${this.x + this.offX.x - w / 2}px, ${this.y + this.offY.x - h / 2 + this.jump.x}px) ` +
      `rotate(${r}rad) scale(${this.sx.x}, ${this.sy.x})`;
    this.el.classList.toggle("lifted", this.dragging);
    this.el.classList.toggle("locked", this.spec.locked);
    this.flipEl.style.transform = this.spec.flipped ? "scaleX(-1)" : "";
    this.updateIdle();
    if (this.bubble) this.placeBubble();
    if (this.badge) this.placeBadge();
  }

  /** 静止时的待机小动画（桌面模式、开启“轻微晃动”时） */
  private updateIdle() {
    const env = this.host.env;
    const want =
      env.idleMotion && !env.reduceMotion && !this.dragging && !this.sliding && !this.gestureStop && !this.resizing;
    const cls = want ? `sb-idle-${IDLE_MOTIONS[hash(this.spec.characterId) % IDLE_MOTIONS.length]}` : "";
    if (cls === this.idleClass) return;
    if (this.idleClass) this.idleEl.classList.remove(this.idleClass);
    if (cls) this.idleEl.classList.add(cls);
    this.idleClass = cls;
  }

  // ---------------- 命中测试 ----------------
  /** ignoreLock：锁定贴纸的悬停检测（显示解锁按钮）也用它 */
  hitTest(px: number, py: number): boolean {
    if (!this.loaded) return false;
    const w = this.width;
    const h = this.height;
    const dx = px - this.x;
    const dy = py - (this.y + this.jump.x);
    const r = -(this.rotation + this.rot.x + this.spin.x);
    const lx = dx * Math.cos(r) - dy * Math.sin(r);
    const ly = dx * Math.sin(r) + dy * Math.cos(r);
    let u = lx / (w * this.sx.x) + 0.5;
    const v = ly / (h * this.sy.x) + 0.5;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
    if (this.spec.flipped) u = 1 - u;
    if (this.chroma) {
      const mk = this.chroma.mask;
      if (!mk) return true;
      const mw = mk.length / 4 / this.chroma.maskH;
      return mk[(Math.floor(v * this.chroma.maskH) * mw + Math.floor(u * mw)) * 4 + 3] > 24;
    }
    return this.mask ? this.mask.hit(u, v) : true;
  }

  // ---------------- 指针 ----------------
  pointerDown(p: PointerInfo) {
    this.host.activity();
    this.hideBubble();
    this.gestureStop?.();
    this.sliding = false;
    this.down = { x: p.x, y: p.y, t: p.time, ox: this.x - p.x, oy: this.y - p.y, button: p.button };
    this.dragging = false;
    this.vel = { x: 0, y: 0 };
    this.lastMove = { x: p.x, y: p.y, t: p.time };
    this.host.raise(this);
    if (p.button === 2) {
      this.resizing = { scale: this.spec.scale, moved: false };
      return;
    }
    // 按下时轻微压扁
    this.sx.target = 1.06;
    this.sy.target = 0.92;
    this.animate();
  }

  pointerMove(p: PointerInfo) {
    const d = this.down;
    if (!d) return;
    if (this.resizing) {
      this.resize(p);
      return;
    }
    if (!this.dragging) {
      if (Math.hypot(p.x - d.x, p.y - d.y) < DRAG_THRESHOLD) return;
      this.dragging = true;
      this.poses.enterDrag();
      this.host.grab(this, p.x, p.y);
    }
    const dt = Math.max(1, p.time - this.lastMove.t) / 1000;
    const ivx = (p.x - this.lastMove.x) / dt;
    const ivy = (p.y - this.lastMove.y) / dt;
    this.vel.x = this.vel.x * 0.6 + ivx * 0.4;
    this.vel.y = this.vel.y * 0.6 + ivy * 0.4;
    this.lastMove = { x: p.x, y: p.y, t: p.time };
    if (this.host.env.springDrag) {
      // 太空 / 重力：弹簧拉着刚体走（抓偏心会转），只做轻微拎起放大
      this.sx.target = this.sy.target = 1.05;
      this.host.drag(this, p.x, p.y);
    } else {
      // 贴纸直接跟手，可以拖出屏幕一部分，松手后再弹回来
      this.x = p.x + d.ox;
      this.y = p.y + d.oy;
      // 被拎起：放大 + 按水平速度倾斜（像挂在手上晃）+ 沿速度方向拉伸
      const speed = Math.hypot(this.vel.x, this.vel.y);
      const stretch = Math.min(speed / 4000, 0.18);
      this.rot.target = clamp(this.vel.x / 2500, -0.45, 0.45);
      this.sx.target = 1.1 - stretch * 0.6;
      this.sy.target = 1.1 + stretch;
      this.host.drag(this, this.x, this.y);
    }
    this.host.activity();
    this.animate();
  }

  pointerUp(p: PointerInfo) {
    const d = this.down;
    this.down = null;
    if (this.resizing) {
      const r = this.resizing;
      this.resizing = null;
      this.hideBadge();
      if (r.moved) this.host.commit(this, { scale: this.spec.scale });
      else this.host.openMenu(this, p.x, p.y);
      this.render();
      return;
    }
    this.sx.target = this.sy.target = 1;
    this.rot.target = 0;
    if (!d) return;
    if (this.dragging) {
      this.dragging = false;
      this.poses.endDrag();
      const env = this.host.env;
      const speed = Math.hypot(this.vel.x, this.vel.y);
      const fresh = p.time - this.lastMove.t < 80;
      const thrown = fresh && speed > THROW_SPEED && env.mode !== "float";
      if (env.springDrag) {
        this.host.release(this, fresh ? this.vel.x : 0, fresh ? this.vel.y : 0, true);
      } else if (env.simulated) {
        this.settleInside();
        this.host.release(this, thrown ? this.vel.x : 0, thrown ? this.vel.y : 0, true);
      } else if (thrown) {
        this.sliding = true; // 甩出
        this.vel.x = clamp(this.vel.x, -5000, 5000);
        this.vel.y = clamp(this.vel.y, -5000, 5000);
      } else {
        this.settleInside();
        this.host.commit(this, this.position());
      }
      if (!thrown) {
        // 放下时“啪”地压扁一下
        this.sx.v += 3;
        this.sy.v -= 3;
      }
    } else if (p.time - d.t < 450) {
      this.click(p.x, p.y, p.time - this.lastClick < 320);
      this.lastClick = p.time;
    }
    this.animate();
  }

  /** 右键拖动缩放：取位移更大的轴，乘法手感（同样的距离在任何尺寸下改变同样比例） */
  private resize(p: PointerInfo) {
    const r = this.resizing!;
    const d = this.down!;
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (!r.moved) {
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
      r.moved = true;
    }
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
    const scale = clamp(r.scale * Math.max(0.25, 1 + delta / 360), 0.2, 2.5);
    this.spec = { ...this.spec, scale };
    this.width = this.host.env.widthFor(scale);
    this.showBadge(`${Math.round(scale * 100)}%`);
    this.host.geometryChanged(this);
    this.host.activity();
    this.render();
  }

  private cancelInteraction() {
    this.down = null;
    this.resizing = null;
    this.hideBadge();
    if (this.dragging) {
      this.dragging = false;
      this.poses.endDrag();
      this.host.release(this, 0, 0, false);
    }
    this.sx.target = this.sy.target = 1;
    this.rot.target = 0;
    this.animate();
  }

  /** 点击反馈（也供主界面“预览”远程触发） */
  click(x: number, y: number, double: boolean) {
    const kinds = this.spec.particles.length ? this.spec.particles : ["sparkle" as const];
    this.host.activity();
    if (double) {
      this.jump.v -= 1100;
      this.spin.x -= Math.PI * 2; // 回弹到 0 = 转一圈
      this.host.particles.burst(x, y, kinds, 1.8);
    } else {
      this.sx.v += 7;
      this.sy.v -= 7;
      this.jump.v -= 420;
      this.host.particles.burst(x, y, kinds, 1);
      const pose = this.poses.react();
      this.rive?.greet();
      this.say(this.host.phraseFor(this, pose));
    }
    this.animate();
  }

  /** 抚摸：来回蹭达到一定距离且方向反复变化 */
  hover(x: number, y: number) {
    if (this.down) return;
    this.host.activity();
    const now = performance.now();
    const h = this.hoverLast;
    if (!h || now - h.t > 300) {
      this.hoverLast = { x, y, t: now, dx: 0 };
      if (!h) {
        // 刚进入：轻微“注意到”
        this.sx.v += 1.2;
        this.sy.v += 1.2;
        this.poses.touch();
        this.animate();
      }
      return;
    }
    const dx = x - h.x;
    const dist = Math.hypot(dx, y - h.y);
    if (Math.sign(dx) !== Math.sign(h.dx) && Math.abs(dx) > 1) this.rub += 40; // 方向翻转加分
    this.rub += dist;
    this.rub *= 0.985;
    this.hoverLast = { x, y, t: now, dx: Math.abs(dx) > 1 ? dx : h.dx };
    if (this.rub > 260 && now - this.lastPet > 260) {
      this.rub = 0;
      this.lastPet = now;
      this.rot.v += (dx >= 0 ? 1 : -1) * 4;
      this.sy.v -= 1.5;
      this.sx.v += 1.5;
      const kinds = this.spec.particles.length ? this.spec.particles : ["heart" as const];
      this.host.particles.emit(x, y - 10, {
        kind: kinds,
        count: 3,
        angle: [-Math.PI * 0.75, -Math.PI * 0.25],
        speed: [60, 160],
        gravity: -40,
        drag: 0.6,
        life: [0.9, 1.4],
        size: [16, 26],
        sizeEnd: 1.1,
        sway: 40,
      });
      this.animate();
    }
  }

  leave() {
    this.hoverLast = null;
    this.rub = 0;
  }

  wheel(p: PointerInfo, deltaY: number) {
    this.host.activity();
    if (p.shift) {
      this.rotation += (deltaY > 0 ? 1 : -1) * (Math.PI / 36);
      this.host.commit(this, { angle: this.rotation });
    } else {
      const scale = clamp(this.spec.scale * (deltaY > 0 ? 0.92 : 1.08), 0.2, 2.5);
      this.spec = { ...this.spec, scale };
      this.width = this.host.env.widthFor(scale);
      this.sx.v += deltaY > 0 ? -1 : 1;
      this.sy.v += deltaY > 0 ? -1 : 1;
      this.host.geometryChanged(this);
      this.host.commit(this, { scale });
    }
    this.render();
    this.animate();
  }

  auxDown() {
    this.playGesture(this.spec.gesture);
  }

  /** 手势互动 */
  playGesture(def: StickerGestureDefinition) {
    if (!this.loaded) return;
    this.gestureStop?.();
    this.hideBubble();
    this.host.raise(this);
    this.host.activity();
    const w = this.width * this.sx.x;
    const h = this.height * this.sy.x;
    const at = placeGesture(def, { left: this.x - w / 2, top: this.y - h / 2, width: w, height: h }, this.bounds, this.host.rt);
    this.gestureStop = playGesture(
      this.host.root,
      def,
      at,
      this.motion,
      this.host.env.reduceMotion,
      () => {
        this.sx.v += 2;
        this.sy.v -= 2;
        this.rive?.greet();
        const kinds = this.spec.particles.length ? this.spec.particles : ["heart" as const];
        this.host.particles.emit(this.x, this.y - h * 0.3, {
          kind: kinds,
          count: 4,
          angle: [-Math.PI * 0.8, -Math.PI * 0.2],
          speed: [80, 180],
          gravity: -30,
          drag: 0.6,
          life: [0.8, 1.3],
          size: [16, 24],
          sway: 30,
        });
        this.animate();
      },
      () => {
        this.gestureStop = null;
        this.render();
      },
    );
    this.render();
  }

  // ---------------- 气泡 / 徽标 ----------------
  say(text: string, ms = 3200) {
    if (!text) return;
    this.hideBubble();
    const b = document.createElement("div");
    b.className = "sb-bubble";
    b.textContent = text;
    this.host.root.appendChild(b);
    this.bubble = b;
    this.placeBubble();
    this.bubbleTimer = window.setTimeout(() => this.hideBubble(), ms);
  }

  private placeBubble() {
    const b = this.bubble!;
    const top = this.y + (this.bounds.top * this.height) - 10 + this.jump.x;
    const above = top > 80;
    b.classList.toggle("below", !above);
    b.style.left = `${clamp(this.x, 120, this.host.rt.width - 120)}px`;
    b.style.top = above ? `${top}px` : `${this.y + this.bounds.bottom * this.height + 10}px`;
  }

  hideBubble() {
    clearTimeout(this.bubbleTimer);
    this.bubble?.remove();
    this.bubble = null;
  }

  private showBadge(text: string) {
    if (!this.badge) {
      this.badge = document.createElement("div");
      this.badge.className = "sb-badge";
      this.host.root.appendChild(this.badge);
      this.el.classList.add("resizing");
    }
    this.badge.textContent = text;
    this.placeBadge();
  }

  private placeBadge() {
    this.badge!.style.left = `${this.x}px`;
    this.badge!.style.top = `${this.y - this.height / 2 - 14}px`;
  }

  private hideBadge() {
    this.badge?.remove();
    this.badge = null;
    this.el.classList.remove("resizing");
  }

  // ---------------- 动画循环（只在需要时订阅 ticker） ----------------
  animate() {
    if (this.ticking) return;
    this.ticking = true;
    this.unsub = this.host.rt.ticker.add(this.tick);
  }

  private tick = (dt: number) => {
    const springs = [this.sx, this.sy, this.rot, this.jump, this.spin, this.offX, this.offY];
    for (const s of springs) s.step(dt);
    if (this.sliding) this.slide(dt);
    // 桌面互撞：滑行 / 拖拽中的贴纸与别的贴纸分离并交换动量
    if (this.host.env.collide && (this.sliding || this.dragging)) this.host.collide(this);
    this.render();
    const settled = !this.sliding && !this.down && springs.every((s) => s.settled);
    if (settled) {
      for (const s of springs) s.snap();
      this.render();
      this.ticking = false;
      this.host.rt.hit.reevaluate();
      return false;
    }
    return true;
  };

  /** 当前归一化位置 */
  position() {
    const { width: W, height: H } = this.host.rt;
    return { x: this.x / W, y: this.y / H, angle: this.rotation };
  }

  /** 放下时若有部分在屏幕外：逻辑位置立刻归位，画面用弹簧弹回 */
  private settleInside() {
    const fit = this.fit(this.x, this.y);
    if (fit.x === this.x && fit.y === this.y) return;
    this.offX.x += this.x - fit.x;
    this.offY.x += this.y - fit.y;
    this.x = fit.x;
    this.y = fit.y;
  }

  /** 把中心限制在可见区域完全留在屏幕内的范围 */
  private fit(x: number, y: number) {
    const { width: W, height: H } = this.host.rt;
    const b = this.bounds;
    const w = this.width;
    const h = this.height;
    return {
      x: clamp(x, -b.left * w, W - b.right * w),
      y: clamp(y, -b.top * h, H - b.bottom * h),
    };
  }

  /** 不碰撞的桌面模式：甩出后的摩擦滑行，撞墙挤压回弹 */
  private slide(dt: number) {
    const { width: W, height: H } = this.host.rt;
    const fr = Math.pow(0.12, dt); // 摩擦
    this.vel.x *= fr;
    this.vel.y *= fr;
    this.x += this.vel.x * dt;
    this.y += this.vel.y * dt;
    this.rotation += this.vel.x * dt * 0.0015;
    const b = this.bounds;
    const minX = -b.left * this.width;
    const maxX = W - b.right * this.width;
    const minY = -b.top * this.height;
    const maxY = H - b.bottom * this.height;
    if (this.x < minX && this.vel.x < 0) (this.x = minX), this.impact("x", Math.abs(this.vel.x), 0);
    if (this.x > maxX && this.vel.x > 0) (this.x = maxX), this.impact("x", Math.abs(this.vel.x), W);
    if (this.y < minY && this.vel.y < 0) (this.y = minY), this.impact("y", Math.abs(this.vel.y), 0);
    if (this.y > maxY && this.vel.y > 0) (this.y = maxY), this.impact("y", Math.abs(this.vel.y), H);
    if (Math.hypot(this.vel.x, this.vel.y) < 20) {
      this.sliding = false;
      this.settleInside();
      this.host.commit(this, this.position());
    }
  }

  /** 撞墙 / 撞贴纸：沿撞击方向挤压，速度大时迸出火花 */
  impact(axis: "x" | "y", speed: number, edge?: number, bounce = true) {
    if (bounce && this.sliding) this.vel[axis] *= -0.55;
    const k = Math.min(speed / 900, 6);
    if (axis === "x") {
      this.sx.v -= k;
      this.sy.v += k;
    } else {
      this.sy.v -= k;
      this.sx.v += k;
    }
    if (speed > 1400 && edge !== undefined) {
      const px = axis === "x" ? edge : this.x;
      const py = axis === "y" ? edge : this.y;
      this.host.particles.emit(px, py, { kind: "sparkle", count: 6, speed: [100, 300], angle: [0, Math.PI * 2], gravity: 0, life: [0.3, 0.6] });
    }
    this.animate();
  }

  dispose() {
    this.unsub?.();
    this.ticking = false;
    this.gestureStop?.();
    this.hideBubble();
    this.hideBadge();
    this.poses.dispose();
    this.disposeMedia();
    this.el.remove();
  }
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
