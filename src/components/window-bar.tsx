import { useEffect, useState } from "react";
import { Maximize2, Minus, RotateCcw, Square, X, Zap } from "lucide-react";
import { clearAll, runningCount, useOverlayRuntime } from "@/lib/overlay-client";
import { PAGE_TITLES } from "@/lib/pages";
import { useUiStore } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { appWindow, inTauri } from "@/lib/tauri";
import { useAppStore } from "@/lib/store";
import { shortcut } from "@/lib/shortcuts";

export function WindowBar() {
  const [maximized, setMaximized] = useState(false);
  const passthrough = useAppStore((state) => state.settings.passthrough);
  const overlayVisible = useAppStore((state) => state.settings.overlayVisible);
  const pets = useAppStore((state) => state.pets);
  const page = useUiStore((state) => state.page);
  const meta = useUiStore((state) => state.meta);
  const navigate = useUiStore((state) => state.navigate);

  useEffect(() => {
    if (!inTauri) return;
    void appWindow.isMaximized().then(setMaximized);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const fn = await getCurrentWindow().onResized(async () => {
        const next = await appWindow.isMaximized();
        if (!disposed) setMaximized(next);
      });
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const running = runningCount(useOverlayRuntime());
  const status = passthrough
    ? "全局锁定 · 贴纸仍可见"
    : overlayVisible
      ? `贴纸宝宝 · ${pets.length > 0 ? `${pets.length} 张在线` : "等待贴纸"}`
      : "贴纸宝宝已隐藏";

  return (
    <div
      className="flex h-11 shrink-0 items-center justify-between gap-3 pl-6 pr-3"
      data-tauri-drag-region
    >
      {/* 左侧：当前页面标题 + 页面统计 / 快捷操作（由各页面报到顶栏） */}
      <div className="flex min-w-0 items-center gap-2.5" data-tauri-drag-region>
        <h1 data-tauri-drag-region className="truncate font-display text-[15px] font-bold tracking-tight text-ink">
          {PAGE_TITLES[page].title}
        </h1>
        {meta.stats && <span className="truncate text-[11px] font-medium text-ink-soft">{meta.stats}</span>}
        {meta.stats && meta.actionLabel && meta.onAction && (
          <button
            type="button"
            onClick={meta.onAction}
            className="pressable inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#456f9f] hover:bg-[#e6f1ff]"
          >
            <RotateCcw className="size-3" aria-hidden />
            {meta.actionLabel}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5" data-tauri-drag-region>
        {/* 贴纸状态：点击前往“我的桌面”管理页 */}
        <button
          type="button"
          onClick={() => navigate("desktop")}
          title="管理桌面上的贴纸"
          className="pressable flex min-w-0 items-center gap-1.5 rounded-full border border-white/70 bg-white/55 py-1 pl-2.5 pr-2.5 text-[10.5px] font-semibold text-ink-soft hover:bg-white/85 hover:text-ink"
        >
          <span
            className={cn(
              "inline-flex h-2 w-2 shrink-0 rounded-full",
              passthrough ? "bg-amber-400" : overlayVisible ? "bg-emerald-400" : "bg-slate-300"
            )}
          />
          <span className="truncate">{status}</span>
        </button>

        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[#d8e4f2]" />

        {running > 0 && (
          <button
            type="button"
            onClick={() => void clearAll()}
            title={`一键清场（${shortcut("Q")}）`}
            className="pressable inline-flex h-7 items-center gap-1.5 rounded-full border border-[#ffd9de] bg-[#fff5f6] px-3 text-[10.5px] font-bold text-[#d8667a] hover:bg-[#ffeef0]"
          >
            <Zap className="h-3 w-3" />
            {running} 个玩法运行中 · 清场
          </button>
        )}
        <button
          type="button"
          aria-label="最小化"
          onClick={() => void appWindow.minimize()}
          className="pressable grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-black/[0.055] hover:text-ink"
        >
          <Minus className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          aria-label={maximized ? "还原" : "最大化"}
          onClick={async () => {
            await appWindow.toggleMaximize();
            setMaximized(await appWindow.isMaximized());
          }}
          className="pressable grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-black/[0.055] hover:text-ink"
        >
          {maximized ? (
            <Square className="h-[12px] w-[12px]" strokeWidth={2.2} />
          ) : (
            <Maximize2 className="h-[14px] w-[14px]" strokeWidth={2.2} />
          )}
        </button>
        <button
          type="button"
          aria-label="关闭到托盘"
          onClick={() => void appWindow.hide()}
          className="pressable grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-rose-500/10 hover:text-rose-500"
        >
          <X className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
