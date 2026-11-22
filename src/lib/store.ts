import { create } from "zustand";
import { characterOf } from "@/lib/characters";
import { STICKER_BY_ID, STICKERS, type Sticker, type StickerState } from "@/lib/stickers";
import { listCreatedStickers, type CreatedSticker } from "@/lib/created-stickers";
import type { StickerGestureId } from "@/lib/sticker-gestures";
import { createJSONStorage, persist } from "zustand/middleware";

export interface PetInstance {
  id: string;
  stickerId: string;
  /** A chosen pose for this instance. Omitted when switching automatically. */
  pose?: StickerState;
  /** The interaction played by a middle click. */
  gesture?: StickerGestureId;
  /** Normalized center position inside the full-screen overlay (0..1). */
  x: number;
  y: number;
  /** Per-pet scale on top of the global pet scale. */
  scale: number;
  z: number;
  /** Per-pet click-through: visible, but clicks fall to the desktop below. */
  passthrough?: boolean;
  flipped?: boolean;
  /** Visual rotation in radians (physics or settled gravity). */
  angle?: number;
  /** Floating (above apps) or desktop (wallpaper layer). Defaults to floating. */
  layer?: "floating" | "desktop";
}

export type StickerMode = "float" | "gravity" | "space";

export interface Settings {
  passthrough: boolean;
  overlayVisible: boolean;
  autoDim: boolean;
  dimOpacity: number;
  dimDelay: number;
  petScale: number;
  reduceMotion: boolean;
  stickerMode: StickerMode;
  /** Non-float modes: allow stickers to rotate / tumble. */
  tumble: boolean;
  physicsFps: 30 | 60 | 120;
  gravityStrength: number;
  inertiaStrength: number;
  physicsWeight: number;
  physicsBounce: number;
  petCollisions: boolean;
  /** Float mode: gentle idle breathing / sway. */
  idleMotion: boolean;
}

export interface AppState {
  settings: Settings;
  pets: PetInstance[];
  previewId: string;
  createdStickers: Sticker[];
  createdStickersLoaded: boolean;
  onboarded: boolean;
  /** Shared auto-dim state so both overlay layers fade together. */
  dimmed: boolean;
}

export interface AppActions {
  setSettings: (patch: Partial<Settings>) => void;
  toggleSetting: (
    key:
      | "passthrough"
      | "autoDim"
      | "overlayVisible"
      | "reduceMotion"
  ) => void;
  resetSettings: () => void;
  selectSticker: (id: string) => void;
  registerCreatedSticker: (sticker: CreatedSticker) => void;
  removeCreatedSticker: (id: string) => void;
  addPet: (stickerId: string) => string;
  removePet: (id: string) => void;
  updatePet: (id: string, patch: Partial<PetInstance>) => void;
  bringToFront: (id: string) => void;
  clearPets: () => void;
  setOnboarded: (value: boolean) => void;
  setDimmed: (value: boolean) => void;
  commitPetPositions: (
    positions: Record<string, { x: number; y: number; angle: number }>
  ) => void;
}

export type AppStore = AppState & AppActions;

export const DEFAULT_SETTINGS: Settings = {
  passthrough: false,
  overlayVisible: true,
  autoDim: true,
  dimOpacity: 0.46,
  dimDelay: 6,
  petScale: 1,
  reduceMotion: false,
  stickerMode: "float",
  tumble: true,
  physicsFps: 60,
  gravityStrength: 1,
  inertiaStrength: 1,
  physicsWeight: 1,
  physicsBounce: 1,
  petCollisions: true,
  idleMotion: true,
};

const DEFAULT_PETS: PetInstance[] = [
  { id: "pet-welcome", stickerId: "shiba", x: 0.84, y: 0.74, scale: 1, z: 1 },
];

const STORAGE_KEY = "deskpet-state-v1";
const SYNC_CHANNEL = "deskpet-state-sync";

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SYNC_CHANNEL) : null;

type PetPositions = Parameters<AppActions["commitPetPositions"]>[0];
type SyncMessage = Partial<AppState> & {
  positions?: PetPositions;
  removedCreated?: string[];
};

let applyingRemote = false;
let committingPositions = false;

function applyPositions(pets: PetInstance[], positions: PetPositions) {
  return pets.map((pet) => positions[pet.id] ? { ...pet, ...positions[pet.id] } : pet);
}

function createdVariant(sticker: CreatedSticker): Sticker {
  return {
    id: sticker.id,
    characterId: sticker.id,
    state: "default",
    name: sticker.name,
    en: "",
    packId: "created",
    subject: "object",
    style: "illustration-2d",
    mood: "cute",
    tags: ["我的创作", "自制", "创建"],
    kind: "static",
    created: { path: sticker.path },
    phrase: "我是你亲手做的贴纸。",
    accent: "#e8f3ff",
    glow: "#bddbfa",
  };
}

function mergeCreated(existing: Sticker[], incoming: Sticker[]) {
  const ids = new Set(incoming.map((sticker) => sticker.id));
  return [...incoming, ...existing.filter((sticker) => !ids.has(sticker.id))];
}

export function findSticker(id: string, created: Sticker[]) {
  return STICKER_BY_ID.get(id) ?? created.find((sticker) => sticker.id === id);
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      pets: DEFAULT_PETS,
      previewId: "penguin",
      createdStickers: [],
      createdStickersLoaded: false,
      onboarded: false,
      dimmed: false,

      setSettings: (patch) =>
        set((state) => {
          const settings = { ...state.settings, ...patch };
          const enteringFloat =
            settings.stickerMode === "float" && state.settings.stickerMode !== "float";
          return {
            settings,
            pets: enteringFloat
              ? state.pets.map((pet) => ({ ...pet, flipped: false, angle: 0 }))
              : state.pets,
          };
        }),

      toggleSetting: (key) =>
        set((state) => ({
          settings: { ...state.settings, [key]: !state.settings[key] },
        })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      selectSticker: (id) => set({ previewId: id }),
      registerCreatedSticker: (sticker) =>
        set((state) => ({ createdStickers: mergeCreated(state.createdStickers, [createdVariant(sticker)]) })),
      removeCreatedSticker: (id) =>
        set((state) => {
          const created = state.createdStickers.filter((sticker) => sticker.id !== id);
          if (created.length === state.createdStickers.length) return state;
          return {
            createdStickers: created,
            pets: state.pets.filter((pet) => pet.stickerId !== id),
            previewId: state.previewId === id ? STICKERS[0].id : state.previewId,
          };
        }),

      addPet: (stickerId) => {
        const variant = STICKER_BY_ID.get(stickerId);
        const baseId = variant ? characterOf(variant)?.defaultVariant.id ?? stickerId : stickerId;
        const id = `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const { pets } = get();
        const maxZ = pets.reduce((top, pet) => Math.max(top, pet.z), 0);
        const slot = pets.length;
        const x = 0.16 + ((slot * 0.17 + 0.05) % 0.68);
        const y = 0.52 + ((slot * 0.11) % 0.28);
        set((state) => ({
          pets: [
            ...state.pets,
            {
              id,
              stickerId: baseId,
              x: Math.min(0.9, Math.max(0.1, x)),
              y: Math.min(0.86, Math.max(0.42, y)),
              scale: 1,
              z: maxZ + 1,
              flipped: Math.random() > 0.72,
              layer: "floating",
            },
          ],
          settings: { ...state.settings, overlayVisible: true },
        }));
        return id;
      },

      removePet: (id) =>
        set((state) => ({ pets: state.pets.filter((pet) => pet.id !== id) })),

      updatePet: (id, patch) =>
        set((state) => ({
          pets: state.pets.map((pet) => (pet.id === id ? { ...pet, ...patch } : pet)),
        })),

      bringToFront: (id) => {
        const { pets } = get();
        const pet = pets.find((pet) => pet.id === id);
        if (!pet || !pets.some((other) => other.id !== id && other.z >= pet.z)) return;
        const maxZ = pets.reduce((top, pet) => Math.max(top, pet.z), 0);
        set({ pets: pets.map((pet) => pet.id === id ? { ...pet, z: maxZ + 1 } : pet) });
      },

      clearPets: () => set({ pets: [] }),

      setOnboarded: (value) => set({ onboarded: value }),

      setDimmed: (value) => set({ dimmed: value }),

      commitPetPositions: (positions) => {
        committingPositions = true;
        try {
          set((state) => ({ pets: applyPositions(state.pets, positions) }));
        } finally {
          committingPositions = false;
        }
        channel?.postMessage({ positions } satisfies SyncMessage);
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        pets: state.pets,
        previewId: state.previewId,
        onboarded: state.onboarded,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppState> | undefined;
        const settings: Settings & { locked?: boolean } = { ...DEFAULT_SETTINGS, ...saved?.settings };
        delete settings.locked;
        return {
          ...current,
          ...saved,
          settings,
          pets: saved?.pets ?? DEFAULT_PETS,
          previewId: saved?.previewId ?? current.previewId,
        };
      },
    }
  )
);

if (channel) {
  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    if (!event.data) return;
    const { positions, createdStickers, removedCreated, ...patch } = event.data;
    applyingRemote = true;
    try {
      useAppStore.setState((state) => {
        // A physics update can arrive after a different window removed a sticker.
        if (positions) return { pets: applyPositions(state.pets, positions) };
        let next: SyncMessage = patch;
        if (createdStickers) {
          next = { ...next, createdStickers: mergeCreated(state.createdStickers, createdStickers) };
        }
        if (removedCreated?.length) {
          const removed = new Set(removedCreated);
          const previewId = next.previewId ?? state.previewId;
          next = {
            ...next,
            createdStickers: (next.createdStickers ?? state.createdStickers).filter(
              ({ id }) => !removed.has(id)
            ),
            pets: (next.pets ?? state.pets).filter((pet) => !removed.has(pet.stickerId)),
            previewId: removed.has(previewId) ? STICKERS[0].id : previewId,
          };
        }
        return next;
      });
    } finally {
      applyingRemote = false;
    }
  };

  useAppStore.subscribe((state, previous) => {
    if (applyingRemote || committingPositions) return;
    const patch: SyncMessage = {};
    if (state.settings !== previous.settings) patch.settings = state.settings;
    if (state.pets !== previous.pets) patch.pets = state.pets;
    if (state.previewId !== previous.previewId) patch.previewId = state.previewId;
    if (state.createdStickers !== previous.createdStickers) {
      const ids = new Set(state.createdStickers.map(({ id }) => id));
      const previousIds = new Set(previous.createdStickers.map(({ id }) => id));
      const added = state.createdStickers.filter(({ id }) => !previousIds.has(id));
      if (added.length) patch.createdStickers = added;
      const removed = previous.createdStickers.filter(({ id }) => !ids.has(id)).map(({ id }) => id);
      if (removed.length) patch.removedCreated = removed;
    }
    if (state.onboarded !== previous.onboarded) patch.onboarded = state.onboarded;
    if (state.dimmed !== previous.dimmed) patch.dimmed = state.dimmed;
    if (Object.keys(patch).length > 0) channel.postMessage(patch);
  });
}

void listCreatedStickers().then((stickers) => {
  useAppStore.setState((state) => ({
    createdStickers: mergeCreated(stickers.map(createdVariant), state.createdStickers),
    createdStickersLoaded: true,
  }));
}, (error: unknown) => {
  console.warn("[deskpet] could not read created stickers", error);
  useAppStore.setState({ createdStickersLoaded: true });
});

export const useSettings = () => useAppStore((state) => state.settings);
export const usePets = () => useAppStore((state) => state.pets);
