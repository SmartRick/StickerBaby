import { useCallback, useRef, useState } from "react";
import { Check, Play } from "lucide-react";
import { StickerImage } from "@/components/sticker-image";
import { placeStickerGesture, StickerGestureEffect, type ActiveStickerGesture } from "@/components/sticker-gesture";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStickerSilhouette } from "@/hooks/use-sticker-silhouette";
import { characterOf } from "@/lib/characters";
import {
  getStickerGesture,
  STICKER_GESTURES,
  type StickerGestureDefinition,
  type StickerGestureId,
} from "@/lib/sticker-gestures";
import { stickerBounds } from "@/lib/sticker-silhouette";
import { STICKERS } from "@/lib/stickers";
import { findSticker, useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function InteractionsPage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const pets = useAppStore((state) => state.pets);
  const created = useAppStore((state) => state.createdStickers);
  const previewId = useAppStore((state) => state.previewId);
  const updatePet = useAppStore((state) => state.updatePet);
  const reduceMotion = useAppStore((state) => state.settings.reduceMotion);
  const [selectedId, setSelectedId] = useState<string>();
  const [demoGesture, setDemoGesture] = useState<StickerGestureId>();
  const [playback, setPlayback] = useState<{ target: string; gesture: ActiveStickerGesture } | null>(null);
  const [greet, setGreet] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLDivElement>(null);
  const spriteMotion = useRef<HTMLDivElement>(null);

  const options = pets.flatMap((pet) => {
    const sticker = findSticker(pet.stickerId, created);
    return sticker ? [{ pet, sticker }] : [];
  });
  const selection = options.find(({ pet }) => pet.id === selectedId) ?? options[0];
  const pet = selection?.pet;
  const sticker = selection?.sticker ?? findSticker(previewId, created) ?? STICKERS[0];
  const pose = characterOf(sticker)?.variants.find((item) => item.state === pet?.pose) ?? sticker;
  const silhouette = useStickerSilhouette(pose);
  const chosen = getStickerGesture(pet ? pet.gesture : demoGesture);
  const target = `${pet?.id ?? "preview"}:${pose.id}`;
  const activeGesture = playback?.target === target ? playback.gesture : null;

  const onContact = useCallback(() => setGreet((key) => key + 1), []);
  const onFinish = useCallback((finished: ActiveStickerGesture) => {
    setPlayback((current) => current?.gesture === finished ? null : current);
  }, []);

  const play = (definition: StickerGestureDefinition) => {
    if (!stage.current || !sprite.current) return;
    const area = stage.current.getBoundingClientRect();
    const image = sprite.current.getBoundingClientRect();
    const bounds = stickerBounds(silhouette, 0, Boolean(pet?.flipped));
    setPlayback({
      target,
      gesture: placeStickerGesture(definition, {
        left: image.left - area.left,
        top: image.top - area.top,
        width: image.width,
        height: image.height,
      }, bounds, area),
    });
  };

  const choose = (definition: StickerGestureDefinition) => {
    if (pet) updatePet(pet.id, { gesture: definition.id });
    else setDemoGesture(definition.id);
    play(definition);
  };

  return (
    <div className="h-full space-y-3.5 overflow-y-auto pb-4 pr-1">
      <header className="px-1">
        <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">互动</h2>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-[20px] border border-white/80 bg-white/70 p-4 shadow-soft" aria-labelledby="interaction-choices">
          {pet ? (
            <div className="space-y-1.5">
              <label htmlFor="interaction-sticker" className="text-[11px] font-semibold text-ink-soft">
                要设置的贴纸
              </label>
              <Select value={pet.id} onValueChange={(id) => {
                setSelectedId(id);
                setPlayback(null);
              }}>
                <SelectTrigger id="interaction-sticker" className="w-full rounded-xl border-[#dce7f5] bg-white/90 text-xs text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {options.map(({ pet: option, sticker: art }, index) => {
                    const desktop = option.layer === "desktop";
                    const hasDuplicate = options.some(({ pet: other, sticker: otherArt }) =>
                      other.id !== option.id && otherArt.name === art.name && (other.layer === "desktop") === desktop
                    );
                    return (
                      <SelectItem key={option.id} value={option.id} className="text-xs">
                        <StickerImage sticker={art} className="h-6 w-6 shrink-0" />
                        {art.name} · {desktop ? "桌面层" : "置顶层"}{hasDuplicate && ` · ${index + 1}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3 rounded-xl bg-[#eef5ff] px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-ink-soft">贴一张到桌面，就能为它设置中键动作。</p>
              <button
                type="button"
                onClick={onOpenLibrary}
                className="pressable shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-[#2e67ba]"
              >
                打开贴纸库
              </button>
            </div>
          )}

          <div>
            <h3 id="interaction-choices" className="mb-2 text-[12px] font-semibold text-ink">
              {pet ? "中键动作" : "选择动作预览"}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {STICKER_GESTURES.map((definition) => {
                const selected = chosen.id === definition.id;
                return (
                  <button
                    key={definition.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => choose(definition)}
                    className={cn(
                      "pressable relative flex min-w-0 flex-col items-center gap-2 rounded-xl border px-1.5 py-2.5 text-center text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-[#4a8df8]",
                      selected
                        ? "border-[#8fb9fa] bg-[#eef5ff] text-[#2e67ba]"
                        : "border-[#e6edf8] bg-white/75 text-ink-soft hover:bg-white"
                    )}
                  >
                    <img src={definition.image} alt="" draggable={false} className="h-12 w-full max-w-[70px] object-contain" />
                    <span>{definition.label}</span>
                    {selected && <Check aria-hidden="true" className="absolute right-1.5 top-1.5 h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-[20px] border border-white/80 bg-white/70 p-4 shadow-soft" aria-labelledby="interaction-preview">
          <div className="flex items-center justify-between gap-3">
            <h3 id="interaction-preview" className="text-[12px] font-semibold text-ink">动作预览</h3>
            <button
              type="button"
              onClick={() => play(chosen)}
              className="pressable flex items-center gap-1.5 rounded-xl bg-[#eef5ff] px-3 py-2 text-[11px] font-semibold text-[#2e67ba] hover:bg-[#dceaff]"
            >
              <Play className="h-3.5 w-3.5" /> 播放预览
            </button>
          </div>
          <div ref={stage} className="relative grid h-[280px] place-items-center overflow-hidden rounded-2xl bg-[#eaf2fc]">
            <div ref={sprite} className="relative h-40 w-40">
              <div ref={spriteMotion} className="h-full w-full">
                <div className="h-full w-full" style={{ scale: pet?.flipped ? "-1 1" : undefined }}>
                  <StickerImage sticker={pose} animated={!reduceMotion} greet={greet} className="h-full w-full" />
                </div>
              </div>
              {activeGesture && (
                <StickerGestureEffect
                  gesture={activeGesture}
                  spriteMotion={spriteMotion}
                  reduceMotion={reduceMotion}
                  onContact={onContact}
                  onFinish={onFinish}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
