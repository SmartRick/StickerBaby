import type { Mood, Style, Subject } from "@/lib/taxonomy";

/**
 * A pack is the browsing / collecting unit: every character belongs to exactly
 * one pack. Add a new sheet as a new pack instead of adding a new top-level
 * category.
 */
export interface StickerPack {
  id: string;
  /** Full name, used in titles and the preview panel. */
  title: string;
  /** Compact label for tight spots (tiles, chips, menus). */
  short: string;
  tagline: string;
  /** One sticker used as the pack thumbnail fallback. */
  coverStickerId: string;
  subject: Subject;
  style: Style;
  mood: Mood;
  accent: string;
  glow: string;
  tags: string[];
}

export const PACKS: StickerPack[] = [
  {
    id: "classic-playful",
    title: "萌趣伙伴",
    short: "萌趣",
    tagline: "圆滚滚的日常搭子",
    coverStickerId: "tabby-cat",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    accent: "#ffe9c9",
    glow: "rgba(255, 191, 122, 0.42)",
    tags: ["萌宠", "日常", "治愈"],
  },
  {
    id: "classic-forest",
    title: "森林伙伴",
    short: "森林",
    tagline: "慢悠悠的森林朋友",
    coverStickerId: "fox",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    accent: "#e6f4e7",
    glow: "rgba(142, 202, 155, 0.4)",
    tags: ["森林", "萌宠", "治愈"],
  },
  {
    id: "classic-cozy",
    title: "软萌伙伴",
    short: "软萌",
    tagline: "软乎乎，暖洋洋",
    coverStickerId: "koala",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    accent: "#ffeef0",
    glow: "rgba(255, 166, 186, 0.4)",
    tags: ["萌宠", "软萌", "治愈"],
  },
  {
    id: "classic-ocean",
    title: "海洋伙伴",
    short: "海洋",
    tagline: "带着海风的拥抱",
    coverStickerId: "whale",
    subject: "animal",
    style: "illustration-2d",
    mood: "calm",
    accent: "#e2f2ff",
    glow: "rgba(106, 181, 255, 0.42)",
    tags: ["海洋", "萌宠", "治愈"],
  },
  {
    id: "playful-pets",
    title: "俏皮萌宠",
    short: "俏皮",
    tagline: "猫狗的小脾气",
    coverStickerId: "playful-pets-1",
    subject: "animal",
    style: "crayon",
    mood: "funny",
    accent: "#fff3df",
    glow: "rgba(246, 190, 102, 0.4)",
    tags: ["猫狗", "俏皮", "表情"],
  },
  {
    id: "happy-pets",
    title: "欢乐萌宠",
    short: "欢乐",
    tagline: "猫狗一起犯傻",
    coverStickerId: "happy-pets-1",
    subject: "animal",
    style: "colored-pencil",
    mood: "healing",
    accent: "#fff1e0",
    glow: "rgba(255, 183, 120, 0.42)",
    tags: ["猫狗", "欢乐", "治愈"],
  },
  {
    id: "doodle-pets",
    title: "涂鸦萌宠",
    short: "涂鸦",
    tagline: "随手画出来的小可爱",
    coverStickerId: "doodle-pets-1",
    subject: "animal",
    style: "doodle",
    mood: "funny",
    accent: "#fff8e8",
    glow: "rgba(246, 205, 126, 0.38)",
    tags: ["猫狗", "涂鸦", "搞怪"],
  },
  {
    id: "colored-pencil-pets",
    title: "彩铅萌宠",
    short: "彩铅",
    tagline: "铅笔尖上的小表情",
    coverStickerId: "colored-pencil-pets-1",
    subject: "animal",
    style: "colored-pencil",
    mood: "funny",
    accent: "#fff1e0",
    glow: "rgba(255, 183, 120, 0.42)",
    tags: ["彩铅", "动物", "表情"],
  },
  {
    id: "crayon-pets",
    title: "蜡笔萌宠",
    short: "蜡笔",
    tagline: "软蜡笔的毛茸茸",
    coverStickerId: "crayon-pets-1",
    subject: "animal",
    style: "crayon",
    mood: "healing",
    accent: "#fff6e4",
    glow: "rgba(246, 190, 102, 0.4)",
    tags: ["蜡笔", "动物", "治愈"],
  },
  {
    id: "hand-drawn-forest",
    title: "手绘森林",
    short: "手绘",
    tagline: "森林里的小小邻居",
    coverStickerId: "hand-drawn-forest-1",
    subject: "animal",
    style: "hand-drawn",
    mood: "healing",
    accent: "#f3f0e9",
    glow: "rgba(177, 162, 142, 0.36)",
    tags: ["手绘", "森林", "动物"],
  },
  {
    id: "watercolor-animals",
    title: "水彩动物",
    short: "水彩",
    tagline: "水彩晕开的小世界",
    coverStickerId: "watercolor-animals-1",
    subject: "animal",
    style: "watercolor",
    mood: "healing",
    accent: "#e9f7ff",
    glow: "rgba(112, 186, 240, 0.4)",
    tags: ["水彩", "动物", "治愈"],
  },
  {
    id: "pastel-animals",
    title: "粉彩动物",
    short: "粉彩",
    tagline: "软绵绵的粉彩色",
    coverStickerId: "pastel-animals-1",
    subject: "animal",
    style: "pastel",
    mood: "healing",
    accent: "#fff1f5",
    glow: "rgba(255, 166, 190, 0.4)",
    tags: ["粉彩", "动物", "治愈"],
  },
  {
    id: "pastel-crayon",
    title: "粉彩蜡笔",
    short: "粉彩",
    tagline: "甜甜的蜡笔小动物",
    coverStickerId: "pastel-crayon-1",
    subject: "animal",
    style: "pastel",
    mood: "healing",
    accent: "#fff1f5",
    glow: "rgba(255, 166, 190, 0.4)",
    tags: ["粉彩", "蜡笔", "动物"],
  },
  {
    id: "funny-animals",
    title: "搞怪动物",
    short: "搞怪",
    tagline: "表情管理失败现场",
    coverStickerId: "funny-animals-1",
    subject: "animal",
    style: "crayon",
    mood: "funny",
    accent: "#fff6e4",
    glow: "rgba(246, 190, 102, 0.4)",
    tags: ["搞怪", "动物", "表情"],
  },
  {
    id: "zoo-friends",
    title: "动物乐园",
    short: "乐园",
    tagline: "动物园里的一天",
    coverStickerId: "zoo-friends-1",
    subject: "animal",
    style: "crayon",
    mood: "energetic",
    accent: "#fff4dc",
    glow: "rgba(255, 198, 90, 0.4)",
    tags: ["动物园", "乐园", "动物"],
  },
  {
    id: "forest-picnic",
    title: "森林野餐",
    short: "野餐",
    tagline: "带点吃的去森林",
    coverStickerId: "forest-picnic-1",
    subject: "animal",
    style: "crayon",
    mood: "healing",
    accent: "#eef8f1",
    glow: "rgba(137, 202, 156, 0.38)",
    tags: ["森林", "野餐", "动物"],
  },
  {
    id: "office-emotions",
    title: "打工人情绪",
    short: "打工人",
    tagline: "今天也在努力上班",
    coverStickerId: "office-emotions-1",
    subject: "character",
    style: "hand-drawn",
    mood: "tired",
    accent: "#f3f0e9",
    glow: "rgba(177, 162, 142, 0.36)",
    tags: ["打工人", "职场", "摸鱼", "文字"],
  },
  {
    id: "office-daily",
    title: "职场日常",
    short: "日常",
    tagline: "上班的六个瞬间",
    coverStickerId: "office-daily-1",
    subject: "character",
    style: "hand-drawn",
    mood: "funny",
    accent: "#fff3ed",
    glow: "rgba(238, 165, 130, 0.36)",
    tags: ["职场", "打工人", "日常", "文字"],
  },
  {
    id: "office-cute",
    title: "萌系职场",
    short: "萌系",
    tagline: "软萌打工人的一天",
    coverStickerId: "office-cute-1",
    subject: "character",
    style: "hand-drawn",
    mood: "tired",
    accent: "#fff0f4",
    glow: "rgba(255, 164, 186, 0.4)",
    tags: ["职场", "打工人", "萌系", "文字"],
  },
];

export const PACK_BY_ID = new Map(PACKS.map((pack) => [pack.id, pack]));

export function packOf(sticker: { packId: string }): StickerPack | undefined {
  return PACK_BY_ID.get(sticker.packId);
}

export function packTitle(packId: string): string {
  return packId === "created" ? "我的创作" : PACK_BY_ID.get(packId)?.title ?? "未分组";
}

export function packShort(packId: string): string {
  return packId === "created" ? "我的创作" : PACK_BY_ID.get(packId)?.short ?? "未分组";
}
