import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function invokeSafe<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T | null> {
  if (!inTauri) return null;
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`[tauri] ${command} failed`, error);
    return null;
  }
}

export const appWindow = {
  minimize: () => (inTauri ? getCurrentWindow().minimize() : Promise.resolve()),
  toggleMaximize: () => (inTauri ? getCurrentWindow().toggleMaximize() : Promise.resolve()),
  hide: () => (inTauri ? getCurrentWindow().hide() : Promise.resolve()),
  close: () => (inTauri ? getCurrentWindow().close() : Promise.resolve()),
  isMaximized: () => (inTauri ? getCurrentWindow().isMaximized() : Promise.resolve(false)),
};

export function onAppEvent<T>(event: string, handler: (payload: T) => void): () => void {
  if (!inTauri) return () => {};
  let unlisten: UnlistenFn | undefined;
  let disposed = false;
  void listen<T>(event, (message) => handler(message.payload)).then((fn) => {
    if (disposed) fn();
    else unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export async function showMainWindow() {
  await invokeSafe("show_main_window");
}

export async function quitApp() {
  await invokeSafe("quit_app");
}
