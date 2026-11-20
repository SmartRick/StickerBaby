import { useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CHARACTERS, type StickerCharacter } from "@/lib/characters";
import { PACKS, PACK_BY_ID, type StickerPack } from "@/lib/packs";
import { STICKERS, stickerSrc } from "@/lib/stickers";
import { MOOD_LABEL, STYLE_LABEL } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const CHARACTERS_BY_PACK = new Map<string, StickerCharacter[]>();
for (const character of CHARACTERS) {
  const list = CHARACTERS_BY_PACK.get(character.packId);
  if (list) list.push(character);
  else CHARACTERS_BY_PACK.set(character.packId, [character]);
}

const STICKER_COUNTS = new Map<string, number>();
for (const sticker of STICKERS) {
  STICKER_COUNTS.set(sticker.packId, (STICKER_COUNTS.get(sticker.packId) ?? 0) + 1);
}

function PackCard({
  pack,
  selected,
  onSelect,
}: {
  pack: StickerPack;
  selected: boolean;
  onSelect: () => void;
}) {
  const characters = CHARACTERS_BY_PACK.get(pack.id) ?? [];
  const previews = characters.slice(0, 4);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-[18px] border bg-white text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
        selected ? "border-[#8bb6eb] ring-1 ring-[#a8caf3]" : "border-[#dfe9f6] hover:border-[#a8c9f3]"
      )}
    >
      <div
        className="relative flex h-28 w-full shrink-0 items-center justify-center overflow-hidden px-3 pt-5"
        style={{ background: `linear-gradient(155deg, #ffffff 0%, ${pack.accent} 100%)` }}
      >
        {previews.map((character, index) => (
          <img
            key={character.id}
            src={stickerSrc(character.defaultVariant.id)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn(
              "h-[88%] w-[29%] shrink-0 object-contain transition-transform duration-200 group-hover:scale-[1.05] motion-reduce:transition-none",
              index > 0 && "-ml-[9%]",
              index % 2 === 0 ? "-rotate-[5deg]" : "rotate-[5deg]"
            )}
          />
        ))}
        <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-1 text-[10px] leading-3 font-semibold text-[#506d90]">
          {characters.length} 个角色 · {STICKER_COUNTS.get(pack.id) ?? 0} 张图
        </span>
        {selected && (
          <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-[#477fca] text-white">
            <Check className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
      <div className="w-full flex-1 px-3 py-2.5">
        <h3 className="truncate font-display text-[15px] leading-5 font-semibold text-ink">{pack.title}</h3>
        <p className="mt-1 truncate text-[11px] text-ink-soft" title={pack.tagline}>{pack.tagline}</p>
        <p className="mt-1.5 text-[10px] font-medium text-ink-faint">
          {STYLE_LABEL[pack.style]} · {MOOD_LABEL[pack.mood]}
        </p>
      </div>
    </button>
  );
}

export function PackPicker({
  value,
  onChange,
  openInitially = false,
  createdCount = 0,
}: {
  value: string;
  onChange: (packId: string) => void;
  openInitially?: boolean;
  createdCount?: number;
}) {
  const [open, setOpen] = useState(openInitially);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const label = value === "created" ? "我的创作" : PACK_BY_ID.get(value)?.title ?? "全部主题包";
  const keyword = query.trim().toLowerCase();
  const packs = PACKS.filter((pack) =>
    [pack.title, pack.short, pack.tagline, STYLE_LABEL[pack.style], MOOD_LABEL[pack.mood], ...pack.tags]
      .join(" ")
      .toLowerCase()
      .includes(keyword)
  );

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  const select = (packId: string) => {
    onChange(packId);
    changeOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`筛选主题包，当前${label}`}
          title={label}
          className={cn(
            "pressable inline-flex h-9 w-[142px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
            value === "all"
              ? "border-[#dce7f5] bg-white/80 text-ink-soft hover:bg-white"
              : "border-[#b6d1f6] bg-[#edf5ff] text-[#3d6698]"
          )}
        >
          <Boxes className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-65" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="bg-[#233d60]/25" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchInput.current?.focus();
          }}
          className="fixed inset-y-4 right-4 z-50 flex w-[min(620px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] border border-[#deebfa] bg-[#f7faff] shadow-[0_20px_70px_-25px_rgba(35,65,105,0.52)] outline-none duration-220 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right motion-reduce:animate-none"
        >
          <header className="shrink-0 px-5 pt-5 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="font-display text-[22px] leading-8 text-ink">主题包</DialogTitle>
                <DialogDescription className="mt-0.5 text-[11px] text-ink-soft">
                  选择主题包，筛选「我的贴纸」里的角色。
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="关闭主题包"
                  className="grid size-8 shrink-0 place-items-center rounded-xl border border-[#e0e9f5] bg-white text-ink-soft hover:bg-[#edf5ff] focus-visible:outline-2 focus-visible:outline-[#7eaff6]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </DialogClose>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="relative min-w-32 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-faint" aria-hidden />
                <Input
                  ref={searchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="搜索主题包"
                  placeholder="搜索主题包"
                  className="h-9 w-full rounded-xl border-[#dce7f5] bg-white pl-8 text-[12px] shadow-none"
                />
              </div>
              <button
                type="button"
                aria-pressed={value === "all"}
                onClick={() => select("all")}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
                  value === "all" ? "border-[#accbf2] bg-[#eaf3ff] text-[#3d6698]" : "border-[#dce7f5] bg-white text-ink-soft hover:bg-[#edf5ff]"
                )}
              >
                {value === "all" && <Check className="size-3.5" aria-hidden />}
                全部主题包
              </button>
              {createdCount > 0 && (
                <button
                  type="button"
                  aria-pressed={value === "created"}
                  onClick={() => select("created")}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#7eaff6]",
                    value === "created" ? "border-[#accbf2] bg-[#eaf3ff] text-[#3d6698]" : "border-[#dce7f5] bg-white text-ink-soft hover:bg-[#edf5ff]"
                  )}
                >
                  {value === "created" && <Check className="size-3.5" aria-hidden />}
                  我的创作 · {createdCount}
                </button>
              )}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {packs.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3 pt-1">
                {packs.map((pack) => (
                  <PackCard key={pack.id} pack={pack} selected={value === pack.id} onSelect={() => select(pack.id)} />
                ))}
              </div>
            ) : (
              <p role="status" className="py-10 text-center text-[12px] text-ink-soft">没有找到匹配的主题包</p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
