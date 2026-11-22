/**
 * 界面瞬态状态（不持久化）：当前页面与顶栏附加信息。
 *
 * 主窗口 / 侧边栏 / 顶栏从这里读当前页面；页面组件用 setPageMeta 把
 * 标题后方的统计文字与快捷操作（如“清除筛选”）报到顶栏，切页时自动清空。
 * navigate 会同步地址栏 hash，保证托盘跳转与窗口刷新后能回到原页面。
 */
import { create } from "zustand";
import { pageFromHash, type PageKey } from "@/lib/pages";

/** 顶栏标题后附带的页面信息 */
export interface PageMeta {
  /** 统计文字，例如“12 个角色 · 36 张图” */
  stats?: string;
  /** 快捷操作文案（如“清除筛选”），与 onAction 成对出现 */
  actionLabel?: string;
  onAction?: () => void;
}

interface UiStore {
  page: PageKey;
  meta: PageMeta;
  navigate: (page: PageKey) => void;
  setPageMeta: (meta: PageMeta) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  page: pageFromHash(window.location.hash),
  meta: {},
  navigate: (page) => {
    window.history.replaceState(null, "", `#${page}`);
    set({ page, meta: {} });
  },
  setPageMeta: (meta) =>
    set((state) =>
      state.meta.stats === meta.stats &&
      state.meta.actionLabel === meta.actionLabel &&
      state.meta.onAction === meta.onAction
        ? state // 内容没变就不更新，避免页面反复渲染造成循环
        : { meta },
    ),
}));
