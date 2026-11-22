import Matter from "matter-js";
import { getPetSize } from "@/lib/pet-size";
import {
  BOX_SILHOUETTE,
  fitStickerCenter,
  stickerBounds,
  type StickerSilhouette,
} from "@/lib/sticker-silhouette";
import type { PetInstance, Settings, StickerMode } from "@/lib/store";

export type PhysicsMode = Exclude<StickerMode, "float">;

export interface PhysicsPosition {
  x: number;
  y: number;
  angle: number;
}

export interface PhysicsGeometry {
  silhouette: StickerSilhouette;
  previewScale?: number;
}

interface PhysicsSticker {
  body: Matter.Body;
  size: number;
  flipped: boolean;
  silhouette: StickerSilhouette;
  /** Local vector from the center of the image to the center of mass. */
  offset: Matter.Vector;
}

type PhysicsTuning = Pick<Settings,
  "gravityStrength" | "inertiaStrength" | "physicsWeight" | "physicsBounce" | "petCollisions"
>;

interface PhysicsOptions {
  mode: PhysicsMode;
  width: number;
  height: number;
  globalScale: number;
  tumble: boolean;
  tuning: PhysicsTuning;
}

const WALL_THICKNESS = 120;
const MAX_SPEED = 46;
const WALL = 1;
const PET = 2;

function bounded(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1;
}

/**
 * Matter.js world for the desktop stickers.
 *
 * The browser owns the rendering; Matter owns positions and rotations. Dragging
 * uses a spring constraint so the dragged sticker can push others around.
 */
export class StickerPhysics {
  private engine: Matter.Engine;
  private world: Matter.World;
  private dynamic = new Map<string, PhysicsSticker>();
  private statics = new Map<string, PhysicsSticker>();
  private walls: Matter.Body[] = [];
  private constraint: Matter.Constraint | null = null;
  private draggedId: string | null = null;
  private dragPointer: Matter.Vector = { x: 0, y: 0 };
  private dragAnchor: Matter.Vector = { x: 0, y: 0 };
  private active = true;
  private weight = 1;
  private bounce = 1;
  private inertia = 1;
  private petCollisions = true;

  constructor(private readonly options: PhysicsOptions) {
    this.engine = Matter.Engine.create({ enableSleeping: true });
    this.world = this.engine.world;
    this.buildWalls();
    this.setTuning(options.tuning);
  }

  private buildWalls() {
    const { width, height } = this.options;
    const wall = {
      isStatic: true,
      restitution: 0.55,
      friction: 0.2,
      collisionFilter: { category: WALL, mask: PET },
    };
    this.walls = [
      Matter.Bodies.rectangle(
        width / 2,
        -WALL_THICKNESS / 2,
        width + WALL_THICKNESS * 2,
        WALL_THICKNESS,
        wall
      ),
      Matter.Bodies.rectangle(
        width / 2,
        height + WALL_THICKNESS / 2,
        width + WALL_THICKNESS * 2,
        WALL_THICKNESS,
        wall
      ),
      Matter.Bodies.rectangle(
        -WALL_THICKNESS / 2,
        height / 2,
        WALL_THICKNESS,
        height + WALL_THICKNESS * 2,
        wall
      ),
      Matter.Bodies.rectangle(
        width + WALL_THICKNESS / 2,
        height / 2,
        WALL_THICKNESS,
        height + WALL_THICKNESS * 2,
        wall
      ),
    ];
    Matter.Composite.add(this.world, this.walls);
  }

  setTuning(tuning: PhysicsTuning) {
    const gravity = this.options.mode === "gravity" ? 0.9 * bounded(tuning.gravityStrength, 0.1, 2) : 0;
    const inertia = bounded(tuning.inertiaStrength, 0.2, 2);
    const weight = bounded(tuning.physicsWeight, 0.3, 2.5);
    const bounce = bounded(tuning.physicsBounce, 0, 1.5);
    const wake = this.engine.gravity.y !== gravity || this.petCollisions !== tuning.petCollisions;
    if (!wake && this.inertia === inertia && this.weight === weight && this.bounce === bounce) return;

    this.engine.gravity.y = gravity;
    this.inertia = inertia;
    this.weight = weight;
    this.bounce = bounce;
    this.petCollisions = tuning.petCollisions;
    for (const wall of this.walls) wall.restitution = Math.min(1, 0.55 * bounce);
    for (const sticker of this.statics.values()) this.tuneBody(sticker);
    for (const sticker of this.dynamic.values()) {
      this.tuneBody(sticker);
      const { body } = sticker;
      if (wake) Matter.Sleeping.set(body, false);
    }
    if (this.constraint) this.constraint.stiffness = this.dragStiffness();
    if (wake) this.active = true;
  }

  private tuneBody({ body, silhouette }: PhysicsSticker) {
    const gravity = this.options.mode === "gravity";
    body.collisionFilter.mask = silhouette.parts.length ? (this.petCollisions ? WALL | PET : WALL) : 0;
    body.restitution = Math.min(1, (gravity ? 0.34 : 0.68) * this.bounce);
    body.frictionAir = gravity ? 0.008 : 0.0012 / this.inertia;
    if (!body.isStatic) {
      Matter.Body.setDensity(body, 0.0012 * this.weight);
      if (!this.options.tumble) Matter.Body.setInertia(body, Infinity);
    }
  }

  private dragStiffness() {
    return Math.min(0.94, 0.62 / this.weight ** 1.6);
  }

  private wake() {
    for (const { body } of this.dynamic.values()) Matter.Sleeping.set(body, false);
    this.active = true;
  }

  get isActive() {
    return this.active && this.dynamic.size > 0;
  }

  private createSticker(pet: PetInstance, size: number, silhouette: StickerSilhouette, isStatic: boolean, pose: PhysicsPosition) {
    const flipped = Boolean(pet.flipped);
    const options = {
      collisionFilter: { category: PET },
      friction: 0.06,
      frictionStatic: 0.4,
      sleepThreshold: 45,
      label: `pet:${pet.id}`,
    } satisfies Matter.IBodyDefinition;
    const parts = silhouette.parts.map(({ left, top, right, bottom }) =>
      Matter.Bodies.rectangle(
        (left + right) / 2 * size * (flipped ? -1 : 1),
        (top + bottom) / 2 * size,
        (right - left) * size,
        (bottom - top) * size,
        silhouette.parts.length === 1 ? options : undefined,
      )
    );
    const body = parts.length > 1
      ? Matter.Body.create({ ...options, parts })
      : parts[0] ?? Matter.Bodies.rectangle(0, 0, 1, 1, options);
    const offset = Matter.Vector.mult(body.position, 1 / size);
    const sticker = { body, offset, size, flipped, silhouette };
    this.place(sticker, pose);
    if (isStatic) Matter.Body.setStatic(body, true);
    this.tuneBody(sticker);
    return sticker;
  }

  private fit(sticker: PhysicsSticker, x: number, y: number, angle: number) {
    const { size, silhouette, flipped } = sticker;
    const { width, height } = this.options;
    return fitStickerCenter(x, y, size, stickerBounds(silhouette, angle, flipped), width, height);
  }

  private imagePosition({ body, offset, size }: PhysicsSticker): PhysicsPosition {
    const center = Matter.Vector.rotate(offset, body.angle);
    return { x: body.position.x - center.x * size, y: body.position.y - center.y * size, angle: body.angle };
  }

  private place(sticker: PhysicsSticker, { x, y, angle }: PhysicsPosition) {
    const fitted = this.fit(sticker, x, y, angle);
    const offset = Matter.Vector.rotate(sticker.offset, angle);
    Matter.Body.setAngle(sticker.body, angle);
    Matter.Body.setPosition(sticker.body, {
      x: fitted.x + offset.x * sticker.size,
      y: fitted.y + offset.y * sticker.size,
    });
  }

  private keepInside(sticker: PhysicsSticker) {
    // A solver step can let fast motion or collision slop pass the wall.
    const { body } = sticker;
    const old = this.imagePosition(sticker);
    const { x, y } = this.fit(sticker, old.x, old.y, old.angle);
    const dx = x - old.x;
    const dy = y - old.y;
    if (dx === 0 && dy === 0) return;

    const velocity = Matter.Body.getVelocity(body);
    Matter.Body.translate(body, { x: dx, y: dy });
    if (dx * velocity.x < 0 || dy * velocity.y < 0) {
      Matter.Body.setVelocity(body, {
        x: dx * velocity.x < 0 ? 0 : velocity.x,
        y: dy * velocity.y < 0 ? 0 : velocity.y,
      });
    }
  }

  sync(pets: PetInstance[], lockedPets: PetInstance[], geometries: ReadonlyMap<string, PhysicsGeometry>) {
    let obstaclesChanged = false;
    const { globalScale, width, height, tumble } = this.options;
    const syncBodies = (instances: PetInstance[], bodies: Map<string, PhysicsSticker>, isStatic: boolean) => {
      const ids = new Set(instances.map((pet) => pet.id));
      for (const [id, { body }] of bodies) {
        if (ids.has(id)) continue;
        if (!isStatic && this.draggedId === id) {
          this.removeConstraint();
          this.draggedId = null;
        }
        Matter.Composite.remove(this.world, body);
        bodies.delete(id);
        obstaclesChanged = true;
      }
      for (const pet of instances) {
        const geometry = geometries.get(pet.id);
        const size = getPetSize(globalScale, geometry?.previewScale ?? pet.scale, width, height);
        const silhouette = geometry?.silhouette ?? BOX_SILHOUETTE;
        const existing = bodies.get(pet.id);
        const initial = { x: pet.x * width, y: pet.y * height, angle: isStatic || tumble ? pet.angle ?? 0 : 0 };
        const live = existing && !isStatic ? this.imagePosition(existing) : initial;
        if (!existing || existing.silhouette !== silhouette || existing.flipped !== Boolean(pet.flipped) || (isStatic && existing.size !== size)) {
          const sticker = this.createSticker(pet, size, silhouette, isStatic, live);
          if (existing) {
            Matter.Composite.remove(this.world, existing.body);
            if (!isStatic) {
              Matter.Body.setVelocity(sticker.body, Matter.Body.getVelocity(existing.body));
              Matter.Body.setAngularVelocity(sticker.body, Matter.Body.getAngularVelocity(existing.body));
              if (this.draggedId === pet.id) this.attachConstraint(sticker);
            }
          }
          bodies.set(pet.id, sticker);
          Matter.Composite.add(this.world, sticker.body);
          obstaclesChanged = true;
        } else if (existing.size !== size) {
          const ratio = size / existing.size;
          Matter.Body.scale(existing.body, ratio, ratio);
          existing.size = size;
          this.tuneBody(existing);
          this.place(existing, live);
          obstaclesChanged = true;
        } else if (isStatic) {
          const previous = this.imagePosition(existing);
          const fitted = this.fit(existing, live.x, live.y, live.angle);
          if (Math.abs(fitted.x - previous.x) > 0.001 || Math.abs(fitted.y - previous.y) > 0.001 || live.angle !== previous.angle) {
            this.place(existing, live);
            obstaclesChanged = true;
          }
        }
      }
    };
    syncBodies(pets, this.dynamic, false);
    syncBodies(lockedPets, this.statics, true);
    if (obstaclesChanged) this.wake();
  }

  step(deltaMs: number) {
    this.updateDragTarget();
    Matter.Engine.update(this.engine, deltaMs);
    if (this.constraint?.bodyB?.isSleeping) Matter.Sleeping.set(this.constraint.bodyB, false);
    this.active = Boolean(this.constraint);
    for (const sticker of this.dynamic.values()) {
      const { body } = sticker;
      if (body.isSleeping) continue;
      if (!this.options.tumble) {
        if (body.angle !== 0) Matter.Body.setAngle(body, 0);
        if (body.angularVelocity !== 0) Matter.Body.setAngularVelocity(body, 0);
      }
      this.keepInside(sticker);
      this.active = true;
    }
  }

  forEachPosition(visit: (id: string, x: number, y: number, angle: number) => void) {
    for (const [id, sticker] of this.dynamic) {
      const { x, y, angle } = this.imagePosition(sticker);
      visit(id, x, y, angle);
    }
  }

  position(id: string): PhysicsPosition | undefined {
    const sticker = this.dynamic.get(id);
    if (sticker) return this.imagePosition(sticker);
  }

  snapshot(): Map<string, PhysicsPosition> {
    return new Map(Array.from(this.dynamic, ([id, sticker]) => [id, this.imagePosition(sticker)]));
  }

  grab(id: string, x: number, y: number) {
    const sticker = this.dynamic.get(id);
    if (!sticker) return;
    this.draggedId = id;
    this.active = true;
    Matter.Sleeping.set(sticker.body, false);
    const pose = this.imagePosition(sticker);
    this.dragPointer = { x, y };
    this.dragAnchor = Matter.Vector.rotate({ x: x - pose.x, y: y - pose.y }, -pose.angle);
    this.attachConstraint(sticker);
  }

  private attachConstraint(sticker: PhysicsSticker) {
    this.removeConstraint();
    const { body, offset, size } = sticker;
    const pointB = Matter.Vector.rotate(Matter.Vector.sub(this.dragAnchor, Matter.Vector.mult(offset, size)), body.angle);
    this.constraint = Matter.Constraint.create({
      pointA: { ...this.dragPointer },
      bodyB: body,
      pointB,
      length: 0,
      stiffness: this.dragStiffness(),
      damping: 0.24,
    });
    Matter.Composite.add(this.world, this.constraint);
  }

  drag(x: number, y: number) {
    this.dragPointer.x = x;
    this.dragPointer.y = y;
  }

  private updateDragTarget() {
    const constraint = this.constraint;
    const sticker = this.draggedId === null ? undefined : this.dynamic.get(this.draggedId);
    if (!constraint || !sticker) return;
    const angle = sticker.body.angle;
    const grip = Matter.Vector.rotate(this.dragAnchor, angle);
    const requestedX = this.dragPointer.x - grip.x;
    const requestedY = this.dragPointer.y - grip.y;
    const target = this.fit(sticker, requestedX, requestedY, angle);
    constraint.pointA.x = target.x + grip.x;
    constraint.pointA.y = target.y + grip.y;
    return {
      clampedX: requestedX - target.x,
      clampedY: requestedY - target.y,
    };
  }

  release(id: string, velocity: { x: number; y: number }, moved: boolean) {
    const target = this.updateDragTarget();
    this.removeConstraint();
    const body = this.dynamic.get(id)?.body;
    this.draggedId = null;
    if (!body) return;
    Matter.Sleeping.set(body, false);
    if (!moved) {
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      return;
    }
    const inertia = this.options.mode === "space" ? this.inertia : 1;
    const x = (target?.clampedX ?? 0) * velocity.x > 0 ? 0 : velocity.x;
    const y = (target?.clampedY ?? 0) * velocity.y > 0 ? 0 : velocity.y;
    const speed = Math.hypot(x, y) * inertia;
    const scale = speed > MAX_SPEED ? inertia * MAX_SPEED / speed : inertia;
    Matter.Body.setVelocity(body, { x: x * scale, y: y * scale });
    Matter.Body.setAngularVelocity(
      body,
      this.options.tumble ? Math.max(-0.12, Math.min(0.12, x * scale * 0.0015)) : 0
    );
  }

  private removeConstraint() {
    if (this.constraint) {
      Matter.Composite.remove(this.world, this.constraint);
      this.constraint = null;
    }
  }

  destroy() {
    this.removeConstraint();
    Matter.Composite.clear(this.world, false, true);
    Matter.Engine.clear(this.engine);
    this.dynamic.clear();
    this.statics.clear();
    this.walls = [];
  }
}
