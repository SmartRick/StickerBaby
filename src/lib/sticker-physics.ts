import Matter from "matter-js";
import { clampPetAxis, getPetSize, petHalfExtent } from "@/lib/pet-size";
import type { PetInstance, Settings, StickerMode } from "@/lib/store";

export type PhysicsMode = Exclude<StickerMode, "float">;

export interface PhysicsPosition {
  x: number;
  y: number;
  angle: number;
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
  private dynamic = new Map<string, Matter.Body>();
  private statics = new Map<string, Matter.Body>();
  private sizes = new Map<string, number>();
  private staticSizes = new Map<string, number>();
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
    for (const body of this.statics.values()) this.tuneBody(body);
    for (const body of this.dynamic.values()) {
      this.tuneBody(body);
      if (wake) Matter.Sleeping.set(body, false);
    }
    if (this.constraint) this.constraint.stiffness = this.dragStiffness();
    if (wake) this.active = true;
  }

  private tuneBody(body: Matter.Body) {
    const gravity = this.options.mode === "gravity";
    body.collisionFilter.mask = this.petCollisions ? WALL | PET : WALL;
    body.restitution = Math.min(1, (gravity ? 0.34 : 0.68) * this.bounce);
    body.frictionAir = gravity ? 0.008 : 0.0012 / this.inertia;
    if (!body.isStatic) Matter.Body.setDensity(body, 0.0012 * this.weight);
  }

  private dragStiffness() {
    return Math.min(0.94, 0.62 / this.weight ** 1.6);
  }

  private wake() {
    for (const body of this.dynamic.values()) Matter.Sleeping.set(body, false);
    this.active = true;
  }

  get isActive() {
    return this.active && this.dynamic.size > 0;
  }

  private bodySize(pet: PetInstance): number {
    const { globalScale, width, height } = this.options;
    return getPetSize(globalScale, pet.scale, width, height);
  }

  private createBody(pet: PetInstance, size: number, isStatic: boolean): Matter.Body {
    const angle = isStatic || this.options.tumble ? pet.angle ?? 0 : 0;
    const { x, y } = this.fit(pet.x * this.options.width, pet.y * this.options.height, size, angle);
    const body = Matter.Bodies.rectangle(x, y, size, size, {
      isStatic,
      collisionFilter: { category: PET },
      friction: 0.06,
      frictionStatic: 0.4,
      angle,
      sleepThreshold: 45,
      label: `pet:${pet.id}`,
    });
    if (!this.options.tumble && !isStatic) Matter.Body.setInertia(body, Infinity);
    this.tuneBody(body);
    return body;
  }

  private fit(x: number, y: number, size: number, angle: number) {
    const extent = petHalfExtent(size, angle);
    return {
      x: clampPetAxis(x, extent, this.options.width),
      y: clampPetAxis(y, extent, this.options.height),
    };
  }

  private keepInside(body: Matter.Body, size: number) {
    // A solver step can let fast motion or collision slop pass the wall.
    const old = body.position;
    const { x, y } = this.fit(old.x, old.y, size, body.angle);
    const dx = x - old.x;
    const dy = y - old.y;
    if (dx === 0 && dy === 0) return;

    const velocity = Matter.Body.getVelocity(body);
    Matter.Body.setPosition(body, { x, y });
    if (dx * velocity.x < 0 || dy * velocity.y < 0) {
      Matter.Body.setVelocity(body, {
        x: dx * velocity.x < 0 ? 0 : velocity.x,
        y: dy * velocity.y < 0 ? 0 : velocity.y,
      });
    }
  }

  sync(pets: PetInstance[], lockedPets: PetInstance[]) {
    let obstaclesChanged = false;
    const dynamicIds = new Set(pets.map((pet) => pet.id));
    for (const [id, body] of this.dynamic) {
      if (!dynamicIds.has(id)) {
        if (this.draggedId === id) {
          this.removeConstraint();
          this.draggedId = null;
        }
        obstaclesChanged = true;
        Matter.Composite.remove(this.world, body);
        this.dynamic.delete(id);
        this.sizes.delete(id);
      }
    }

    const staticIds = new Set(lockedPets.map((pet) => pet.id));
    for (const [id, body] of this.statics) {
      if (!staticIds.has(id)) {
        Matter.Composite.remove(this.world, body);
        this.statics.delete(id);
        this.staticSizes.delete(id);
        obstaclesChanged = true;
      }
    }

    for (const pet of lockedPets) {
      const size = this.bodySize(pet);
      const existing = this.statics.get(pet.id);
      if (!existing || this.staticSizes.get(pet.id) !== size) {
        if (existing) Matter.Composite.remove(this.world, existing);
        const body = this.createBody(pet, size, true);
        this.statics.set(pet.id, body);
        this.staticSizes.set(pet.id, size);
        Matter.Composite.add(this.world, body);
        obstaclesChanged = true;
      } else {
        const angle = pet.angle ?? 0;
        const { x, y } = this.fit(pet.x * this.options.width, pet.y * this.options.height, size, angle);
        if (x !== existing.position.x || y !== existing.position.y || angle !== existing.angle) {
          Matter.Body.setAngle(existing, angle);
          Matter.Body.setPosition(existing, { x, y });
          obstaclesChanged = true;
        }
      }
    }

    for (const pet of pets) {
      const size = this.bodySize(pet);
      const existing = this.dynamic.get(pet.id);
      if (existing) {
        const previousSize = this.sizes.get(pet.id) ?? size;
        if (previousSize !== size) {
          const ratio = size / previousSize;
          Matter.Body.scale(existing, ratio, ratio);
          if (!this.options.tumble) Matter.Body.setInertia(existing, Infinity);
          this.keepInside(existing, size);
          this.sizes.set(pet.id, size);
          obstaclesChanged = true;
        }
        continue;
      }
      const body = this.createBody(pet, size, false);
      this.dynamic.set(pet.id, body);
      this.sizes.set(pet.id, size);
      Matter.Composite.add(this.world, body);
      this.active = true;
    }
    if (obstaclesChanged) this.wake();
  }

  step(deltaMs: number) {
    this.updateDragTarget();
    Matter.Engine.update(this.engine, deltaMs);
    if (this.constraint?.bodyB?.isSleeping) Matter.Sleeping.set(this.constraint.bodyB, false);
    this.active = Boolean(this.constraint);
    for (const [id, body] of this.dynamic) {
      if (body.isSleeping) continue;
      if (!this.options.tumble) {
        if (body.angle !== 0) Matter.Body.setAngle(body, 0);
        if (body.angularVelocity !== 0) Matter.Body.setAngularVelocity(body, 0);
      }
      this.keepInside(body, this.sizes.get(id)!);
      this.active = true;
    }
  }

  forEachPosition(visit: (id: string, x: number, y: number, angle: number) => void) {
    for (const [id, body] of this.dynamic) {
      visit(id, body.position.x, body.position.y, body.angle);
    }
  }

  position(id: string): PhysicsPosition | undefined {
    const body = this.dynamic.get(id);
    if (body) return { x: body.position.x, y: body.position.y, angle: body.angle };
  }

  snapshot(): Map<string, PhysicsPosition> {
    const positions = new Map<string, PhysicsPosition>();
    for (const [id, body] of this.dynamic) {
      positions.set(id, {
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
      });
    }
    return positions;
  }

  grab(id: string, x: number, y: number) {
    const body = this.dynamic.get(id);
    if (!body) return;
    this.removeConstraint();
    this.draggedId = id;
    this.active = true;
    Matter.Sleeping.set(body, false);
    // Preserve the position of the pointer relative to the sticker on pickup.
    const pointB = { x: x - body.position.x, y: y - body.position.y };
    this.dragPointer = { x, y };
    this.dragAnchor = Matter.Vector.rotate(pointB, -body.angle);
    this.constraint = Matter.Constraint.create({
      pointA: { x, y },
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
    const body = constraint?.bodyB;
    if (!constraint || !body || this.draggedId === null) return;
    const grip = Matter.Vector.rotate(this.dragAnchor, body.angle);
    const requestedX = this.dragPointer.x - grip.x;
    const requestedY = this.dragPointer.y - grip.y;
    const size = this.sizes.get(this.draggedId)!;
    const target = this.fit(requestedX, requestedY, size, body.angle);
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
    const body = this.dynamic.get(id);
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
    this.sizes.clear();
    this.staticSizes.clear();
    this.walls = [];
  }
}
