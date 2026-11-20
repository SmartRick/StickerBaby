import { useState } from "react";
import { Home, ImagePlus, Settings, Sticker } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageKey } from "@/lib/pages";
import { useAppStore } from "@/lib/store";
import { CHARACTERS } from "@/lib/characters";
import { GREETINGS } from "@/lib/greetings";
import brandLogo from "@/assets/brand/sticker-baby.webp";

const NAV: Array<{ key: PageKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "首页", icon: Home },
  { key: "library", label: "我的贴纸", icon: Sticker },
  { key: "create", label: "创建贴纸", icon: ImagePlus },
  { key: "settings", label: "设置", icon: Settings },
];

interface SidebarProps {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
}

export function Sidebar({ page, onNavigate }: SidebarProps) {
  const createdCount = useAppStore((state) => state.createdStickers.length);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [bounceKey, setBounceKey] = useState(0);
  const greeting = GREETINGS[greetingIndex];

  const nextGreeting = () => {
    setGreetingIndex((index) => (index + 1) % GREETINGS.length);
    setBounceKey((key) => key + 1);
  };

  return (
    <aside className="sidebar-surface relative flex w-[224px] shrink-0 flex-col overflow-hidden border-r border-white/70">
      <div className="flex items-center gap-3 px-6 pb-7 pt-6">
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

      <nav className="flex flex-col gap-1 px-3.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.key === page;
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "pressable group flex h-[44px] items-center gap-3 rounded-2xl px-3.5 text-[13.5px] font-medium",
                active
                  ? "nav-active text-[#2e67ba]"
                  : "text-ink-soft hover:bg-white/60 hover:text-ink"
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-xl transition-colors",
                  active ? "bg-white/85 text-[#4a8df8]" : "text-ink-faint group-hover:text-ink-soft"
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === "library" && (
                <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">
                  {CHARACTERS.length + createdCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={nextGreeting}
        aria-label="换一个打招呼"
        title="点我换一个打招呼"
        className="relative mt-auto block h-[204px] w-full cursor-pointer text-left outline-none"
      >
        <span
          key={`greeting-text-${greetingIndex}`}
          className="pet-name animate-bubble absolute left-3 top-1 z-10 inline-block whitespace-nowrap rounded-2xl rounded-bl-md border border-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#5c7392]"
        >
          {greeting.text}
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 h-[180px] w-[180px] -translate-x-1/2 -rotate-[3deg]">
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
