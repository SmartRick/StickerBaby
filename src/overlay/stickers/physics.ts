/**
 * 贴纸物理世界（Matter.js）。
 *
 * 只在太空 / 重力模式下创建。桌面模式（无论是否开启“贴纸之间碰撞”）都由贴纸自己
 * 处理（sticker.ts 的 slide + collide.ts 的凸包互撞），保证开碰撞不改变原有手感。
 *
 * 两种拖拽方式：
 * - direct（桌面模式）：贴纸直接跟手；刚体变成很重、不转的“运动学”刚体，每步用速度追到指针处，
 *   撞到别的贴纸时带着真实动量把它们撞飞。松手后恢复质量并交给甩出速度。
 * - spring（太空 / 重力）：用弹簧约束拉着刚体走，抓住偏心位置会像钟摆一样转，
 *   越重跟手越慢，拖着的贴纸会真实地撞开别的贴纸。
 *
 * 刚体由 alpha 轮廓拼成复合体，凹口和镂空处别的贴纸可以挤进去；锁定的贴纸是静态障碍。
 */
import Matter from "matter-js";
import type { Settings, StickerMode } from "@/lib/store";
import type { Pt } from "./mask";

export type PhysicsTuning = Pick<
  Settings,
  "gravityStrength" | "inertiaStrength" | "physicsWeight" | "physicsBounce" | "tumble" | "physicsFps"
> & { mode: Exclude<StickerMode, "float">; collisions: boolean };

export interface BodySpec {
  id: string;
  /** 图片中心（px）与旋转（rad） */
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  /** 凸包（以图片中心为原点的归一化坐标） */
  hull: Pt[];
  flipped: boolean;
  /** 锁定贴纸：静态障碍 */
  fixed: boolean;
}

export interface BodyPose {
  x: number;
  y: number;
  angle: number;
}

interface Entry {
  body: Matter.Body;
  spec: BodySpec;
  /** 质心相对图片中心的偏移（未旋转，px） */
  offset: Matter.Vector;
  dragging: boolean;
  /** 直接拖拽的目标（图片中心与角度） */
  target?: BodyPose;
}

/** 直接拖拽时质量放大倍数：被拖的贴纸几乎推不动，撞上去的贴纸会被弹开 */
const DRAG_MASS = 40;
const BASE_DELTA = 1000 / 60;

const WALL = 0x1;
const PET = 0x2;
const WALL_T = 400;
/** 桌面模式甩出速度上限（px/s），避免一帧穿过别的贴纸 */
const MAX_THROW = 3200;
/** 弹簧拖拽松手速度上限（px / 基准步） */
const MAX_SPEED = 46;

const clamp = (v: number, a: number, b: number) => (Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : 1);

export class StickerWorld {
  private engine = Matter.Engine.create({ enableSleeping: true });
  private entries = new Map<string, Entry>();
  private walls: Matter.Body[] = [];
  private acc = 0;
  private tuning!: PhysicsTuning;
  private constraint: Matter.Constraint | null = null;
  private dragId: string | null = null;
  private dragPointer: Matter.Vector = { x: 0, y: 0 };
  private dragAnchor: Matter.Vector = { x: 0, y: 0 };
  /** 撞墙回调（只在桌面模式触发，用于挤压回弹）：id、撞击强度（px/s）、法线 */
  onWallHit: ((id: string, speed: number, nx: number, ny: number) => void) | null = null;

  constructor(
    private width: number,
    private height: number,
    tuning: PhysicsTuning,
  ) {
    this.buildWalls();
    this.setTuning(tuning);
    Matter.Events.on(this.engine, "collisionStart", (e) => this.wallHits(e.pairs));
  }

  get springDrag() {
    return this.tuning.mode !== "desk";
  }

  private buildWalls() {
    Matter.Composite.remove(this.engine.world, this.walls);
    const { width: w, height: h } = this;
    const opt = { isStatic: true, friction: 0.2, collisionFilter: { category: WALL, mask: PET }, label: "wall" };
    this.walls = [
      Matter.Bodies.rectangle(w / 2, -WALL_T / 2, w + WALL_T * 2, WALL_T, opt),
      Matter.Bodies.rectangle(w / 2, h + WALL_T / 2, w + WALL_T * 2, WALL_T, opt),
      Matter.Bodies.rectangle(-WALL_T / 2, h / 2, WALL_T, h + WALL_T * 2, opt),
      Matter.Bodies.rectangle(w + WALL_T / 2, h / 2, WALL_T, h + WALL_T * 2, opt),
    ];
    Matter.Composite.add(this.engine.world, this.walls);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buildWalls();
    this.setTuning(this.tuning);
  }

  setTuning(t: PhysicsTuning) {
    const prev = this.tuning;
    this.tuning = t;
    const bounce = clamp(t.physicsBounce, 0, 1.5);
    this.engine.gravity.y = t.mode === "gravity" ? 0.9 * clamp(t.gravityStrength, 0.1, 2) : 0;
    for (const w of this.walls) w.restitution = Math.min(1, 0.55 * bounce);
    for (const e of this.entries.values()) this.tune(e);
    if (this.constraint) this.constraint.stiffness = this.dragStiffness();
    if (!prev || prev.mode !== t.mode || prev.collisions !== t.collisions || prev.gravityStrength !== t.gravityStrength) this.wakeAll();
  }

  private tune(e: Entry) {
    const t = this.tuning;
    const b = e.body;
    const bounce = clamp(t.physicsBounce, 0, 1.5);
    const inertia = clamp(t.inertiaStrength, 0.2, 2);
    b.collisionFilter.mask = t.collisions ? WALL | PET : WALL;
    b.friction = 0.06;
    b.frictionStatic = 0.4;
    switch (t.mode) {
      case "gravity":
        b.restitution = Math.min(1, 0.34 * bounce);
        b.frictionAir = 0.008;
        break;
      case "space":
        b.restitution = Math.min(1, 0.68 * bounce);
        b.frictionAir = 0.0012 / inertia;
        break;
      default:
        // 桌面：与不碰撞时的滑行手感一致（每秒保留约 12% 速度）
        b.restitution = Math.min(1, 0.55 * bounce);
        b.frictionAir = 0.035 / inertia;
    }
    if (!b.isStatic) {
      Matter.Body.setDensity(b, 0.0012 * clamp(t.physicsWeight, 0.3, 2.5));
      if (!t.tumble) Matter.Body.setInertia(b, Infinity);
    }
  }

  private dragStiffness() {
    return Math.min(0.94, 0.62 / clamp(this.tuning.physicsWeight, 0.3, 2.5) ** 1.6);
  }

  private wakeAll() {
    for (const e of this.entries.values()) if (!e.body.isStatic) Matter.Sleeping.set(e.body, false);
  }

  /** 与贴纸列表对齐：新增 / 删除 / 几何变化时重建刚体 */
  sync(specs: BodySpec[]) {
    const ids = new Set(specs.map((s) => s.id));
    for (const [id, e] of this.entries) {
      if (ids.has(id)) continue;
      if (this.dragId === id) this.dropConstraint();
      Matter.Composite.remove(this.engine.world, e.body);
      this.entries.delete(id);
    }
    for (const spec of specs) {
      const e = this.entries.get(spec.id);
      const geometryChanged =
        !e ||
        e.spec.hull !== spec.hull ||
        e.spec.flipped !== spec.flipped ||
        Math.abs(e.spec.width - spec.width) > 0.5 ||
        Math.abs(e.spec.height - spec.height) > 0.5;
      if (geometryChanged) {
        // 重建（换姿势、缩放）时保留运动状态；直接拖拽中以贴纸当前位置为准
        const dynamic = e && !e.body.isStatic;
        const velocity = dynamic ? Matter.Body.getVelocity(e.body) : null;
        const spin = dynamic ? e.body.angularVelocity : 0;
        const pose = e && !spec.fixed && !e.spec.fixed && !(e.dragging && !this.springDrag) ? this.pose(e) : spec;
        if (e) Matter.Composite.remove(this.engine.world, e.body);
        const next = this.create({ ...spec, ...pose });
        if (e?.dragging) {
          next.dragging = true;
          next.target = e.target;
          if (this.springDrag) this.attach(next);
          else this.makeKinematic(next);
        } else if (velocity) {
          Matter.Body.setVelocity(next.body, velocity);
          Matter.Body.setAngularVelocity(next.body, spin);
        }
        this.entries.set(spec.id, next);
        Matter.Composite.add(this.engine.world, next.body);
      } else if (e.spec.fixed !== spec.fixed) {
        e.spec = spec;
        if (spec.fixed && this.dragId === spec.id) this.dropConstraint();
        Matter.Body.setStatic(e.body, spec.fixed);
        this.tune(e);
        this.place(e, spec);
        Matter.Sleeping.set(e.body, false);
      } else if (spec.fixed || (e.body.isSleeping && !e.dragging)) {
        // 外部移动（主界面、另一层窗口）：静态或已休眠的刚体直接对齐
        const p = this.pose(e);
        if (Math.abs(p.x - spec.x) > 0.5 || Math.abs(p.y - spec.y) > 0.5 || Math.abs(p.angle - spec.angle) > 0.001) {
          this.place(e, spec);
          if (!spec.fixed) Matter.Sleeping.set(e.body, false);
        }
        e.spec = spec;
      } else {
        e.spec = { ...spec, x: e.spec.x, y: e.spec.y, angle: e.spec.angle };
      }
    }
  }

  private create(spec: BodySpec): Entry {
    const sx = spec.flipped ? -1 : 1;
    const opts: Matter.IChamferableBodyDefinition = {
      collisionFilter: { category: PET, mask: WALL | PET },
      sleepThreshold: 45,
      label: spec.id,
    };
    // 凸包顶点换算到像素；翻转时镜像并反转顺序保持绕向
    let pts = spec.hull.map((p) => ({ x: p.x * spec.width * sx, y: p.y * spec.height }));
    if (spec.flipped) pts = pts.reverse();
    const c = Matter.Vertices.centre(pts);
    // fromVertices 以质心为刚体位置，所以 body.position = c 即“质心相对图片中心的偏移”
    const body =
      Matter.Bodies.fromVertices(c.x, c.y, [pts], opts) ??
      Matter.Bodies.rectangle(0, 0, Math.max(1, spec.width), Math.max(1, spec.height), opts);
    const entry: Entry = { body, spec, offset: { x: body.position.x, y: body.position.y }, dragging: false };
    this.place(entry, spec);
    if (spec.fixed) Matter.Body.setStatic(body, true);
    this.tune(entry);
    return entry;
  }

  private place(e: Entry, p: BodyPose) {
    const off = Matter.Vector.rotate(e.offset, p.angle);
    Matter.Body.setAngle(e.body, p.angle);
    Matter.Body.setPosition(e.body, { x: p.x + off.x, y: p.y + off.y });
  }

  private pose(e: Entry): BodyPose {
    const off = Matter.Vector.rotate(e.offset, e.body.angle);
    return { x: e.body.position.x - off.x, y: e.body.position.y - off.y, angle: e.body.angle };
  }

  /** 外部（主界面 / 另一层）直接改了位置：刚体瞬移过去并停下 */
  teleport(id: string, p: BodyPose) {
    const e = this.entries.get(id);
    if (!e || e.dragging) return;
    this.place(e, p);
    e.spec = { ...e.spec, ...p };
    if (!e.body.isStatic) {
      Matter.Body.setVelocity(e.body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(e.body, 0);
      Matter.Sleeping.set(e.body, false);
    }
  }

  get(id: string): BodyPose | undefined {
    const e = this.entries.get(id);
    return e ? this.pose(e) : undefined;
  }

  /** 抓住贴纸；px/py 是指针位置（弹簧拖拽用来确定抓握点） */
  grab(id: string, px: number, py: number) {
    const e = this.entries.get(id);
    if (!e || e.spec.fixed) return;
    e.dragging = true;
    this.dragId = id;
    if (this.springDrag) {
      const pose = this.pose(e);
      this.dragPointer = { x: px, y: py };
      this.dragAnchor = Matter.Vector.rotate({ x: px - pose.x, y: py - pose.y }, -pose.angle);
      this.attach(e);
    } else {
      e.target = this.pose(e);
      this.makeKinematic(e);
    }
    Matter.Sleeping.set(e.body, false);
    this.wakeAll();
  }

  private makeKinematic(e: Entry) {
    Matter.Body.setMass(e.body, e.body.mass * DRAG_MASS);
    Matter.Body.setInertia(e.body, Infinity);
    Matter.Body.setAngularVelocity(e.body, 0);
  }

  /** 每个物理步前：给被直接拖拽的刚体一个刚好追到目标的速度 */
  private chase(stepMs: number) {
    for (const e of this.entries.values()) {
      if (!e.dragging || this.springDrag || !e.target) continue;
      const off = Matter.Vector.rotate(e.offset, e.target.angle);
      const tx = e.target.x + off.x;
      const ty = e.target.y + off.y;
      if (e.body.angle !== e.target.angle) Matter.Body.setAngle(e.body, e.target.angle);
      const k = BASE_DELTA / stepMs;
      Matter.Body.setVelocity(e.body, { x: (tx - e.body.position.x) * k, y: (ty - e.body.position.y) * k });
      Matter.Sleeping.set(e.body, false);
    }
  }

  private attach(e: Entry) {
    this.dropConstraint();
    const pointB = Matter.Vector.rotate(Matter.Vector.sub(this.dragAnchor, e.offset), e.body.angle);
    this.constraint = Matter.Constraint.create({
      pointA: { ...this.dragPointer },
      bodyB: e.body,
      pointB,
      length: 0,
      stiffness: this.dragStiffness(),
      damping: 0.24,
    });
    Matter.Composite.add(this.engine.world, this.constraint);
  }

  private dropConstraint() {
    if (this.constraint) Matter.Composite.remove(this.engine.world, this.constraint);
    this.constraint = null;
  }

  /** 直接拖拽：刚体移到贴纸位置；弹簧拖拽：更新指针位置 */
  drag(id: string, x: number, y: number, angle: number) {
    const e = this.entries.get(id);
    if (!e?.dragging) return;
    if (this.springDrag) {
      this.dragPointer = { x, y };
      return;
    }
    e.target = { x, y, angle };
    for (const other of this.entries.values()) if (other.body.isSleeping) Matter.Sleeping.set(other.body, false);
  }

  /** 弹簧目标点：限制在贴纸可见区域不出屏幕的范围内 */
  private updateDragTarget() {
    const c = this.constraint;
    const e = this.dragId ? this.entries.get(this.dragId) : undefined;
    if (!c || !e) return;
    const grip = Matter.Vector.rotate(this.dragAnchor, e.body.angle);
    const { min, max } = e.body.bounds;
    const pose = this.pose(e);
    // 以当前包围盒估计贴纸中心可达的范围
    const left = pose.x - min.x;
    const right = max.x - pose.x;
    const top = pose.y - min.y;
    const bottom = max.y - pose.y;
    const cx = clamp(this.dragPointer.x - grip.x, left, this.width - right);
    const cy = clamp(this.dragPointer.y - grip.y, top, this.height - bottom);
    c.pointA.x = cx + grip.x;
    c.pointA.y = cy + grip.y;
  }

  /** 松手。vx/vy：指针速度（px/s） */
  release(id: string, vx: number, vy: number, moved: boolean) {
    const e = this.entries.get(id);
    if (this.dragId === id) this.dragId = null;
    if (!e?.dragging) return;
    e.dragging = false;
    const t = this.tuning;
    if (this.springDrag) {
      this.dropConstraint();
      Matter.Sleeping.set(e.body, false);
      if (!moved) {
        Matter.Body.setVelocity(e.body, { x: 0, y: 0 });
        return;
      }
      // 与原版一致：指针速度（px/ms × 16.67 = 每基准步的位移），太空模式乘惯性
      const inertia = t.mode === "space" ? clamp(t.inertiaStrength, 0.2, 2) : 1;
      const x = vx / 60;
      const y = vy / 60;
      const speed = Math.hypot(x, y) * inertia;
      const k = speed > MAX_SPEED ? (inertia * MAX_SPEED) / speed : inertia;
      Matter.Body.setVelocity(e.body, { x: x * k, y: y * k });
      Matter.Body.setAngularVelocity(e.body, t.tumble ? clamp(x * k * 0.0015, -0.12, 0.12) : 0);
      return;
    }
    e.target = undefined;
    // 恢复质量与转动惯量（tune 会按密度重算质量，惯量按面积重算）
    Matter.Body.setInertia(e.body, 1);
    this.tune(e);
    if (t.tumble) Matter.Body.setInertia(e.body, momentOfInertia(e.body));
    const speed = Math.hypot(vx, vy);
    const k = speed > MAX_THROW ? MAX_THROW / speed : 1;
    Matter.Body.setVelocity(e.body, { x: (vx * k) / 60, y: (vy * k) / 60 });
    Matter.Body.setAngularVelocity(e.body, t.tumble ? clamp(((vx * k) / 60) * 0.0016, -0.15, 0.15) : 0);
    Matter.Sleeping.set(e.body, false);
  }

  /**
   * 推进模拟（按设定帧率定步长累积）。返回本次移动过的贴纸 id；
   * 全部休眠时返回 null，调用方据此停止逐帧循环。
   */
  step(dt: number): string[] | null {
    const stepMs = 1000 / (this.tuning.physicsFps || 60);
    this.acc = Math.min(this.acc + dt * 1000, stepMs * 4);
    let stepped = false;
    while (this.acc >= stepMs) {
      this.updateDragTarget();
      this.chase(stepMs);
      Matter.Engine.update(this.engine, stepMs);
      if (this.constraint?.bodyB?.isSleeping) Matter.Sleeping.set(this.constraint.bodyB, false);
      this.acc -= stepMs;
      stepped = true;
    }
    const moved: string[] = [];
    let active = false;
    for (const [id, e] of this.entries) {
      if (e.dragging && !this.springDrag) {
        active = true;
        continue;
      }
      if (e.body.isStatic || (e.body.isSleeping && !e.dragging)) continue;
      active = true;
      if (!this.tuning.tumble && e.body.angle !== 0) {
        Matter.Body.setAngle(e.body, 0);
        Matter.Body.setAngularVelocity(e.body, 0);
      }
      this.keepInside(e);
      if (stepped) moved.push(id);
    }
    return active ? moved : null;
  }

  /**
   * 只在高速刚体真的穿墙时把它拉回来。不能每步都夹在屏幕内：
   * 那会和碰撞求解互相拉扯，贴底的贴纸会抖、还会被挤进上面的贴纸里。
   */
  private keepInside(e: Entry) {
    const { min, max } = e.body.bounds;
    const slack = 24;
    let dx = 0;
    let dy = 0;
    if (max.x - min.x < this.width) {
      if (min.x < -slack) dx = -min.x;
      else if (max.x > this.width + slack) dx = this.width - max.x;
    }
    if (max.y - min.y < this.height) {
      if (min.y < -slack) dy = -min.y;
      else if (max.y > this.height + slack) dy = this.height - max.y;
    }
    if (!dx && !dy) return;
    Matter.Body.translate(e.body, { x: dx, y: dy });
    const v = Matter.Body.getVelocity(e.body);
    Matter.Body.setVelocity(e.body, { x: dx * v.x < 0 ? 0 : v.x, y: dy * v.y < 0 ? 0 : v.y });
  }

  /** 只有桌面模式撞墙时有挤压反馈；贴纸互撞、太空 / 重力模式都不加 Q 弹 */
  private wallHits(pairs: Matter.Pair[]) {
    if (!this.onWallHit || this.tuning.mode !== "desk") return;
    for (const pair of pairs) {
      const a = pair.bodyA.parent;
      const b = pair.bodyB.parent;
      const wallA = a.label === "wall";
      if (wallA === (b.label === "wall")) continue;
      const body = wallA ? b : a;
      const v = body.velocity;
      const n = pair.collision.normal;
      const speed = Math.abs(v.x * n.x + v.y * n.y) * 60;
      if (speed > 200 && this.entries.has(body.label)) this.onWallHit(body.label, speed, n.x, n.y);
    }
  }

  destroy() {
    this.dropConstraint();
    Matter.Events.off(this.engine, "collisionStart");
    Matter.Composite.clear(this.engine.world, false, true);
    Matter.Engine.clear(this.engine);
    this.entries.clear();
  }
}

/** 按顶点重算绕质心的转动惯量（与 Matter 内部 Body.setVertices 的算法一致：顶点平移到质心再算） */
function momentOfInertia(body: Matter.Body) {
  const local = body.vertices.map((v) => ({ x: v.x - body.position.x, y: v.y - body.position.y }));
  return 4 * Matter.Vertices.inertia(local as Matter.Vector[], body.mass);
}
