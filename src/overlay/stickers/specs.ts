/**
 * 共享状态（桌面实例 PetInstance）+ 贴纸目录 → 悬浮层贴纸描述 StickerSpec。
 * 同一款贴纸的姿势列表按 stickerId 缓存，保证引用稳定（变化检测靠引用比较）。
 */
import { characterOf } from "@/lib/characters";
import { nativeStickerUrl } from "@/lib/created-stickers";
import { particlesForSticker } from "@/lib/effects";
import { packTitle } from "@/lib/packs";
import { getStickerGesture } from "@/lib/sticker-gestures";
import { STATE_LABEL, stickerSrc, type Sticker } from "@/lib/stickers";
import type { PetInstance } from "@/lib/store";
import type { ParticleKind } from "@/shared/protocol";
import type { PoseVariant } from "./poses";
import type { StickerSpec } from "./sticker";

const posesCache = new Map<string, PoseVariant[]>();
const videoCache = new Map<string, StickerSpec["video"]>();

function posesFor(sticker: Sticker): PoseVariant[] {
  const key = `${sticker.id}|${sticker.created?.path ?? ""}`;
  let poses = posesCache.get(key);
  if (!poses) {
    const variants = characterOf(sticker)?.variants ?? [sticker];
    poses = variants.map((v) => ({
      state: v.state,
      src: v.created?.path ? nativeStickerUrl(v.created.path) : stickerSrc(v.id),
      phrase: v.phrase,
    }));
    posesCache.set(key, poses);
  }
  return poses;
}

function videoFor(sticker: Sticker, pet: PetInstance): StickerSpec["video"] {
  if (!sticker.video) return undefined;
  const chroma = pet.chroma !== undefined ? pet.chroma : sticker.video.chroma;
  const key = `${sticker.video.src}|${JSON.stringify(chroma)}`;
  let v = videoCache.get(key);
  if (!v) {
    v = { src: sticker.video.src, chroma };
    videoCache.set(key, v);
  }
  return v;
}

export function buildSpec(pet: PetInstance, sticker: Sticker, typeParticles?: ParticleKind[]): StickerSpec {
  const character = characterOf(sticker);
  const base = character?.defaultVariant ?? sticker;
  const kind = sticker.kind === "video" ? "视频贴纸" : sticker.kind === "animated" ? "动态贴纸" : "静态贴纸";
  const multi = (character?.variants.length ?? 1) > 1;
  return {
    id: pet.id,
    stickerId: base.id,
    characterId: base.characterId,
    name: base.name,
    subtitle: `${multi ? STATE_LABEL[pet.pose ?? "default"] : kind} · ${packTitle(base.packId)}`,
    poses: posesFor(base),
    thumb: base.kind === "video" && base.created ? "" : stickerSrc(base.id) || posesFor(base)[0].src,
    pinned: pet.pose,
    riveSrc: base.riveSrc,
    video: videoFor(base, pet),
    x: pet.x,
    y: pet.y,
    scale: pet.scale,
    angle: pet.angle ?? 0,
    z: pet.z,
    locked: Boolean(pet.passthrough),
    flipped: Boolean(pet.flipped),
    gesture: getStickerGesture(pet.gesture),
    // 单张覆盖 > 这款贴纸的默认 > 按主题自动
    particles: pet.particles?.length ? pet.particles : typeParticles?.length ? typeParticles : particlesForSticker(base.id),
    phrase: base.phrase,
  };
}

const KEYS: (keyof StickerSpec)[] = [
  "stickerId", "name", "subtitle", "poses", "pinned", "riveSrc", "video",
  "x", "y", "scale", "angle", "z", "locked", "flipped", "gesture", "phrase", "particles",
];

export function diffSpec(a: StickerSpec, b: StickerSpec): Set<keyof StickerSpec> {
  const out = new Set<keyof StickerSpec>();
  for (const k of KEYS) if (a[k] !== b[k]) out.add(k);
  return out;
}
