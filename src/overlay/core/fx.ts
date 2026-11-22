/**
 * 全屏特效 / 恶作剧 模块的统一契约。
 * 新增内容 = 写一个工厂函数并注册到对应表中，不需要改动运行时（PRD 6.5 扩展原则）。
 */
import type { DistortKind, EffectKind, PlayOptions, PrankKind } from "../../shared/protocol";
import type { CanvasLayer, FxEntity } from "./layer";
import type { ParticleSystem } from "./particles";
import type { Runtime } from "./runtime";

/** 模块之间的联动（如：导弹 -> 爆炸 -> 屏幕震荡 -> 裂痕） */
export interface FxBus {
  distort(kind: DistortKind, options?: PlayOptions): void;
  prank(kind: PrankKind, options?: PlayOptions): void;
  effect(kind: EffectKind, options?: PlayOptions): void;
}

export interface FxContext {
  rt: Runtime;
  /** 实体所在图层（特效 -> fx 图层；恶作剧 -> scene 图层） */
  layer: CanvasLayer;
  /** fx 图层上的共享粒子系统 */
  particles: ParticleSystem;
  options: PlayOptions;
  bus: FxBus;
}

export type FxFactory = (ctx: FxContext) => FxEntity;
