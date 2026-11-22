import { PACKS } from "@/lib/packs";
import type { Mood, Style, Subject } from "@/lib/taxonomy";

import type { ChromaKey } from "@/shared/protocol";

/** static 静态图；animated Rive 动态；video 视频（可绿幕抠像） */
export type StickerKind = "static" | "animated" | "video";

/**
 * One character can ship several poses. The library groups them into a single
 * card; the desktop swaps poses by behavior (sleeping, dragged, peeking...).
 */
export type StickerState =
  | "default"
  | "idle"
  | "sleep"
  | "peek"
  | "drag"
  | "happy"
  | "walk"
  | "wave"
  | "wink"
  | "surprise"
  | "love"
  | "nap"
  | "work"
  | "snack"
  | "drink"
  | "music";

export const STATE_LABEL: Record<StickerState, string> = {
  default: "默认",
  idle: "发呆",
  sleep: "睡觉",
  peek: "趴边",
  drag: "被拖拽",
  happy: "开心",
  walk: "走动",
  wave: "招手",
  wink: "眨眼",
  surprise: "惊醒",
  love: "抱爱心",
  nap: "打瞌睡",
  work: "工作",
  snack: "吃饼干",
  drink: "喝奶茶",
  music: "听音乐",
};

export const STATE_ORDER: StickerState[] = [
  "default", "wave", "wink", "surprise", "love", "happy",
  "idle", "nap", "sleep", "peek", "drag", "walk",
  "work", "snack", "drink", "music",
];

export interface Sticker {
  /** Variant-level id, also the default asset basename. */
  id: string;
  assetId?: string;
  created?: { path?: string };
  /** Shared id for every pose of the same character. */
  characterId: string;
  state: StickerState;
  name: string;
  en: string;
  /** Exactly one pack. */
  packId: string;
  subject: Subject;
  style: Style;
  mood: Mood;
  /** Free-form search words: species, props, seasons, vibes. */
  tags: string[];
  kind: StickerKind;
  riveSrc?: string;
  /** 视频贴纸：站内路径或本地绝对路径 + 抠像参数 */
  video?: { src: string; chroma: ChromaKey | null; poster?: string };
  phrase: string;
  accent: string;
  glow: string;
}

type StickerBase = Omit<Sticker, "characterId" | "state" | "kind" | "riveSrc">;

/**
 * The original 24 stickers. Eighteen of their images were re-cut by the user
 * and keep the same ids, so pets and effects stay stable.
 */
const CLASSIC_STICKERS: StickerBase[] = [
  // 萌趣伙伴
  {
    id: "tabby-cat",
    name: "起司猫",
    en: "Tabby",
    packId: "classic-playful",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["猫", "橘猫", "蹭蹭", "萌宠"],
    phrase: "喵～今天也蹭蹭你！",
    accent: "#fff0dd",
    glow: "rgba(255, 191, 122, 0.45)",
  },
  {
    id: "shiba",
    name: "柴犬丸",
    en: "Shiba",
    packId: "classic-playful",
    subject: "animal",
    style: "illustration-2d",
    mood: "energetic",
    tags: ["柴犬", "狗", "元气", "夸奖"],
    phrase: "汪！你超棒的 ✨",
    accent: "#fff2dc",
    glow: "rgba(255, 178, 96, 0.5)",
  },
  {
    id: "panda",
    name: "团团",
    en: "Panda",
    packId: "classic-playful",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    tags: ["熊猫", "竹子", "分享", "抱抱"],
    phrase: "竹子分你一半，好不好？",
    accent: "#eaf6ec",
    glow: "rgba(142, 202, 155, 0.42)",
  },
  {
    id: "rabbit",
    name: "萝卜兔",
    en: "Rabbit",
    packId: "classic-playful",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["兔子", "胡萝卜", "抱抱", "春天"],
    phrase: "胡萝卜味的抱抱！",
    accent: "#fff0ec",
    glow: "rgba(255, 166, 150, 0.42)",
  },
  {
    id: "penguin",
    name: "企鹅布丁",
    en: "Penguin",
    packId: "classic-playful",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["企鹅", "围巾", "冬天", "保暖"],
    phrase: "围巾暖乎乎的，你也要保暖哦。",
    accent: "#eaf3ff",
    glow: "rgba(122, 174, 255, 0.45)",
  },
  {
    id: "otter",
    name: "海獭可可",
    en: "Otter",
    packId: "classic-playful",
    subject: "animal",
    style: "illustration-2d",
    mood: "calm",
    tags: ["海獭", "小鱼", "抱抱", "海洋"],
    phrase: "抱紧小鱼，也抱紧你。",
    accent: "#f6ecdf",
    glow: "rgba(190, 143, 99, 0.38)",
  },

  // 森林伙伴
  {
    id: "fox",
    name: "小狐狸",
    en: "Fox",
    packId: "classic-forest",
    subject: "animal",
    style: "illustration-2d",
    mood: "energetic",
    tags: ["狐狸", "好运", "偷偷", "森林"],
    phrase: "偷偷把好运塞给你！",
    accent: "#fff0e2",
    glow: "rgba(255, 146, 74, 0.42)",
  },
  {
    id: "deer",
    name: "花鹿鹿",
    en: "Deer",
    packId: "classic-forest",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    tags: ["鹿", "花瓣", "春天", "森林"],
    phrase: "花瓣落在你的肩膀上了。",
    accent: "#fff3e6",
    glow: "rgba(238, 175, 118, 0.4)",
  },
  {
    id: "raccoon",
    name: "浣熊莓莓",
    en: "Raccoon",
    packId: "classic-forest",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["浣熊", "草莓", "贪吃", "森林"],
    phrase: "草莓要留一颗给我呀。",
    accent: "#f9eded",
    glow: "rgba(229, 128, 128, 0.4)",
  },
  {
    id: "hedgehog",
    name: "刺猬蘑菇",
    en: "Hedgehog",
    packId: "classic-forest",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["刺猬", "蘑菇", "小心", "森林"],
    phrase: "小心刺，抱的时候轻一点。",
    accent: "#f7eee7",
    glow: "rgba(193, 144, 111, 0.4)",
  },
  {
    id: "squirrel",
    name: "松鼠果果",
    en: "Squirrel",
    packId: "classic-forest",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    tags: ["松鼠", "橡果", "小确幸", "森林"],
    phrase: "把今天的小确幸存起来。",
    accent: "#fdf0e0",
    glow: "rgba(231, 168, 96, 0.42)",
  },
  {
    id: "owl",
    name: "夜猫子",
    en: "Owl",
    packId: "classic-forest",
    subject: "animal",
    style: "illustration-2d",
    mood: "tired",
    tags: ["猫头鹰", "熬夜", "夜猫子", "森林"],
    phrase: "熬夜的话，我会盯着你哦。",
    accent: "#f3eefc",
    glow: "rgba(186, 156, 235, 0.42)",
  },

  // 软萌伙伴
  {
    id: "lion",
    name: "狮子团团",
    en: "Lion",
    packId: "classic-cozy",
    subject: "animal",
    style: "illustration-2d",
    mood: "energetic",
    tags: ["狮子", "太阳", "威风", "抱抱"],
    phrase: "今天也要威风凛凛！",
    accent: "#fff1d9",
    glow: "rgba(255, 176, 73, 0.45)",
  },
  {
    id: "elephant",
    name: "小象蓝蓝",
    en: "Elephant",
    packId: "classic-cozy",
    subject: "animal",
    style: "illustration-2d",
    mood: "calm",
    tags: ["大象", "水花", "夏天", "降温"],
    phrase: "喷一点小水花给你降降温。",
    accent: "#e9f3ff",
    glow: "rgba(124, 174, 255, 0.42)",
  },
  {
    id: "giraffe",
    name: "长颈鹿点点",
    en: "Giraffe",
    packId: "classic-cozy",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    tags: ["长颈鹿", "星星", "远眺", "抱抱"],
    phrase: "站得高，看得远～",
    accent: "#fff4d9",
    glow: "rgba(255, 198, 90, 0.42)",
  },
  {
    id: "koala",
    name: "考拉抱抱",
    en: "Koala",
    packId: "classic-cozy",
    subject: "animal",
    style: "illustration-2d",
    mood: "calm",
    tags: ["考拉", "抱抱", "慢慢来", "睡觉"],
    phrase: "慢慢来，不着急。",
    accent: "#f0f2f6",
    glow: "rgba(160, 172, 194, 0.4)",
  },
  {
    id: "pig",
    name: "猪猪苹果",
    en: "Piggy",
    packId: "classic-cozy",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["猪", "苹果", "吃货", "抱抱"],
    phrase: "吃苹果的时间到啦！",
    accent: "#ffeef2",
    glow: "rgba(255, 165, 186, 0.45)",
  },
  {
    id: "sheep",
    name: "棉花羊",
    en: "Sheep",
    packId: "classic-cozy",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    tags: ["绵羊", "数羊", "睡觉", "柔软"],
    phrase: "数到第三只羊就睡着啦。",
    accent: "#fff8ec",
    glow: "rgba(238, 207, 152, 0.42)",
  },

  // 海洋伙伴
  {
    id: "whale",
    name: "蓝鲸泡泡",
    en: "Whale",
    packId: "classic-ocean",
    subject: "animal",
    style: "illustration-2d",
    mood: "calm",
    tags: ["鲸鱼", "海洋", "温柔", "泡泡"],
    phrase: "扑通——给你一整个海的温柔。",
    accent: "#e9f8ff",
    glow: "rgba(106, 181, 255, 0.48)",
  },
  {
    id: "clownfish",
    name: "小丑鱼",
    en: "Clownfish",
    packId: "classic-ocean",
    subject: "animal",
    style: "illustration-2d",
    mood: "energetic",
    tags: ["小丑鱼", "珊瑚", "海洋", "找找你"],
    phrase: "在珊瑚里找到你啦！",
    accent: "#fff0e4",
    glow: "rgba(255, 150, 77, 0.45)",
  },
  {
    id: "octopus",
    name: "章鱼水手",
    en: "Octopus",
    packId: "classic-ocean",
    subject: "animal",
    style: "illustration-2d",
    mood: "cute",
    tags: ["章鱼", "水手", "比心", "海洋"],
    phrase: "八只手也要给你比心！",
    accent: "#ffeff6",
    glow: "rgba(255, 141, 183, 0.45)",
  },
  {
    id: "dolphin",
    name: "海豚奇奇",
    en: "Dolphin",
    packId: "classic-ocean",
    subject: "animal",
    style: "illustration-2d",
    mood: "energetic",
    tags: ["海豚", "快乐", "出发", "海洋"],
    phrase: "出发去快乐岛咯！",
    accent: "#e9f6ff",
    glow: "rgba(107, 176, 255, 0.45)",
  },
  {
    id: "crab",
    name: "蟹蟹",
    en: "Crab",
    packId: "classic-ocean",
    subject: "animal",
    style: "illustration-2d",
    mood: "funny",
    tags: ["螃蟹", "横着走", "海洋", "搞怪"],
    phrase: "横着走，也要走到你身边。",
    accent: "#ffecea",
    glow: "rgba(255, 122, 104, 0.42)",
  },
  {
    id: "starfish",
    name: "海星闪闪",
    en: "Starfish",
    packId: "classic-ocean",
    subject: "animal",
    style: "illustration-2d",
    mood: "healing",
    tags: ["海星", "星星", "桌面", "海洋"],
    phrase: "把星星摘下来放在你桌上。",
    accent: "#fff6d9",
    glow: "rgba(255, 204, 84, 0.45)",
  },
];

interface NewCharacterSeed {
  id: string;
  name: string;
  en: string;
  tags: string[];
  phrase: string;
  mood?: Mood;
}

const NEW_PACK_CHARACTERS: Record<string, NewCharacterSeed[]> = {
  "playful-pets": [
    { id: "playful-pets-1", name: "俏皮橘猫", en: "Tabby", tags: ["猫", "橘猫", "大笑"], phrase: "笑一个嘛，今天也要开心！" },
    { id: "playful-pets-2", name: "哈士奇", en: "Husky", tags: ["狗", "哈士奇", "星星"], phrase: "嘿嘿，看我帅不帅？" },
    { id: "playful-pets-3", name: "胡萝卜比格", en: "Beagle", tags: ["狗", "比格", "胡萝卜"], phrase: "胡萝卜分你一口！" },
    { id: "playful-pets-4", name: "蓝巾巴哥", en: "Pug", tags: ["狗", "巴哥", "围巾"], phrase: "皱着眉，也是在撒娇。" },
    { id: "playful-pets-5", name: "气鼓白猫", en: "White Cat", tags: ["猫", "白猫", "生气"], phrase: "哼，哄我一下就好了。" },
    { id: "playful-pets-6", name: "卷毛贵宾", en: "Poodle", tags: ["狗", "贵宾", "卷毛"], phrase: "卷卷毛，也要贴贴。" },
  ],
  "happy-pets": [
    { id: "happy-pets-1", name: "抱鱼橘猫", en: "Tabby", tags: ["猫", "橘猫", "小鱼"], phrase: "这条鱼，谁都不许抢。" },
    { id: "happy-pets-2", name: "开心金毛", en: "Golden", tags: ["狗", "金毛", "开心"], phrase: "今天也要摇尾巴！" },
    { id: "happy-pets-3", name: "吐舌兔", en: "Bunny", tags: ["兔子", "吐舌", "开心"], phrase: "略略略～" },
    { id: "happy-pets-4", name: "柯基屁股", en: "Corgi", tags: ["狗", "柯基", "屁股"], phrase: "看我的小短腿！" },
    { id: "happy-pets-5", name: "糖果猫", en: "Candy Cat", tags: ["猫", "糖果", "贪吃"], phrase: "糖罐子归我啦。" },
    { id: "happy-pets-6", name: "卷纸比熊", en: "Bichon", tags: ["狗", "比熊", "捣蛋"], phrase: "纸卷！是纸卷先动的手！" },
  ],
  "doodle-pets": [
    { id: "doodle-pets-1", name: "笑眼橘猫", en: "Tabby", tags: ["猫", "橘猫", "笑眼"], phrase: "眯起眼睛，就是喜欢你。" },
    { id: "doodle-pets-2", name: "柯基屁股", en: "Corgi", tags: ["狗", "柯基", "屁股"], phrase: "小短腿也有大能量。" },
    { id: "doodle-pets-3", name: "草莓兔", en: "Berry Bunny", tags: ["兔子", "草莓", "甜"], phrase: "草莓味的抱抱！" },
    { id: "doodle-pets-4", name: "蝴蝶结猫", en: "Bow Cat", tags: ["猫", "蝴蝶结", "软萌"], phrase: "今天也要优雅地贴贴。" },
    { id: "doodle-pets-5", name: "吐舌巴哥", en: "Pug", tags: ["狗", "巴哥", "吐舌"], phrase: "舌头收不回去了，救命。" },
    { id: "doodle-pets-6", name: "纸箱猫", en: "Box Cat", tags: ["猫", "纸箱", "躲猫猫"], phrase: "箱子里最安全。" },
  ],
  "colored-pencil-pets": [
    { id: "colored-pencil-pets-1", name: "吐舌长颈鹿", en: "Giraffe", tags: ["长颈鹿", "吐舌", "搞怪"], phrase: "站得高，也要做鬼脸。" },
    { id: "colored-pencil-pets-2", name: "惊讶浣熊", en: "Raccoon", tags: ["浣熊", "惊讶", "星星"], phrase: "哇！你吓我一跳！" },
    { id: "colored-pencil-pets-3", name: "大笑河马", en: "Hippo", tags: ["河马", "大笑", "水花"], phrase: "笑到喷水花！" },
    { id: "colored-pencil-pets-4", name: "花花刺猬", en: "Hedgehog", tags: ["刺猬", "花", "软萌"], phrase: "小心，刺上开了花。" },
    { id: "colored-pencil-pets-5", name: "墨镜鳄鱼", en: "Croc", tags: ["鳄鱼", "墨镜", "酷"], phrase: "酷鳄从不回头看爆炸。" },
    { id: "colored-pencil-pets-6", name: "眨眼猫头鹰", en: "Owl", tags: ["猫头鹰", "眨眼", "爱心"], phrase: "眨眨眼，今晚也不睡。" },
  ],
  "crayon-pets": [
    { id: "crayon-pets-1", name: "抱竹小熊猫", en: "Red Panda", tags: ["小熊猫", "竹子", "抱抱"], phrase: "竹子抱紧，快乐加倍。" },
    { id: "crayon-pets-2", name: "倒挂树懒", en: "Sloth", tags: ["树懒", "倒挂", "慢慢来"], phrase: "慢一点，世界不会跑。" },
    { id: "crayon-pets-3", name: "爱心考拉", en: "Koala", tags: ["考拉", "爱心", "抱抱"], phrase: "抱抱你，送你两颗心。" },
    { id: "crayon-pets-4", name: "飞行员企鹅", en: "Pilot Penguin", tags: ["企鹅", "飞行员", "围巾"], phrase: "准备起飞，去你的桌面！" },
    { id: "crayon-pets-5", name: "火烈鸟", en: "Flamingo", tags: ["火烈鸟", "花", "优雅"], phrase: "优雅，永不过时。" },
    { id: "crayon-pets-6", name: "顶球海豹", en: "Seal", tags: ["海豹", "顶球", "开心"], phrase: "球不能掉，快乐也不能。" },
  ],
  "hand-drawn-forest": [
    { id: "hand-drawn-forest-1", name: "围巾狐狸", en: "Fox", tags: ["狐狸", "围巾", "森林"], phrase: "围巾分你一半，暖和吧？" },
    { id: "hand-drawn-forest-2", name: "花鹿", en: "Deer", tags: ["鹿", "花", "森林"], phrase: "花瓣落在你头上啦。" },
    { id: "hand-drawn-forest-3", name: "星星浣熊", en: "Raccoon", tags: ["浣熊", "星星", "森林"], phrase: "摘颗星星送给你。" },
    { id: "hand-drawn-forest-4", name: "橡果松鼠", en: "Squirrel", tags: ["松鼠", "橡果", "森林"], phrase: "橡果存起来，冬天不慌。" },
    { id: "hand-drawn-forest-5", name: "围巾猫头鹰", en: "Owl", tags: ["猫头鹰", "围巾", "森林"], phrase: "围巾和夜风，都刚刚好。" },
    { id: "hand-drawn-forest-6", name: "飞行员企鹅", en: "Penguin", tags: ["企鹅", "飞行员", "森林"], phrase: "森林上空，也能飞。" },
  ],
  "watercolor-animals": [
    { id: "watercolor-animals-1", name: "围巾企鹅", en: "Penguin", tags: ["企鹅", "围巾", "冬天"], phrase: "围巾暖乎乎，冬天也不怕。" },
    { id: "watercolor-animals-2", name: "蜂蜜小熊", en: "Bear", tags: ["小熊", "蜂蜜", "甜"], phrase: "蜂蜜沾到鼻子上了。" },
    { id: "watercolor-animals-3", name: "铃铛奶牛", en: "Cow", tags: ["奶牛", "铃铛", "农场"], phrase: "叮铃叮铃，我来啦。" },
    { id: "watercolor-animals-4", name: "飞行小鸡", en: "Chick", tags: ["小鸡", "飞行", "元气"], phrase: "扑腾扑腾，也能飞！" },
    { id: "watercolor-animals-5", name: "蝴蝶结小羊", en: "Sheep", tags: ["小羊", "蝴蝶结", "软萌"], phrase: "咩～今天也很温柔。" },
    { id: "watercolor-animals-6", name: "顶球小鲸", en: "Whale", tags: ["鲸鱼", "顶球", "水花"], phrase: "顶起一颗小星球。" },
  ],
  "pastel-animals": [
    { id: "pastel-animals-1", name: "围巾小鹿", en: "Deer", tags: ["鹿", "围巾", "粉彩"], phrase: "围巾软软的，像云一样。" },
    { id: "pastel-animals-2", name: "花花羊驼", en: "Alpaca", tags: ["羊驼", "花", "粉彩"], phrase: "花花戴头上，心情也开花。" },
    { id: "pastel-animals-3", name: "喷水小鲸", en: "Whale", tags: ["鲸鱼", "喷水", "粉彩"], phrase: "喷一口彩虹给你。" },
    { id: "pastel-animals-4", name: "粉彩蝙蝠", en: "Bat", tags: ["蝙蝠", "星星", "粉彩"], phrase: "夜晚也有粉色星星。" },
    { id: "pastel-animals-5", name: "河狸木头", en: "Beaver", tags: ["河狸", "木头", "粉彩"], phrase: "木头啃一啃，房子盖一盖。" },
    { id: "pastel-animals-6", name: "独角鲸", en: "Narwhal", tags: ["独角鲸", "星星", "粉彩"], phrase: "角尖上挂着一颗星。" },
  ],
  "pastel-crayon": [
    { id: "pastel-crayon-1", name: "草莓刺猬", en: "Hedgehog", tags: ["刺猬", "草莓", "粉彩"], phrase: "草莓分你一半，甜吧？" },
    { id: "pastel-crayon-2", name: "爱心长颈鹿", en: "Giraffe", tags: ["长颈鹿", "爱心", "粉彩"], phrase: "把爱心举高高。" },
    { id: "pastel-crayon-3", name: "西瓜鳄鱼", en: "Croc", tags: ["鳄鱼", "西瓜", "粉彩"], phrase: "夏天就要吃西瓜。" },
    { id: "pastel-crayon-4", name: "苹果浣熊", en: "Raccoon", tags: ["浣熊", "苹果", "粉彩"], phrase: "苹果脆脆的，像今天。" },
    { id: "pastel-crayon-5", name: "花花羊驼", en: "Alpaca", tags: ["羊驼", "花", "粉彩"], phrase: "今天也要美美地出门。" },
    { id: "pastel-crayon-6", name: "星星独角鲸", en: "Narwhal", tags: ["独角鲸", "星星", "粉彩"], phrase: "星星掉进海里啦。" },
  ],
  "funny-animals": [
    { id: "funny-animals-1", name: "吐舌橘猫", en: "Tabby", tags: ["猫", "橘猫", "吐舌"], phrase: "略～今天不想上班。" },
    { id: "funny-animals-2", name: "哈士奇吐舌", en: "Husky", tags: ["狗", "哈士奇", "吐舌"], phrase: "我不是傻，我是快乐。" },
    { id: "funny-animals-3", name: "大笑小猪", en: "Pig", tags: ["猪", "大笑", "搞怪"], phrase: "笑到打鸣（不是）。" },
    { id: "funny-animals-4", name: "墨镜小羊", en: "Sheep", tags: ["羊", "墨镜", "酷"], phrase: "咩格丽特夫人驾到。" },
    { id: "funny-animals-5", name: "长舌青蛙", en: "Frog", tags: ["青蛙", "吐舌", "搞怪"], phrase: "呱！舌头比心情还长。" },
    { id: "funny-animals-6", name: "大笑海獭", en: "Otter", tags: ["海獭", "大笑", "泪"], phrase: "笑到眼泪都出来了。" },
  ],
  "zoo-friends": [
    { id: "zoo-friends-1", name: "喷水小象", en: "Elephant", tags: ["大象", "喷水", "乐园"], phrase: "给你下一场小雨。" },
    { id: "zoo-friends-2", name: "太阳狮", en: "Lion", tags: ["狮子", "太阳", "乐园"], phrase: "太阳当空照，狮子对你笑。" },
    { id: "zoo-friends-3", name: "围巾斑马", en: "Zebra", tags: ["斑马", "围巾", "乐园"], phrase: "黑白配，也要暖暖的。" },
    { id: "zoo-friends-4", name: "小鸭河马", en: "Hippo", tags: ["河马", "小鸭", "乐园"], phrase: "头顶小鸭，快乐出发。" },
    { id: "zoo-friends-5", name: "水手章鱼", en: "Octopus", tags: ["章鱼", "水手", "乐园"], phrase: "八只手，一起打招呼。" },
    { id: "zoo-friends-6", name: "巨嘴鸟", en: "Toucan", tags: ["巨嘴鸟", "花", "乐园"], phrase: "大嘴巴，只说好话。" },
  ],
  "forest-picnic": [
    { id: "forest-picnic-1", name: "胡萝卜兔", en: "Bunny", tags: ["兔子", "胡萝卜", "野餐"], phrase: "胡萝卜是野餐的灵魂。" },
    { id: "forest-picnic-2", name: "西瓜企鹅", en: "Penguin", tags: ["企鹅", "西瓜", "野餐"], phrase: "西瓜和企鹅，夏天绝配。" },
    { id: "forest-picnic-3", name: "橡果臭鼬", en: "Skunk", tags: ["臭鼬", "橡果", "野餐"], phrase: "橡果藏好，不许抢。" },
    { id: "forest-picnic-4", name: "贝壳海獭", en: "Otter", tags: ["海獭", "贝壳", "野餐"], phrase: "捡到一枚小海螺。" },
    { id: "forest-picnic-5", name: "星星蝙蝠", en: "Bat", tags: ["蝙蝠", "星星", "野餐"], phrase: "白天的星星，也归我。" },
    { id: "forest-picnic-6", name: "抱鱼小熊", en: "Polar Bear", tags: ["小熊", "小鱼", "野餐"], phrase: "鱼和拥抱，都要。" },
  ],
  "office-emotions": [
    { id: "office-emotions-1", name: "好的！", en: "Okay", tags: ["打工人", "职场", "收到"], phrase: "好的！马上改！" },
    { id: "office-emotions-2", name: "摸鱼加餐", en: "Snack Break", tags: ["打工人", "摸鱼", "加餐"], phrase: "摸鱼可以，加餐必须有。" },
    { id: "office-emotions-3", name: "改第N版", en: "Revise Again", tags: ["打工人", "改稿", "崩溃"], phrase: "改到第 N 版，已经不认识字了。" },
    { id: "office-emotions-4", name: "摸鱼中", en: "Slacking", tags: ["打工人", "摸鱼", "猫"], phrase: "别问，问就是在思考。" },
    { id: "office-emotions-5", name: "辛苦了", en: "Good Job", tags: ["打工人", "辛苦", "文件"], phrase: "辛苦了，先喝口水吧。" },
    { id: "office-emotions-6", name: "电量耗尽", en: "Low Battery", tags: ["打工人", "加班", "没电"], phrase: "电量 1%，请求下班。" },
  ],
  "office-daily": [
    { id: "office-daily-1", name: "元气加油", en: "Go Go", tags: ["职场", "加油", "元气"], phrase: "加油！今天也能撑住！" },
    { id: "office-daily-2", name: "带薪摸鱼", en: "Paid Slacking", tags: ["职场", "摸鱼", "墨镜"], phrase: "带薪摸鱼，快乐加倍。" },
    { id: "office-daily-3", name: "文件堆", en: "Paper Pile", tags: ["职场", "文件", "加班"], phrase: "文件堆成山，也要一张张来。" },
    { id: "office-daily-4", name: "发工资啦", en: "Payday", tags: ["职场", "工资", "开心"], phrase: "发工资啦！先开心五分钟。" },
    { id: "office-daily-5", name: "又改?!", en: "Again", tags: ["职场", "改稿", "无语"], phrase: "又改？！好好好。" },
    { id: "office-daily-6", name: "周末zzz", en: "Weekend", tags: ["职场", "周末", "睡觉"], phrase: "周末，谁也别叫我。" },
  ],
  "office-cute": [
    { id: "office-cute-1", name: "萌系加班", en: "Overtime", tags: ["职场", "加班", "起火"], phrase: "加班到冒烟，也要保持可爱。" },
    { id: "office-cute-2", name: "搞定啦", en: "Done", tags: ["职场", "完成", "开心"], phrase: "搞定啦！可以夸我了。" },
    { id: "office-cute-3", name: "会议放空", en: "Meeting", tags: ["职场", "会议", "放空"], phrase: "会议很长，灵魂已出走。" },
    { id: "office-cute-4", name: "毯毯午睡", en: "Nap", tags: ["职场", "午睡", "毯子"], phrase: "午睡五分钟，续命两小时。" },
    { id: "office-cute-5", name: "DDL冲刺", en: "Deadline", tags: ["职场", "DDL", "冲刺"], phrase: "DDL 在追，我在跑。" },
    { id: "office-cute-6", name: "音乐续命", en: "Music", tags: ["职场", "音乐", "咖啡"], phrase: "耳机一戴，继续战斗。" },
  ],
};

function buildNewStickers(): Omit<Sticker, "kind" | "riveSrc">[] {
  return PACKS.flatMap((pack) => {
    const seeds = NEW_PACK_CHARACTERS[pack.id];
    if (!seeds) return [];
    return seeds.map((seed) => ({
      id: seed.id,
      characterId: seed.id,
      state: "default" as const,
      name: seed.name,
      en: seed.en,
      packId: pack.id,
      subject: pack.subject,
      style: pack.style,
      mood: seed.mood ?? pack.mood,
      tags: [...new Set([...pack.tags, ...seed.tags])],
      phrase: seed.phrase,
      accent: pack.accent,
      glow: pack.glow,
    }));
  });
}

const riveFiles = import.meta.glob<string>("../assets/sticker-motion/*.riv", {
  eager: true,
  query: "?url",
  import: "default",
});

const POSE_SETS: Partial<Record<string, Partial<Record<StickerState, string>>>> = {
  "crayon-pets-4": {
    wink: "给你眨个眼。",
    surprise: "嗯？你回来啦！",
    love: "这个大爱心送给你。",
    idle: "我先趴一会儿。",
    nap: "呼……差一点就睡着了。",
    sleep: "晚安，飞行员。",
    drag: "把我送到哪里呀？",
    work: "今天也一起专注。",
    snack: "来块饼干吗？",
    drink: "奶茶时间到。",
    music: "这首歌我喜欢。",
  },
};

export const STICKERS: Sticker[] = [
  ...CLASSIC_STICKERS.map((sticker) => ({
    ...sticker,
    characterId: sticker.id,
    state: "default" as const,
  })),
  ...buildNewStickers(),
].flatMap((sticker) => {
  const poses = POSE_SETS[sticker.id];
  if (!poses) return [sticker];
  return [
    { ...sticker, assetId: `${sticker.id}--default` },
    ...STATE_ORDER.flatMap((state) => {
      const phrase = poses[state];
      return phrase ? [{ ...sticker, id: `${sticker.id}--${state}`, state, phrase }] : [];
    }),
  ];
}).map((sticker): Sticker => {
  const riveSrc = riveFiles[`../assets/sticker-motion/${sticker.id}.riv`];
  return { ...sticker, riveSrc, kind: riveSrc ? "animated" : "static" };
});

/** 绿幕视频贴纸：悬浮层用 WebGL 实时抠像，图库里显示抠好的封面帧 */
const GREEN_SCREEN: ChromaKey = { color: [0.01, 0.96, 0.01], similarity: 0.4, smoothness: 0.08, spill: 0.1 };

STICKERS.push({
  id: "video-dance",
  characterId: "video-dance",
  state: "default",
  name: "绿幕跳舞",
  en: "Dance",
  packId: "video-fun",
  subject: "character",
  style: "illustration-2d",
  mood: "energetic",
  tags: ["视频", "跳舞", "绿幕", "动态"],
  kind: "video",
  video: { src: "/assets/dance-greenscreen.mp4", chroma: GREEN_SCREEN },
  phrase: "一起跳起来！",
  accent: "#eef3ff",
  glow: "rgba(120, 150, 255, 0.38)",
});

export const STICKER_BY_ID = new Map(STICKERS.map((sticker) => [sticker.id, sticker]));

const modules = import.meta.glob("../assets/stickers/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function stickerSrc(id: string): string {
  const assetId = STICKER_BY_ID.get(id)?.assetId ?? id;
  return modules[`../assets/stickers/${assetId}.webp`] ?? modules[`../assets/stickers/${id}.webp`] ?? "";
}

export const GENERIC_PHRASES = [
  "我在这儿陪着你。",
  "今天也辛苦啦，抱抱！",
  "喝口水，伸个懒腰吧。",
  "你做得已经很好啦 ✨",
  "要不要休息三分钟？",
  "摸摸头，烦恼都飞走～",
];
