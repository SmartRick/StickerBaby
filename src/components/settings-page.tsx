import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  Blend,
  Info,
  Keyboard,
  LockKeyhole,
  Monitor,
  MousePointer2,
  Orbit,
  Power,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StickerImage } from "@/components/sticker-image";
import { findSticker, useAppStore, type StickerMode } from "@/lib/store";
import { STICKERS } from "@/lib/stickers";
import { toast } from "@/lib/toast";
import { invokeSafe, quitApp } from "@/lib/tauri";
import { cn } from "@/lib/utils";

function SectionCard({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass rounded-[24px] p-4 shadow-soft", className)}>
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/75 text-[#4a8df8] shadow-sm">
          {icon}
        </span>
        <div>
          <h3 className="text-[12.5px] font-bold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[9.5px] text-ink-faint">{description}</p>}
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  icon,
  control,
  disabled,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  control: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3", disabled && "opacity-50")}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-ink-faint">{icon}</span>}
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[9.5px] leading-4 text-ink-soft">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function PhysicsSlider({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow
      title={label}
      description={description}
      control={
        <div className="flex items-center gap-2">
          <Slider
            aria-label={label}
            className="w-[clamp(64px,11vw,132px)]"
            value={[value]}
            min={min}
            max={max}
            step={0.05}
            onValueChange={([next]) => onChange(next)}
          />
          <span className="w-9 text-right text-[10px] font-semibold tabular-nums text-ink-soft">
            {Math.round(value * 100)}%
          </span>
        </div>
      }
    />
  );
}

function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-[#dfe8f4] bg-white/85 px-1.5 text-[9.5px] font-bold text-[#5d7697] shadow-[0_2px_0_rgba(190,205,225,0.6)]">
      {children}
    </kbd>
  );
}

const STICKER_MODES: Array<{
  id: StickerMode;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    id: "float",
    label: "悬浮",
    description: "停在原位，可自由摆放",
    icon: Sparkles,
  },
  {
    id: "gravity",
    label: "重力",
    description: "有重量，会下落、碰撞、翻滚",
    icon: ArrowDown,
  },
  {
    id: "space",
    label: "太空",
    description: "无重力，拖一下顺着惯性漂",
    icon: Orbit,
  },
];

export function SettingsPage() {
  const settings = useAppStore((state) => state.settings);
  const pets = useAppStore((state) => state.pets);
  const setSettings = useAppStore((state) => state.setSettings);
  const toggleSetting = useAppStore((state) => state.toggleSetting);
  const resetSettings = useAppStore((state) => state.resetSettings);
  const clearPets = useAppStore((state) => state.clearPets);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [idlePreview, setIdlePreview] = useState(true);

  const sticker = useAppStore((state) => findSticker(state.previewId, state.createdStickers)) ?? STICKERS[4];
  const floatingCount = pets.filter((pet) => (pet.layer ?? "floating") === "floating").length;
  const desktopCount = pets.length - floatingCount;

  useEffect(() => {
    if (!settings.autoDim) {
      setIdlePreview(false);
      return;
    }
    setIdlePreview(false);
    const timer = window.setTimeout(() => setIdlePreview(true), Math.max(1200, settings.dimDelay * 1000));
    return () => window.clearTimeout(timer);
  }, [settings.autoDim, settings.dimDelay]);

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-1 pb-1">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="font-display text-[18px] font-semibold tracking-tight text-ink">偏好设置</h2>
        </div>

        {settings.passthrough && (
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[#ffe1a8] bg-[#fff8e9]/90 px-4 py-3 text-[10.5px] text-[#8a6420] shadow-soft backdrop-blur">
            <span className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              全局锁定已开启：所有贴纸仍可见，但点击会直接传给下方应用。
            </span>
            <button
              type="button"
              onClick={() => toggleSetting("passthrough")}
              className="pressable shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-bold text-[#8a6420] hover:bg-white"
            >
              立即关闭
            </button>
          </div>
        )}

        <SectionCard
          icon={<Sparkles className="h-4 w-4" />}
          title="贴纸模式"
          description="决定贴纸在桌面上的运动方式"
        >
          <div className="grid grid-cols-3 gap-2 px-1 pb-1">
            {STICKER_MODES.map((mode) => {
              const Icon = mode.icon;
              const active = settings.stickerMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSettings({ stickerMode: mode.id })}
                  className={cn(
                    "pressable rounded-2xl border p-3 text-left transition-colors",
                    active
                      ? "border-[#9cc6ff] bg-white shadow-[0_10px_22px_-18px_rgba(41,96,179,0.8)]"
                      : "border-white/70 bg-white/45 hover:bg-white/75"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-xl",
                      active
                        ? "bg-gradient-to-br from-[#e8f2ff] to-[#d7e9ff] text-[#4a8df8]"
                        : "bg-white/70 text-ink-faint"
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.1} />
                  </span>
                  <span className="mt-2 block text-[11.5px] font-bold text-ink">
                    {mode.label}
                  </span>
                  <span className="mt-0.5 block text-[9px] leading-4 text-ink-soft">
                    {mode.description}
                  </span>
                </button>
              );
            })}
          </div>

          {settings.stickerMode === "float" && (
            <SettingRow
              title="轻微晃动"
              description="悬浮模式下让贴纸轻轻呼吸、摇摆"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              control={
                <Switch
                  checked={settings.idleMotion !== false}
                  onCheckedChange={(checked) => setSettings({ idleMotion: checked })}
                />
              }
            />
          )}

          {settings.stickerMode !== "float" && (
            <div className="mt-2">
              {settings.stickerMode === "gravity" ? (
                <PhysicsSlider
                  label="重力强度"
                  description="越高，下落越快"
                  value={settings.gravityStrength}
                  min={0.1}
                  max={2}
                  onChange={(gravityStrength) => setSettings({ gravityStrength })}
                />
              ) : (
                <PhysicsSlider
                  label="惯性强度"
                  description="越高，松手后漂得越远"
                  value={settings.inertiaStrength}
                  min={0.2}
                  max={2}
                  onChange={(inertiaStrength) => setSettings({ inertiaStrength })}
                />
              )}
              <PhysicsSlider
                label="贴纸重量"
                description="越重，拖动时跟手越慢"
                value={settings.physicsWeight}
                min={0.3}
                max={2.5}
                onChange={(physicsWeight) => setSettings({ physicsWeight })}
              />
              <PhysicsSlider
                label="碰撞弹性"
                description="控制撞到贴纸或屏幕边缘时的反弹"
                value={settings.physicsBounce}
                min={0}
                max={1.5}
                onChange={(physicsBounce) => setSettings({ physicsBounce })}
              />
              <SettingRow
                title="贴纸之间碰撞"
                description="关闭后贴纸可以互相穿过，仍会被屏幕边缘挡住"
                control={
                  <Switch
                    aria-label="贴纸之间碰撞"
                    checked={settings.petCollisions}
                    onCheckedChange={(petCollisions) => setSettings({ petCollisions })}
                  />
                }
              />
              <SettingRow
                title="允许翻滚"
                description="关闭后贴纸始终保持朝上"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                control={
                  <Switch
                    checked={settings.tumble}
                    onCheckedChange={(checked) => setSettings({ tumble: checked })}
                  />
                }
              />
              <div className="flex items-center justify-between gap-3 px-1 py-1">
                <div>
                  <p className="text-[11.5px] font-semibold text-ink">物理帧率</p>
                  <p className="mt-0.5 text-[9.5px] text-ink-soft">
                    运动时的更新频率上限，实际表现随屏幕和负载变化
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/70 bg-white/45 p-1">
                  {([30, 60, 120] as const).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => setSettings({ physicsFps: fps })}
                      className={cn(
                        "pressable rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors",
                        settings.physicsFps === fps
                          ? "bg-[#4a8df8] text-white shadow-sm"
                          : "text-ink-soft hover:bg-white/80"
                      )}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={<Monitor className="h-4 w-4" />}
          title="桌面行为"
          description="控制贴纸层和窗口的关系"
        >
          <SettingRow
            title="全部禁止拖动"
            description="所有贴纸不能拖动，但仍可点击互动"
            icon={<LockKeyhole className="h-3.5 w-3.5" />}
            control={
              <Switch
                checked={settings.locked}
                onCheckedChange={() => toggleSetting("locked")}
                disabled={settings.passthrough}
              />
            }
            disabled={settings.passthrough}
          />
          <SettingRow
            title="全局锁定"
            description="所有贴纸临时锁定并可点击穿透；关闭后恢复每张贴纸自己的锁定状态"
            icon={<MousePointer2 className="h-3.5 w-3.5" />}
            control={
              <Switch
                checked={settings.passthrough}
                onCheckedChange={() => toggleSetting("passthrough")}
              />
            }
          />
          <SettingRow
            title="显示桌面贴纸"
            description={settings.overlayVisible ? "贴纸正在桌面上" : "贴纸层已隐藏，随时可以叫回来"}
            icon={settings.overlayVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            control={
              <Switch
                checked={settings.overlayVisible}
                onCheckedChange={() => toggleSetting("overlayVisible")}
              />
            }
          />
        </SectionCard>

        <SectionCard
          icon={<Blend className="h-4 w-4" />}
          title="自动降低透明度"
          description="安静的时候退到背景里，需要时再出现"
        >
          <SettingRow
            title="自动变淡"
            description="鼠标离开一段时间后，宠物会慢慢变透明"
            icon={<Timer className="h-3.5 w-3.5" />}
            control={
              <Switch checked={settings.autoDim} onCheckedChange={() => toggleSetting("autoDim")} />
            }
          />
          <SettingRow
            title="闲置等待"
            description="鼠标离开多久后开始变淡"
            control={
              <span className="rounded-full bg-white/70 px-2 py-1 text-[9.5px] font-bold text-[#5d7697]">
                {settings.dimDelay} 秒
              </span>
            }
            disabled={!settings.autoDim}
          />
          <div className={cn("pb-4 pt-1", !settings.autoDim && "pointer-events-none opacity-50")}>
            <Slider
              value={[settings.dimDelay]}
              min={2}
              max={30}
              step={1}
              onValueChange={([value]) => setSettings({ dimDelay: value })}
              className="[&_[data-slot=slider-range]]:bg-[#8cb8f5] [&_[data-slot=slider-thumb]]:border-[#8cb8f5]"
            />
            <div className="mt-1 flex justify-between px-0.5 text-[8.5px] text-ink-faint">
              <span>2 秒</span>
              <span>30 秒</span>
            </div>
          </div>
          <div className={cn("pb-2 pt-1", !settings.autoDim && "pointer-events-none opacity-50")}>
            <div className="flex items-center justify-between pb-2">
              <p className="text-[11.5px] font-semibold text-ink">最低透明度</p>
              <span className="rounded-full bg-white/70 px-2 py-1 text-[9.5px] font-bold text-[#5d7697]">
                {Math.round(settings.dimOpacity * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(settings.dimOpacity * 100)]}
              min={20}
              max={90}
              step={1}
              onValueChange={([value]) => setSettings({ dimOpacity: value / 100 })}
              className="[&_[data-slot=slider-range]]:bg-[#8cb8f5] [&_[data-slot=slider-thumb]]:border-[#8cb8f5]"
            />
            <div className="mt-1 flex justify-between px-0.5 text-[8.5px] text-ink-faint">
              <span>几乎透明</span>
              <span>清晰可见</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={<SlidersHorizontal className="h-4 w-4" />}
          title="外观"
          description="让宠物更合你的桌面"
        >
          <div className="pb-3 pt-3">
            <div className="flex items-center justify-between pb-2">
              <div>
                <p className="text-[11.5px] font-semibold text-ink">宠物大小</p>
                <p className="mt-0.5 text-[9.5px] text-ink-soft">统一调整桌面上所有宠物的尺寸</p>
              </div>
              <span className="rounded-full bg-white/70 px-2 py-1 text-[9.5px] font-bold text-[#5d7697]">
                {Math.round(settings.petScale * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(settings.petScale * 100)]}
              min={70}
              max={140}
              step={5}
              onValueChange={([value]) => setSettings({ petScale: value / 100 })}
              className="[&_[data-slot=slider-range]]:bg-[#8cb8f5] [&_[data-slot=slider-thumb]]:border-[#8cb8f5]"
            />
          </div>
          <SettingRow
            title="减少动态效果"
            description="关闭呼吸、摇摆等闲置动画，更省电"
            control={
              <Switch
                checked={settings.reduceMotion}
                onCheckedChange={(checked) => setSettings({ reduceMotion: checked })}
              />
            }
          />
        </SectionCard>

        <SectionCard icon={<Keyboard className="h-4 w-4" />} title="快捷操作" description="任何时候都能用">
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[11.5px] font-semibold text-ink">切换全局锁定</p>
              <p className="mt-0.5 text-[9.5px] text-ink-soft">锁定后忘了怎么关？按这个组合键</p>
            </div>
            <div className="flex items-center gap-1">
              <ShortcutKey>Ctrl</ShortcutKey>
              <span className="text-[9px] text-ink-faint">+</span>
              <ShortcutKey>Alt</ShortcutKey>
              <span className="text-[9px] text-ink-faint">+</span>
              <ShortcutKey>P</ShortcutKey>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-[11.5px] font-semibold text-ink">托盘菜单</p>
              <p className="mt-0.5 text-[9.5px] text-ink-soft">关闭主窗口后，从系统托盘找回桌面宠物</p>
            </div>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[9.5px] font-semibold text-[#5d7697]">
              常驻托盘
            </span>
          </div>
        </SectionCard>

        <SectionCard icon={<Power className="h-4 w-4" />} title="数据与退出" description="管理桌面上的小伙伴">
          <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-[11.5px] font-semibold text-ink">清空桌面</p>
              <p className="mt-0.5 text-[9.5px] text-ink-soft">
                当前桌面有 {pets.length} 只，贴纸库不会被删除
              </p>
            </div>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  disabled={pets.length === 0}
                  className="pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-[#ffd9de] bg-[#fff5f6] px-3 text-[10px] font-bold text-[#d8667a] hover:bg-[#ffeef0] disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" /> 清空
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-[24px]">
                <DialogHeader>
                  <DialogTitle>让所有小伙伴回家？</DialogTitle>
                  <DialogDescription>
                    桌面上的 {pets.length} 只宠物会被收起，之后还可以从贴纸库重新领养。
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="pressable h-9 rounded-full border border-[#e2ecf9] bg-white px-4 text-[11px] font-semibold text-ink-soft hover:bg-[#f7fbff]"
                  >
                    再想想
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearPets();
                      setConfirmOpen(false);
                      toast("桌面已经收拾干净啦", "success");
                    }}
                    className="pressable h-9 rounded-full bg-[#4a8df8] px-4 text-[11px] font-bold text-white hover:bg-[#3d80ea]"
                  >
                    全部抱回家
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-[11.5px] font-semibold text-ink">恢复默认设置</p>
              <p className="mt-0.5 text-[9.5px] text-ink-soft">不会影响桌面宠物和贴纸库</p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetSettings();
                toast("设置已经恢复默认", "success");
              }}
              className="pressable inline-flex h-8 items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 text-[10px] font-semibold text-[#5d7697] hover:bg-white"
            >
              <RotateCcw className="h-3 w-3" /> 恢复
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-[11.5px] font-semibold text-ink">退出桌面宠物</p>
              <p className="mt-0.5 text-[9.5px] text-ink-soft">关闭主窗口只是收进托盘，这里才会真正退出</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void quitApp();
                setTimeout(() => toast("如果应用没有退出，请从托盘菜单退出"), 600);
              }}
              className="pressable inline-flex h-8 items-center gap-1.5 rounded-full bg-[#2f3d54] px-3 text-[10px] font-bold text-white hover:bg-[#253246]"
            >
              <Power className="h-3 w-3" /> 退出应用
            </button>
          </div>
        </SectionCard>

        <div className="flex items-center justify-center gap-2 py-2 text-[9.5px] text-ink-faint">
          <Sparkles className="h-3 w-3" />
          贴纸宝宝 v0.1.0 · 用 Tauri + React + shadcn/ui 制作
        </div>
      </div>

      <aside className="hidden w-[290px] shrink-0 flex-col gap-3.5 overflow-y-auto lg:flex">
        <section className="glass rounded-[24px] p-3.5 shadow-soft">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[12px] font-bold text-ink">桌面预览</h3>
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-ink-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 实时
            </span>
          </div>
          <div
            className="relative mt-2.5 h-[214px] overflow-hidden rounded-[18px] border border-white/60"
            style={{
              background:
                "radial-gradient(120% 90% at 30% 0%, #eaf5ff 0%, #dcecff 45%, #f9f2e5 100%)",
            }}
            onMouseEnter={() => setIdlePreview(false)}
            onMouseLeave={() => settings.autoDim && setIdlePreview(true)}
          >
            <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(180deg,#e6d7c4,#cfb491)] opacity-60" />
            <div className="absolute left-3 top-3 flex gap-1">
              <span className="h-8 w-6 rounded-[4px] bg-white/40" />
              <span className="h-8 w-6 rounded-[4px] bg-white/25" />
            </div>
            <span className="absolute right-4 top-4 h-12 w-12 rounded-full bg-white/35" />
            <div className="absolute inset-0 grid place-items-center">
              <div
                className="transition-all duration-700"
                style={{
                  opacity: settings.autoDim && idlePreview ? settings.dimOpacity : 1,
                  width: `${132 * settings.petScale}px`,
                  height: `${132 * settings.petScale}px`,
                  maxWidth: "82%",
                  maxHeight: "82%",
                }}
              >
                <StickerImage
                  sticker={sticker}
                  className={`h-full w-full ${settings.reduceMotion ? "" : "animate-[float_5.4s_ease-in-out_infinite]"} drop-shadow-[0_18px_20px_rgba(40,60,90,0.25)]`}
                />
              </div>
            </div>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/70 px-2 py-1 text-[8.5px] font-semibold text-[#60758c] backdrop-blur">
              {settings.autoDim
                ? idlePreview
                  ? `闲置中 · 透明度 ${Math.round(settings.dimOpacity * 100)}%`
                  : "鼠标移入 · 恢复清晰"
                : "自动变淡已关闭"}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5 px-0.5">
            <span className={cn("rounded-full px-2 py-1 text-[8.5px] font-bold", settings.locked ? "bg-[#fff2df] text-[#a9782f]" : "bg-[#f0f3f7] text-[#8b9aab]")}>
              拖动锁定 {settings.locked ? "ON" : "OFF"}
            </span>
            <span className={cn("rounded-full px-2 py-1 text-[8.5px] font-bold", settings.passthrough ? "bg-[#ffeaf0] text-[#c15a75]" : "bg-[#f0f3f7] text-[#8b9aab]")}>
              全局锁定 {settings.passthrough ? "ON" : "OFF"}
            </span>
            <span className="rounded-full bg-[#f0f3f7] px-2 py-1 text-[8.5px] font-bold text-[#8b9aab]">
              悬浮 {floatingCount} · 桌面 {desktopCount}
            </span>
          </div>
        </section>

        <section className="glass rounded-[24px] p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#fff4dc] text-[#e1a232]">
              <Info className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-[11.5px] font-bold text-ink">小贴士</h3>
          </div>
          <ul className="mt-2 space-y-2 text-[9.5px] leading-[1.7] text-ink-soft">
            <li>· 左键拖动贴纸可以换位置，右键拖拽可以调整大小。</li>
            <li>· 右键贴纸可以锁定（点击穿透）、左右翻转、换一只或移除。</li>
            <li>· 锁定模式下主窗口和托盘仍然可以操作。</li>
            <li>· 关闭主窗口不会退出，贴纸会继续留在桌面上。</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
