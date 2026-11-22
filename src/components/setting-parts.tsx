import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** 设置类页面共用的卡片、行、滑块（设置、我的桌面） */
export function SectionCard({
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

export function SettingRow({
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

export function PercentSlider({
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

export function ShortcutKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-[#dfe8f4] bg-white/85 px-1.5 text-[9.5px] font-bold text-[#5d7697] shadow-[0_2px_0_rgba(190,205,225,0.6)]">
      {children}
    </kbd>
  );
}
