import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Sticker } from "@/lib/stickers";
import { packShort } from "@/lib/packs";
import { StickerImage } from "@/components/sticker-image";

interface StickerTileProps {
  sticker: Sticker;
  selected?: boolean;
  onSelect: () => void;
  onAdd?: () => void;
}

export function StickerTile({
  sticker,
  selected,
  onSelect,
  onAdd,
}: StickerTileProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      className={cn(
        "tile-lift group/tile relative flex cursor-pointer flex-col rounded-[18px] border p-1.5 outline-none",
        selected
          ? "border-[#8bbcff] bg-white shadow-[0_0_0_2px_rgba(74,141,248,0.28)]"
          : "border-white/80 bg-white/55 hover:border-white hover:bg-white/80"
      )}
      style={{ backgroundColor: selected ? "#ffffff" : undefined }}
    >
      <div
        className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-[14px]"
        style={{
          background: `radial-gradient(120% 110% at 50% 0%, #ffffff 0%, ${sticker.accent} 100%)`,
        }}
      >
        <StickerImage
          sticker={sticker}
          className="h-[86%] w-[86%] transition-transform duration-300 group-hover/tile:scale-[1.06]"
        />
        {sticker.kind !== "static" && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/85 px-1.5 py-[2px] text-[8px] font-bold uppercase tracking-wide text-[#5b8ac4] backdrop-blur">
            <span className="h-1 w-1 rounded-full bg-[#5bb5ff]" />
            {sticker.kind === "video" ? "video" : "live"}
          </span>
        )}
        {selected && !onAdd && (
          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#4a8df8] text-white shadow-sm">
            <Check className="h-2.5 w-2.5" strokeWidth={3.2} />
          </span>
        )}
        {onAdd && (
          <button
            type="button"
            aria-label={`把${sticker.name}贴到桌面`}
            title="贴到桌面"
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
            className={cn(
              "pressable absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#4a8df8] text-white shadow-[0_6px_12px_-6px_rgba(40,90,170,0.8)] transition-opacity hover:bg-[#3d80ea]",
              selected ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100"
            )}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.8} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 px-1 pb-0.5 pt-1.5">
        <span className="truncate text-[10.5px] font-semibold text-ink">{sticker.name}</span>
        <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-wide text-ink-faint">
          {packShort(sticker.packId)}
        </span>
      </div>
    </div>
  );
}
