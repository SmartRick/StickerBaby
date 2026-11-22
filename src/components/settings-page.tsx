import { useEffect, useState } from "react";
import {
  ArrowDown,
  Blend,
  Info,
  Keyboard,
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
import { SectionCard, SettingRow, ShortcutKey } from "@/components/setting-parts";
import { listMonitors, type MonitorDesc } from "@/lib/overlay-client";
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
import { findSticker, useAppStore } from "@/lib/store";
import { STICKERS } from "@/lib/stickers";
import { toast } from "@/lib/toast";
import { invokeSafe, quitApp } from "@/lib/tauri";
import { cn } from "@/lib/utils";

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

        <MonitorSection />

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
          description="让贴纸更合你的桌面"
        >
          <div className="pb-3 pt-3">
            <div className="flex items-center justify-between pb-2">
              <div>
                <p className="text-[11.5px] font-semibold text-ink">贴纸大小</p>
                <p className="mt-0.5 text-[9.5px] text-ink-soft">统一调整桌面上所有贴纸的尺寸</p>
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
          {[
            { title: "一键清场", description: "立即停止所有特效、恶作剧和扰动，还原被移动的窗口", key: "Q" },
            { title: "隐藏 / 显示悬浮层", description: "临时藏起桌面上的一切，再按一次回来", key: "F12" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-[11.5px] font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-[9.5px] text-ink-soft">{item.description}</p>
              </div>
              <div className="flex items-center gap-1">
                <ShortcutKey>Ctrl</ShortcutKey>
                <span className="text-[9px] text-ink-faint">+</span>
                <ShortcutKey>Alt</ShortcutKey>
                <span className="text-[9px] text-ink-faint">+</span>
                <ShortcutKey>{item.key}</ShortcutKey>
              </div>
            </div>
          ))}
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
            <li>· 单击 Q 弹、双击转圈、鼠标来回蹭是抚摸；用力一甩会滑出去。</li>
            <li>· 滚轮缩放，Shift + 滚轮旋转；中键播放手势互动。</li>
            <li>· 右键贴纸可以置顶 / 放到桌面层、锁定（点击穿透）、翻转、复制或移除。</li>
            <li>· 锁定的贴纸停留 1 秒会出现「解锁」按钮。</li>
            <li>· 锁定模式下主窗口和托盘仍然可以操作。</li>
            <li>· 关闭主窗口不会退出，贴纸会继续留在桌面上。</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function MonitorSection() {
  const monitorIndex = useAppStore((state) => state.settings.monitorIndex);
  const setSettings = useAppStore((state) => state.setSettings);
  const [monitors, setMonitors] = useState<MonitorDesc[]>([]);

  useEffect(() => {
    void listMonitors().then((list) => setMonitors(list ?? []));
  }, []);

  const current = monitorIndex >= 0 ? monitorIndex : monitors.find((m) => m.primary)?.index ?? 0;

  return (
    <SectionCard icon={<Monitor className="h-4 w-4" />} title="显示器" description="贴纸和特效出现在哪块屏幕上">
      {monitors.length <= 1 ? (
        <p className="px-1 py-3 text-[10px] text-ink-soft">当前只有一块显示器。</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-1 py-2">
          {monitors.map((monitor) => (
            <button
              key={monitor.index}
              type="button"
              onClick={() => setSettings({ monitorIndex: monitor.index })}
              className={cn(
                "pressable rounded-2xl border p-3 text-left transition-colors",
                current === monitor.index
                  ? "border-[#9cc6ff] bg-white shadow-[0_10px_22px_-18px_rgba(41,96,179,0.8)]"
                  : "border-white/70 bg-white/45 hover:bg-white/75"
              )}
            >
              <span className="block text-[11.5px] font-bold text-ink">
                显示器 {monitor.index + 1}
                {monitor.primary && <span className="ml-1.5 text-[9px] font-semibold text-[#4a8df8]">主屏</span>}
              </span>
              <span className="mt-0.5 block text-[9px] text-ink-soft">
                {monitor.rect.width}×{monitor.rect.height} · 缩放 {Math.round(monitor.scale * 100)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
