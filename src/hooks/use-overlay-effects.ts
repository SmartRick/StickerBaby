import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { invokeSafe, onAppEvent } from "@/lib/tauri";
import { toast } from "@/lib/toast";

interface OverlayEffectsOptions {
  /** Only the workspace listens to global shortcut / tray events. */
  events?: boolean;
}

/**
 * Applies cross-window settings to the native pet overlay and keeps the
 * workspace in sync with tray / shortcut actions.
 */
export function useOverlayEffects({ events = false }: OverlayEffectsOptions = {}) {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const { overlayVisible, passthrough, stickerMode } = settings;

  useEffect(() => {
    if (events) void invokeSafe("sync_tray_state", {
      settings: { overlayVisible, passthrough, stickerMode },
    });
  }, [events, overlayVisible, passthrough, stickerMode]);

  useEffect(() => {
    void invokeSafe("set_overlay_passthrough", { enabled: settings.passthrough });
  }, [settings.passthrough]);

  useEffect(() => {
    void invokeSafe("set_overlay_visible", { visible: settings.overlayVisible });
  }, [settings.overlayVisible]);

  useEffect(() => {
    if (!events) return;
    const stopShortcut = onAppEvent("shortcut:toggle-passthrough", () => {
      const next = !useAppStore.getState().settings.passthrough;
      setSettings({ passthrough: next });
      toast(
        next
          ? "已开启全局锁定 · 贴纸仍可见，点击会落到桌面；Ctrl+Alt+P 恢复"
          : "已退出全局锁定",
        next ? "warn" : "success"
      );
    });
    const stopTray = onAppEvent<boolean>("tray:toggle-overlay", (visible) => {
      setSettings({ overlayVisible: visible });
    });
    const stopMode = onAppEvent<string>("tray:sticker-mode", (mode) => {
      if (mode === "float" || mode === "gravity" || mode === "space") {
        setSettings({ stickerMode: mode });
      }
    });
    return () => {
      stopShortcut();
      stopTray();
      stopMode();
    };
  }, [events, setSettings]);
}
