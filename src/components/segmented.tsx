import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  itemClassName,
}: SegmentedProps<T>) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-2xl border border-white/70 bg-white/55 p-1",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "pressable h-8 flex-1 rounded-xl px-3 text-[12.5px] font-medium text-ink-soft transition-colors",
            option === value ? "chip-active" : "hover:bg-white/80 hover:text-ink",
            itemClassName
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
