/**
 * 点击粒子目录（主界面用）：与悬浮层粒子系统共用同一套 3D 图标图集。
 */
import { IMAGE_SPRITES } from "@/overlay/core/sprites";
import type { ParticleKind } from "@/shared/protocol";

export const PARTICLE_LABEL: Partial<Record<ParticleKind, string>> = {
  heart: "爱心",
  star: "星星",
  sparkle: "闪光",
  "sparkle-purple": "紫色闪光",
  bubble: "泡泡",
  drop: "水滴",
  petal: "花瓣",
  flower: "小花",
  leaf: "叶子",
  snowflake: "雪花",
  ice: "冰晶",
  paw: "猫爪",
  bone: "骨头",
  "bubble-bone": "骨头泡泡",
  fishbone: "鱼骨头",
  coin: "金币",
  gem: "宝石",
  gift: "礼物",
  ribbon: "彩带",
  streamer: "拉花",
  moon: "月亮",
  cloud: "云朵",
  fire: "火焰",
  lightning: "闪电",
  tornado: "旋风",
  butterfly: "蝴蝶",
  bee: "蜜蜂",
  shell: "贝壳",
  lips: "亲亲",
  note: "音符",
  bell: "铃铛",
};

/** 可选的粒子（都有图集里的图片） */
export const PARTICLE_OPTIONS = (Object.keys(PARTICLE_LABEL) as ParticleKind[]).filter((kind) => IMAGE_SPRITES[kind]);

export const MAX_PARTICLES = 4;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const atlases = new Map<string, Promise<{ image: HTMLImageElement; frames: Frame[] }>>();

function loadAtlas(name: string) {
  let p = atlases.get(name);
  if (!p) {
    p = (async () => {
      const meta = (await (await fetch(`/assets/${name}.json`)).json()) as { image: string; frames: Frame[] };
      const image = new Image();
      image.src = `/assets/${meta.image}`;
      await image.decode();
      return { image, frames: meta.frames };
    })();
    atlases.set(name, p);
  }
  return p;
}

/** 把粒子图标画到 canvas 上 */
export async function drawParticle(canvas: HTMLCanvasElement, kind: ParticleKind) {
  const def = IMAGE_SPRITES[kind];
  if (!def) return;
  const { image, frames } = await loadAtlas(def[0]);
  const f = frames[def[1]];
  const ctx = canvas.getContext("2d");
  if (!f || !ctx) return;
  const size = canvas.width;
  const s = size / Math.max(f.w, f.h);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, f.x, f.y, f.w, f.h, (size - f.w * s) / 2, (size - f.h * s) / 2, f.w * s, f.h * s);
}
