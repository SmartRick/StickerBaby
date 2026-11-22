/**
 * 主界面 <-> 悬浮层 通信协议（玩法指令与运行状态）。
 *
 *   emitTo(layer, EV.command, cmd)   发送指令（见 src/lib/overlay-client.ts）
 *   listen(EV.state, ...)            接收置顶层当前运行中的特效 / 恶作剧 / 扰动
 *
 * 贴纸的摆放、锁定、模式等持久状态不走这里，而是通过共享状态（src/lib/store.ts）同步，
 * 两个悬浮层各自订阅；窗口扰动等系统能力直接 invoke Rust 命令。
 */

export const EV = {
  /** 面板 -> 悬浮层：OverlayCommand */
  command: "sb://cmd",
  /** 悬浮层 -> 所有窗口：OverlayStateSnapshot */
  state: "sb://state",
  /** Rust -> 悬浮层：全局光标（悬浮层 CSS 像素坐标） */
  cursor: "sb://cursor",
  /** Rust -> 所有窗口：一键清场（Ctrl+Alt+Q） */
  panic: "sb://panic",
  /** Rust -> 所有窗口：悬浮层整体隐藏 / 显示（Ctrl+Alt+F12） */
  hidden: "sb://overlay-hidden",
  /** Rust -> 悬浮层：悬浮层所在屏幕变化 */
  overlayInfo: "sb://overlay-info",
} as const;

export type ParticleKind =
  | "heart"
  | "star"
  | "bubble"
  | "petal"
  | "snowflake"
  | "sparkle"
  | "bone"
  | "paw"
  | "coin"
  | "fishbone"
  | "leaf"
  | "ice"
  | "confetti"
  | "glow"
  // 图片粒子（public/assets/particles、emoji3d）
  | "drop"
  | "bubble-bone"
  | "sparkle-purple"
  | "ribbon"
  | "streamer"
  | "gift"
  | "gem"
  | "moon"
  | "fire"
  | "lightning"
  | "cloud"
  | "flower"
  | "butterfly"
  | "bee"
  | "shell"
  | "lips"
  | "note"
  | "tornado"
  | "bell";

/** 屏幕恶作剧 / 可移动的全屏桌面层 */
export type PrankKind =
  // 屏幕异常
  | "crack"
  | "shatter"
  | "stain"
  | "glitch-screen"
  | "graffiti"
  | "tape"
  // 恐怖元素
  | "horror-blood"
  | "horror-eyes"
  | "horror-hands"
  | "horror-ghost"
  | "horror-scrawl"
  // 系统故障
  | "error-popups"
  | "panda-virus"
  // 爬行类
  | "centipede"
  | "millipede"
  | "cockroach"
  | "maggot"
  | "gecko"
  | "fly"
  | "ant"
  // 观赏类
  | "goldfish"
  | "butterfly";

/** 全屏特效：once 一次性播放后自动结束；ambient 常驻直到关闭 */
export type EffectKind =
  | "fireworks"
  | "coin-rain"
  | "money-rain"
  | "money-burst"
  | "money-gun"
  | "meteor-shower"
  | "heart-rain"
  | "magic"
  | "smoke"
  | "confetti"
  | "missile"
  | "ingot-rain"
  | "ultraman"
  | "ultraman-tiga"
  | "hacker"
  | "tv-static"
  | "snow"
  | "rain"
  | "thunderstorm"
  | "sakura"
  | "fireflies"
  // 桌面环境（WebGL 着色器，常驻）
  | "fire"
  | "flood"
  | "freeze"
  | "sandstorm"
  | "ripple";

/** 屏幕扰动（基于截屏 + WebGL 着色器的视觉模拟） */
export type DistortKind =
  | "shake"
  | "explosion-shake"
  | "sway"
  | "bob"
  | "tilt"
  | "wave"
  | "bulge"
  | "stretch"
  | "swirl"
  | "rgb-shift"
  | "tear"
  | "noise"
  | "flash"
  | "digital-glitch"
  | "flip"
  | "color-shift"
  | "blur";

/** 窗口扰动（Rust 真实移动其他应用窗口） */
export type WindowFxKind = "shake" | "bounce" | "offset" | "wobble";
export type WindowFxTarget = "foreground" | "all";

/** 绿幕抠像参数（视频贴纸） */
export interface ChromaKey {
  /** 0..1 RGB */
  color: [number, number, number];
  /** 颜色相似度阈值，越大抠得越多 */
  similarity: number;
  /** 边缘羽化 */
  smoothness: number;
  /** 去溢色范围（超出 similarity 的这段距离内对残留绿色去饱和） */
  spill: number;
}

export interface PlayOptions {
  durationMs?: number;
  /** 0..1 */
  intensity?: number;
  /** 指定位置（CSS 像素），不传则随机 / 全屏 */
  x?: number;
  y?: number;
  count?: number;
}

export type OverlayCommand =
  /** 让桌面上的某张贴纸播放手势互动（不传 gesture 用它自己的中键动作） */
  | { type: "sticker.gesture"; petId: string; gesture?: string }
  /** 让桌面上的某张贴纸做一次点击反馈（Q 弹 + 粒子 + 气泡） */
  | { type: "sticker.react"; petId: string }
  | { type: "prank.start"; kind: PrankKind; options?: PlayOptions }
  | { type: "prank.stop"; id?: string; kind?: PrankKind }
  | { type: "effect.play"; kind: EffectKind; options?: PlayOptions }
  | { type: "effect.stop"; id?: string; kind?: EffectKind }
  | { type: "distort.play"; kind: DistortKind; options?: PlayOptions }
  | { type: "combo.play"; kind: "missile-strike"; options?: PlayOptions }
  | { type: "clear.all" }
  | { type: "state.request" };

export interface RunningItem<K extends string> {
  id: string;
  kind: K;
}

export interface OverlayStateSnapshot {
  pranks: RunningItem<PrankKind>[];
  effects: RunningItem<EffectKind>[];
  distorting: DistortKind | null;
}
