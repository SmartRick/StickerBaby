import { useLayoutEffect, useRef, type RefObject } from "react";
import type { StickerGestureDefinition } from "@/lib/sticker-gestures";

export interface ActiveStickerGesture {
  definition: StickerGestureDefinition;
  left: number;
  top: number;
  width: number;
  originX: number;
  originY: number;
}

type Bounds = { left: number; top: number; right: number; bottom: number };

export function placeStickerGesture(
  definition: StickerGestureDefinition,
  sprite: Pick<DOMRect, "left" | "top" | "width" | "height">,
  bounds: Bounds,
  viewport: { width: number; height: number }
): ActiveStickerGesture {
  const margin = 8;
  let width = Math.max(1, Math.min(
    Math.max(40, sprite.width * 1.15),
    320,
    viewport.width - margin * 2,
    (viewport.height - margin * 2) * definition.aspect
  ));
  let height = width / definition.aspect;
  const [targetX, targetY] = definition.target;
  const contactX = sprite.left + (0.5 + bounds.left + (bounds.right - bounds.left) * targetX) * sprite.width;
  const contactY = sprite.top + (0.5 + bounds.top + (bounds.bottom - bounds.top) * targetY) * sprite.height;
  const [originX, originY] = definition.grip;
  // 手从上方伸入（grip 靠近图底）而上方放不下时，整体缩小手型图，
  // 保住接触点与朝向。之前是上下翻转来"塞下"，看起来像把戳反过来了。
  if (originY > 0.5) {
    const shrink = Math.min(1, Math.max(0.45, (contactY - margin) / (height * originY)));
    width *= shrink;
    height *= shrink;
  }
  const left = Math.min(viewport.width - margin - width, Math.max(margin, contactX - width * originX));
  const top = Math.min(viewport.height - margin - height, Math.max(margin, contactY - height * originY));
  return { definition, left: left - sprite.left, top: top - sprite.top, width, originX, originY };
}

interface StickerGestureEffectProps {
  gesture: ActiveStickerGesture;
  spriteMotion: RefObject<HTMLDivElement | null>;
  reduceMotion: boolean;
  onContact: () => void;
  onFinish: (gesture: ActiveStickerGesture) => void;
}

export function StickerGestureEffect({
  gesture,
  spriteMotion,
  reduceMotion,
  onContact,
  onFinish,
}: StickerGestureEffectProps) {
  const hand = useRef<HTMLDivElement>(null);
  const artwork = useRef<HTMLImageElement>(null);
  const { definition, left, top, width, originX, originY } = gesture;
  const { id, image, duration } = definition;

  useLayoutEffect(() => {
    const element = hand.current;
    const image = artwork.current;
    if (!element || !image) return;
    let obsolete = false;
    let handAnimation: Animation | undefined;
    let stickerAnimation: Animation | undefined;
    let contactTimer: number | undefined;

    const first = definition.hand[0];
    const last = definition.hand[definition.hand.length - 1];
    const handFrames = ([
      ...definition.hand,
      [0.83, last[1], last[2], last[3]],
      [1, last[1] + 7, first[2], first[3]],
    ] as const).map(([offset, x, y, angle]) => ({
      offset,
      transform: `translate(${x}%, ${y}%) rotate(${angle}deg)`,
      opacity: offset === 1 ? 0 : 1,
    }));
    const spriteFrames = ([
      [0, 0, 0, 0, 1, 1],
      ...definition.sticker,
      [1, 0, 0, 0, 1, 1],
    ] as const).map(([offset, x, y, angle, sx, sy]) => ({
      offset,
      transform: `translate(${x}%, ${y}%) rotate(${angle}deg) scale(${sx}, ${sy})`,
    }));
    const play = () => {
      if (obsolete) return;
      if (reduceMotion) {
        handAnimation = element.animate(
          [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
          { duration: 480, fill: "both" }
        );
      } else {
        handAnimation = element.animate(handFrames, { duration, easing: "ease-in-out", fill: "both" });
        stickerAnimation = spriteMotion.current?.animate(spriteFrames, { duration, easing: "ease-in-out" });
        contactTimer = window.setTimeout(onContact, duration * definition.sticker[0][0]);
      }
      handAnimation.onfinish = () => onFinish(gesture);
    };
    if (image.complete && image.naturalWidth > 0) {
      play();
    } else {
      void image.decode().then(play, () => {
        if (!obsolete) onFinish(gesture);
      });
    }
    return () => {
      obsolete = true;
      window.clearTimeout(contactTimer);
      handAnimation?.cancel();
      stickerAnimation?.cancel();
    };
  }, [definition, duration, gesture, onContact, onFinish, reduceMotion, spriteMotion]);

  return (
    <div
      ref={hand}
      data-sticker-gesture={id}
      aria-hidden="true"
      className="pointer-events-none absolute z-30"
      style={{ left, top, width, opacity: 0, transformOrigin: `${originX * 100}% ${originY * 100}%` }}
    >
      <img ref={artwork} src={image} alt="" draggable={false} className="block h-auto w-full" />
    </div>
  );
}
