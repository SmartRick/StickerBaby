import { useEffect, useRef, useState } from "react";
import { AppWindow, Gauge, Play, RotateCcw, Settings2, Square, TriangleAlert, Zap } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { categoriesOf, playablesOf, runningIds, thumbOf, type Playable, type PlayCategory, type PlayDomain, type PlayParamSpec } from "@/domain/playables";
import { play, stop, stopDomain } from "@/domain/play";
import { useOverlayRuntime } from "@/lib/overlay-client";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { WindowFxTarget } from "@/shared/protocol";
import { shortcut } from "@/lib/shortcuts";

/**
 * 玩法页（全屏特效 / 恶作剧 / 屏幕扰动 共用）：按业务分类展示玩法卡片，点卡片播放，
 * 常驻类再点一次停止；顶部是强度、窗口扰动对象和“全部停止”。
 */
export function PlaygroundPage({ domain }: { domain: PlayDomain }) {
  const categories = categoriesOf(domain);
  const runtime = useOverlayRuntime();
  const running = runningIds(runtime);
  const playOptions = useAppStore((state) => state.playOptions);
  const [intensity, setIntensity] = useState(0.6);
  const [target, setTarget] = useState<WindowFxTarget>("foreground");
  const [filter, setFilter] = useState<string>("all");
  const scroller = useRef<HTMLDivElement>(null);
  const domainRunning = categories.reduce(
    (sum, category) => sum + playablesOf(category.id).reduce((n, p) => n + (running.get(p.id) ?? 0), 0),
    0
  );
  const shown = filter === "all" ? categories : categories.filter((c) => c.id === filter);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [filter]);

  const stopAll = async () => {
    if (domain === "disturb") return stopDomain(domain);
    const items = categories.flatMap((category) => playablesOf(category.id)).filter((p) => running.has(p.id));
    await Promise.all(items.map(stop));
  };

  const trigger = async (p: Playable) => {
    if (p.mode === "persist" && running.has(p.id) && !p.stackable) {
      await stop(p);
      return;
    }
    const custom = playOptions[p.id];
    const affected = await play(p, {
      intensity,
      target,
      options: custom?.count !== undefined ? { count: custom.count } : undefined,
    });
    if (p.engine === "window") {
      toast(affected ? `已扰动 ${affected} 个窗口，结束后自动还原` : "没有找到可以扰动的窗口", affected ? "success" : "warn");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-center justify-end gap-3 px-1">
        <div className="flex flex-wrap items-center gap-2">
          {domain === "disturb" && (
            <div className="flex items-center gap-1 rounded-full border border-white/70 bg-white/55 p-1" title="窗口扰动作用于哪些窗口">
              <AppWindow className="ml-1.5 h-3.5 w-3.5 text-ink-faint" />
              {(["foreground", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTarget(value)}
                  className={cn(
                    "pressable rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors",
                    target === value ? "bg-[#4a8df8] text-white shadow-sm" : "text-ink-soft hover:bg-white/80"
                  )}
                >
                  {value === "foreground" ? "前台窗口" : "所有窗口"}
                </button>
              ))}
            </div>
          )}
          <div className="flex h-9 items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3" title="强度">
            <Gauge className="h-3.5 w-3.5 text-ink-faint" />
            <Slider aria-label="强度" className="w-[96px]" value={[intensity]} min={0.15} max={1} step={0.05} onValueChange={([v]) => setIntensity(v)} />
            <span className="w-8 text-right text-[10px] font-semibold tabular-nums text-ink-soft">{Math.round(intensity * 100)}%</span>
          </div>
          <button
            type="button"
            disabled={domain !== "disturb" && domainRunning === 0}
            onClick={() => void stopAll()}
            className="pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ffd9de] bg-[#fff5f6] px-3.5 text-[10.5px] font-bold text-[#d8667a] hover:bg-[#ffeef0] disabled:opacity-40"
            title={`停止本页正在运行的玩法（${shortcut("Q")} 一键清场全部）`}
          >
            <Square className="h-3 w-3" fill="currentColor" />
            {domain === "disturb" ? "还原窗口" : "全部停止"}
            {domainRunning > 0 && <span className="rounded-full bg-[#d8667a] px-1.5 text-[9px] text-white">{domainRunning}</span>}
          </button>
        </div>
      </header>

      <nav className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto px-1">
        {[{ id: "all", title: "全部" }, ...categories].map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setFilter(category.id)}
            className={cn(
              "pressable h-8 shrink-0 rounded-full px-3.5 text-[11px] font-semibold transition-colors",
              filter === category.id ? "chip-active" : "bg-white/55 text-ink-soft hover:bg-white/85 hover:text-ink"
            )}
          >
            {category.title}
          </button>
        ))}
      </nav>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1">
        {shown.map((category) => (
          <CategorySection key={category.id} category={category} running={running} busy={runtime.distorting !== null} onTrigger={trigger} />
        ))}
        <p className="flex items-center justify-center gap-1.5 pb-1 text-[9.5px] text-ink-faint">
          <Zap className="h-3 w-3" />
          任何时候按 {shortcut("Q")} 一键清场{domain === "disturb" && " · 屏幕扰动期间显示的是冻结的截图，几秒后自动恢复"}
        </p>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  running,
  busy,
  onTrigger,
}: {
  category: PlayCategory;
  running: Map<string, number>;
  busy: boolean;
  onTrigger: (p: Playable) => void;
}) {
  const Icon = category.icon;
  const items = playablesOf(category.id);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <span className="grid h-7 w-7 place-items-center rounded-xl" style={{ background: category.tint, color: category.ink }}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-[12.5px] font-bold text-ink">{category.title}</h3>
        <span className="text-[9.5px] text-ink-faint">{category.description}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
        {items.map((p) => (
          <PlayCard
            key={p.id}
            playable={p}
            category={category}
            count={running.get(p.id) ?? 0}
            disabled={busy && p.engine === "distort"}
            onTrigger={onTrigger}
          />
        ))}
      </div>
    </section>
  );
}

function PlayCard({
  playable: p,
  category,
  count,
  disabled,
  onTrigger,
}: {
  playable: Playable;
  category: PlayCategory;
  count: number;
  disabled: boolean;
  onTrigger: (p: Playable) => void;
}) {
  const Icon = p.icon;
  const [confirm, setConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const active = count > 0;
  const toggleOff = p.mode === "persist" && active && !p.stackable;
  const countSpec = p.params?.find((spec) => spec.id === "count");
  const custom = useAppStore((state) => state.playOptions[p.id]);
  const setPlayOption = useAppStore((state) => state.setPlayOption);
  const customized = custom?.count !== undefined && countSpec !== undefined;

  useEffect(() => {
    if (!confirm) return;
    const timer = window.setTimeout(() => setConfirm(false), 2600);
    return () => window.clearTimeout(timer);
  }, [confirm]);

  const click = () => {
    // 惊吓内容需要再点一次确认，避免误触
    if (p.scary && !active && !confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    onTrigger(p);
  };

  const replay = async () => {
    await stop(p);
    onTrigger(p);
  };

  const thumb = thumbOf(p);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[18px] border bg-white/75 transition-all",
        active ? "border-[#9cc6ff] shadow-[0_12px_26px_-18px_rgba(41,96,179,0.75)]" : "border-white/80 hover:bg-white hover:shadow-soft",
        disabled && "opacity-50"
      )}
    >
      <button type="button" disabled={disabled} onClick={click} className="absolute inset-0 z-[1] rounded-[18px]" aria-label={`${toggleOff ? "停止" : "播放"} ${p.name}`} />
      <div className="pointer-events-none relative aspect-[16/9] overflow-hidden" style={{ background: category.tint }}>
        {thumb ? (
          <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
        ) : (
          <div className="grid h-full w-full place-items-center" style={{ color: category.ink }}>
            <Icon className="h-9 w-9 opacity-80" strokeWidth={1.6} />
          </div>
        )}
        <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-lg bg-white/90 shadow-sm" style={{ color: category.ink }}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        {active && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[8.5px] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> 运行中{count > 1 && ` ×${count}`}
          </span>
        )}
        {!active && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#4a8df8]/95 text-white opacity-0 shadow-[0_12px_24px_-12px_rgba(41,96,179,0.9)] transition-opacity group-hover:opacity-100">
              <Play className="h-4 w-4" fill="currentColor" />
            </span>
          </span>
        )}
        {confirm && (
          <div className="absolute inset-0 grid place-items-center bg-[#c2415a]/90 text-[11px] font-bold text-white">胆小慎点 · 再点一次播放</div>
        )}
      </div>
      <div className="pointer-events-none flex flex-1 flex-col px-2.5 pb-2 pt-1.5">
        <p className="truncate text-[11.5px] font-bold text-ink">{p.name}</p>
        <p className="mt-0.5 truncate text-[9.5px] text-ink-soft">{p.description}</p>
        <div className="mt-1.5 flex items-center gap-1">
          <span className={cn("rounded-full px-1.5 py-px text-[8.5px] font-semibold", p.mode === "persist" ? "bg-[#eef5ff] text-[#4a8df8]" : "bg-[#f3f4f6] text-[#8b9aab]")}>
            {p.mode === "persist" ? "常驻" : "一次性"}
          </span>
          {p.scary && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-[#fbe9ec] px-1.5 py-px text-[8.5px] font-semibold text-[#c2415a]">
              <TriangleAlert className="h-2.5 w-2.5" /> 惊吓
            </span>
          )}
          {customized && <span className="rounded-full bg-[#e8f7ee] px-1.5 py-px text-[8.5px] font-semibold text-[#3f8f5c]">已调 ×{custom?.count}</span>}
          {p.hint && <span className="truncate rounded-full bg-[#fff7e6] px-1.5 py-px text-[8.5px] font-semibold text-[#b9832a]">{p.hint}</span>}
        </div>
      </div>
      {countSpec && (
        <button
          type="button"
          aria-label={`调整${p.name}的参数`}
          title="调整参数"
          onClick={() => setSettingsOpen(true)}
          className="pressable absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-full bg-white/92 text-[#5d7697] shadow-sm hover:bg-white hover:text-[#2f5b95]"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      )}
      {active && p.mode === "persist" && (
        <button
          type="button"
          onClick={() => void stop(p)}
          className="pressable absolute bottom-2 right-2 z-20 inline-flex h-6 items-center gap-1 rounded-full bg-white px-2 text-[9px] font-bold text-[#d8667a] shadow-sm"
        >
          <Square className="h-2.5 w-2.5" fill="currentColor" /> 停止
        </button>
      )}

      {countSpec && (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-[380px] rounded-[24px] border-white/80 bg-white/95">
            <DialogHeader>
              <DialogTitle className="font-display text-[17px]">调整 · {p.name}</DialogTitle>
              <DialogDescription>参数会记住，之后每次播放都用这个值</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3 py-1">
              <span className="w-16 shrink-0 text-[11.5px] font-semibold text-ink">{countSpec.label}</span>
              <Slider
                aria-label={countSpec.label}
                value={[custom?.count ?? countSpec.default]}
                min={countSpec.min}
                max={countSpec.max}
                step={countSpec.step ?? 1}
                onValueChange={([v]) => setPlayOption(p.id, { count: v })}
              />
              <span className="w-9 text-right text-[11.5px] font-bold tabular-nums text-[#2e67ba]">{custom?.count ?? countSpec.default}</span>
            </div>
            <p className="text-[9.5px] text-ink-faint">
              范围 {countSpec.min} – {countSpec.max}；未自定义时按强度自动选择
            </p>
            <DialogFooter className="gap-2">
              {customized && (
                <button
                  type="button"
                  onClick={() => setPlayOption(p.id, { count: undefined })}
                  className="pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-[#e2ecf9] bg-white px-3.5 text-[10.5px] font-semibold text-ink-soft hover:bg-[#f4f9ff]"
                >
                  <RotateCcw className="h-3 w-3" /> 恢复默认
                </button>
              )}
              {active && (
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    void replay();
                  }}
                  className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-[#4a8df8] px-4 text-[10.5px] font-bold text-white hover:bg-[#3d80ea]"
                >
                  <Play className="h-3 w-3" fill="currentColor" /> 按新参数重播
                </button>
              )}
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="pressable inline-flex h-9 items-center rounded-full border border-[#e2ecf9] bg-white px-4 text-[10.5px] font-semibold text-ink-soft hover:bg-[#f4f9ff]"
              >
                完成
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
