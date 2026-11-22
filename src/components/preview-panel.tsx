import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  Image as ImageIcon,
  ImagePlus,
  Pause,
  PawPrint,
  Play,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StickerImage } from "@/components/sticker-image";
import { findSticker, useAppStore } from "@/lib/store";
import { GENERIC_PHRASES, STATE_LABEL, STICKERS } from "@/lib/stickers";
import { characterOf } from "@/lib/characters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { packTitle } from "@/lib/packs";
import { ROOMS, initialRoomIndex, rememberRoomIndex } from "@/lib/rooms";
import { effectForSticker } from "@/lib/effects";
import { StickerBurst } from "@/components/sticker-burst";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  onShuffle: () => void;
  onCreateSticker: () => void;
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="pressable grid h-8 w-8 place-items-center rounded-full border border-white/80 bg-white/80 text-[#5c7595] shadow-[0_8px_16px_-12px_rgba(40,71,116,0.6)] backdrop-blur hover:bg-white hover:text-[#2f5b95]"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function PreviewPanel({ onShuffle, onCreateSticker }: PreviewPanelProps) {
  const previewId = useAppStore((state) => state.previewId);
  const pets = useAppStore((state) => state.pets);
  const created = useAppStore((state) => state.createdStickers);
  const createdLoaded = useAppStore((state) => state.createdStickersLoaded);
  const addPet = useAppStore((state) => state.addPet);
  const selectSticker = useAppStore((state) => state.selectSticker);
  const reduceMotion = useAppStore((state) => state.settings.reduceMotion);
  const [paused, setPaused] = useState(false);
  const [reactKey, setReactKey] = useState(0);
  const [roomIndex, setRoomIndex] = useState(initialRoomIndex);
  const [stageGreet, setStageGreet] = useState(0);
  const [stageBouncing, setStageBouncing] = useState(false);
  const [stageBubble, setStageBubble] = useState<{ id: number; text: string } | null>(null);
  const [stageBursting, setStageBursting] = useState(false);
  const stageTimers = useRef<number[]>([]);

  const sticker = findSticker(previewId, created);
  const poses = sticker ? characterOf(sticker)?.variants : undefined;
  const instances = sticker
    ? pets.filter(
        (pet) => findSticker(pet.stickerId, created)?.characterId === sticker.characterId
      )
    : [];

  useEffect(() => {
    return () => {
      stageTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (createdLoaded && !sticker) {
      selectSticker(STICKERS[0].id);
    }
  }, [createdLoaded, selectSticker, sticker]);

  const handleStageClick = () => {
    if (!sticker) return;
    const text =
      Math.random() < 0.7
        ? sticker.phrase
        : GENERIC_PHRASES[Math.floor(Math.random() * GENERIC_PHRASES.length)];
    stageTimers.current.forEach((timer) => window.clearTimeout(timer));
    setStageBubble({ id: Date.now(), text });
    setStageGreet((key) => key + 1);
    setStageBouncing(true);
    setStageBursting(true);
    stageTimers.current = [
      window.setTimeout(() => setStageBouncing(false), 900),
      window.setTimeout(() => setStageBursting(false), 1700),
      window.setTimeout(() => setStageBubble(null), 3000),
    ];
  };

  const handleAdd = () => {
    if (!sticker) {
      toast("先从右边挑一张贴纸吧", "warn");
      return;
    }
    addPet(sticker.id);
    setReactKey((key) => key + 1);
    toast(`${sticker.name} 已经贴到桌面上啦`, "success");
  };

  return (
    <section className="glass flex h-full min-h-0 flex-1 flex-col rounded-[28px] p-3 shadow-soft">
      <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-[22px] border border-white/50 bg-[#dceaf9]">
        {/* generated room backdrop */}
        <img
          src={ROOMS[roomIndex]}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-[#3c2f22]/10" />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/20" />

        {/* 名称和状态选择 */}
        {sticker && (
          <div className="absolute left-3.5 top-3.5 z-20 flex items-center gap-2">
            <span className="rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[#405d80] shadow-sm backdrop-blur">
              {sticker.name}
              <span className="ml-1.5 font-medium text-ink-faint">{packTitle(sticker.packId)}</span>
            </span>
            {poses && poses.length > 1 && (
              <Select value={sticker.id} onValueChange={selectSticker}>
                <SelectTrigger aria-label="预览状态" className="h-7 rounded-full border-white/80 bg-white/90 px-2.5 text-[10px] font-bold text-[#405d80] data-[size=default]:h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {poses.map((pose) => <SelectItem key={pose.id} value={pose.id}>{STATE_LABEL[pose.state]}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* controls, top-right */}
        <div className="absolute right-3.5 top-3.5 z-20 flex gap-1.5">
          <ToolButton
            label="换个房间"
            onClick={() => setRoomIndex((index) => {
              const next = (index + 1) % ROOMS.length;
              rememberRoomIndex(next);
              return next;
            })}
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolButton>
          {sticker?.riveSrc && !reduceMotion && (
            <ToolButton label={paused ? "继续动起来" : "暂停动画"} onClick={() => setPaused((value) => !value)}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </ToolButton>
          )}
          <ToolButton label="换一只" onClick={onShuffle}>
            <RefreshCw className="h-3.5 w-3.5" />
          </ToolButton>
        </div>

        {instances.length > 0 && (
          <span className="pointer-events-none absolute right-3.5 bottom-3.5 z-20 inline-flex items-center gap-1 rounded-full bg-[#e8f7ee]/95 px-2.5 py-1 text-[10px] font-bold text-[#3f8f5c] shadow-sm">
            <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden /> 在桌面 ×{instances.length}
          </span>
        )}
        {sticker ? (
          <div key={`${sticker.id}-${reactKey}`} className="absolute inset-x-0 bottom-[7%] flex flex-col items-center">
            <div className="relative animate-pet-pop">
              {stageBubble && (
                <div
                  key={stageBubble.id}
                  className="bubble-tail animate-bubble pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 z-40 w-max max-w-[240px] -translate-x-1/2 rounded-[16px] border border-white/90 bg-white/95 px-3 py-2 text-center text-[11px] font-semibold leading-[1.45] text-[#42566f] shadow-[0_16px_30px_-16px_rgba(35,60,100,0.5)] backdrop-blur"
                >
                  {stageBubble.text}
                </div>
              )}
              {stageBursting && (
                <div className="absolute bottom-full left-1/2 z-30 h-24 w-36 -translate-x-1/2">
                  <StickerBurst key={stageGreet} effect={effectForSticker(sticker.id)} />
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                aria-label={`和${sticker.name}打个招呼`}
                title="点我一下"
                onClick={handleStageClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleStageClick();
                  }
                }}
                className="relative cursor-pointer rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-[#7aaef0]"
              >
                <div
                  className="pointer-events-none absolute -inset-[10%] -z-10 rounded-full opacity-90 blur-2xl"
                  style={{ background: `radial-gradient(circle, ${sticker.glow}, transparent 68%)` }}
                />
                <div className="pointer-events-none absolute -bottom-2 left-1/2 h-7 w-[62%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(50%_100%_at_50%_50%,rgba(60,45,30,0.22),transparent_72%)] blur-[3px]" />
                <div className={cn(stageBouncing && !reduceMotion && "animate-pet-bounce")}>
                  <StickerImage
                    sticker={sticker}
                    animated={!reduceMotion}
                    paused={paused}
                    greet={stageGreet}
                    className="sticker-img h-[clamp(190px,36vh,310px)] w-[clamp(190px,36vh,310px)] shrink-0 object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/80 bg-white/25 px-10 py-8 text-center backdrop-blur-sm">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/70 text-[#8aa4c2] shadow-sm">
                <PawPrint className="h-7 w-7" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-[#46637f]">预览区空空的</p>
                <p className="mt-1 text-[11px] text-[#71869c]">从右侧挑一只小伙伴来看看吧</p>
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-[30%] left-[52%] h-1.5 w-1.5 rounded-full bg-white/70 blur-[0.5px]" />
        <div className="pointer-events-none absolute bottom-[46%] left-[38%] h-1 w-1 rounded-full bg-white/60" />
        <div className="pointer-events-none absolute top-[26%] right-[24%] h-1.5 w-1.5 rounded-full bg-white/55" />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-1.5 pb-0.5 pt-2.5">
        <button
          type="button"
          onClick={onCreateSticker}
          className="pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e0eaf7] bg-white/80 px-3 text-[11.5px] font-bold text-[#466c98] hover:bg-white"
        >
          <ImagePlus className="size-3.5" aria-hidden />
          创建贴纸
        </button>

        <button
          type="button"
          onClick={handleAdd}
          className="pressable group inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-[#5b9bff] to-[#4287f5] px-5 text-[12px] font-bold text-white shadow-[0_14px_26px_-14px_rgba(46,106,210,0.95)] hover:from-[#6aa5ff] hover:to-[#4f91f8]"
        >
          {instances.length > 0 ? (
            <Plus className="h-4 w-4" strokeWidth={2.6} />
          ) : (
            <Play className="h-3.5 w-3.5 fill-white" strokeWidth={2} />
          )}
          {instances.length > 0 ? `再放一只` : "添加到桌面"}
          {instances.length > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px]">{instances.length}</span>
          )}
        </button>
      </div>
    </section>
  );
}
