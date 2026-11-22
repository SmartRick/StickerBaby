export type PageKey = "home" | "library" | "create" | "interactions" | "settings";

export const PAGE_TITLES: Record<PageKey, { title: string; subtitle: string }> = {
  home: { title: "首页", subtitle: "挑一张贴纸，让它住进你的桌面" },
  library: { title: "我的贴纸", subtitle: "所有角色和想贴的图都在这里" },
  create: { title: "创建贴纸", subtitle: "从图片制作贴纸" },
  interactions: { title: "互动", subtitle: "预览手势并设置贴纸的中键动作" },
  settings: { title: "设置", subtitle: "把桌面贴纸调成你最舒服的样子" },
};
