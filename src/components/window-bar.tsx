import { useEffect, useState } from "react";
import { Maximize2, Minus, PawPrint, Square, Trash2, LockKeyhole, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StickerImage } from "@/components/sticker-image";
import { cn } from "@/lib/utils";
import { appWindow, inTauri } from "@/lib/tauri";
import { findSticker, useAppStore } from "@/lib/store";
import { packShort } from "@/lib/packs";
import { toast } from "@/lib/toast";

export function WindowBar() {
  const [maximized, setMaximized] = useState(false);
  const [petsOpen, setPetsOpen] = useState(false);
  const passthrough = useAppStore((state) => state.settings.passthrough);
  const overlayVisible = useAppStore((state) => state.settings.overlayVisible);
  const pets = useAppStore((state) => state.pets);
  const created = useAppStore((state) => state.createdStickers);
  const clearPets = useAppStore((state) => state.clearPets);
  const removePet = useAppStore((state) => state.removePet);
  const updatePet = useAppStore((state) => state.updatePet);

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

  const status = passthrough
    ? "全局锁定 · 点击直达桌面"
    : overlayVisible
      ? `贴纸宝宝 · ${pets.length > 0 ? `${pets.length} 张在线` : "等待贴纸"}`
      : "贴纸宝宝已隐藏";

  return (
    <div
      className="flex h-11 shrink-0 items-center justify-between gap-3 pl-6 pr-3"
      data-tauri-drag-region
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setPetsOpen(true)}
          className="pressable flex min-w-0 items-center gap-2 rounded-full px-1 py-0.5 text-left text-[11.5px] text-ink-faint hover:text-ink-soft"
          title="查看桌面上的贴纸"
        >
          <span
            className={cn(
              "inline-flex h-2 w-2 shrink-0 rounded-full",
              passthrough ? "bg-amber-400" : overlayVisible ? "bg-emerald-400" : "bg-slate-300"
            )}
          />
          <span className="truncate">{status}</span>
        </button>
        <button
          type="button"
          aria-label="一键清空桌面贴纸"
          title="一键清空桌面贴纸"
          disabled={pets.length === 0}
          onClick={() => {
            clearPets();
            toast("桌面已经收拾干净啦", "success");
          }}
          className="pressable grid h-6 w-6 place-items-center rounded-full text-ink-faint hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex items-center gap-1.5" data-tauri-drag-region>
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

      <Dialog open={petsOpen} onOpenChange={setPetsOpen}>
        <DialogContent className="max-w-[430px] rounded-[26px] border-white/80 bg-white/95">
          <DialogHeader>
            <DialogTitle className="font-display text-[18px]">桌面上的贴纸</DialogTitle>
            <DialogDescription>
              当前桌面有 {pets.length} 张贴纸，可以单独移除。
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {pets.length > 0 ? (
              pets.map((pet) => {
                const sticker = findSticker(pet.stickerId, created);
                return (
                  <div
                    key={pet.id}
                    className="flex items-center gap-3 rounded-[18px] border border-white/80 bg-white/65 p-2.5"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-[#eef5ff]">
                      {sticker ? (
                        <StickerImage sticker={sticker} className="h-10 w-10" />
                      ) : (
                        <PawPrint className="h-5 w-5 text-ink-faint" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold text-ink">
                        {sticker?.name ?? "未知贴纸"}
                      </p>
                      <p className="mt-0.5 text-[9.5px] text-ink-faint">
                        {sticker ? packShort(sticker.packId) : "桌面"} ·{" "}
                        {Math.round(pet.scale * 100)}%{pet.passthrough ? " · 已锁定" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={pet.passthrough ? "解锁这张贴纸" : "锁定这张贴纸"}
                      title={pet.passthrough ? "解锁" : "锁定（点击穿透）"}
                      onClick={() =>
                        updatePet(pet.id, { passthrough: !pet.passthrough })
                      }
                      className={cn(
                        "pressable grid h-8 w-8 place-items-center rounded-full",
                        pet.passthrough
                          ? "bg-[#fff6e3] text-[#b8862f]"
                          : "text-ink-faint hover:bg-[#eef5ff] hover:text-[#4a7fc5]"
                      )}
                    >
                      <LockKeyhole className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      aria-label="移除这张贴纸"
                      onClick={() => {
                        removePet(pet.id);
                        toast(
                          `${sticker?.name ?? "贴纸"} 已经回到贴纸库啦`,
                          "success"
                        );
                      }}
                      className="pressable grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-[#fff1f3] hover:text-[#e0687c]"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="grid place-items-center rounded-[18px] border border-dashed border-[#d9e5f4] bg-white/50 py-8 text-center">
                <PawPrint className="h-6 w-6 text-ink-faint" />
                <p className="mt-2 text-[11px] font-semibold text-ink-soft">桌面上还没有贴纸</p>
                <p className="mt-0.5 text-[9.5px] text-ink-faint">去贴纸仓库挑一张吧</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {pets.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearPets();
                  toast("桌面已经收拾干净啦", "success");
                }}
                className="pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffd9de] bg-[#fff5f6] px-4 text-[10.5px] font-bold text-[#d8667a] hover:bg-[#ffeef0]"
              >
                <Trash2 className="h-3 w-3" /> 全部清空
              </button>
            )}
            <button
              type="button"
              onClick={() => setPetsOpen(false)}
              className="pressable inline-flex h-9 items-center rounded-full bg-[#4a8df8] px-5 text-[10.5px] font-bold text-white hover:bg-[#3d80ea]"
            >
              关闭
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
