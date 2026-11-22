/**
 * 多状态角色的姿势切换（同一张贴纸的不同状态图）。
 *
 * 优先级：被拖拽 > 点击反应（眨眼 / 爱心 / 惊醒，1.6s） > 右键固定的状态 > 闲置状态 > 默认。
 * 闲置 15 / 45 / 90 秒依次趴下、打瞌睡、睡觉；任何互动都会重置闲置计时。
 * 角色没有提供的状态一律回退到默认图。
 */
import type { StickerState } from "@/lib/stickers";

export interface PoseVariant {
  state: StickerState;
  src: string;
  phrase: string;
}

const IDLE_SCHEDULE = [
  { state: "idle", delay: 15_000 },
  { state: "nap", delay: 45_000 },
  { state: "sleep", delay: 90_000 },
] as const satisfies readonly { state: StickerState; delay: number }[];

const REACTION_MS = 1_600;
const QUICK_POSES: StickerState[] = ["drag", "wink", "surprise", "love"];

export class PoseController {
  private dragging = false;
  private reaction: StickerState | undefined;
  private idle: StickerState | undefined;
  private lastClick = 0;
  private timers: number[] = [];
  private reactionTimer = 0;
  private current: PoseVariant;

  constructor(
    private variants: PoseVariant[],
    private pinned: StickerState | undefined,
    private onChange: (pose: PoseVariant) => void,
  ) {
    this.current = this.resolve();
    this.scheduleIdle();
    // 预加载常用的反应姿势，切换时不闪
    for (const v of variants) if (QUICK_POSES.includes(v.state)) new Image().src = v.src;
  }

  get multiple() {
    return this.variants.length > 1;
  }

  get shown() {
    return this.current;
  }

  get list() {
    return this.variants;
  }

  get pinnedState() {
    return this.pinned;
  }

  private find(state: StickerState | undefined) {
    return state ? this.variants.find((v) => v.state === state) : undefined;
  }

  private base() {
    return this.find("default") ?? this.variants[0];
  }

  private resolve(): PoseVariant {
    return (
      (this.dragging ? this.find("drag") : undefined) ??
      this.find(this.reaction) ??
      this.find(this.pinned) ??
      this.find(this.idle) ??
      this.base()
    );
  }

  private refresh() {
    const next = this.resolve();
    if (next !== this.current) {
      this.current = next;
      this.onChange(next);
    }
  }

  private scheduleIdle() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (!this.multiple || this.pinned || this.dragging) return;
    for (const { state, delay } of IDLE_SCHEDULE) {
      if (!this.find(state)) continue;
      this.timers.push(
        window.setTimeout(() => {
          this.idle = state;
          this.refresh();
        }, delay),
      );
    }
  }

  private wake() {
    this.idle = undefined;
    this.scheduleIdle();
  }

  setVariants(variants: PoseVariant[], pinned: StickerState | undefined) {
    this.variants = variants;
    this.pinned = pinned;
    this.reaction = undefined;
    this.wake();
    this.refresh();
  }

  setPinned(state: StickerState | undefined) {
    if (state === this.pinned) return;
    this.pinned = state;
    this.reaction = undefined;
    this.wake();
    this.refresh();
  }

  enterDrag() {
    if (!this.multiple) return;
    clearTimeout(this.reactionTimer);
    this.reaction = undefined;
    this.dragging = true;
    this.wake();
    this.refresh();
  }

  endDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.wake();
    this.refresh();
  }

  /** 点击反应：睡着时惊醒，连点抱爱心，否则眨眼；返回用到的姿势（用于气泡台词） */
  react(): PoseVariant | undefined {
    if (!this.multiple) return undefined;
    const now = Date.now();
    const sleepy = IDLE_SCHEDULE.some(({ state }) => state === (this.pinned ?? this.idle));
    const choice: StickerState =
      sleepy && this.find("surprise")
        ? "surprise"
        : now - this.lastClick < 550 && this.find("love")
          ? "love"
          : this.find("wink")
            ? "wink"
            : "happy";
    this.lastClick = now;
    const pose = this.find(choice);
    this.wake();
    clearTimeout(this.reactionTimer);
    this.reaction = pose?.state;
    if (pose) this.reactionTimer = window.setTimeout(() => {
      this.reaction = undefined;
      this.refresh();
    }, REACTION_MS);
    this.refresh();
    return pose;
  }

  /** 普通互动（悬停、抚摸）只重置闲置计时 */
  touch() {
    if (this.idle) {
      this.wake();
      this.refresh();
    }
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    clearTimeout(this.reactionTimer);
  }
}
