import { useState } from "react";
import { ArrowDown, ArrowRight, Hand, Heart, ImagePlus, Orbit, Sparkles } from "lucide-react";
import { useAppStore, type StickerMode } from "@/lib/store";
import { cn } from "@/lib/utils";
import { StickerImage } from "@/components/sticker-image";
import { CHARACTERS } from "@/lib/characters";
import { STICKERS } from "@/lib/stickers";
import { BANNERS } from "@/lib/banners";

interface HeroBannerProps {
  onAdopt: () => void;
  onCreate: () => void;
}

const MODES: Array<{ id: StickerMode; label: string; icon: typeof Hand }> = [
  { id: "float", label: "悬浮", icon: Sparkles },
  { id: "desk", label: "桌面", icon: Hand },
  { id: "space", label: "太空", icon: Orbit },
  { id: "gravity", label: "重力", icon: ArrowDown },
];

/** 每次启动随机挑一张 banner 背景 */
const BANNER = (() => {
  const images = Object.values(BANNERS);
  return images[Math.floor(Math.random() * images.length)];
})();

/** 今日主角：按天轮换（视频贴纸不在推荐之列），当天打开都是同一只 */
const DAILY = (() => {
  const pool = CHARACTERS.map((character) => character.defaultVariant).filter(
    (sticker) => sticker.kind !== "video"
  );
  return pool[Math.floor(Date.now() / 86_400_000) % pool.length];
})();

export function HeroBanner({ onAdopt, onCreate }: HeroBannerProps) {
  const mode = useAppStore((state) => state.settings.stickerMode);
  const setSettings = useAppStore((state) => state.setSettings);
  return (
    <section className="relative h-[172px] shrink-0 overflow-hidden rounded-[28px] border border-white/70 bg-[#dff2ff] shadow-soft">
      <img
        src={BANNER}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.78)_0%,rgba(255,255,255,0.46)_38%,rgba(255,255,255,0.04)_68%,transparent_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-[#2f5f7a]/10" />

      {/* 倾斜的今日主角名牌，压在贴纸左缘后方，更有张力 */}
      <div className="pointer-events-none absolute bottom-[38px] right-[142px] z-0 -rotate-[8deg] text-right">
        <p className="text-[9.5px] font-bold tracking-[0.32em] text-white/95 drop-shadow-[0_1px_4px_rgba(43,76,125,0.6)]">
          今日主角
        </p>
        <p className="font-display text-[26px] font-black leading-tight text-white drop-shadow-[0_3px_10px_rgba(43,76,125,0.7)]">
          {DAILY.name}
        </p>
      </div>

      <div className="pointer-events-none absolute -right-2 bottom-[-16px] z-10 h-[196px] w-[196px]">
        <div
          className="absolute inset-0 rounded-full opacity-80 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.9), transparent 68%)" }}
        />
        <StickerImage
          sticker={DAILY}
          className="absolute inset-0 h-full w-full -rotate-[4deg] animate-[bob_5s_ease-in-out_infinite] drop-shadow-[0_22px_26px_rgba(67,89,120,0.26)]"
        />
      </div>

      <Heart className="absolute right-[190px] top-6 h-7 w-7 -rotate-12 fill-[#ff8fa3] text-[#ff8fa3] drop-shadow-sm" strokeWidth={1.5} />
      <Heart className="absolute right-[174px] top-[62px] h-4 w-4 rotate-12 fill-[#ff9fb0] text-[#ff9fb0]" strokeWidth={1.5} />
      <Sparkles className="absolute right-[228px] top-[112px] h-6 w-6 text-[#ffd45e]" strokeWidth={2} />
      <Sparkles className="absolute right-[206px] bottom-[26px] h-3.5 w-3.5 text-[#ffe28a]" strokeWidth={2.4} />

      <div className="relative z-10 flex h-full flex-col justify-center gap-3 px-7 pb-1">
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/80 bg-white/55 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[#5b7ba4] backdrop-blur">
          <Sparkles className="h-3 w-3 text-[#ffb84d]" strokeWidth={2.4} />
          每天一点小陪伴
          <span className="ml-1 h-1 w-1 rounded-full bg-[#8fb6e8]" />
          {STICKERS.length} 张贴纸
        </div>
        <h2 className="font-display text-[29px] font-semibold leading-[1.15] tracking-tight text-[#2b4c7d]">
          用可爱的贴纸
          <br />
          <span className="text-[#3c7edb]">点亮你的桌面～</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onAdopt}
            className="pressable group inline-flex w-fit items-center gap-2 rounded-full border border-white/90 bg-gradient-to-r from-[#fff2cf] via-[#ffe9b5] to-[#ffe1a4] px-4 py-2 text-[12px] font-bold text-[#8a6420] shadow-[0_10px_20px_-14px_rgba(150,108,32,0.7)] hover:from-[#ffefc2] hover:to-[#ffd991]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#e8a52f]" strokeWidth={2.4} />
            随机贴一张
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="pressable inline-flex w-fit items-center gap-2 rounded-full border border-white/90 bg-white/70 px-4 py-2 text-[12px] font-bold text-[#3a66a8] shadow-[0_10px_20px_-14px_rgba(90,130,190,0.8)] backdrop-blur hover:bg-white"
          >
            <ImagePlus className="h-3.5 w-3.5 text-[#4a8df8]" strokeWidth={2.4} />
            创建贴纸
          </button>
          <div className="flex items-center gap-0.5 rounded-full border border-white/80 bg-white/55 p-1 backdrop-blur" title="贴纸运动模式">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setSettings({ stickerMode: id })}
                className={cn(
                  "pressable inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10.5px] font-semibold transition-colors",
                  mode === id ? "bg-white text-[#2e67ba] shadow-sm" : "text-[#5b7ba4] hover:bg-white/70"
                )}
              >
                <Icon className="h-3 w-3" strokeWidth={2.4} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
