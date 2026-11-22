import { useState } from "react";
import { Activity, Home, ImagePlus, Laugh, Monitor, Settings, Sparkles, Sticker } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageKey } from "@/lib/pages";
import { useAppStore } from "@/lib/store";
import { CHARACTERS } from "@/lib/characters";
import { GREETINGS } from "@/lib/greetings";
import { useOverlayRuntime } from "@/lib/overlay-client";
import { CATEGORIES, DOMAINS, PLAYABLE_BY_ID, runningIds, type PlayDomain } from "@/domain/playables";
import brandLogo from "@/assets/brand/sticker-baby.webp";

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof Home;
}

/** 分组导航：贴纸（内容与摆放）/ 玩法（互动与特效） */
const NAV: Array<{ group?: string; items: NavItem[] }> = [
  { items: [{ key: "home", label: "首页", icon: Home }] },
  {
    group: "贴纸",
    items: [
      { key: "library", label: "贴纸库", icon: Sticker },
      { key: "create", label: "创建贴纸", icon: ImagePlus },
      { key: "desktop", label: "我的桌面", icon: Monitor },
    ],
  },
  {
    group: "玩法",
    items: [
      { key: "effects", label: DOMAINS.effects.title, icon: Sparkles },
      { key: "pranks", label: DOMAINS.pranks.title, icon: Laugh },
      { key: "disturb", label: DOMAINS.disturb.title, icon: Activity },
    ],
  },
  { items: [{ key: "settings", label: "设置", icon: Settings }] },
];

const CATEGORY_DOMAIN = new Map(CATEGORIES.map((category) => [category.id, category.domain]));

interface SidebarProps {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
}

export function Sidebar({ page, onNavigate }: SidebarProps) {
  const createdCount = useAppStore((state) => state.createdStickers.length);
  const petCount = useAppStore((state) => state.pets.length);
  const runtime = useOverlayRuntime();
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [bounceKey, setBounceKey] = useState(0);
  const greeting = GREETINGS[greetingIndex];

  // 每个玩法领域正在运行的数量（导航上的绿色角标）
  const running: Partial<Record<PlayDomain, number>> = {};
  for (const [id, count] of runningIds(runtime)) {
    const playable = PLAYABLE_BY_ID.get(id);
    const domain = playable && CATEGORY_DOMAIN.get(playable.category);
    if (domain) running[domain] = (running[domain] ?? 0) + count;
  }

  const badgeOf = (key: PageKey) => {
    if (key === "library") return { value: CHARACTERS.length + createdCount, live: false };
    if (key === "desktop") return petCount ? { value: petCount, live: false } : null;
    const live = running[key as PlayDomain];
    return live ? { value: live, live: true } : null;
  };

  const nextGreeting = () => {
    setGreetingIndex((index) => (index + 1) % GREETINGS.length);
    setBounceKey((key) => key + 1);
  };

  return (
    <aside className="sidebar-surface relative flex w-[224px] shrink-0 flex-col overflow-hidden border-r border-white/70">
      <div className="flex items-center gap-3 px-6 pb-5 pt-6">
        <img
          src={brandLogo}
          alt="贴纸宝宝"
          draggable={false}
          className="h-11 w-11 rounded-[14px] object-cover shadow-[0_12px_24px_-12px_rgba(216,150,32,0.7)] ring-1 ring-white/60"
        />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[19px] font-semibold leading-tight tracking-tight text-ink">
            贴纸宝宝
          </h1>
          <p className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            Sticker Baby
          </p>
        </div>
      </div>

      <nav className="flex flex-col px-3.5">
        {NAV.map((section, index) => (
          <div key={section.group ?? `top-${index}`} className={cn("flex flex-col gap-0.5", index > 0 && "mt-2")}>
            {section.group && (
              <p className="px-3.5 pb-0.5 text-[9.5px] font-bold tracking-[0.2em] text-ink-faint">{section.group}</p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = item.key === page;
              const badge = badgeOf(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(item.key)}
                  className={cn(
                    "pressable group flex h-[38px] items-center gap-3 rounded-2xl px-3 text-[13px] font-medium",
                    active ? "nav-active text-[#2e67ba]" : "text-ink-soft hover:bg-white/60 hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-xl transition-colors",
                      active ? "bg-white/85 text-[#4a8df8]" : "text-ink-faint group-hover:text-ink-soft"
                    )}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {badge && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        badge.live ? "bg-emerald-400 text-white" : "bg-white/80 text-ink-faint"
                      )}
                    >
                      {badge.value}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={nextGreeting}
        aria-label="换一个打招呼"
        title="点我换一个打招呼"
        className="relative mt-auto block h-[min(204px,calc(100vh-600px))] min-h-0 w-full shrink-0 cursor-pointer overflow-hidden text-left outline-none"
      >
        <span
          key={`greeting-text-${greetingIndex}`}
          className="pet-name animate-bubble absolute left-3 top-1 z-10 inline-block whitespace-nowrap rounded-2xl rounded-bl-md border border-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#5c7392]"
        >
          {greeting.text}
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 aspect-square h-[min(180px,calc(100%-28px))] -translate-x-1/2 -rotate-[3deg]">
          <span
            key={`greeting-pet-${bounceKey}`}
            className="flex h-full w-full animate-pet-bounce items-center justify-center"
          >
            <img
              src={greeting.src}
              alt={greeting.text}
              draggable={false}
              className="h-full w-full object-contain drop-shadow-[0_20px_24px_rgba(56,86,128,0.18)]"
            />
          </span>
        </span>
        <span className="pointer-events-none absolute left-[64%] top-[26px] h-2 w-2 rounded-full bg-[#ffd36b]/90" />
        <span className="pointer-events-none absolute left-[74%] top-[12px] h-1.5 w-1.5 rounded-full bg-[#ffb8c6]/90" />
      </button>
    </aside>
  );
}
