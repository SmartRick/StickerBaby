import { useCallback, useLayoutEffect, useRef } from "react";
import { StickerPhysics, type PhysicsGeometry, type PhysicsPosition } from "@/lib/sticker-physics";
import type { PetInstance, Settings } from "@/lib/store";

interface UseStickerPhysicsOptions {
  enabled: boolean;
  settings: Settings;
  pets: PetInstance[];
  lockedPets: PetInstance[];
  onCommit: (positions: Map<string, PhysicsPosition>) => void;
}

export type RegisterPhysicsSprite = (id: string, element: HTMLDivElement | null) => void;

interface Sprite {
  element: HTMLDivElement;
  rotation: HTMLElement | null;
  x?: number;
  y?: number;
  angle?: number;
}

export function useStickerPhysics({ enabled, settings, pets, lockedPets, onCommit }: UseStickerPhysicsOptions) {
  const { stickerMode: mode, petScale: globalScale, tumble } = settings;
  const controllerRef = useRef<StickerPhysics | null>(null);
  const sprites = useRef(new Map<string, Sprite>());
  const geometries = useRef(new Map<string, PhysicsGeometry>());
  const latest = useRef({ pets, lockedPets, settings, onCommit });
  const previousWorld = useRef<{ poses: Map<string, PhysicsPosition>; width: number; height: number } | null>(null);
  const requestStep = useRef<(() => void) | null>(null);
  latest.current = { pets, lockedPets, settings, onCommit };

  const registerGeometry = useCallback((id: string, geometry: PhysicsGeometry | null) => {
    if (geometry) geometries.current.set(id, geometry);
    else geometries.current.delete(id);
    const controller = controllerRef.current;
    if (!controller) return;
    const { pets, lockedPets } = latest.current;
    controller.sync(pets, lockedPets, geometries.current);
    requestStep.current?.();
  }, []);

  const registerSprite: RegisterPhysicsSprite = useCallback((id, element) => {
    if (element) {
      sprites.current.set(id, { element, rotation: element.querySelector("[data-pet-angle]") });
    } else {
      const sprite = sprites.current.get(id);
      if (!sprite) return;
      sprite.element.style.translate = "";
      if (sprite.rotation) sprite.rotation.style.rotate = "";
      sprites.current.delete(id);
    }
  }, []);

  useLayoutEffect(() => {
    if (!enabled || mode === "float") {
      previousWorld.current = null;
      return;
    }
    let controller: StickerPhysics;
    let frame = 0;
    let last = 0;
    let presentedAt = 0;
    let accumulator = 0;

    const render = () => {
      controller.forEachPosition((id, x, y, angle) => {
        const sprite = sprites.current.get(id);
        if (!sprite) return;
        const px = Math.fround(x);
        const py = Math.fround(y);
        const rotation = Math.fround(angle);
        if (px !== sprite.x || py !== sprite.y) {
          sprite.element.style.translate = `${px}px ${py}px`;
          sprite.x = px;
          sprite.y = py;
        }
        if (sprite.rotation && rotation !== sprite.angle) {
          sprite.rotation.style.rotate = `${rotation}rad`;
          sprite.angle = rotation;
        }
      });
    };

    const commit = () => latest.current.onCommit(controller.snapshot());

    const loop = (now: number) => {
      frame = 0;
      // Keep solver steps at 60 Hz or higher even in 30 Hz presentation mode.
      const fps = latest.current.settings.physicsFps;
      const stepMs = 1000 / Math.max(60, fps);
      accumulator = Math.min(stepMs * 4, accumulator + Math.max(0, now - last));
      last = now;
      let stepped = false;
      while (accumulator + 0.01 >= stepMs && controller.isActive) {
        controller.step(stepMs);
        accumulator = Math.max(0, accumulator - stepMs);
        stepped = true;
      }

      const active = controller.isActive;
      if (stepped && (fps !== 30 || now - presentedAt >= 32 || !active)) {
        render();
        presentedAt = now;
      }
      if (active) {
        frame = requestAnimationFrame(loop);
      } else {
        // Persist settled positions without writing to storage during motion.
        commit();
      }
    };

    const schedule = () => {
      if (frame || !controller.isActive) return;
      last = performance.now();
      accumulator = 0;
      frame = requestAnimationFrame(loop);
    };

    const create = (seed?: Map<string, PhysicsPosition>, oldWidth?: number, oldHeight?: number) => {
      controller = new StickerPhysics({
        mode,
        width: window.innerWidth,
        height: window.innerHeight,
        globalScale,
        tumble,
        tuning: latest.current.settings,
      });
      controllerRef.current = controller;
      const current = latest.current;
      const startingPets = seed && oldWidth && oldHeight
        ? current.pets.map((pet) => {
            const pose = seed.get(pet.id);
            return pose ? { ...pet, x: pose.x / oldWidth, y: pose.y / oldHeight, angle: pose.angle } : pet;
          })
        : current.pets;
      controller.sync(startingPets, current.lockedPets, geometries.current);
      render();
      schedule();
    };

    const previous = previousWorld.current;
    previousWorld.current = null;
    create(previous?.poses, previous?.width, previous?.height);
    let width = window.innerWidth;
    let height = window.innerHeight;
    const resize = () => {
      if (window.innerWidth === width && window.innerHeight === height) return;
      const snapshot = controller.snapshot();
      cancelAnimationFrame(frame);
      frame = 0;
      controller.destroy();
      create(snapshot, width, height);
      width = window.innerWidth;
      height = window.innerHeight;
    };

    requestStep.current = () => {
      render();
      schedule();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", commit);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pagehide", commit);
      previousWorld.current = { poses: controller.snapshot(), width, height };
      latest.current.onCommit(previousWorld.current.poses);
      controller.destroy();
      controllerRef.current = null;
      requestStep.current = null;
      for (const sprite of sprites.current.values()) {
        sprite.element.style.translate = "";
        if (sprite.rotation) sprite.rotation.style.rotate = "";
        sprite.x = sprite.y = sprite.angle = undefined;
      }
    };
  }, [enabled, globalScale, mode, tumble]);

  useLayoutEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.setTuning(settings);
    controller.sync(pets, lockedPets, geometries.current);
    requestStep.current?.();
  }, [lockedPets, pets, settings]);

  const grab = useCallback((id: string, x: number, y: number) => {
    controllerRef.current?.grab(id, x, y);
    requestStep.current?.();
  }, []);

  const drag = useCallback((_id: string, x: number, y: number) => {
    controllerRef.current?.drag(x, y);
  }, []);

  const release = useCallback((id: string, velocity: { x: number; y: number }, moved: boolean) => {
    controllerRef.current?.release(id, { x: velocity.x * 16.67, y: velocity.y * 16.67 }, moved);
  }, []);

  const getPosition = useCallback((id: string) => controllerRef.current?.position(id), []);

  return { registerSprite, registerGeometry, getPosition, grab, drag, release };
}
