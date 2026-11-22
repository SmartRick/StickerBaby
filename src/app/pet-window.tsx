import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Unlock } from "lucide-react";
import { PetSprite } from "@/components/pet-sprite";
import { useOverlayEffects } from "@/hooks/use-overlay-effects";
import { usePetHitRects } from "@/hooks/use-pet-hit-rects";
import { useStickerPhysics } from "@/hooks/use-sticker-physics";
import { clampPetAxis, getPetSize, petHalfExtent } from "@/lib/pet-size";
import { findSticker, useAppStore, type PetInstance } from "@/lib/store";
import type { PhysicsPosition } from "@/lib/sticker-physics";
import { inTauri, invokeSafe, onAppEvent } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface OverlayCursor {
  cursor: [number, number] | null;
  origin: [number, number];
  scale: number;
}

export function PetWindow() {
  const layer =
    new URLSearchParams(window.location.search).get("layer") === "desktop"
      ? "desktop"
      : "floating";

  useOverlayEffects({ events: false });

  const pets = useAppStore((state) => state.pets);
  const created = useAppStore((state) => state.createdStickers);
  const settings = useAppStore((state) => state.settings);
  const onboarded = useAppStore((state) => state.onboarded);
  const setOnboarded = useAppStore((state) => state.setOnboarded);
  const dimmed = useAppStore((state) => state.dimmed);
  const setDimmed = useAppStore((state) => state.setDimmed);
  const updatePet = useAppStore((state) => state.updatePet);
  const commitPetPositions = useAppStore((state) => state.commitPetPositions);

  const idleTimer = useRef<number | undefined>(undefined);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [unlockPetId, setUnlockPetId] = useState<string | null>(null);
  const lockedPetsRef = useRef<PetInstance[]>([]);
  const unlockButtonRect = useRef<DOMRect | null>(null);
  const hoverRef = useRef<{ id: string; at: number } | null>(null);
  const missesRef = useRef(0);

  const layerPets = useMemo(
    () => pets.filter((pet) => (pet.layer ?? "floating") === layer),
    [layer, pets]
  );
  const interactivePets = useMemo(
    () => layerPets.filter((pet) => !pet.passthrough),
    [layerPets]
  );
  const lockedPets = useMemo(
    () => layerPets.filter((pet) => pet.passthrough),
    [layerPets]
  );
  lockedPetsRef.current = lockedPets;

  usePetHitRects(settings.overlayVisible && !settings.passthrough);

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const commitPhysics = useCallback(
    (snapshot: Map<string, PhysicsPosition>) => {
      if (snapshot.size === 0) return;
      const positions: Record<string, { x: number; y: number; angle: number }> = {};
      for (const pet of useAppStore.getState().pets) {
        const position = snapshot.get(pet.id);
        if (!position || pet.passthrough) continue;
        const x = position.x / window.innerWidth;
        const y = position.y / window.innerHeight;
        if (
          Math.abs(x - pet.x) * window.innerWidth < 0.25 &&
          Math.abs(y - pet.y) * window.innerHeight < 0.25 &&
          Math.abs(position.angle - (pet.angle ?? 0)) < 0.001
        ) continue;
        positions[pet.id] = {
          x,
          y,
          angle:
            useAppStore.getState().settings.stickerMode === "float"
              ? 0
              : position.angle,
        };
      }
      if (Object.keys(positions).length) commitPetPositions(positions);
    },
    [commitPetPositions]
  );

  const physicsEnabled =
    settings.overlayVisible &&
    !settings.passthrough &&
    settings.stickerMode !== "float";

  const {
    registerSprite,
    registerGeometry,
    getPosition,
    grab,
    drag,
    release,
  } = useStickerPhysics({
    enabled: physicsEnabled,
    settings,
    pets: interactivePets,
    lockedPets,
    onCommit: commitPhysics,
  });

  const activity = useCallback(() => {
    if (useAppStore.getState().dimmed) setDimmed(false);
    window.clearTimeout(idleTimer.current);
    if (settings.autoDim && settings.overlayVisible) {
      idleTimer.current = window.setTimeout(
        () => setDimmed(true),
        Math.max(1200, settings.dimDelay * 1000)
      );
    }
  }, [
    setDimmed,
    settings.autoDim,
    settings.dimDelay,
    settings.overlayVisible,
  ]);

  useEffect(() => {
    activity();
    return () => window.clearTimeout(idleTimer.current);
  }, [activity, pets.length]);

  useEffect(() => {
    document.title = layer === "desktop" ? "贴纸宝宝 Desktop" : "贴纸宝宝 Layer";
    document.documentElement.classList.add("pet-surface");
    document.body.classList.add("pet-surface");
    // The pet layer has its own Radix menus; never show WebView2's native
    // back/reload/save-image context menu (it also pops after a right-drag).
    const blockNativeMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", blockNativeMenu);
    const timer = window.setTimeout(() => void invokeSafe("overlay_ready"), 160);
    const stopBlur = onAppEvent("overlay:blur", () => {
      document.body.classList.remove("dragging");
    });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("contextmenu", blockNativeMenu);
      stopBlur();
    };
  }, [layer]);

  useEffect(() => {
    if (layer !== "floating" || layerPets.length === 0 || onboarded) return;
    const timer = window.setTimeout(() => setOnboarded(true), 7600);
    return () => window.clearTimeout(timer);
  }, [layer, layerPets.length, onboarded, setOnboarded]);

  // Hover a locked sticker for ~1.2s to reveal its unlock button. The button
  // lives in the interactive layer, which is the only layer that can click.
  useEffect(() => {
    if (!inTauri || settings.passthrough || !settings.overlayVisible || lockedPets.length === 0) {
      setUnlockPetId(null);
      return;
    }
    let busy = false;
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const info = await invokeSafe<OverlayCursor>("overlay_cursor");
        if (!info?.cursor) return;
        const dpr = info.scale || 1;
        const x = (info.cursor[0] - info.origin[0]) / dpr;
        const y = (info.cursor[1] - info.origin[1]) / dpr;

        const button = unlockButtonRect.current;
        const overButton =
          unlockPetId !== null &&
          button !== null &&
          x >= button.left - 10 &&
          x <= button.right + 10 &&
          y >= button.top - 10 &&
          y <= button.bottom + 10;

        if (overButton) {
          missesRef.current = 0;
          return;
        }

        let hit: PetInstance | null = null;
        for (const pet of lockedPetsRef.current) {
          const size = getPetSize(settings.petScale, pet.scale, viewport.width, viewport.height);
          const extent = petHalfExtent(size, pet.angle ?? 0);
          const cx = clampPetAxis(pet.x * viewport.width, extent, viewport.width);
          const cy = clampPetAxis(pet.y * viewport.height, extent, viewport.height);
          if (
            Math.abs(x - cx) <= extent + 10 &&
            Math.abs(y - cy) <= extent + 10
          ) {
            hit = pet;
            break;
          }
        }

        if (!hit) {
          hoverRef.current = null;
          missesRef.current += 1;
          if (missesRef.current >= 5) {
            missesRef.current = 0;
            setUnlockPetId(null);
          }
          return;
        }

        missesRef.current = 0;
        if (hoverRef.current?.id !== hit.id) {
          hoverRef.current = { id: hit.id, at: performance.now() };
          setUnlockPetId(null);
          return;
        }
        if (performance.now() - hoverRef.current.at >= 1200) {
          setUnlockPetId(hit.id);
        }
      } finally {
        busy = false;
      }
    }, 160);
    return () => window.clearInterval(timer);
  }, [
    lockedPets.length,
    settings.overlayVisible,
    settings.passthrough,
    settings.petScale,
    unlockPetId,
    viewport,
  ]);

  const unlockTarget = unlockPetId
    ? lockedPets.find((pet) => pet.id === unlockPetId) ?? null
    : null;
  const unlockExtent = unlockTarget
    ? petHalfExtent(getPetSize(settings.petScale, unlockTarget.scale, viewport.width, viewport.height), unlockTarget.angle ?? 0)
    : 0;
  const unlockY = unlockTarget
    ? clampPetAxis(unlockTarget.y * viewport.height, unlockExtent, viewport.height)
    : 0;
  const unlockAbove = unlockY + unlockExtent + 44 > viewport.height;
  const unlockLeft = unlockTarget
    ? clampPetAxis(unlockTarget.x * viewport.width, Math.max(64, unlockExtent), viewport.width)
    : 0;
  const unlockTop = unlockY + (unlockAbove ? -1 : 1) * (unlockExtent + 16);

  const firstPetId = interactivePets[0]?.id;

  return (
    <div className="pet-root">
      <div className="absolute inset-0">
        {layerPets.map((pet) => {
          const sticker = findSticker(pet.stickerId, created);
          if (!sticker) return null;
          return (
            <PetSprite
              key={pet.id}
              pet={pet}
              sticker={sticker}
              globalScale={settings.petScale}
              viewport={viewport}
              passthrough={settings.passthrough || Boolean(pet.passthrough)}
              autoDim={settings.autoDim}
              reduceMotion={settings.reduceMotion}
              hint={layer === "floating" && !onboarded && !settings.passthrough && pet.id === firstPetId}
              onActivity={activity}
              opacity={settings.autoDim && dimmed ? settings.dimOpacity : 1}
              visible={settings.overlayVisible}
              physics={physicsEnabled && !pet.passthrough}
              registerPhysicsSprite={registerSprite}
              registerPhysicsGeometry={registerGeometry}
              getPhysicsPosition={getPosition}
              onPhysicsGrab={grab}
              onPhysicsDrag={drag}
              onPhysicsRelease={release}
            />
          );
        })}
      </div>

      {unlockTarget && (
        <div
          data-pet-hit
          data-pet-pad="18"
          className="pet-hit absolute z-[9999]"
          style={{
            left: unlockLeft,
            top: unlockTop,
            transform: `translate(-50%, ${unlockAbove ? "-100%" : "0"})`,
          }}
          ref={(element) => {
            unlockButtonRect.current = element
              ? element.getBoundingClientRect()
              : null;
          }}
        >
          <button
            type="button"
            onClick={() => {
              updatePet(unlockTarget.id, { passthrough: false });
              setUnlockPetId(null);
            }}
            className={cn(
              "pressable flex items-center gap-1.5 rounded-full border border-white/90 bg-white/95 px-3 py-1.5",
              "text-[10.5px] font-bold text-[#3f6fa8] shadow-[0_14px_28px_-16px_rgba(35,65,110,0.6)] backdrop-blur",
              "hover:bg-[#4a8df8] hover:text-white"
            )}
          >
            <Unlock className="h-3.5 w-3.5" strokeWidth={2.2} />
            解锁
          </button>
        </div>
      )}

    </div>
  );
}
