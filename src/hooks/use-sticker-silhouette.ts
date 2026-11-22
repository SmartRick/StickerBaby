import { useEffect, useState } from "react";
import { nativeStickerUrl, readCreatedImage } from "@/lib/created-stickers";
import { stickerSrc, type Sticker } from "@/lib/stickers";
import {
  BOX_SILHOUETTE,
  readStickerSilhouette,
  type StickerSilhouette,
} from "@/lib/sticker-silhouette";

interface CachedSilhouette {
  pending: Promise<StickerSilhouette>;
  value?: StickerSilhouette;
}

const silhouettes = new Map<string, CachedSilhouette>();

async function readBrowserSilhouette(id: string) {
  const file = await readCreatedImage(id);
  if (!file) return BOX_SILHOUETTE;
  const url = URL.createObjectURL(file);
  try {
    return await readStickerSilhouette(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useStickerSilhouette(sticker: Sticker) {
  const path = sticker.created?.path;
  const src = path ? nativeStickerUrl(path) : stickerSrc(sticker.id);
  const browserId = sticker.created && !path ? sticker.id : undefined;
  const key = browserId ?? src;
  const [loaded, setLoaded] = useState<StickerSilhouette>();

  useEffect(() => {
    if (!key) return;
    let current = true;
    let entry = silhouettes.get(key);
    if (!entry) {
      const pending = browserId ? readBrowserSilhouette(browserId) : readStickerSilhouette(src);
      entry = { pending };
      silhouettes.set(key, entry);
    }
    const cached = entry;
    void cached.pending.then((silhouette) => {
      cached.value = silhouette;
      if (current) setLoaded(silhouette);
    }, () => {
      if (silhouettes.get(key) === cached) silhouettes.delete(key);
      if (current) setLoaded(BOX_SILHOUETTE);
    });
    return () => { current = false; };
  }, [browserId, key, src]);

  return key ? silhouettes.get(key)?.value ?? loaded ?? BOX_SILHOUETTE : BOX_SILHOUETTE;
}
