/**
 * 玩法目录（业务模型）。
 *
 * 引擎层按“怎么实现”分：特效 effect / 恶作剧 prank / 屏幕扰动 distort / 窗口扰动 window / 组合 combo；
 * 用户按“想干什么”找：
 *
 *   领域 PlayDomain（一个页面）
 *     └─ 分类 PlayCategory（页面里的一个分组）
 *          └─ 玩法 Playable（一张卡片，对应引擎里的一个 kind）
 *
 * 两者在这里解耦：同一个引擎实现可以放进任何领域（例如引擎里的“黑客入侵”是全屏特效，
 * 业务上归到“恶作剧 · 系统恶搞”；金鱼是恶作剧层的实体，业务上归到“特效 · 观赏生灵”）。
 *
 * 新增玩法 = 引擎注册工厂（overlay/effects、overlay/pranks）+ 这里加一条目录项，页面自动出现。
 */
import type { LucideIcon } from "lucide-react";
import {
  AppWindow, Banknote, Biohazard, Blend, Bomb, Bug, CloudLightning, CloudRain, CloudSnow, Coins, Contrast,
  Droplets, Eye, Fish, Flame, Flower2, FlipVertical2, Footprints, Gem, Ghost, Hand, Heart, Laugh,
  Maximize2, MonitorX, MoveHorizontal, MoveVertical, Orbit, Palette, PartyPopper, PenTool, Radio, Rocket,
  RotateCw, ScanLine, Scissors, Shrimp, Skull, Snail, Snowflake, Sparkles, Squirrel, Star, Terminal,
  Tornado, TriangleAlert, Tv, Vibrate, WandSparkles, Waves, Wind, Worm, Zap, Activity, Feather,
  Spline, Shell,
} from "lucide-react";
import type { DistortKind, EffectKind, PrankKind, WindowFxKind } from "@/shared/protocol";

export type PlayDomain = "effects" | "pranks" | "disturb";

/** once：播放一次自动结束；persist：常驻，直到手动停止或一键清场 */
export type PlayMode = "once" | "persist";

export type PlayEngine =
  | { engine: "effect"; kind: EffectKind }
  | { engine: "prank"; kind: PrankKind }
  | { engine: "distort"; kind: DistortKind }
  | { engine: "window"; kind: WindowFxKind }
  | { engine: "combo"; kind: "missile-strike" };

export type Playable = PlayEngine & {
  /** 全局唯一：`${engine}:${kind}` */
  id: string;
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  mode: PlayMode;
  /** 互动提示（点击拍死、可擦掉……） */
  hint?: string;
  /** 惊吓内容：卡片上标注，避免误触 */
  scary?: boolean;
  /** 可叠加多次 */
  stackable?: boolean;
};

export interface PlayCategory {
  id: string;
  domain: PlayDomain;
  title: string;
  description: string;
  icon: LucideIcon;
  /** 卡片图标底色 */
  tint: string;
  ink: string;
}

export interface DomainMeta {
  id: PlayDomain;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

export const DOMAINS: Record<PlayDomain, DomainMeta> = {
  effects: { id: "effects", title: "全屏特效", subtitle: "庆祝、氛围、名场面，铺满整个桌面", icon: Sparkles },
  pranks: { id: "pranks", title: "恶作剧", subtitle: "以假乱真的屏幕整蛊和桌面小虫子", icon: Laugh },
  disturb: { id: "disturb", title: "屏幕扰动", subtitle: "让画面抖起来、扭起来，甚至真的晃动窗口", icon: Activity },
};

export const CATEGORIES: PlayCategory[] = [
  // ---- 全屏特效 ----
  { id: "celebrate", domain: "effects", title: "庆祝", description: "生日、上线、下班，来点仪式感", icon: PartyPopper, tint: "#fff1e6", ink: "#e07a3f" },
  { id: "fortune", domain: "effects", title: "招财", description: "金币、钞票、元宝从天而降", icon: Coins, tint: "#fff7dc", ink: "#c99a1a" },
  { id: "weather", domain: "effects", title: "天气氛围", description: "常驻的天气，开着它安静工作", icon: CloudSnow, tint: "#e9f3ff", ink: "#4a8df8" },
  { id: "environment", domain: "effects", title: "桌面环境", description: "火焰、洪水、冰冻……鼠标可以互动", icon: Flame, tint: "#ffece8", ink: "#e5603f" },
  { id: "spectacle", domain: "effects", title: "名场面", description: "大场面一次性演出", icon: Rocket, tint: "#efeaff", ink: "#7b61e8" },
  { id: "companion", domain: "effects", title: "观赏生灵", description: "在桌面上游动、飞舞的小生命", icon: Fish, tint: "#e6f7f3", ink: "#2f9f86" },
  // ---- 恶作剧 ----
  { id: "screen", domain: "pranks", title: "屏幕整蛊", description: "裂了？脏了？其实都是假的", icon: MonitorX, tint: "#eef2f7", ink: "#5d7697" },
  { id: "system", domain: "pranks", title: "系统恶搞", description: "以假乱真的报错和“病毒”", icon: TriangleAlert, tint: "#fff4e0", ink: "#d48a12" },
  { id: "critters", domain: "pranks", title: "桌面爬虫", description: "会爬、会躲鼠标，点一下拍死", icon: Bug, tint: "#f1f5e8", ink: "#6c8a2f" },
  { id: "horror", domain: "pranks", title: "惊吓", description: "胆小慎点", icon: Skull, tint: "#fbe9ec", ink: "#c2415a" },
  // ---- 屏幕扰动 ----
  { id: "shake", domain: "disturb", title: "屏幕震荡", description: "整块屏幕晃起来", icon: Vibrate, tint: "#e9f3ff", ink: "#4a8df8" },
  { id: "warp", domain: "disturb", title: "画面扭曲", description: "弯、拉、旋、波浪", icon: Spline, tint: "#efeaff", ink: "#7b61e8" },
  { id: "glitch", domain: "disturb", title: "信号故障", description: "像显示器坏掉一样", icon: ScanLine, tint: "#e6f7f3", ink: "#2f9f86" },
  { id: "abnormal", domain: "disturb", title: "画面异常", description: "翻转、变色、模糊", icon: Contrast, tint: "#fff1e6", ink: "#e07a3f" },
  { id: "window", domain: "disturb", title: "窗口扰动", description: "真的移动其他应用的窗口，结束后精确还原", icon: AppWindow, tint: "#fbe9ec", ink: "#c2415a" },
];

const eff = (kind: EffectKind, category: string, name: string, description: string, icon: LucideIcon, mode: PlayMode, extra: Partial<Playable> = {}): Playable =>
  ({ engine: "effect", kind, id: `effect:${kind}`, category, name, description, icon, mode, ...extra }) as Playable;
const prk = (kind: PrankKind, category: string, name: string, description: string, icon: LucideIcon, extra: Partial<Playable> = {}): Playable =>
  ({ engine: "prank", kind, id: `prank:${kind}`, category, name, description, icon, mode: "persist", stackable: true, ...extra }) as Playable;
const dst = (kind: DistortKind, category: string, name: string, description: string, icon: LucideIcon, extra: Partial<Playable> = {}): Playable =>
  ({ engine: "distort", kind, id: `distort:${kind}`, category, name, description, icon, mode: "once", ...extra }) as Playable;
const win = (kind: WindowFxKind, name: string, description: string, icon: LucideIcon): Playable =>
  ({ engine: "window", kind, id: `window:${kind}`, category: "window", name, description, icon, mode: "once" }) as Playable;

export const PLAYABLES: Playable[] = [
  // 庆祝
  eff("fireworks", "celebrate", "全屏烟花", "金色亮粉、柳型、菊花轮番绽放", Sparkles, "once"),
  eff("confetti", "celebrate", "彩带礼花", "两侧礼炮喷出彩纸", PartyPopper, "once"),
  eff("heart-rain", "celebrate", "爱心雨", "满屏飘落的爱心", Heart, "once"),
  eff("magic", "celebrate", "魔法阵", "旋转的魔法阵与光点", WandSparkles, "once"),
  // 招财
  eff("coin-rain", "fortune", "金币雨", "旋转的金币哗啦啦落下", Coins, "once"),
  eff("money-rain", "fortune", "钞票从天而降", "双面翻转、纸张卷曲", Banknote, "once"),
  eff("money-burst", "fortune", "钞票喷发", "从屏幕底部喷涌而出", Banknote, "once"),
  eff("money-gun", "fortune", "喷钞枪", "侧边连发，横扫全屏", Banknote, "once"),
  eff("ingot-rain", "fortune", "元宝雨", "金灿灿的元宝落满桌面", Gem, "once"),
  // 天气氛围
  eff("snow", "weather", "下雪", "大小雪花缓缓飘落", CloudSnow, "persist"),
  eff("rain", "weather", "下雨", "雨丝与地面溅起的水花", CloudRain, "persist"),
  eff("thunderstorm", "weather", "雷雨", "大雨加上不时的闪电", CloudLightning, "persist"),
  eff("sakura", "weather", "樱花飘落", "粉色花瓣随风打转", Flower2, "persist"),
  eff("fireflies", "weather", "萤火虫", "忽明忽暗的小光点", Star, "persist"),
  eff("meteor-shower", "weather", "流星雨", "划过夜空的流星", Sparkles, "once"),
  // 桌面环境
  eff("fire", "environment", "桌面火焰", "从屏幕底部燃起的火焰", Flame, "persist"),
  eff("flood", "environment", "桌面水淹", "水位上涨，鼠标划过起波纹", Waves, "persist"),
  eff("freeze", "environment", "桌面冰冻", "结霜的屏幕，鼠标经过会融化", Snowflake, "persist", { hint: "鼠标经过融化" }),
  eff("sandstorm", "environment", "沙尘暴", "黄沙漫天", Wind, "persist"),
  eff("ripple", "environment", "鼠标水波纹", "鼠标所到之处荡起水波", Droplets, "persist", { hint: "移动鼠标" }),
  // 名场面
  eff("ultraman", "spectacle", "奥特曼登场 · 经典", "从远处冲向镜头飞过", Zap, "once"),
  eff("ultraman-tiga", "spectacle", "奥特曼登场 · 迪迦", "从远处冲向镜头飞过", Zap, "once"),
  eff("missile", "spectacle", "导弹飞过", "导弹呼啸着划过屏幕", Rocket, "once"),
  { engine: "combo", kind: "missile-strike", id: "combo:missile-strike", category: "spectacle", name: "导弹袭击", description: "导弹命中 → 爆炸 → 震屏 → 屏幕裂开", icon: Bomb, mode: "once" },
  eff("smoke", "spectacle", "全屏烟雾", "浓烟翻滚后慢慢散去", Tornado, "once"),
  // 观赏生灵
  prk("goldfish", "companion", "金鱼", "在桌面上游来游去", Fish, { hint: "鼠标靠近会游开，点击冲刺" }),
  prk("butterfly", "companion", "蝴蝶", "扇着翅膀飞舞、停落", Feather),
  // 屏幕整蛊
  prk("crack", "screen", "屏幕裂痕", "像被砸了一下", Zap),
  prk("shatter", "screen", "屏幕破碎", "整块玻璃碎裂", MonitorX),
  prk("stain", "screen", "屏幕污渍", "一块擦不掉的脏印", Droplets, { hint: "鼠标来回擦可擦掉" }),
  prk("glitch-screen", "screen", "花屏", "竖线与黑块，像排线松了", ScanLine),
  prk("graffiti", "screen", "屏幕涂鸦", "被人用马克笔画了几笔", PenTool),
  prk("tape", "screen", "胶带", "屏幕上贴了几条胶带", Scissors, { hint: "点击撕掉" }),
  // 系统恶搞
  prk("error-popups", "system", "系统错误弹窗", "Win95 风格的错误窗口层层叠叠", TriangleAlert, { hint: "点 OK 关闭" }),
  prk("panda-virus", "system", "熊猫烧香", "桌面图标被“感染”，结束后恢复", Biohazard, { hint: "点击杀毒", stackable: false }),
  eff("hacker", "system", "黑客入侵", "代码雨、警告、进度条", Terminal, "once"),
  eff("tv-static", "system", "电视雪花屏", "信号丢失的雪花噪点", Tv, "once"),
  // 桌面爬虫
  prk("cockroach", "critters", "蟑螂", "会躲鼠标的小强", Bug, { hint: "点击拍死" }),
  prk("centipede", "critters", "蜈蚣", "分节背甲、波浪步足", Worm, { hint: "点击拍死" }),
  prk("millipede", "critters", "千足虫", "受惊会卷成一团", Snail),
  prk("maggot", "critters", "蛆", "一扭一扭地爬", Worm),
  prk("gecko", "critters", "壁虎", "对角迈步，竖瞳盯着你", Squirrel),
  prk("fly", "critters", "苍蝇", "嗡嗡乱飞，时不时停下搓手", Bug),
  prk("ant", "critters", "蚂蚁队列", "排着队搬家", Shrimp),
  // 惊吓
  prk("horror-blood", "horror", "血迹流淌", "从屏幕顶端缓缓流下", Droplets, { scary: true }),
  prk("horror-eyes", "horror", "偷窥的眼睛", "黑暗里的眼睛跟着鼠标转", Eye, { scary: true, hint: "跟随鼠标" }),
  prk("horror-hands", "horror", "血手印", "一个接一个按在屏幕上", Hand, { scary: true }),
  prk("horror-ghost", "horror", "鬼影闪现", "站立、探头、逼近", Ghost, { scary: true }),
  prk("horror-scrawl", "horror", "恐怖涂鸦", "血字一笔一笔写出来", Footprints, { scary: true }),
  // 屏幕震荡
  dst("shake", "shake", "整体抖动", "像被敲了一下", Vibrate),
  dst("explosion-shake", "shake", "爆炸震荡", "剧烈震动后慢慢平息", Bomb),
  dst("sway", "shake", "左右摇晃", "像在船上", MoveHorizontal),
  dst("bob", "shake", "上下晃动", "一上一下", MoveVertical),
  // 画面扭曲
  dst("tilt", "warp", "整体倾斜", "画面歪了", RotateCw),
  dst("wave", "warp", "波浪形变", "像隔着水面", Waves),
  dst("bulge", "warp", "局部弯曲", "以鼠标为中心鼓起", Maximize2, { hint: "以鼠标为中心" }),
  dst("stretch", "warp", "画面拉伸", "被拉长又弹回", MoveHorizontal),
  dst("swirl", "warp", "局部失真", "漩涡一样拧起来", Orbit),
  // 信号故障
  dst("rgb-shift", "glitch", "RGB 偏移", "三原色错开", Palette),
  dst("tear", "glitch", "画面撕裂", "横向错位条纹", Scissors),
  dst("noise", "glitch", "信号干扰", "雪花与滚动条纹", Radio),
  dst("flash", "glitch", "闪屏", "一闪一闪", Zap),
  dst("digital-glitch", "glitch", "数字故障", "方块化的数字错误", ScanLine),
  // 画面异常
  dst("flip", "abnormal", "画面反转", "整个屏幕倒过来", FlipVertical2),
  dst("color-shift", "abnormal", "颜色变化", "色相不停流转", Blend),
  dst("blur", "abnormal", "屏幕模糊", "像没戴眼镜", Contrast),
  // 窗口扰动
  win("shake", "窗口抖动", "随机抖动，逐渐平息", Vibrate),
  win("bounce", "窗口弹跳", "像球一样落下弹几下", Activity),
  win("offset", "短暂错位", "跳到几个位置后归位", Shell),
  win("wobble", "窗口震荡", "左右来回摆", MoveHorizontal),
];

export const PLAYABLE_BY_ID = new Map(PLAYABLES.map((p) => [p.id, p]));

/** 缩略图：scripts/capture-thumbs.mjs 实际渲染每个玩法截的一帧（窗口扰动没有） */
const THUMBS = import.meta.glob("../assets/playables/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export function thumbOf(p: Playable): string | undefined {
  return THUMBS[`../assets/playables/${p.engine}-${p.kind}.webp`];
}

export function categoriesOf(domain: PlayDomain) {
  return CATEGORIES.filter((c) => c.domain === domain);
}

export function playablesOf(category: string) {
  return PLAYABLES.filter((p) => p.category === category);
}

/** 运行中的引擎 kind 对应的玩法 id */
export function runningIds(state: { pranks: { kind: string }[]; effects: { kind: string }[]; distorting: string | null }) {
  const ids = new Map<string, number>();
  const add = (id: string) => ids.set(id, (ids.get(id) ?? 0) + 1);
  for (const p of state.pranks) add(`prank:${p.kind}`);
  for (const e of state.effects) add(`effect:${e.kind}`);
  if (state.distorting) add(`distort:${state.distorting}`);
  return ids;
}
