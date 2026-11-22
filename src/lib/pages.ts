/**
 * 主界面信息架构：
 *
 *   首页
 *   贴纸   贴纸库 · 创建贴纸 · 我的桌面   —— 内容（主题包 → 角色 → 状态），桌面上每张贴纸的摆放与互动
 *   玩法   全屏特效 · 恶作剧 · 屏幕扰动  —— domain/playables 中的玩法目录
 *   设置
 */
export type PageKey =
  | "home"
  | "library"
  | "create"
  | "desktop"
  | "effects"
  | "pranks"
  | "disturb"
  | "settings";

export const PAGE_KEYS: PageKey[] = ["home", "library", "create", "desktop", "effects", "pranks", "disturb", "settings"];

export const PAGE_TITLES: Record<PageKey, { title: string; subtitle: string }> = {
  home: { title: "首页", subtitle: "挑一张贴纸，让它住进你的桌面" },
  library: { title: "贴纸库", subtitle: "所有角色和想贴的图都在这里" },
  create: { title: "创建贴纸", subtitle: "从图片或视频制作贴纸" },
  desktop: { title: "我的桌面", subtitle: "贴纸在桌面上怎么动、怎么摆" },
  effects: { title: "全屏特效", subtitle: "庆祝、氛围、名场面" },
  pranks: { title: "恶作剧", subtitle: "屏幕整蛊和桌面小虫子" },
  disturb: { title: "屏幕扰动", subtitle: "画面与窗口的晃动扭曲" },
  settings: { title: "设置", subtitle: "把贴纸宝宝调成你最舒服的样子" },
};

export function pageFromHash(hash: string): PageKey {
  const key = hash.replace(/^#/, "");
  if (key === "packs") return "library";
  // 旧的“互动”页并入了“我的桌面”
  if (key === "interactions") return "desktop";
  return (PAGE_KEYS as string[]).includes(key) ? (key as PageKey) : "home";
}
