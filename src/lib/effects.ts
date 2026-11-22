import {
  Carrot,
  Cherry,
  Droplet,
  Fish,
  Heart,
  Leaf,
  Music2,
  PawPrint,
  Snowflake,
  Star,
} from "lucide-react";
import { STICKER_BY_ID } from "@/lib/stickers";
import type { Mood } from "@/lib/taxonomy";
import type { ParticleKind } from "@/shared/protocol";

export type PetEffect =
  | "fish"
  | "paw"
  | "leaf"
  | "carrot"
  | "snow"
  | "bubble"
  | "star"
  | "heart"
  | "berry"
  | "note";

export const EFFECT_META: Record<PetEffect, { icon: typeof Heart; color: string }> = {
  fish: { icon: Fish, color: "#63a9e8" },
  paw: { icon: PawPrint, color: "#e8a23d" },
  leaf: { icon: Leaf, color: "#6cb97a" },
  carrot: { icon: Carrot, color: "#f08a3c" },
  snow: { icon: Snowflake, color: "#78b8ef" },
  bubble: { icon: Droplet, color: "#62c6e6" },
  star: { icon: Star, color: "#f4c24c" },
  heart: { icon: Heart, color: "#ff8fa3" },
  berry: { icon: Cherry, color: "#e56b8a" },
  note: { icon: Music2, color: "#a883f0" },
};

const EFFECT_BY_STICKER: Record<string, PetEffect> = {
  "tabby-cat": "fish",
  shiba: "paw",
  panda: "leaf",
  rabbit: "carrot",
  penguin: "snow",
  otter: "bubble",
  lion: "star",
  elephant: "bubble",
  giraffe: "leaf",
  koala: "leaf",
  pig: "heart",
  sheep: "heart",
  fox: "star",
  deer: "leaf",
  raccoon: "berry",
  hedgehog: "leaf",
  squirrel: "star",
  owl: "note",
  whale: "bubble",
  clownfish: "bubble",
  octopus: "heart",
  dolphin: "bubble",
  crab: "bubble",
  starfish: "star",
};

/**
 * Pack-level fallback so future sheets get a sensible effect without a manual
 * entry per sticker. Per-sticker overrides always win.
 */
const EFFECT_BY_PACK: Record<string, PetEffect> = {
  "classic-playful": "paw",
  "classic-forest": "leaf",
  "classic-cozy": "heart",
  "classic-ocean": "bubble",
  "playful-pets": "paw",
  "happy-pets": "paw",
  "doodle-pets": "star",
  "colored-pencil-pets": "star",
  "crayon-pets": "leaf",
  "hand-drawn-forest": "leaf",
  "watercolor-animals": "bubble",
  "pastel-animals": "heart",
  "pastel-crayon": "heart",
  "funny-animals": "star",
  "zoo-friends": "star",
  "forest-picnic": "leaf",
  "office-emotions": "note",
  "office-daily": "note",
  "office-cute": "note",
};

const EFFECT_BY_MOOD: Record<Mood, PetEffect> = {
  healing: "heart",
  cute: "heart",
  funny: "star",
  tired: "note",
  energetic: "star",
  calm: "bubble",
  festive: "star",
};

export function effectForSticker(id: string): PetEffect {
  const direct = EFFECT_BY_STICKER[id];
  if (direct) return direct;
  const sticker = STICKER_BY_ID.get(id);
  if (!sticker) return "heart";
  return EFFECT_BY_PACK[sticker.packId] ?? EFFECT_BY_MOOD[sticker.mood];
}

/** 桌面贴纸被点击 / 抚摸时喷出的粒子（悬浮层粒子系统里的 3D 图标） */
const PARTICLES_BY_EFFECT: Record<PetEffect, ParticleKind[]> = {
  fish: ["fishbone", "bubble"],
  paw: ["paw", "bone"],
  leaf: ["leaf", "petal"],
  carrot: ["leaf", "heart"],
  snow: ["snowflake", "ice"],
  bubble: ["bubble", "drop"],
  star: ["star", "sparkle"],
  heart: ["heart", "sparkle"],
  berry: ["heart", "flower"],
  note: ["note", "sparkle"],
};

export function particlesForSticker(id: string): ParticleKind[] {
  if (STICKER_BY_ID.get(id)?.kind === "video") return ["note", "heart"];
  return PARTICLES_BY_EFFECT[effectForSticker(id)];
}
