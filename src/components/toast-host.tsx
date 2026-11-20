import { Check, Info, TriangleAlert } from "lucide-react";
import { useToastStore } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ICONS = {
  default: Info,
  success: Check,
  warn: TriangleAlert,
};

const TONES = {
  default: "text-[#4a6c94]",
  success: "text-[#3f8f5c]",
  warn: "text-[#b07a2c]",
};

export function ToastHost() {
  const items = useToastStore((state) => state.items);

  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <div
            key={item.id}
            className="animate-bubble flex items-center gap-2 rounded-full border border-white/85 bg-white/90 py-2 pl-2.5 pr-4 text-[11px] font-semibold text-ink shadow-[0_18px_34px_-20px_rgba(38,70,115,0.55)] backdrop-blur-xl"
          >
            <span className={cn("grid h-6 w-6 place-items-center rounded-full bg-[#f2f7fd]", TONES[item.tone])}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
            </span>
            {item.message}
          </div>
        );
      })}
    </div>
  );
}
