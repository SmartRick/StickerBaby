import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { ParticleIcon, ParticlePicker } from "@/components/particle-picker";
import { particlesForSticker } from "@/lib/effects";
import { PARTICLE_LABEL } from "@/lib/particles";
import { useAppStore } from "@/lib/store";
import type { StickerCharacter } from "@/lib/characters";
import { cn } from "@/lib/utils";

/**
 * 贴纸详情里的“互动效果”：这款贴纸被点击 / 抚摸时喷出的粒子。
 * 这里改的是这款贴纸的默认值，桌面上的每一张还能在“我的桌面”里单独覆盖。
 */
export function StickerEffectsSection({ character }: { character: StickerCharacter }) {
  const custom = useAppStore((state) => state.stickerParticles[character.id]);
  const setStickerParticles = useAppStore((state) => state.setStickerParticles);
  const [editing, setEditing] = useState(false);
  const auto = particlesForSticker(character.defaultVariant.id);
  const shown = custom?.length ? custom : auto;

  return (
    <section className="rounded-[17px] border border-[#e4ecf6] bg-white/80 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#4a8df8]" />
          <span className="text-[11.5px] font-bold text-ink">点击粒子</span>
          <div className="flex items-center gap-1">
            {shown.map((kind) => (
              <span key={kind} title={PARTICLE_LABEL[kind]} className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3f8ff]">
                <ParticleIcon kind={kind} size={20} />
              </span>
            ))}
          </div>
          <span className="truncate text-[10px] text-ink-faint">
            {custom?.length ? "已自定义" : "按主题自动"} · {shown.map((k) => PARTICLE_LABEL[k]).join("、")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="pressable inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eef5ff] px-2.5 py-1 text-[10px] font-semibold text-[#2e67ba] hover:bg-[#dceaff]"
        >
          修改
          <ChevronDown className={cn("h-3 w-3 transition-transform", editing && "rotate-180")} />
        </button>
      </div>
      {editing && (
        <div className="mt-2.5">
          <ParticlePicker value={custom} auto={auto} onChange={(next) => setStickerParticles(character.id, next)} />
          <p className="mt-2 text-[9.5px] text-ink-faint">桌面上已有的这款贴纸会立即生效；单张贴纸可以在“我的桌面”里另外设置。</p>
        </div>
      )}
    </section>
  );
}
