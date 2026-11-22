/**
 * 贴纸图层：把共享状态里属于本层（置顶 / 桌面）的贴纸实例同步成 DOM 贴纸，
 * 负责命中测试路由、右键菜单、锁定贴纸的“解锁”按钮、自动变淡、物理世界和持久化。
 *
 * 状态流向：
 *   主界面 / 另一层窗口改动 → store → reconcile() → Sticker.apply(只应用变化的字段)
 *   贴纸停稳（放下、滑行结束、刚体休眠、缩放） → commit → store → 其他窗口
 * 运动中的帧不写存储。
 */
import { emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { CHARACTERS } from "@/lib/characters";
import { getPetSize } from "@/lib/pet-size";
import { STICKER_GESTURES } from "@/lib/sticker-gestures";
import { GENERIC_PHRASES, STATE_LABEL } from "@/lib/stickers";
import { findSticker, useAppStore, type AppStore, type PetInstance, type Settings } from "@/lib/store";
import type { ParticleSystem } from "../core/particles";
import type { Interactive, PointerInfo, Runtime } from "../core/runtime";
import { ContextMenu, icon, type MenuEntry } from "./menu";
import { type BodySpec, type PhysicsTuning, StickerWorld } from "./physics";
import type { PoseVariant } from "./poses";
import { buildSpec, diffSpec } from "./specs";
import { Sticker, type StickerEnv, type StickerHost } from "./sticker";

export type LayerKind = "floating" | "desktop";

const UNLOCK_HOVER_MS = 1200;

export class StickerLayer implements Interactive, StickerHost {
  readonly root: HTMLDivElement;
  readonly rightDrag = true;
  private items = new Map<string, Sticker>();
  private pets = new Map<string, PetInstance>();
  private target: Sticker | null = null;
  private hovered: Sticker | null = null;
  private menu: ContextMenu;
  private unlock: UnlockButton;
  private world: StickerWorld | null = null;
  private worldTick: (() => void) | null = null;
  private moved = new Set<string>();
  private settings: Settings;
  private dimTimer = 0;
  private lastActivity = 0;
  env: StickerEnv;

  constructor(
    readonly rt: Runtime,
    readonly particles: ParticleSystem,
    readonly kind: LayerKind,
    zIndex: number,
  ) {
    this.root = document.createElement("div");
    this.root.className = "layer layer-stickers";
    this.root.style.zIndex = String(zIndex);
    document.getElementById("stage")!.appendChild(this.root);
    rt.hit.register(zIndex, this);
    this.menu = new ContextMenu(rt, document.getElementById("stage")!);
    this.unlock = new UnlockButton(rt, this);
    this.settings = useAppStore.getState().settings;
    this.env = this.makeEnv();

    useAppStore.subscribe((state, prev) => this.onStore(state, prev));
    rt.onResize(() => {
      this.world?.resize(rt.width, rt.height);
      for (const s of this.items.values()) s.relayout();
      this.syncWorld();
    });
    this.applySettings(this.settings, null);
    this.reconcile(useAppStore.getState());
    this.onboarding();
  }

  private makeEnv(): StickerEnv {
    const st = this.settings;
    return {
      widthFor: (scale) => getPetSize(st.petScale, scale, this.rt.width, this.rt.height),
      reduceMotion: st.reduceMotion,
      idleMotion: st.idleMotion && (st.stickerMode === "float" || st.stickerMode === "desk"),
      mode: st.stickerMode,
      simulated: this.physicsWanted(st),
      springDrag: st.stickerMode === "space" || st.stickerMode === "gravity",
      interactive: st.overlayVisible && !st.passthrough,
    };
  }

  /** 悬浮不模拟；桌面模式只有打开碰撞才交给刚体；太空 / 重力总是刚体 */
  private physicsWanted(st: Settings) {
    if (st.stickerMode === "float") return false;
    return st.stickerMode !== "desk" || st.collisions.desk;
  }

  private tuning(st: Settings): PhysicsTuning {
    const mode = st.stickerMode === "float" ? "desk" : st.stickerMode;
    return { ...st, mode, collisions: st.collisions[mode] };
  }

  // ---------------- 共享状态 ----------------
  private onStore(state: AppStore, prev: AppStore) {
    if (state.settings !== prev.settings) this.applySettings(state.settings, prev.settings);
    if (state.pets !== prev.pets || state.createdStickers !== prev.createdStickers || state.stickerParticles !== prev.stickerParticles)
      this.reconcile(state, state.stickerParticles !== prev.stickerParticles);
    if (state.dimmed !== prev.dimmed) this.applyDim(state);
  }

  private applySettings(st: Settings, prev: Settings | null) {
    this.settings = st;
    this.env = this.makeEnv();
    const physics = this.physicsWanted(st);
    if (physics && !this.world) {
      this.world = new StickerWorld(this.rt.width, this.rt.height, this.tuning(st));
      this.world.onWallHit = (id, speed, nx, ny) => this.items.get(id)?.impact(Math.abs(nx) > Math.abs(ny) ? "x" : "y", speed);
      this.syncWorld();
    } else if (!physics && this.world) {
      this.commitMoved();
      this.stopWorld();
    } else if (this.world) {
      this.world.setTuning(this.tuning(st));
      this.runWorld();
    }
    const scaleChanged = prev && (prev.petScale !== st.petScale || prev.reduceMotion !== st.reduceMotion);
    for (const s of this.items.values()) {
      if (scaleChanged) s.relayout();
      else s.render();
    }
    this.root.style.visibility = st.overlayVisible ? "" : "hidden";
    for (const s of this.items.values()) s.setVisible(st.overlayVisible);
    if (!this.env.interactive) {
      this.menu.close();
      this.unlock.hide();
    }
    this.applyDim(useAppStore.getState());
    this.rt.hit.reevaluate();
  }

  private reconcile(state: AppStore, force = false) {
    const mine = state.pets.filter((p) => (p.layer ?? "floating") === this.kind);
    const ids = new Set<string>();
    for (const pet of mine) {
      const sticker = findSticker(pet.stickerId, state.createdStickers);
      if (!sticker) continue;
      ids.add(pet.id);
      const spec = buildSpec(pet, sticker, state.stickerParticles[sticker.characterId]);
      const existing = this.items.get(pet.id);
      if (!existing) {
        const s = new Sticker(spec, this);
        this.items.set(pet.id, s);
        this.root.appendChild(s.el);
        s.setVisible(this.settings.overlayVisible);
      } else if (force || this.pets.get(pet.id) !== pet) {
        const changed = diffSpec(existing.spec, spec);
        if (changed.size) existing.apply(spec, changed);
      }
      this.pets.set(pet.id, pet);
    }
    for (const [id, s] of this.items) {
      if (ids.has(id)) continue;
      this.items.delete(id);
      this.pets.delete(id);
      if (this.target === s) this.target = null;
      if (this.hovered === s) this.hovered = null;
      // 删除动画：缩小淡出
      s.el.classList.add("removing");
      setTimeout(() => s.dispose(), 220);
    }
    this.syncWorld();
    this.rt.hit.reevaluate();
  }

  commit(s: Sticker, patch: { x?: number; y?: number; scale?: number; angle?: number }) {
    if (!this.items.has(s.id)) return;
    useAppStore.getState().updatePet(s.id, patch);
  }

  private commitMoved() {
    if (!this.moved.size) return;
    const positions: Record<string, { x: number; y: number; angle: number }> = {};
    for (const id of this.moved) {
      const s = this.items.get(id);
      if (s && !s.dragging) positions[id] = s.position();
    }
    this.moved.clear();
    if (Object.keys(positions).length) useAppStore.getState().commitPetPositions(positions);
  }

  raise(s: Sticker) {
    useAppStore.getState().bringToFront(s.id);
  }

  phraseFor(s: Sticker, pose: PoseVariant | undefined) {
    if (pose?.phrase) return pose.phrase;
    return Math.random() < 0.72 ? s.spec.phrase : GENERIC_PHRASES[Math.floor(Math.random() * GENERIC_PHRASES.length)];
  }

  // ---------------- 物理世界 ----------------
  private bodySpec(s: Sticker): BodySpec {
    return {
      id: s.id,
      x: s.x,
      y: s.y,
      angle: s.rotation,
      width: s.width,
      height: s.height,
      hull: s.hull,
      flipped: s.spec.flipped,
      fixed: s.locked,
    };
  }

  private syncWorld() {
    if (!this.world) return;
    this.world.sync([...this.items.values()].map((s) => this.bodySpec(s)));
    this.runWorld();
  }

  private runWorld() {
    if (!this.world || this.worldTick) return;
    this.worldTick = this.rt.ticker.add((dt) => {
      const world = this.world;
      if (!world) return false;
      const moved = world.step(dt);
      if (moved === null) {
        this.worldTick = null;
        this.commitMoved();
        return false;
      }
      for (const id of moved) {
        const pose = world.get(id);
        const s = this.items.get(id);
        if (!pose || !s) continue;
        s.setBodyPose(pose.x, pose.y, pose.angle);
        this.moved.add(id);
      }
      return true;
    });
  }

  private stopWorld() {
    this.worldTick?.();
    this.worldTick = null;
    this.world?.destroy();
    this.world = null;
  }

  teleported(s: Sticker) {
    this.world?.teleport(s.id, { x: s.x, y: s.y, angle: s.rotation });
    this.runWorld();
  }

  geometryChanged(_s: Sticker) {
    this.syncWorld();
  }

  grab(s: Sticker, px: number, py: number) {
    this.world?.grab(s.id, px, py);
    this.runWorld();
  }

  drag(s: Sticker, x: number, y: number) {
    this.world?.drag(s.id, x, y, s.rotation);
  }

  release(s: Sticker, vx: number, vy: number, moved: boolean) {
    if (!this.world) return;
    this.world.release(s.id, vx, vy, moved);
    this.moved.add(s.id);
    this.runWorld();
  }

  // ---------------- 自动变淡 ----------------
  /** 任何互动：恢复不透明并重新计时（桌面层把活动转发给置顶层，由置顶层统一计时） */
  activity() {
    const now = performance.now();
    if (now - this.lastActivity < 250) return;
    this.lastActivity = now;
    const state = useAppStore.getState();
    if (state.dimmed) state.setDimmed(false);
    if (this.kind === "floating") this.restartDimTimer();
    else void emitTo("pet", "sb://activity").catch(() => {});
  }

  restartDimTimer() {
    clearTimeout(this.dimTimer);
    const st = this.settings;
    if (this.kind !== "floating" || !st.autoDim || !st.overlayVisible) return;
    this.dimTimer = window.setTimeout(() => useAppStore.getState().setDimmed(true), Math.max(1200, st.dimDelay * 1000));
  }

  private applyDim(state: AppStore) {
    const st = state.settings;
    const dim = st.autoDim && state.dimmed;
    this.root.style.opacity = dim ? String(st.dimOpacity) : "";
    if (!state.dimmed) this.restartDimTimer();
  }

  // ---------------- 远程指令（主界面预览） ----------------
  gesture(petId: string, gestureId?: string) {
    const s = this.items.get(petId);
    if (!s) return;
    const def = STICKER_GESTURES.find((g) => g.id === gestureId) ?? s.spec.gesture;
    s.playGesture(def);
  }

  react(petId: string) {
    const s = this.items.get(petId);
    if (!s) return;
    s.click(s.x, s.y - s.height * 0.2, false);
  }

  private onboarding() {
    if (this.kind !== "floating" || useAppStore.getState().onboarded) return;
    window.setTimeout(() => {
      const first = [...this.items.values()].find((s) => !s.locked);
      if (!first || useAppStore.getState().onboarded) return;
      first.say("拖动我 · 中键互动 · 右键看更多", 7000);
      window.setTimeout(() => useAppStore.getState().setOnboarded(true), 7600);
    }, 1200);
  }

  // ---------------- 右键菜单 ----------------
  openMenu(s: Sticker, x: number, y: number) {
    const store = useAppStore.getState();
    const pet = store.pets.find((p) => p.id === s.id);
    if (!pet) return;
    const update = (patch: Partial<PetInstance>) => useAppStore.getState().updatePet(s.id, patch);
    const here = () => s.position();
    const poses = s.pose;
    const entries: MenuEntry[] = [
      {
        label: "置顶",
        icon: "pin",
        checked: (pet.layer ?? "floating") === "floating",
        hint: (pet.layer ?? "floating") === "floating" ? "" : "在桌面层",
        onSelect: () => update({ ...here(), layer: (pet.layer ?? "floating") === "floating" ? "desktop" : "floating" }),
      },
      { label: "左右翻转", icon: "flip", checked: Boolean(pet.flipped), onSelect: () => update({ flipped: !pet.flipped }) },
      { label: "锁定这张", icon: "lock", checked: false, hint: "点击穿透", onSelect: () => update({ ...here(), passthrough: true }) },
      {
        label: "自动变淡",
        icon: "blend",
        checked: store.settings.autoDim,
        onSelect: () => useAppStore.getState().setSettings({ autoDim: !store.settings.autoDim }),
      },
      "separator",
      {
        label: "互动",
        icon: "hand",
        hint: "中键",
        submenu: [
          { caption: "选中后设为中键动作" },
          ...STICKER_GESTURES.map((g) => ({
            label: g.label,
            image: g.image,
            radio: s.spec.gesture.id === g.id,
            onSelect: () => {
              update({ gesture: g.id });
              s.playGesture(g);
            },
          })),
        ],
      },
      ...(poses.multiple
        ? [
            {
              label: "切换状态",
              icon: "pose",
              submenu: [
                { label: "自动切换", radio: !pet.pose, onSelect: () => update({ pose: undefined }) },
                "separator" as const,
                ...poses.list.map((v) => ({
                  label: STATE_LABEL[v.state],
                  radio: pet.pose === v.state,
                  onSelect: () => update({ pose: v.state }),
                })),
              ],
            },
          ]
        : []),
      {
        label: "换一只陪我",
        icon: "shuffle",
        onSelect: () => {
          const pool = CHARACTERS.filter((c) => c.id !== s.spec.characterId);
          const next = pool[Math.floor(Math.random() * pool.length)]?.defaultVariant;
          if (!next) return;
          update({ stickerId: next.id, pose: undefined, chroma: undefined });
          useAppStore.getState().selectSticker(next.id);
          window.setTimeout(() => this.items.get(s.id)?.say(`${next.name} 来换班啦～`, 2800), 120);
        },
      },
      {
        label: "恢复默认大小",
        icon: "reset",
        hint: `${Math.round(pet.scale * 100)}%`,
        disabled: Math.abs(pet.scale - 1) < 0.01,
        onSelect: () => update({ scale: 1 }),
      },
      ...(Math.abs(pet.angle ?? 0) > 0.01 ? [{ label: "摆正", icon: "reset", onSelect: () => update({ angle: 0 }) }] : []),
      { label: "打开主界面", icon: "window", onSelect: () => void invoke("show_main_window").catch(() => {}) },
      "separator",
      { label: "抱回小窝", icon: "trash", danger: true, onSelect: () => useAppStore.getState().removePet(s.id) },
    ];
    this.unlock.hide();
    this.menu.open(x, y, { image: s.spec.video ? s.spec.thumb : poses.shown.src, title: s.spec.name, subtitle: s.spec.subtitle }, entries);
  }

  // ---------------- Interactive ----------------
  private sorted() {
    return [...this.items.values()].sort((a, b) => b.spec.z - a.spec.z);
  }

  hitTest(x: number, y: number) {
    if (!this.env.interactive) {
      this.target = null;
      return false;
    }
    const top = this.sorted().find((s) => s.hitTest(x, y)) ?? null;
    // 锁定的贴纸点击穿透：命中它时视为没命中（但仍挡住它下面的贴纸）
    this.target = top && !top.locked ? top : null;
    return !!this.target;
  }

  /** 光标下最上层的锁定贴纸（用于显示解锁按钮） */
  lockedAt(x: number, y: number): Sticker | null {
    if (!this.env.interactive) return null;
    const top = this.sorted().find((s) => s.hitTest(x, y));
    return top?.locked ? top : null;
  }

  pointerDown(p: PointerInfo) {
    this.menu.close();
    this.target?.pointerDown(p);
  }
  pointerMove(p: PointerInfo) {
    this.target?.pointerMove(p);
  }
  pointerUp(p: PointerInfo) {
    this.target?.pointerUp(p);
  }
  auxDown(_p: PointerInfo) {
    this.menu.close();
    this.target?.auxDown();
  }
  hover(x: number, y: number) {
    if (this.hovered !== this.target) {
      this.hovered?.leave();
      this.hovered = this.target;
    }
    this.target?.hover(x, y);
  }
  leave() {
    this.hovered?.leave();
    this.hovered = null;
  }
  wheel(p: PointerInfo, dy: number) {
    this.target?.wheel(p, dy);
  }

  unlockSticker(s: Sticker) {
    useAppStore.getState().updatePet(s.id, { passthrough: false });
    s.say("解锁啦，可以拖动了", 1800);
  }
}

/**
 * 锁定贴纸点击穿透，所以没法右键它。鼠标在锁定贴纸上停留 1.2 秒，
 * 在它上方 / 下方出现“解锁”按钮（按钮本身可点击）。
 */
class UnlockButton implements Interactive {
  private el: HTMLButtonElement;
  private sticker: Sticker | null = null;
  private candidate: { s: Sticker; since: number } | null = null;
  private missTimer = 0;

  constructor(
    private rt: Runtime,
    private layer: StickerLayer,
  ) {
    this.el = document.createElement("button");
    this.el.type = "button";
    this.el.className = "sb-unlock";
    this.el.innerHTML = `${icon("unlock", 13)}<span>解锁</span>`;
    this.el.hidden = true;
    this.el.onclick = () => {
      const s = this.sticker;
      this.hide();
      if (s) layer.unlockSticker(s);
    };
    document.getElementById("stage")!.appendChild(this.el);
    rt.hit.register(1001, this);
    rt.onCursor((c) => this.track(c.x, c.y, c.inside));
  }

  private track(x: number, y: number, inside: boolean) {
    if (!inside) return this.miss();
    if (this.sticker && this.hitTest(x, y)) {
      clearTimeout(this.missTimer);
      this.missTimer = 0;
      return;
    }
    const s = this.layer.lockedAt(x, y);
    if (!s) return this.miss();
    clearTimeout(this.missTimer);
    this.missTimer = 0;
    if (this.sticker === s) return;
    const now = performance.now();
    if (this.candidate?.s !== s) {
      this.candidate = { s, since: now };
      return;
    }
    if (now - this.candidate.since >= UNLOCK_HOVER_MS) this.show(s);
  }

  private miss() {
    this.candidate = null;
    if (this.sticker && !this.missTimer) this.missTimer = window.setTimeout(() => this.hide(), 800);
  }

  private show(s: Sticker) {
    this.sticker = s;
    this.el.hidden = false;
    const r = this.el.getBoundingClientRect();
    const bottom = s.y + s.bounds.bottom * s.height;
    const top = s.y + s.bounds.top * s.height;
    const below = bottom + 16 + r.height < this.rt.height;
    this.el.style.left = `${Math.max(8, Math.min(this.rt.width - r.width - 8, s.x - r.width / 2))}px`;
    this.el.style.top = `${below ? bottom + 12 : top - 12 - r.height}px`;
    this.rt.hit.reevaluate();
  }

  hide() {
    clearTimeout(this.missTimer);
    this.missTimer = 0;
    this.candidate = null;
    if (!this.sticker) return;
    this.sticker = null;
    this.el.hidden = true;
    this.rt.hit.reevaluate();
  }

  hitTest(x: number, y: number) {
    if (!this.sticker) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6;
  }
}
