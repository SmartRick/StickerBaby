import { useEffect, useRef } from "react";
import { Check, Sparkles } from "lucide-react";
import { drawParticle, MAX_PARTICLES, PARTICLE_LABEL, PARTICLE_OPTIONS } from "@/lib/particles";
import { cn } from "@/lib/utils";
import type { ParticleKind } from "@/shared/protocol";

export function ParticleIcon({ kind, size = 28, className }: { kind: ParticleKind; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) void drawParticle(ref.current, kind);
  }, [kind]);
  const px = size * 2;
  return <canvas ref={ref} width={px} height={px} style={{ width: size, height: size }} className={className} aria-hidden />;
}

/**
 * 点击粒子选择：最多 4 种，点击 / 抚摸贴纸时随机混合喷出。
 * value 为空表示“自动”（按贴纸主题选择），auto 是自动时实际使用的那几种。
 */
export function ParticlePicker({
  value,
  auto,
  onChange,
}: {
  value: ParticleKind[] | undefined;
  auto: ParticleKind[];
  onChange: (next: ParticleKind[] | undefined) => void;
}) {
  const custom = Boolean(value?.length);
  const selected = custom ? value! : auto;

  const toggle = (kind: ParticleKind) => {
    const base = custom ? value! : [];
    const next = base.includes(kind) ? base.filter((k) => k !== kind) : [...base, kind].slice(-MAX_PARTICLES);
    onChange(next.length ? next : undefined);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {selected.map((kind) => (
            <span key={kind} className="grid h-8 w-8 place-items-center rounded-xl bg-white shadow-sm" title={PARTICLE_LABEL[kind]}>
              <ParticleIcon kind={kind} size={22} />
            </span>
          ))}
          <span className="ml-1 truncate text-[10px] text-ink-faint">{custom ? `自选 ${selected.length}/${MAX_PARTICLES}` : "自动 · 按贴纸主题"}</span>
        </div>
        <button
          type="button"
          disabled={!custom}
          onClick={() => onChange(undefined)}
          className="pressable inline-flex shrink-0 items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-[#4a8df8] hover:bg-white disabled:opacity-40"
        >
          <Sparkles className="h-3 w-3" /> 恢复自动
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1.5">
        {PARTICLE_OPTIONS.map((kind) => {
          const on = custom && value!.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(kind)}
              className={cn(
                "pressable relative flex flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 text-[9.5px] font-semibold transition-colors",
                on ? "border-[#8fb9fa] bg-[#eef5ff] text-[#2e67ba]" : "border-[#e6edf8] bg-white/75 text-ink-soft hover:bg-white"
              )}
            >
              <ParticleIcon kind={kind} size={26} />
              {PARTICLE_LABEL[kind]}
              {on && <Check className="absolute right-1 top-1 h-2.5 w-2.5" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
