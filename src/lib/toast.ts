import { create } from "zustand";

export type ToastTone = "default" | "success" | "warn";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  items: ToastItem[];
  push: (message: string, tone?: ToastTone) => void;
  remove: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (message, tone = "default") => {
    const id = ++counter;
    set((state) => ({ items: [...state.items.slice(-2), { id, message, tone }] }));
    window.setTimeout(() => {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
    }, 2400);
  },
  remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
}));

export function toast(message: string, tone: ToastTone = "default") {
  useToastStore.getState().push(message, tone);
}
