import { useMemo, useState } from "react";
import { ArrowRight, Eye, EyeOff, Hand, LockKeyhole, Play, Square, Trash2 } from "lucide-react";
import { Segmented } from "@/components/segmented";
import { StickerTile } from "@/components/sticker-tile";
import { StickerImage } from "@/components/sticker-image";
import { useCreatedCharacters } from "@/hooks/use-sticker-catalog";
import { CHARACTERS, characterHasAnimated, type StickerCharacter } from "@/lib/characters";
import { PACKS } from "@/lib/packs";
import { findSticker, useAppStore } from "@/lib/store";
import { sendToOverlay, useOverlayRuntime } from "@/lib/overlay-client";
import type { PageKey } from "@/lib/pages";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PLAYABLE_BY_ID, runningIds, thumbOf, type Playable } from "@/domain/playables";
import { play, stop } from "@/domain/play";

const TABS = ["贴纸", "玩法", "桌面"] as const;
type Tab = (typeof TABS)[number];

/** 首页常用玩法（各领域挑几个最有代表性的） */
const FAVORITES = [
  "effect:fireworks", "effect:confetti", "effect:coin-rain", "effect:snow",
  "effect:sakura", "prank:goldfish", "prank:cockroach", "prank:crack",
  "prank:error-popups", "combo:missile-strike", "distort:shake", "distort:wave",
].flatMap((id) => PLAYABLE_BY_ID.get(id) ?? []);

/**
 * 首页右侧快捷面板：
 * - 贴纸：按主题包快速挑选，点选预览、一键贴到桌面
 * - 玩法：常用特效 / 恶作剧 / 扰动，点一下就播
 * - 桌面：桌面上的贴纸（点一下让它动）与常用开关
 */
export function HomeQuickPanel({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [tab, setTab] = useState<Tab>("贴纸");
  const runtime = useOverlayRuntime();
  const petCount = useAppStore((state) => state.pets.length);
  const running = runningIds(runtime);
  const liveCount = [...running.values()].reduce((a, b) => a + b, 0);

  return (
    <section className="glass flex h-full min-h-0 flex-col rounded-[28px] p-4 pb-2 shadow-soft">
      <div className="flex shrink-0 items-center gap-2">
        <Segmented
          options={TABS}
          value={tab}
          onChange={setTab}
          className="flex-1"
          itemClassName="relative"
        />
      </div>
      <div className="mt-1.5 flex shrink-0 gap-3 px-1 text-[9.5px] text-ink-faint">
        <span>{CHARACTERS.length} 个角色</span>
        <span>桌面 {petCount} 张</span>
        <span className={cn(liveCount > 0 && "font-semibold text-emerald-600")}>运行中 {liveCount} 个玩法</span>
      </div>
      <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
        {tab === "贴纸" && <StickerTab onNavigate={onNavigate} />}
        {tab === "玩法" && <PlayTab running={running} onNavigate={onNavigate} />}
        {tab === "桌面" && <DesktopTab onNavigate={onNavigate} />}
      </div>
    </section>
  );
}

function StickerTab({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const created = useCreatedCharacters();
  const [pack, setPack] = useState<string>("all");
  const previewId = useAppStore((state) => state.previewId);
  const selectSticker = useAppStore((state) => state.selectSticker);
  const addPet = useAppStore((state) => state.addPet);

  const chips = useMemo(
    () => [
      { id: "all", label: "常用推荐" },
      { id: "live", label: "动态" },
      ...(created.length ? [{ id: "created", label: "我的创作" }] : []),
      ...PACKS.map((p) => ({ id: p.id, label: p.short })),
    ],
    [created.length]
  );

  const usage = useAppStore((state) => state.usage);
  const pets = useAppStore((state) => state.pets);

  const list = useMemo<StickerCharacter[]>(() => {
    if (pack === "created") return created;
    if (pack === "live") return CHARACTERS.filter(characterHasAnimated);
    if (pack !== "all") return CHARACTERS.filter((c) => c.packId === pack);
    return recommend([...created, ...CHARACTERS], usage, pets);
  }, [created, pack, usage, pets]);

  return (
    <>
      <div className="no-scrollbar -mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setPack(chip.id)}
            className={cn(
              "pressable h-7 shrink-0 rounded-full px-3 text-[10.5px] font-semibold transition-colors",
              pack === chip.id ? "chip-active" : "bg-white/55 text-ink-soft hover:bg-white/85"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto px-1.5 pb-1 pr-2.5">
        <div className="grid grid-cols-3 gap-2">
          {list.map((character) => (
            <StickerTile
              key={character.id}
              sticker={character.defaultVariant}
              selected={character.variants.some((variant) => variant.id === previewId)}
              onSelect={() => selectSticker(character.defaultVariant.id)}
              onAdd={() => {
                addPet(character.defaultVariant.id);
                toast(`「${character.name}」已经贴到桌面上啦`, "success");
              }}
            />
          ))}
        </div>
      </div>
      <FooterLink label="打开贴纸库" onClick={() => onNavigate("library")} />
    </>
  );
}

function PlayTab({ running, onNavigate }: { running: Map<string, number>; onNavigate: (page: PageKey) => void }) {
  const trigger = (p: Playable) => {
    if (p.mode === "persist" && running.has(p.id) && !p.stackable) void stop(p);
    else void play(p, { intensity: 0.6, target: "foreground" });
  };
  return (
    <>
      <div className="-mr-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1 pr-2">
        <div className="grid grid-cols-2 gap-2">
          {FAVORITES.map((p) => {
            const active = running.has(p.id);
            const thumb = thumbOf(p);
            return (
              <div key={p.id} className={cn("group relative overflow-hidden rounded-[16px] border bg-white/75", active ? "border-[#9cc6ff]" : "border-white/80")}>
                <button type="button" onClick={() => trigger(p)} className="block w-full text-left" aria-label={`播放 ${p.name}`}>
                  <div className="relative aspect-[16/9] overflow-hidden bg-[#e9f2fc]">
                    {thumb && <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />}
                    <span className={cn("absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-white shadow-sm transition-opacity", active ? "bg-emerald-500" : "bg-[#4a8df8] opacity-0 group-hover:opacity-100")}>
                      {active ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : <Play className="h-3 w-3" fill="currentColor" />}
                    </span>
                  </div>
                  <p className="truncate px-2 py-1.5 text-[10.5px] font-bold text-ink">{p.name}</p>
                </button>
                {active && p.mode === "persist" && (
                  <button
                    type="button"
                    onClick={() => void stop(p)}
                    className="pressable absolute left-1.5 top-1.5 inline-flex h-5 items-center gap-1 rounded-full bg-white px-1.5 text-[8.5px] font-bold text-[#d8667a] shadow-sm"
                  >
                    <Square className="h-2 w-2" fill="currentColor" /> 停止
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5 pt-1">
        {([["effects", "全屏特效"], ["pranks", "恶作剧"], ["disturb", "屏幕扰动"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onNavigate(key)}
            className="pressable flex-1 rounded-full bg-white/60 py-1.5 text-[10px] font-semibold text-[#5c7898] hover:bg-white"
          >
            {label} →
          </button>
        ))}
      </div>
    </>
  );
}

function DesktopTab({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const pets = useAppStore((state) => state.pets);
  const created = useAppStore((state) => state.createdStickers);
  const settings = useAppStore((state) => state.settings);
  const toggleSetting = useAppStore((state) => state.toggleSetting);
  const clearPets = useAppStore((state) => state.clearPets);
  const toggles = [
    { key: "overlayVisible", label: settings.overlayVisible ? "贴纸显示中" : "贴纸已隐藏", on: settings.overlayVisible, icon: settings.overlayVisible ? Eye : EyeOff },
    { key: "passthrough", label: "全局锁定", on: settings.passthrough, icon: LockKeyhole },
    { key: "autoDim", label: "自动变淡", on: settings.autoDim, icon: Hand },
  ] as const;

  return (
    <>
      <div className="grid shrink-0 grid-cols-3 gap-1.5">
        {toggles.map(({ key, label, on, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => toggleSetting(key)}
            className={cn(
              "pressable flex flex-col items-center gap-1 rounded-2xl border py-2 text-[10px] font-semibold",
              on ? "border-[#9cc6ff] bg-white text-[#2e67ba]" : "border-white/70 bg-white/45 text-ink-soft hover:bg-white/75"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 shrink-0 px-1 text-[10px] text-ink-faint">点一下，让桌面上的它动一动</p>
      <div className="-mr-1 mt-1.5 min-h-0 flex-1 overflow-y-auto px-1 pr-2">
        {pets.length === 0 ? (
          <p className="grid h-full place-items-center text-[11px] text-ink-soft">桌面上还没有贴纸</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {pets.map((pet) => {
              const sticker = findSticker(pet.stickerId, created);
              if (!sticker) return null;
              return (
                <button
                  key={pet.id}
                  type="button"
                  title={sticker.name}
                  onClick={() => void sendToOverlay({ type: "sticker.react", petId: pet.id })}
                  className="pressable relative grid aspect-square place-items-center rounded-2xl border border-white/80 bg-white/65 hover:bg-white"
                >
                  <StickerImage sticker={sticker} className="h-[78%] w-[78%]" />
                  {pet.layer === "desktop" && <span className="absolute bottom-1 rounded-full bg-[#f1efe9] px-1 text-[8px] font-semibold text-[#8a7b5e]">桌面层</span>}
                  {pet.passthrough && <LockKeyhole className="absolute right-1 top-1 h-3 w-3 text-[#c99a1a]" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5 pt-1">
        <button
          type="button"
          disabled={!pets.length}
          onClick={() => {
            clearPets();
            toast("桌面已经收拾干净啦", "success");
          }}
          className="pressable inline-flex items-center gap-1 rounded-full bg-[#fff5f6] px-3 py-1.5 text-[10px] font-semibold text-[#d8667a] hover:bg-[#ffeef0] disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" /> 清空
        </button>
        <FooterLink grow label="管理我的桌面" onClick={() => onNavigate("desktop")} />
      </div>
    </>
  );
}

function FooterLink({ label, onClick, grow }: { label: string; onClick: () => void; grow?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(grow && "flex-1", "pressable group mt-1 inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-full bg-white/60 text-[10px] font-semibold text-[#5c7898] hover:bg-white")}
    >
      {label}
      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 首页推荐：用过的贴纸排在前面——最近贴过的、贴得多的、正在桌面上的分数更高；
 * 之后补上我的创作和每个主题包的代表角色，保证新用户也有东西可挑。
 */
function recommend(
  all: StickerCharacter[],
  usage: Record<string, { count: number; last: number }>,
  pets: { stickerId: string }[],
): StickerCharacter[] {
  const now = Date.now();
  const onDesktop = new Map<string, number>();
  for (const pet of pets) {
    const character = all.find((c) => c.variants.some((v) => v.id === pet.stickerId));
    if (character) onDesktop.set(character.id, (onDesktop.get(character.id) ?? 0) + 1);
  }
  const score = (c: StickerCharacter) => {
    const u = usage[c.id];
    const recency = u ? 6 * Math.exp(-(now - u.last) / (3 * DAY)) : 0;
    return (u?.count ?? 0) + recency + (onDesktop.get(c.id) ?? 0) * 2;
  };
  const used = all.filter((c) => score(c) > 0).sort((a, b) => score(b) - score(a));
  const picked = new Set(used.map((c) => c.id));
  const packs = new Set<string>();
  const rest = all.filter((c) => {
    if (picked.has(c.id)) return false;
    if (c.packId === "created") return true;
    if (packs.has(c.packId)) return false;
    packs.add(c.packId);
    return true;
  });
  return [...used, ...rest];
}
