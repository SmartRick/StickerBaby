import { useEffect, useRef } from "react";
import { ChromaVideo } from "@/overlay/stickers/chroma";
import { resolveSrc } from "@/overlay/stickers/sticker";
import type { ChromaKey } from "@/shared/protocol";
import { cn } from "@/lib/utils";

/** 视频贴纸缩略图：静音循环播放，有抠像参数时用与桌面相同的 WebGL 抠像 */
export function VideoThumb({ src, chroma, className, name }: { src: string; chroma: ChromaKey | null; className?: string; name: string }) {
  const host = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(chroma);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = resolveSrc(src);
    video.className = "absolute inset-0 h-full w-full object-contain";
    void video.play().catch(() => {});
    let view: ChromaVideo | null = null;
    const params = JSON.parse(key) as ChromaKey | null;
    if (params) {
      try {
        view = new ChromaVideo(video, params);
        view.canvas.className = "absolute inset-0 h-full w-full object-contain";
        el.appendChild(view.canvas);
      } catch {
        el.appendChild(video);
      }
    } else {
      el.appendChild(video);
    }
    return () => {
      view?.dispose();
      view?.canvas.remove();
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };
  }, [src, key]);

  return <div ref={host} role="img" aria-label={name} className={cn("relative", className)} />;
}
