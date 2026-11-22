import { STATE_ORDER, STICKERS, type Sticker } from "@/lib/stickers";

/**
 * The library browses characters, not raw variants. A character groups every
 * pose of the same sticker (default, sleeping, dragged...).
 */
export interface StickerCharacter {
  id: string;
  name: string;
  en: string;
  packId: string;
  subject: Sticker["subject"];
  style: Sticker["style"];
  mood: Sticker["mood"];
  tags: string[];
  variants: Sticker[];
  defaultVariant: Sticker;
}

const STATE_RANK = new Map(STATE_ORDER.map((state, index) => [state, index]));

export const CHARACTERS: StickerCharacter[] = (() => {
  const grouped = new Map<string, Sticker[]>();
  for (const sticker of STICKERS) {
    const list = grouped.get(sticker.characterId);
    if (list) {
      list.push(sticker);
    } else {
      grouped.set(sticker.characterId, [sticker]);
    }
  }

  return [...grouped.entries()].map(([id, variants]) => {
    const sorted = [...variants].sort(
      (a, b) => (STATE_RANK.get(a.state) ?? 99) - (STATE_RANK.get(b.state) ?? 99)
    );
    const defaultVariant = sorted.find((variant) => variant.state === "default") ?? sorted[0];
    return {
      id,
      name: defaultVariant.name,
      en: defaultVariant.en,
      packId: defaultVariant.packId,
      subject: defaultVariant.subject,
      style: defaultVariant.style,
      mood: defaultVariant.mood,
      tags: [...new Set(sorted.flatMap((variant) => variant.tags))],
      variants: sorted,
      defaultVariant,
    };
  });
})();

export const CHARACTER_BY_ID = new Map(CHARACTERS.map((character) => [character.id, character]));

export function characterOf(sticker: Sticker): StickerCharacter | undefined {
  return CHARACTER_BY_ID.get(sticker.characterId);
}

export function characterHasAnimated(character: StickerCharacter): boolean {
  return character.variants.some((variant) => variant.kind !== "static");
}
