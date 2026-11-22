import { useEffect } from "react";
import { STICKER_MODES, useAppStore, type StickerMode } from "@/lib/store";
import { setOverlayMonitor, subscribeOverlayRuntime } from "@/lib/overlay-client";
import { invokeSafe, onAppEvent } from "@/lib/tauri";
import { toast } from "@/lib/toast";

/**
 * 主界面与原生层的桥：托盘 / 全局快捷键 → 设置；设置 → 托盘勾选状态、悬浮层所在显示器。
 * 贴纸的显隐、锁定、模式等由两个悬浮层直接订阅共享状态生效。
 */
export function useOverlayEffects() {
  const { overlayVisible, passthrough, stickerMode, monitorIndex } = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  useEffect(() => subscribeOverlayRuntime(), []);

  useEffect(() => {
    void invokeSafe("sync_tray_state", { settings: { overlayVisible, passthrough, stickerMode } });
  }, [overlayVisible, passthrough, stickerMode]);

  useEffect(() => {
    if (monitorIndex >= 0) void setOverlayMonitor(monitorIndex);
  }, [monitorIndex]);

  useEffect(() => {
    const stopShortcut = onAppEvent("shortcut:toggle-passthrough", () => {
      const next = !useAppStore.getState().settings.passthrough;
      setSettings({ passthrough: next });
      toast(next ? "已开启全局锁定 · 贴纸仍可见，点击会落到桌面；Ctrl+Alt+P 恢复" : "已退出全局锁定", next ? "warn" : "success");
    });
    const stopTray = onAppEvent("tray:toggle-overlay", () => {
      setSettings({ overlayVisible: !useAppStore.getState().settings.overlayVisible });
    });
    const stopMode = onAppEvent<string>("tray:sticker-mode", (mode) => {
      if (STICKER_MODES.includes(mode as StickerMode)) setSettings({ stickerMode: mode as StickerMode });
    });
    const stopPanic = onAppEvent("sb://panic", () => toast("已一键清场：特效、恶作剧和窗口扰动全部停止", "success"));
    return () => {
      stopShortcut();
      stopTray();
      stopMode();
      stopPanic();
    };
  }, [setSettings]);
}
