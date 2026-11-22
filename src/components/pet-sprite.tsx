import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpToLine,
  Blend,
  FlipHorizontal,
  Hand,
  LockKeyhole,
  RotateCcw,
  Settings2,
  Shuffle,
  Trash2,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { StickerImage } from "@/components/sticker-image";
import { StickerBurst } from "@/components/sticker-burst";
import { placeStickerGesture, StickerGestureEffect, type ActiveStickerGesture } from "@/components/sticker-gesture";
import { effectForSticker } from "@/lib/effects";
import { getStickerGesture, preloadStickerGestures, STICKER_GESTURES, type StickerGestureDefinition } from "@/lib/sticker-gestures";
import { useAppStore, type PetInstance } from "@/lib/store";
import {
  GENERIC_PHRASES,
  STATE_LABEL,
  stickerSrc,
  type Sticker,
} from "@/lib/stickers";
import { CHARACTERS } from "@/lib/characters";
import { packTitle } from "@/lib/packs";
import { invokeSafe, onAppEvent, showMainWindow } from "@/lib/tauri";
import { getPetSize, PET_BASE_SIZE } from "@/lib/pet-size";
import type { PhysicsGeometry, PhysicsPosition } from "@/lib/sticker-physics";
import { fitStickerCenter, stickerBounds } from "@/lib/sticker-silhouette";
import type { RegisterPhysicsSprite } from "@/hooks/use-sticker-physics";
import { useStickerPose } from "@/hooks/use-sticker-pose";
import { useStickerSilhouette } from "@/hooks/use-sticker-silhouette";
import { cn } from "@/lib/utils";

interface PetSpriteProps {
  pet: PetInstance;
  sticker: Sticker;
  globalScale: number;
  viewport: { width: number; height: number };
  passthrough: boolean;
  autoDim: boolean;
  reduceMotion: boolean;
  hint?: boolean;
  onActivity: () => void;
  physics: boolean;
  opacity: number;
  visible: boolean;
  registerPhysicsSprite: RegisterPhysicsSprite;
  registerPhysicsGeometry: (id: string, geometry: PhysicsGeometry | null) => void;
  getPhysicsPosition: (id: string) => PhysicsPosition | undefined;
  onPhysicsGrab?: (id: string, x: number, y: number) => void;
  onPhysicsDrag?: (id: string, x: number, y: number) => void;
  onPhysicsRelease?: (
    id: string,
    velocity: { x: number; y: number },
    moved: boolean
  ) => void;
}

const ABS_MAX_SIZE = 420;
const MIN_PET_SCALE = 0.2;
const MAX_PET_SCALE = 2.5;

const IDLE_MOTIONS = [
  "animate-[float_5.4s_ease-in-out_infinite]",
  "animate-[sway_4.6s_ease-in-out_infinite]",
  "animate-[bob_3.6s_ease-in-out_infinite]",
  "animate-[wiggle_4.2s_ease-in-out_infinite]",
  "animate-[breathe_4.8s_ease-in-out_infinite]",
];

/** Stable per-character idle motion, without adding another catalog field. */
function idleMotionFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return IDLE_MOTIONS[hash % IDLE_MOTIONS.length];
}

interface FloatDrag {
  element: HTMLDivElement;
  px: number;
  py: number;
  x: number;
  y: number;
  nextX: number;
  nextY: number;
  frame: number;
  moved: boolean;
}

interface Bubble {
  id: number;
  text: string;
}

export function PetSprite({
  pet,
  sticker,
  globalScale,
  viewport,
  passthrough,
  autoDim,
  reduceMotion,
  hint,
  onActivity,
  physics,
  opacity,
  visible,
  registerPhysicsSprite,
  registerPhysicsGeometry,
  getPhysicsPosition,
  onPhysicsGrab,
  onPhysicsDrag,
  onPhysicsRelease,
}: PetSpriteProps) {
  const updatePet = useAppStore((state) => state.updatePet);
  const removePet = useAppStore((state) => state.removePet);
  const bringToFront = useAppStore((state) => state.bringToFront);
  const setSettings = useAppStore((state) => state.setSettings);
  const selectSticker = useAppStore((state) => state.selectSticker);

  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [resizeScale, setResizeScale] = useState(pet.scale);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [reacting, setReacting] = useState(false);
  const [reactKey, setReactKey] = useState(0);
  const [bursting, setBursting] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [hintVisible, setHintVisible] = useState(Boolean(hint));
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGesture, setActiveGesture] = useState<ActiveStickerGesture | null>(null);
  const idleMotion = useAppStore((state) => state.settings.idleMotion);
  const gesturePointer = useRef<number | null>(null);
  const dragRef = useRef<FloatDrag | null>(null);
  const physicsDragRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
    moved: boolean;
  } | null>(null);
  const resizeRef = useRef<{ px: number; py: number; scale: number; moved: boolean } | null>(null);
  const resizeScaleRef = useRef(pet.scale);
  const suppressMenu = useRef(false);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const burstTimer = useRef<number | undefined>(undefined);
  const reactTimer = useRef<number | undefined>(undefined);
  const gestureTimer = useRef<number | undefined>(undefined);
  const spriteElement = useRef<HTMLDivElement | null>(null);
  const gestureMotion = useRef<HTMLDivElement>(null);

  const { width, height } = viewport;
  const previewScale = resizing ? resizeScale : undefined;
  const size = getPetSize(globalScale, previewScale ?? pet.scale, width, height);
  const poses = useStickerPose(sticker, pet.pose, visible);
  const silhouette = useStickerSilhouette(poses.shown);
  const bounds = stickerBounds(silhouette, pet.angle ?? 0, Boolean(pet.flipped));
  const { x: centerX, y: centerY } = fitStickerCenter(pet.x * width, pet.y * height, size, bounds, width, height);
  const above = centerY > height * 0.72;
  const animated = visible && !reduceMotion;
  const idleAnimation =
    !physics && !dragging && !reacting && !activeGesture && idleMotion !== false && animated
      ? idleMotionFor(sticker.characterId)
      : "";
  const clickBounce = reacting && !activeGesture && !reduceMotion;
  const middleGesture = getStickerGesture(pet.gesture);
  const spriteRef = useCallback(
    (element: HTMLDivElement | null) => {
      spriteElement.current = element;
      if (physics) registerPhysicsSprite(pet.id, element);
    },
    [pet.id, physics, registerPhysicsSprite]
  );
  const onGestureContact = useCallback(() => setReactKey((key) => key + 1), []);
  const onGestureFinish = useCallback((finished: ActiveStickerGesture) => {
    setActiveGesture((current) => current === finished ? null : current);
  }, []);

  const scaleBounds = () => {
    const base = PET_BASE_SIZE * globalScale;
    const min = MIN_PET_SCALE;
    const max = Math.max(min, Math.min(MAX_PET_SCALE, ABS_MAX_SIZE / base));
    return { min, max };
  };

  useLayoutEffect(() => {
    registerPhysicsGeometry(pet.id, { silhouette, previewScale });
  }, [pet.id, previewScale, registerPhysicsGeometry, silhouette]);

  useLayoutEffect(
    () => () => registerPhysicsGeometry(pet.id, null),
    [pet.id, registerPhysicsGeometry]
  );

  useEffect(() => {
    if (visible) preloadStickerGestures();
    else setActiveGesture(null);
  }, [visible]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHintVisible(false), 7000);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(
    () => () => {
      window.clearTimeout(bubbleTimer.current);
      window.clearTimeout(burstTimer.current);
      window.clearTimeout(reactTimer.current);
      window.clearTimeout(gestureTimer.current);
      if (dragRef.current?.frame) window.cancelAnimationFrame(dragRef.current.frame);
      if (gesturePointer.current !== null || gestureTimer.current !== undefined) {
        void invokeSafe("set_overlay_dragging", { dragging: false });
      }
    },
    []
  );

  /**
   * Keep the native layer interactive for a moment after a gesture.
   * On Windows the right-button `contextmenu` can arrive just after `pointerup`;
   * releasing immediately would hand the click to the app underneath, which
   * then shows its own context menu in the blank space around the pet.
   */
  const endOverlayGesture = useCallback((delayMs: number) => {
    window.clearTimeout(gestureTimer.current);
    const finish = () => {
      gestureTimer.current = undefined;
      void invokeSafe("set_overlay_dragging", { dragging: false });
    };
    if (delayMs > 0) {
      gestureTimer.current = window.setTimeout(finish, delayMs);
    } else {
      finish();
    }
  }, []);

  useEffect(() => {
    // Native focus loss (clicking another app) does not always reach Radix,
    // so close the menu explicitly when the overlay blurs.
    return onAppEvent("overlay:blur", () => setMenuOpen(false));
  }, []);

  useEffect(() => {
    if (!passthrough) return;
    setMenuOpen(false);
    const pointerId = gesturePointer.current;
    const sprite = spriteElement.current;
    if (pointerId !== null && sprite?.hasPointerCapture(pointerId)) {
      sprite.releasePointerCapture(pointerId);
    }
  }, [passthrough]);

  const react = () => {
    setActiveGesture(null);
    const pose = poses.react();
    const text = pose?.phrase ?? (Math.random() < 0.72
      ? sticker.phrase
      : GENERIC_PHRASES[Math.floor(Math.random() * GENERIC_PHRASES.length)]);
    setBubble({ id: Date.now(), text });
    setReactKey((key) => key + 1);
    setReacting(true);
    setBursting(true);
    setBurstKey((key) => key + 1);
    window.clearTimeout(bubbleTimer.current);
    window.clearTimeout(burstTimer.current);
    window.clearTimeout(reactTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 3200);
    burstTimer.current = window.setTimeout(() => setBursting(false), 1700);
    reactTimer.current = window.setTimeout(() => setReacting(false), 900);
  };

  const playGesture = (definition: StickerGestureDefinition) => {
    const sprite = spriteElement.current;
    if (!sprite || !visible || passthrough || gesturePointer.current !== null) return;
    const angle = (physics ? getPhysicsPosition(pet.id)?.angle : undefined) ?? pet.angle ?? 0;
    const contactBounds = stickerBounds(silhouette, angle, Boolean(pet.flipped));
    setActiveGesture(placeStickerGesture(definition, sprite.getBoundingClientRect(), contactBounds, viewport));
    setHintVisible(false);
    setBubble(null);
    setBursting(false);
    setReacting(false);
    bringToFront(pet.id);
    onActivity();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (passthrough) return;
    if (event.button === 1) {
      // Suppress WebView2's autoscroll cursor on middle press.
      event.preventDefault();
      return;
    }
    if (gesturePointer.current !== null || (event.button !== 0 && event.button !== 2)) return;
    onActivity();
    setBubble(null);
    setActiveGesture(null);
    window.clearTimeout(gestureTimer.current);
    gestureTimer.current = undefined;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesturePointer.current = event.pointerId;
    bringToFront(pet.id);
    void invokeSafe("set_overlay_dragging", { dragging: true });

    if (event.button === 2) {
      resizeRef.current = {
        px: event.clientX,
        py: event.clientY,
        scale: pet.scale,
        moved: false,
      };
      resizeScaleRef.current = pet.scale;
      return;
    }
    event.preventDefault();
    if (physics) {
      physicsDragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastT: performance.now(),
        vx: 0,
        vy: 0,
        moved: false,
      };
      setDragging(true);
      onPhysicsGrab?.(pet.id, event.clientX, event.clientY);
      return;
    }
    dragRef.current = {
      element: event.currentTarget,
      px: event.clientX,
      py: event.clientY,
      x: centerX,
      y: centerY,
      nextX: centerX,
      nextY: centerY,
      frame: 0,
      moved: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (passthrough || gesturePointer.current !== event.pointerId) return;
    const physicsDrag = physicsDragRef.current;
    if (physicsDrag) {
      const now = performance.now();
      const dt = now - physicsDrag.lastT;
      const dx = event.clientX - physicsDrag.lastX;
      const dy = event.clientY - physicsDrag.lastY;
      if (
        !physicsDrag.moved &&
        Math.hypot(event.clientX - physicsDrag.startX, event.clientY - physicsDrag.startY) > 3
      ) {
        physicsDrag.moved = true;
        poses.enterDrag();
      }
      if (dt > 0) {
        physicsDrag.vx = physicsDrag.vx * 0.55 + (dx / dt) * 0.45;
        physicsDrag.vy = physicsDrag.vy * 0.55 + (dy / dt) * 0.45;
      }
      physicsDrag.lastX = event.clientX;
      physicsDrag.lastY = event.clientY;
      physicsDrag.lastT = now;
      onPhysicsDrag?.(pet.id, event.clientX, event.clientY);
      onActivity();
      return;
    }

    const resize = resizeRef.current;
    if (resize) {
      const dx = event.clientX - resize.px;
      const dy = event.clientY - resize.py;
      if (!resize.moved) {
        if (Math.hypot(dx, dy) <= 4) return;
        resize.moved = true;
        setResizing(true);
      }
      // Horizontal or vertical drags both work; the dominant axis wins.
      const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
      const { min, max } = scaleBounds();
      // Multiplicative feel: a fixed drag distance changes the same proportion
      // at every size, instead of jumping by an absolute amount when small.
      const factor = Math.max(0.25, 1 + delta / 360);
      const next = Math.min(max, Math.max(min, resize.scale * factor));
      resizeScaleRef.current = next;
      setResizeScale(next);
      onActivity();
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.px;
    const dy = event.clientY - drag.py;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) <= 3) return;
      drag.moved = true;
      poses.enterDrag();
    }

    const { x: nextX, y: nextY } = fitStickerCenter(drag.x + dx, drag.y + dy, size, bounds, width, height);
    if (nextX === drag.nextX && nextY === drag.nextY) return;
    drag.nextX = nextX;
    drag.nextY = nextY;
    if (!drag.frame) {
      drag.frame = window.requestAnimationFrame(() => {
        drag.frame = 0;
        drag.element.style.translate = `${drag.nextX - drag.x}px ${drag.nextY - drag.y}px`;
        onActivity();
      });
    }
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gesturePointer.current !== event.pointerId) return;
    gesturePointer.current = null;
    const cancelled = passthrough || event.type !== "pointerup";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const physicsDrag = physicsDragRef.current;
    if (physicsDrag) {
      physicsDragRef.current = null;
      setDragging(false);
      endOverlayGesture(0);
      onPhysicsRelease?.(
        pet.id,
        cancelled ? { x: 0, y: 0 } : { x: physicsDrag.vx, y: physicsDrag.vy },
        physicsDrag.moved
      );
      if (physicsDrag.moved) poses.endDrag();
      else if (!cancelled) react();
      return;
    }

    const resize = resizeRef.current;
    if (resize) {
      resizeRef.current = null;
      setResizing(false);
      endOverlayGesture(resize.moved ? 320 : 0);
      if (resize.moved) {
        const scale = resizeScaleRef.current;
        if (physics) {
          updatePet(pet.id, { scale });
        } else {
          const size = getPetSize(globalScale, scale, width, height);
          const { x, y } = fitStickerCenter(pet.x * width, pet.y * height, size, bounds, width, height);
          updatePet(pet.id, { scale, x: x / width, y: y / height });
        }
        suppressMenu.current = true;
        window.setTimeout(() => {
          suppressMenu.current = false;
        }, 350);
      }
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    endOverlayGesture(drag?.moved ? 220 : 0);
    if (!drag) return;

    window.cancelAnimationFrame(drag.frame);
    drag.element.style.translate = "";
    if (drag.moved) {
      poses.endDrag();
      const requestedX = cancelled ? drag.nextX : drag.x + event.clientX - drag.px;
      const requestedY = cancelled ? drag.nextY : drag.y + event.clientY - drag.py;
      const { x, y } = fitStickerCenter(requestedX, requestedY, size, bounds, width, height);
      updatePet(pet.id, { x: x / width, y: y / height });
    } else if (!cancelled) {
      react();
    }
  };

  const replacePet = async () => {
    const pool = CHARACTERS.filter((character) => character.id !== sticker.characterId).map(
      (character) => character.defaultVariant
    );
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) return;
    // Decode before swapping so the first frame is complete in the fixed box.
    const image = new Image();
    image.src = stickerSrc(next.id);
    try {
      await image.decode();
    } catch {
      // A failed decode still swaps; the fixed pet box keeps the layer sane.
    }
    updatePet(pet.id, { stickerId: next.id, pose: undefined });
    selectSticker(next.id);
    setReactKey((key) => key + 1);
    setBubble({ id: Date.now(), text: `${next.name} 来换班啦～` });
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 2800);
  };

  return (
    <ContextMenu
      open={menuOpen && !passthrough}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) {
          bringToFront(pet.id);
          setHintVisible(false);
          onActivity();
        }
      }}
    >
      <ContextMenuTrigger asChild disabled={passthrough}>
        <div
          ref={spriteRef}
          data-pet-hit
          data-pet-passthrough={passthrough ? "true" : undefined}
          className={cn(
            "group absolute select-none transition-opacity duration-700 ease-out",
            passthrough ? "pointer-events-none" : "pet-hit",
            resizing ? "cursor-nwse-resize" : dragging ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{
            left: physics ? 0 : centerX,
            top: physics ? 0 : centerY,
            width: size,
            height: size,
            zIndex: 20 + pet.z,
            opacity,
            transform: "translate3d(-50%, -50%, 0)",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
          onPointerEnter={onActivity}
          onPointerLeave={onActivity}
          onAuxClick={(event) => {
            if (event.button !== 1) return;
            event.preventDefault();
            playGesture(middleGesture);
          }}
          onContextMenuCapture={(event) => {
            if (resizeRef.current?.moved || suppressMenu.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          {/* reaction bubble */}
          {bubble && (
            <div
              key={bubble.id}
              data-pet-visual
              className={cn(
                "bubble-tail animate-bubble pointer-events-none absolute left-1/2 z-40 w-max max-w-[230px] -translate-x-1/2 rounded-[16px] border border-white/90 bg-white/95 px-3 py-2 text-center text-[11px] font-semibold leading-[1.45] text-[#42566f] shadow-[0_16px_30px_-16px_rgba(35,60,100,0.5)] backdrop-blur",
                above ? "bottom-full mb-3" : "bottom-full mb-8"
              )}
            >
              {bubble.text}
            </div>
          )}

          {/* click burst */}
          {bursting && (
            <div
              data-pet-visual
              className="pointer-events-none absolute bottom-full left-1/2 z-30 h-24 w-36 -translate-x-1/2"
            >
              <StickerBurst key={burstKey} effect={effectForSticker(sticker.id)} />
            </div>
          )}

          <div ref={gestureMotion} className="relative h-full w-full">
            {resizing && (
              <>
                <div className="pointer-events-none absolute -inset-1 z-10 rounded-[20px] border-2 border-dashed border-[#74adf7]/80 bg-[#cfe4ff]/10" />
                <span className="pointer-events-none absolute -top-7 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#2f4d74]/90 px-2 py-0.5 text-[9px] font-bold text-white shadow-sm">
                  {Math.round(resizeScale * 100)}%
                </span>
              </>
            )}
            <div
              data-pet-angle
              className="relative h-full w-full"
              style={{ transform: physics ? undefined : `rotate(${pet.angle ?? 0}rad)` }}
            >
              <div
                className="relative h-full w-full"
                style={{ scale: pet.flipped ? "-1 1" : undefined }}
              >
                <div
                  className={cn(
                    "h-full w-full",
                    idleAnimation,
                    clickBounce && "animate-pet-bounce"
                  )}
                >
                  <StickerImage
                    sticker={poses.shown}
                    animated={animated}
                    greet={reactKey}
                    desktop
                    className="h-full w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          {activeGesture && (
            <StickerGestureEffect
              gesture={activeGesture}
              spriteMotion={gestureMotion}
              reduceMotion={reduceMotion}
              onContact={onGestureContact}
              onFinish={onGestureFinish}
            />
          )}

          {/* hint */}
          {hintVisible && !passthrough && (
            <div
              className={cn(
                "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/90 bg-white/92 px-3 py-1.5 text-[10px] font-semibold text-[#5a7694] shadow-[0_12px_24px_-16px_rgba(35,60,100,0.55)] backdrop-blur",
                above ? "bottom-full mb-3" : "bottom-full mb-8"
              )}
              data-pet-visual
            >
              <span className="mr-1 inline-flex items-center gap-1 text-[#4a8df8]">
                <Hand className="h-3 w-3" /> 拖动我
              </span>
              · 中键抚摸
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent
        data-pet-menu
        className="w-[208px] rounded-[18px] border-white/85 bg-white/95 p-1.5 shadow-[0_24px_48px_-20px_rgba(30,58,102,0.45)] backdrop-blur-xl"
      >
        <ContextMenuLabel className="flex items-center gap-2 px-2 py-1.5">
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-[#eef5ff]">
            <StickerImage sticker={sticker} className="h-6 w-6" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-bold text-ink">{sticker.name}</span>
            <span className="block text-[8.5px] font-medium text-ink-faint">
              {poses.variants ? STATE_LABEL[poses.shown.state] : sticker.kind === "animated" ? "动态贴纸" : "静态贴纸"} · {packTitle(sticker.packId)}
            </span>
          </span>
        </ContextMenuLabel>
        <ContextMenuSeparator className="my-1 bg-[#edf3fa]" />
        <ContextMenuCheckboxItem
          checked={(pet.layer ?? "floating") === "floating"}
          onCheckedChange={(checked) => {
            const position = getPhysicsPosition(pet.id);
            updatePet(pet.id, {
              layer: checked ? "floating" : "desktop",
              ...(position && {
                x: position.x / window.innerWidth,
                y: position.y / window.innerHeight,
                angle: position.angle,
              }),
            });
          }}
          className="gap-2 rounded-xl py-1.5 pl-8 pr-2 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <ArrowUpToLine className="mr-1 h-3.5 w-3.5" /> 置顶
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={Boolean(pet.flipped)}
          onCheckedChange={() => updatePet(pet.id, { flipped: !pet.flipped })}
          className="gap-2 rounded-xl py-1.5 pl-8 pr-2 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <FlipHorizontal className="mr-1 h-3.5 w-3.5" /> 左右翻转
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={Boolean(pet.passthrough)}
          onCheckedChange={(checked) => {
            const position = getPhysicsPosition(pet.id);
            updatePet(pet.id, {
              passthrough: checked,
              ...(position && {
                x: position.x / window.innerWidth,
                y: position.y / window.innerHeight,
                angle: position.angle,
              }),
            });
          }}
          className="gap-2 rounded-xl py-1.5 pl-8 pr-2 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <LockKeyhole className="mr-1 h-3.5 w-3.5" /> 锁定这张
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={autoDim}
          onCheckedChange={() => setSettings({ autoDim: !autoDim })}
          className="gap-2 rounded-xl py-1.5 pl-8 pr-2 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <Blend className="mr-1 h-3.5 w-3.5" /> 自动变淡
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator className="my-1 bg-[#edf3fa]" />
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]">
            <Hand className="h-3.5 w-3.5" /> 互动
          </ContextMenuSubTrigger>
          <ContextMenuPortal>
            <ContextMenuSubContent data-pet-menu className="pointer-events-auto rounded-[16px] p-1.5">
              <ContextMenuLabel className="px-2 py-1 text-[10px] text-ink-faint">
                选中后设为中键动作
              </ContextMenuLabel>
              <ContextMenuRadioGroup value={middleGesture.id}>
                {STICKER_GESTURES.map((definition) => (
                  <ContextMenuRadioItem
                    key={definition.id}
                    value={definition.id}
                    onSelect={() => {
                      updatePet(pet.id, { gesture: definition.id });
                      playGesture(definition);
                    }}
                    className="gap-2 rounded-xl py-1.5 pl-7 pr-3 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
                  >
                    <img src={definition.image} alt="" className="h-5 w-7 object-contain" draggable={false} />
                    {definition.label}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuPortal>
        </ContextMenuSub>
        {poses.variants && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#4b6580]">
              <Settings2 className="h-3.5 w-3.5" /> 切换状态
            </ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent data-pet-menu className="pointer-events-auto max-h-[75vh] overflow-y-auto rounded-[16px] p-1.5">
                <ContextMenuRadioGroup value={pet.pose ?? "auto"}>
                  <ContextMenuRadioItem value="auto" onSelect={() => updatePet(pet.id, { pose: undefined })}>
                    自动切换
                  </ContextMenuRadioItem>
                  <ContextMenuSeparator />
                  {poses.variants.map((variant) => (
                    <ContextMenuRadioItem
                      key={variant.id}
                      value={variant.state}
                      onSelect={() => updatePet(pet.id, { pose: variant.state })}
                    >
                      {STATE_LABEL[variant.state]}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
        )}
        <ContextMenuItem
          onSelect={replacePet}
          className="gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <Shuffle className="h-3.5 w-3.5" /> 换一只陪我
        </ContextMenuItem>
        <ContextMenuItem
          disabled={Boolean(physics) || Math.abs(pet.scale - 1) < 0.01}
          onSelect={() => updatePet(pet.id, { scale: 1 })}
          className="gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          恢复默认大小
          <span className="ml-auto rounded-full bg-[#eef5ff] px-1.5 py-0.5 text-[8.5px] font-bold text-[#6f89a8]">
            {Math.round(pet.scale * 100)}%
          </span>
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => void showMainWindow()}
          className="gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#4b6580] focus:bg-[#eef5ff] focus:text-[#34689f]"
        >
          <Settings2 className="h-3.5 w-3.5" /> 打开主界面
        </ContextMenuItem>
        <ContextMenuSeparator className="my-1 bg-[#edf3fa]" />
        <ContextMenuItem
          onSelect={() => removePet(pet.id)}
          className="gap-2 rounded-xl px-2 py-1.5 text-[11px] font-medium text-[#d8667a] focus:bg-[#fff1f3] focus:text-[#c9536a]"
        >
          <Trash2 className="h-3.5 w-3.5" /> 抱回小窝
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
