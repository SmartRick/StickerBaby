import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";
import { stickerSrc, type Sticker } from "@/lib/stickers";

import { nativeStickerUrl, readCreatedImage } from "@/lib/created-stickers";

const RiveSticker = lazy(() => import("@/components/rive-sticker"));

interface StickerImageProps {
  sticker: Sticker;
  className?: string;
  animated?: boolean;
  paused?: boolean;
  greet?: number;
  desktop?: boolean;
}

export function StickerImage({
  sticker,
  className,
  animated = false,
  paused = false,
  greet = 0,
  desktop = false,
}: StickerImageProps) {
  const [browserAsset, setBrowserAsset] = useState<{ id: string; url: string }>();
  const localPath = sticker.created?.path;
  const browserId = sticker.created && !localPath ? sticker.id : undefined;
  useEffect(() => {
    if (!browserId) return;
    let active = true;
    let url: string | undefined;
    void readCreatedImage(browserId).then((file) => {
      if (!active || !file) return;
      url = URL.createObjectURL(file);
      setBrowserAsset({ id: browserId, url });
    }, (error: unknown) => console.warn("[deskpet] sticker image unavailable", error));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [browserId]);

  const src = localPath
    ? nativeStickerUrl(localPath)
    : browserAsset?.id === sticker.id ? browserAsset.url : stickerSrc(sticker.id);
  if (!src) {
    return (
      <div className={cn("grid place-items-center text-ink-faint", className)}>
        <PawPrint className="h-8 w-8" />
      </div>
    );
  }
  const image = (classes?: string) => (
    <img
      src={src}
      alt={sticker.name}
      draggable={false}
      className={cn("select-none object-contain", classes)}
      style={{ WebkitUserDrag: "none" } as CSSProperties}
    />
  );

  if (!animated || !sticker.riveSrc) return image(className);
  return (
    <Suspense fallback={image(className)}>
      <RiveSticker
        key={sticker.id}
        src={sticker.riveSrc}
        name={sticker.name}
        className={className}
        poster={image("h-full w-full")}
        paused={paused}
        greet={greet}
        desktop={desktop}
      />
    </Suspense>
  );
}
