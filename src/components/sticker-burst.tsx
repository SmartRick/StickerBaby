import type { CSSProperties } from "react";
import { EFFECT_META, type PetEffect } from "@/lib/effects";
import { cn } from "@/lib/utils";

const PARTICLES = [
  { left: 28, drift: -24, size: 15, delay: 0 },
  { left: 41, drift: -10, size: 18, delay: 70 },
  { left: 52, drift: 2, size: 14, delay: 140 },
  { left: 64, drift: 14, size: 17, delay: 40 },
  { left: 76, drift: 26, size: 13, delay: 190 },
];

export function StickerBurst({
  effect,
  className,
}: {
  effect: PetEffect;
  className?: string;
}) {
  const { icon: Icon, color } = EFFECT_META[effect];

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {PARTICLES.map((particle, index) => (
        <Icon
          key={index}
          className="animate-heart absolute"
          style={
            {
              left: `${particle.left}%`,
              bottom: "10%",
              width: particle.size,
              height: particle.size,
              color,
              fill: "currentColor",
              animationDelay: `${particle.delay}ms`,
              "--drift": `${particle.drift}px`,
            } as CSSProperties
          }
          strokeWidth={1.6}
        />
      ))}
    </div>
  );
}
