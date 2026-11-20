import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Segmented } from "@/components/segmented";
import { StickerTile } from "@/components/sticker-tile";
import { useAppStore } from "@/lib/store";
import { CHARACTERS, characterHasAnimated, type StickerCharacter } from "@/lib/characters";
import { useCreatedCharacters } from "@/hooks/use-sticker-catalog";
import { PACKS } from "@/lib/packs";

const KINDS = ["全部", "纯静态", "含动态"] as const;
type Kind = (typeof KINDS)[number];

const PREVIEW_LIMIT = 24;

const CHARACTERS_BY_PACK = new Map<string, StickerCharacter[]>();
for (const character of CHARACTERS) {
  const list = CHARACTERS_BY_PACK.get(character.packId);
  if (list) {
    list.push(character);
  } else {
    CHARACTERS_BY_PACK.set(character.packId, [character]);
  }
}

/** Two characters per pack so the home shelf shows new packs too. */
const FEATURED_CHARACTERS: StickerCharacter[] = (() => {
  const picks: StickerCharacter[] = [];
  for (let round = 0; round < 2; round += 1) {
    for (const pack of PACKS) {
      const character = CHARACTERS_BY_PACK.get(pack.id)?.[round];
      if (character) picks.push(character);
    }
  }
  return picks;
})();

interface StickerBrowserProps {
  onOpenLibrary: () => void;
}

export function StickerBrowser({ onOpenLibrary }: StickerBrowserProps) {
  const created = useCreatedCharacters();
  const [kind, setKind] = useState<Kind>("全部");
  const previewId = useAppStore((state) => state.previewId);
  const selectSticker = useAppStore((state) => state.selectSticker);

  const list = useMemo(() => {
    const candidates = kind === "含动态" ? CHARACTERS : [...created, ...FEATURED_CHARACTERS];
    return candidates.filter((character) => {
      const hasAnimated = characterHasAnimated(character);
      if (kind === "纯静态" && hasAnimated) return false;
      if (kind === "含动态" && !hasAnimated) return false;
      return true;
    });
  }, [created, kind]);

  return (
    <section className="glass flex h-full min-h-0 flex-1 flex-col rounded-[28px] p-4 pb-2 shadow-soft">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">贴纸仓库</h3>
          <p className="mt-0.5 text-[9.5px] text-ink-faint">
            {CHARACTERS.length + created.length} 个角色 · 精选预览
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="pressable group inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/80 bg-white/60 pl-3 pr-2.5 text-[10.5px] font-semibold text-[#5c7898] hover:bg-white/90"
        >
          查看全部
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <Segmented options={KINDS} value={kind} onChange={setKind} className="mt-3 shrink-0" />

      <div className="-mr-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1.5 pb-1 pr-2.5">
        <div className="grid grid-cols-3 gap-2">
          {list.slice(0, PREVIEW_LIMIT).map((character) => (
            <StickerTile
              key={character.id}
              sticker={character.defaultVariant}
              selected={character.variants.some((variant) => variant.id === previewId)}
              onSelect={() => selectSticker(character.defaultVariant.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
