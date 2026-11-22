import { useState } from "react";
import {
  ArrowDown,
  ArrowUpToLine,
  ChevronDown,
  Eye,
  EyeOff,
  FlipHorizontal,
  Hand,
  LockKeyhole,
  MousePointer2,
  Orbit,
  RotateCcw,
  Sparkles,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { PercentSlider, SectionCard, SettingRow } from "@/components/setting-parts";
import { StickerImage } from "@/components/sticker-image";
import { Segmented } from "@/components/segmented";
import { PetInspector } from "@/components/pet-inspector";
import { sendToOverlay } from "@/lib/overlay-client";
import { packShort } from "@/lib/packs";
import { findSticker, useAppStore, type PetInstance, type StickerMode } from "@/lib/store";
import type { Sticker } from "@/lib/stickers";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ChromaKey } from "@/shared/protocol";

const MODES: Array<{ id: StickerMode; label: string; description: string; icon: typeof Hand }> = [
  { id: "float", label: "悬浮", description: "拖到哪停在哪，轻轻呼吸摇摆", icon: Sparkles },
  { id: "desk", label: "桌面", description: "甩一下滑出去，撞边挤压回弹", icon: Hand },
  { id: "space", label: "太空", description: "无重力，拖一下顺着惯性漂", icon: Orbit },
  { id: "gravity", label: "重力", description: "会下落、碰撞、堆叠、翻滚", icon: ArrowDown },
];

const TABS = ["桌面上的贴纸", "运动与行为"] as const;
type Tab = (typeof TABS)[number];

/**
 * 我的桌面：
 * - 桌面上的贴纸：左边列表，右边是选中那张的详情（摆放、中键互动、点击粒子、视频抠像）
 * - 运动与行为：运动模式、碰撞、全局锁定等对所有贴纸生效的设置
 */
export function DesktopPage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const [tab, setTab] = useState<Tab>("桌面上的贴纸");
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">我的桌面</h2>
          <p className="mt-0.5 text-[10.5px] text-ink-soft">桌面上每张贴纸的设置，以及它们怎么动</p>
        </div>
        <Segmented options={TABS} value={tab} onChange={setTab} className="min-w-[240px]" />
      </header>
      {tab === "桌面上的贴纸" ? (
        <PetWorkspace onOpenLibrary={onOpenLibrary} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 items-start gap-4 overflow-y-auto pb-4 pr-1">
          <MotionSection />
          <BehaviorSection />
        </div>
      )}
    </div>
  );
}

function PetWorkspace({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const pets = useAppStore((state) => state.pets);
  const created = useAppStore((state) => state.createdStickers);
  const [selectedId, setSelectedId] = useState<string>();
  const rows = pets
    .flatMap((pet) => {
      const sticker = findSticker(pet.stickerId, created);
      return sticker ? [{ pet, sticker }] : [];
    })
    .sort((a, b) => b.pet.z - a.pet.z);
  const selected = rows.find(({ pet }) => pet.id === selectedId) ?? rows[0];

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-4 pb-1">
      <PetList rows={rows} selectedId={selected?.pet.id} onSelect={setSelectedId} onOpenLibrary={onOpenLibrary} />
      <div className="min-h-0 overflow-y-auto pb-3 pr-1">
        {selected ? (
          <PetInspector key={selected.pet.id} pet={selected.pet} sticker={selected.sticker} />
        ) : (
          <div className="grid h-full place-items-center rounded-[24px] border border-dashed border-[#d9e5f4] bg-white/40 text-[11px] text-ink-soft">
            选一张桌面上的贴纸来设置
          </div>
        )}
      </div>
    </div>
  );
}

function MotionSection() {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const mode = settings.stickerMode;
  const collide = mode !== "float" && settings.collisions[mode];
  const rigid = mode === "space" || mode === "gravity" || collide;

  return (
    <SectionCard icon={<Sparkles className="h-4 w-4" />} title="运动模式" description="拖拽、甩出、松手之后贴纸怎么运动">
      <div className="grid grid-cols-4 gap-2 px-1 pb-1">
        {MODES.map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSettings({ stickerMode: item.id })}
              className={cn(
                "pressable rounded-2xl border p-3 text-left transition-colors",
                active ? "border-[#9cc6ff] bg-white shadow-[0_10px_22px_-18px_rgba(41,96,179,0.8)]" : "border-white/70 bg-white/45 hover:bg-white/75"
              )}
            >
              <span className={cn("grid h-8 w-8 place-items-center rounded-xl", active ? "bg-gradient-to-br from-[#e8f2ff] to-[#d7e9ff] text-[#4a8df8]" : "bg-white/70 text-ink-faint")}>
                <Icon className="h-4 w-4" strokeWidth={2.1} />
              </span>
              <span className="mt-2 block text-[11.5px] font-bold text-ink">{item.label}</span>
              <span className="mt-0.5 block text-[9px] leading-4 text-ink-soft">{item.description}</span>
            </button>
          );
        })}
      </div>

      {mode !== "float" && (
        <SettingRow
          title="贴纸之间碰撞"
          description={collide ? "贴纸会互相推挤、撞开" : "贴纸互相穿过，只会被屏幕边缘挡住"}
          control={
            <Switch
              aria-label="贴纸之间碰撞"
              checked={collide}
              onCheckedChange={(on) => setSettings({ collisions: { ...settings.collisions, [mode]: on } })}
            />
          }
        />
      )}
      {(mode === "float" || mode === "desk") && (
        <SettingRow
          title="轻微晃动"
          description="静止时轻轻呼吸、摇摆"
          control={<Switch checked={settings.idleMotion} onCheckedChange={(idleMotion) => setSettings({ idleMotion })} />}
        />
      )}
      {mode === "gravity" && (
        <PercentSlider label="重力强度" description="越高，下落越快" value={settings.gravityStrength} min={0.1} max={2} onChange={(gravityStrength) => setSettings({ gravityStrength })} />
      )}
      {mode !== "gravity" && rigid && (
        <PercentSlider label="惯性强度" description="越高，松手后滑得越远" value={settings.inertiaStrength} min={0.2} max={2} onChange={(inertiaStrength) => setSettings({ inertiaStrength })} />
      )}
      {rigid && (
        <>
          <PercentSlider label="贴纸重量" description="越重越难被别的贴纸撞开" value={settings.physicsWeight} min={0.3} max={2.5} onChange={(physicsWeight) => setSettings({ physicsWeight })} />
          <PercentSlider label="碰撞弹性" description="撞到贴纸或屏幕边缘时的反弹" value={settings.physicsBounce} min={0} max={1.5} onChange={(physicsBounce) => setSettings({ physicsBounce })} />
          <SettingRow
            title="允许翻滚"
            description="关闭后贴纸始终保持原来的角度"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            control={<Switch checked={settings.tumble} onCheckedChange={(tumble) => setSettings({ tumble })} />}
          />
          <div className="flex items-center justify-between gap-3 px-1 py-2">
            <div>
              <p className="text-[11.5px] font-semibold text-ink">物理帧率</p>
              <p className="mt-0.5 text-[9.5px] text-ink-soft">运动时的模拟频率，实际表现随屏幕和负载变化</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-white/70 bg-white/45 p-1">
              {([30, 60, 120] as const).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => setSettings({ physicsFps: fps })}
                  className={cn(
                    "pressable rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors",
                    settings.physicsFps === fps ? "bg-[#4a8df8] text-white shadow-sm" : "text-ink-soft hover:bg-white/80"
                  )}
                >
                  {fps}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function BehaviorSection() {
  const settings = useAppStore((state) => state.settings);
  const toggleSetting = useAppStore((state) => state.toggleSetting);
  return (
    <SectionCard icon={<MousePointer2 className="h-4 w-4" />} title="桌面行为" description="贴纸和其他应用的关系">
      <SettingRow
        title="全局锁定"
        description="所有贴纸点击穿透、不能拖动。Ctrl+Alt+P 随时切换。"
        icon={<LockKeyhole className="h-3.5 w-3.5" />}
        control={<Switch checked={settings.passthrough} onCheckedChange={() => toggleSetting("passthrough")} />}
      />
      <SettingRow
        title="显示桌面贴纸"
        description={settings.overlayVisible ? "贴纸正在桌面上（特效不受影响）" : "贴纸已隐藏，随时可以叫回来"}
        icon={settings.overlayVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        control={<Switch checked={settings.overlayVisible} onCheckedChange={() => toggleSetting("overlayVisible")} />}
      />
    </SectionCard>
  );
}

function PetList({
  rows,
  selectedId,
  onSelect,
  onOpenLibrary,
}: {
  rows: { pet: PetInstance; sticker: Sticker }[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onOpenLibrary: () => void;
}) {
  const clearPets = useAppStore((state) => state.clearPets);
  const setState = useAppStore.setState;
  const allLocked = rows.length > 0 && rows.every(({ pet }) => pet.passthrough);
  const floating = rows.filter(({ pet }) => (pet.layer ?? "floating") === "floating").length;

  return (
    <section className="glass flex min-h-0 flex-col rounded-[24px] p-3 shadow-soft">
      <div className="px-1">
        <h3 className="text-[12.5px] font-bold text-ink">桌面上的贴纸</h3>
        <p className="mt-0.5 text-[9.5px] text-ink-faint">
          共 {rows.length} 张 · 置顶 {floating} · 桌面层 {rows.length - floating}
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center">
          <div className="text-center">
            <p className="text-[12px] font-semibold text-ink-soft">桌面上还没有贴纸</p>
            <button
              type="button"
              onClick={onOpenLibrary}
              className="pressable mt-3 h-9 rounded-full bg-[#4a8df8] px-4 text-[11px] font-bold text-white hover:bg-[#3d80ea]"
            >
              去贴纸库挑一张
            </button>
          </div>
        </div>
      ) : (
        <ul className="mt-2.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {rows.map(({ pet, sticker }) => {
            const active = pet.id === selectedId;
            const top = (pet.layer ?? "floating") === "floating";
            return (
              <li key={pet.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(pet.id)}
                  className={cn(
                    "pressable flex w-full items-center gap-2.5 rounded-[16px] border px-2 py-1.5 text-left transition-colors",
                    active ? "border-[#9cc6ff] bg-white shadow-[0_10px_22px_-18px_rgba(41,96,179,0.8)]" : "border-white/70 bg-white/50 hover:bg-white/80"
                  )}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f8ff]">
                    <StickerImage sticker={sticker} className="h-8 w-8" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-bold text-ink">{sticker.name}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[9px]">
                      <span className={cn("rounded-full px-1.5 py-px font-semibold", top ? "bg-[#eef5ff] text-[#4a8df8]" : "bg-[#f1efe9] text-[#8a7b5e]")}>
                        {top ? "置顶" : "桌面层"}
                      </span>
                      {pet.passthrough && <span className="rounded-full bg-[#fff4dc] px-1.5 py-px font-semibold text-[#c99a1a]">锁定</span>}
                      {pet.particles?.length ? <span className="rounded-full bg-[#f3eeff] px-1.5 py-px font-semibold text-[#7b61e8]">自定粒子</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => setState((state) => ({ pets: state.pets.map((pet) => ({ ...pet, passthrough: !allLocked })) }))}
          className="pressable inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/80 bg-white/70 text-[10px] font-semibold text-[#5d7697] hover:bg-white disabled:opacity-40"
        >
          {allLocked ? <UnlockKeyhole className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" />}
          {allLocked ? "全部解锁" : "全部锁定"}
        </button>
        <button
          type="button"
          disabled={rows.length === 0}
          onClick={() => {
            clearPets();
            toast("桌面已经收拾干净啦", "success");
          }}
          className="pressable inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#ffd9de] bg-[#fff5f6] text-[10px] font-bold text-[#d8667a] hover:bg-[#ffeef0] disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" /> 清空桌面
        </button>
      </div>
    </section>
  );
}

const DEFAULT_CHROMA: ChromaKey = { color: [0.01, 0.96, 0.01], similarity: 0.4, smoothness: 0.08, spill: 0.1 };

/** 视频贴纸绿幕抠像参数（实时作用于桌面上的这张贴纸） */
export function ChromaEditor({
  value,
  onChange,
  onReset,
}: {
  value: ChromaKey | null;
  onChange: (value: ChromaKey | null) => void;
  onReset?: () => void;
}) {
  const key = value ?? DEFAULT_CHROMA;
  const sliders: Array<{ field: "similarity" | "smoothness" | "spill"; label: string; max: number }> = [
    { field: "similarity", label: "抠像范围", max: 0.8 },
    { field: "smoothness", label: "边缘羽化", max: 0.3 },
    { field: "spill", label: "去溢色", max: 0.5 },
  ];
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-white/70 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold text-ink">绿幕抠像</span>
        <div className="flex items-center gap-2">
          {onReset && (
            <button type="button" onClick={onReset} className="text-[9.5px] font-semibold text-[#4a8df8] hover:underline">
              恢复默认
            </button>
          )}
          <Switch aria-label="绿幕抠像" checked={value !== null} onCheckedChange={(on) => onChange(on ? key : null)} />
        </div>
      </div>
      {value !== null &&
        sliders.map(({ field, label, max }) => (
          <div key={field} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-[9.5px] text-ink-soft">{label}</span>
            <Slider
              aria-label={label}
              value={[key[field]]}
              min={0}
              max={max}
              step={0.005}
              onValueChange={([next]) => onChange({ ...key, [field]: next })}
            />
            <span className="w-8 text-right text-[9px] tabular-nums text-ink-faint">{key[field].toFixed(2)}</span>
          </div>
        ))}
    </div>
  );
}
