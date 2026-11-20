/**
 * Sticker taxonomy.
 *
 * A sticker has exactly one primary subject, style and mood. Everything else
 * (characters, props, seasons, occasions...) lives in free-form tags so new
 * themes never need a new top-level category.
 */

export type Subject =
  | "animal"
  | "character"
  | "text"
  | "object"
  | "jewelry"
  | "food"
  | "plant"
  | "festival";

export type Style =
  | "illustration-2d"
  | "colored-pencil"
  | "crayon"
  | "pastel"
  | "watercolor"
  | "hand-drawn"
  | "doodle"
  | "pixel"
  | "clay-3d";

export type Mood =
  | "healing"
  | "cute"
  | "funny"
  | "tired"
  | "energetic"
  | "calm"
  | "festive";

export const SUBJECTS: Subject[] = [
  "animal",
  "character",
  "text",
  "object",
  "jewelry",
  "food",
  "plant",
  "festival",
];

export const STYLES: Style[] = [
  "illustration-2d",
  "colored-pencil",
  "crayon",
  "pastel",
  "watercolor",
  "hand-drawn",
  "doodle",
  "pixel",
  "clay-3d",
];

export const MOODS: Mood[] = [
  "healing",
  "cute",
  "funny",
  "tired",
  "energetic",
  "calm",
  "festive",
];

export const SUBJECT_LABEL: Record<Subject, string> = {
  animal: "动物",
  character: "角色",
  text: "文字",
  object: "物品",
  jewelry: "首饰",
  food: "食物",
  plant: "植物",
  festival: "节日",
};

export const STYLE_LABEL: Record<Style, string> = {
  "illustration-2d": "2D 插画",
  "colored-pencil": "彩铅",
  crayon: "蜡笔",
  pastel: "粉彩",
  watercolor: "水彩",
  "hand-drawn": "手绘",
  doodle: "涂鸦",
  pixel: "像素",
  "clay-3d": "黏土 3D",
};

export const MOOD_LABEL: Record<Mood, string> = {
  healing: "治愈",
  cute: "可爱",
  funny: "搞怪",
  tired: "疲惫",
  energetic: "元气",
  calm: "安静",
  festive: "节日",
};

/** Filter values include `all` so a Select can always render a neutral state. */
export type SubjectFilter = Subject | "all";
export type StyleFilter = Style | "all";
export type MoodFilter = Mood | "all";
export type Format = "static" | "animated";
export type FormatFilter = Format | "all";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export const SUBJECT_FILTER_OPTIONS: FilterOption<SubjectFilter>[] = [
  { value: "all", label: "全部内容" },
  ...SUBJECTS.map((subject) => ({
    value: subject,
    label: SUBJECT_LABEL[subject],
  })),
];

export const STYLE_FILTER_OPTIONS: FilterOption<StyleFilter>[] = [
  { value: "all", label: "全部画风" },
  ...STYLES.map((style) => ({
    value: style,
    label: STYLE_LABEL[style],
  })),
];

export const MOOD_FILTER_OPTIONS: FilterOption<MoodFilter>[] = [
  { value: "all", label: "全部情绪" },
  ...MOODS.map((mood) => ({
    value: mood,
    label: MOOD_LABEL[mood],
  })),
];

export const FORMAT_FILTER_OPTIONS: FilterOption<FormatFilter>[] = [
  { value: "all", label: "全部格式" },
  { value: "static", label: "纯静态" },
  { value: "animated", label: "含动态" },
];
