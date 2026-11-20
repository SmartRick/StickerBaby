import { useMemo } from "react";
import { CHARACTERS, type StickerCharacter } from "@/lib/characters";
import { useAppStore } from "@/lib/store";

export function useCreatedCharacters() {
  const created = useAppStore((state) => state.createdStickers);
  return useMemo(() => created.map((sticker): StickerCharacter => ({
    id: sticker.characterId,
    name: sticker.name,
    en: sticker.en,
    packId: sticker.packId,
    subject: sticker.subject,
    style: sticker.style,
    mood: sticker.mood,
    tags: sticker.tags,
    variants: [sticker],
    defaultVariant: sticker,
  })), [created]);
}

export function useStickerCatalog() {
  const created = useCreatedCharacters();
  return useMemo(() => [...created, ...CHARACTERS], [created]);
}
