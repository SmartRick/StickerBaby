import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArrowUpToLine, Check, FlipHorizontal, Hand, LockKeyhole, Monitor, Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { StickerImage } from "@/components/sticker-image";
import { ParticlePicker } from "@/components/particle-picker";
import { ChromaEditor } from "@/components/desktop-page";
import { placeStickerGesture, StickerGestureEffect, type ActiveStickerGesture } from "@/components/sticker-gesture";
import { useStickerSilhouette } from "@/hooks/use-sticker-silhouette";
import { characterOf } from "@/lib/characters";
import { particlesForSticker } from "@/lib/effects";
import { sendToOverlay } from "@/lib/overlay-client";
import { packTitle } from "@/lib/packs";
import { getStickerGesture, STICKER_GESTURES, type StickerGestureDefinition } from "@/lib/sticker-gestures";
import { stickerBounds } from "@/lib/sticker-silhouette";
import { STATE_LABEL, type Sticker } from "@/lib/stickers";
import { useAppStore, type PetInstance } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * 桌面上一张贴纸的详情：摆放（置顶 / 锁定 / 翻转 / 大小）、中键手势（带预览）、
 * 点击粒子、视频抠像。原来的“互动”页并到了这里——它们设置的都是同一张桌面贴纸。
 */
export function PetInspector({ pet, sticker }: { pet: PetInstance; sticker: Sticker }) {
  const updatePet = useAppStore((state) => state.updatePet);
  const removePet = useAppStore((state) => state.removePet);
  const typeParticles = useAppStore((state) => state.stickerParticles[sticker.characterId]);
  const floating = (pet.layer ?? "floating") === "floating";
  const character = characterOf(sticker);
  const pose = character?.variants.find((item) => item.state === pet.pose) ?? sticker;
  const chroma = pet.chroma !== undefined ? pet.chroma : sticker.video?.chroma ?? null;
  const auto = typeParticles?.length ? typeParticles : particlesForSticker(character?.defaultVariant.id ?? sticker.id);

  const toggles = [
    { label: floating ? "置顶中" : "在桌面层", active: floating, icon: ArrowUpToLine, onClick: () => updatePet(pet.id, { layer: floating ? "desktop" : "floating" }) },
    { label: pet.passthrough ? "已锁定" : "锁定", active: Boolean(pet.passthrough), icon: LockKeyhole, onClick: () => updatePet(pet.id, { passthrough: !pet.passthrough }) },
    { label: "翻转", active: Boolean(pet.flipped), icon: FlipHorizontal, onClick: () => updatePet(pet.id, { flipped: !pet.flipped }) },
    { label: `${Math.round(pet.scale * 100)}%`, active: false, icon: RotateCcw, onClick: () => updatePet(pet.id, { scale: 1, angle: 0 }), title: "恢复默认大小并摆正" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-[20px] border border-white/80 bg-white/70 p-3">
        <button
          type="button"
          title="让它动一下"
          onClick={() => void sendToOverlay({ type: "sticker.react", petId: pet.id })}
          className="pressable grid h-16 w-16 shrink-0 place-items-center rounded-2xl"
          style={{ background: `radial-gradient(120% 110% at 50% 0%, #fff 0%, ${sticker.accent} 100%)` }}
        >
          <StickerImage sticker={pose} className="h-14 w-14" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-ink">{sticker.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-ink-faint">
            {packTitle(sticker.packId)}
            {character && character.variants.length > 1 && ` · ${pet.pose ? STATE_LABEL[pet.pose] : "自动切换状态"}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {toggles.map(({ label, active, icon: Icon, onClick, title }) => (
              <button
                key={label}
                type="button"
                title={title}
                aria-pressed={active}
                onClick={onClick}
                className={cn(
                  "pressable inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold",
                  active ? "bg-[#e8f2ff] text-[#2e67ba]" : "bg-white text-ink-soft hover:bg-[#f4f9ff]"
                )}
              >
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          title="抱回小窝"
          onClick={() => removePet(pet.id)}
          className="pressable grid h-8 w-8 shrink-0 place-items-center self-start rounded-full text-ink-faint hover:bg-rose-500/10 hover:text-rose-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <GestureSection pet={pet} sticker={pose} />

      <Card icon={<Sparkles className="h-3.5 w-3.5" />} title="点击粒子" description={pet.particles?.length ? "这张单独设置" : typeParticles?.length ? "跟随这款贴纸的设置" : "按主题自动"}
        action={
          <button
            type="button"
            onClick={() => void sendToOverlay({ type: "sticker.react", petId: pet.id })}
            className="pressable inline-flex items-center gap-1 rounded-xl border border-[#dce7f5] bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-[#2e67ba] hover:bg-[#f4f9ff]"
          >
            <Monitor className="h-3.5 w-3.5" /> 在桌面上试试
          </button>
        }
      >
        <ParticlePicker value={pet.particles} auto={auto} onChange={(particles) => updatePet(pet.id, { particles })} />
      </Card>

      {sticker.video && (
        <ChromaEditor value={chroma} onChange={(next) => updatePet(pet.id, { chroma: next })} onReset={() => updatePet(pet.id, { chroma: undefined })} />
      )}
    </div>
  );
}

function Card({ icon, title, description, action, children }: { icon: ReactNode; title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-[20px] border border-white/80 bg-white/70 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#eef5ff] text-[#4a8df8]">{icon}</span>
          <div>
            <h4 className="text-[12px] font-bold text-ink">{title}</h4>
            {description && <p className="text-[9.5px] text-ink-faint">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** 中键手势：选中即设为这张贴纸的中键动作，左侧小舞台预览，也可以直接在桌面上播放 */
function GestureSection({ pet, sticker }: { pet: PetInstance; sticker: Sticker }) {
  const updatePet = useAppStore((state) => state.updatePet);
  const reduceMotion = useAppStore((state) => state.settings.reduceMotion);
  const [playback, setPlayback] = useState<ActiveStickerGesture | null>(null);
  const [greet, setGreet] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const sprite = useRef<HTMLDivElement>(null);
  const spriteMotion = useRef<HTMLDivElement>(null);
  const silhouette = useStickerSilhouette(sticker);
  const chosen = getStickerGesture(pet.gesture);

  const onContact = useCallback(() => setGreet((key) => key + 1), []);
  const onFinish = useCallback((finished: ActiveStickerGesture) => setPlayback((current) => (current === finished ? null : current)), []);

  const preview = (definition: StickerGestureDefinition) => {
    if (!stage.current || !sprite.current) return;
    const area = stage.current.getBoundingClientRect();
    const image = sprite.current.getBoundingClientRect();
    setPlayback(
      placeStickerGesture(
        definition,
        { left: image.left - area.left, top: image.top - area.top, width: image.width, height: image.height },
        stickerBounds(silhouette, 0, Boolean(pet.flipped)),
        area
      )
    );
  };

  return (
    <Card
      icon={<Hand className="h-3.5 w-3.5" />}
      title="中键互动"
      description="鼠标中键点这张贴纸时播放的手势"
      action={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => preview(chosen)}
            className="pressable inline-flex items-center gap-1 rounded-xl bg-[#eef5ff] px-2.5 py-1.5 text-[10.5px] font-semibold text-[#2e67ba] hover:bg-[#dceaff]"
          >
            <Play className="h-3.5 w-3.5" /> 预览
          </button>
          <button
            type="button"
            onClick={() => void sendToOverlay({ type: "sticker.gesture", petId: pet.id, gesture: chosen.id })}
            className="pressable inline-flex items-center gap-1 rounded-xl border border-[#dce7f5] bg-white px-2.5 py-1.5 text-[10.5px] font-semibold text-[#2e67ba] hover:bg-[#f4f9ff]"
          >
            <Monitor className="h-3.5 w-3.5" /> 在桌面上播放
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3">
        <div ref={stage} className="relative grid h-[150px] place-items-center overflow-hidden rounded-2xl bg-[#eaf2fc]">
          <div ref={sprite} className="relative h-24 w-24">
            <div ref={spriteMotion} className="h-full w-full">
              <div className="h-full w-full" style={{ scale: pet.flipped ? "-1 1" : undefined }}>
                <StickerImage sticker={sticker} animated={!reduceMotion} greet={greet} className="h-full w-full" />
              </div>
            </div>
            {playback && (
              <StickerGestureEffect gesture={playback} spriteMotion={spriteMotion} reduceMotion={reduceMotion} onContact={onContact} onFinish={onFinish} />
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {STICKER_GESTURES.map((definition) => {
            const selected = chosen.id === definition.id;
            return (
              <button
                key={definition.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  updatePet(pet.id, { gesture: definition.id });
                  preview(definition);
                }}
                className={cn(
                  "pressable relative flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-[10px] font-semibold",
                  selected ? "border-[#8fb9fa] bg-[#eef5ff] text-[#2e67ba]" : "border-[#e6edf8] bg-white/75 text-ink-soft hover:bg-white"
                )}
              >
                <img src={definition.image} alt="" draggable={false} className="h-8 w-full max-w-[52px] object-contain" />
                <span className="truncate">{definition.label}</span>
                {selected && <Check aria-hidden className="absolute right-1 top-1 h-3 w-3" />}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
