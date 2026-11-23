/**
 * 全局快捷键文案（与 src-tauri/src/lib.rs 注册的组合键保持一致）：
 * Windows 为 Ctrl+Alt+键，macOS 为 ⌘⌥键。
 */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);

/** 组合键的修饰键，用于逐个渲染按键帽 */
export const SHORTCUT_MODIFIERS: string[] = IS_MAC ? ["⌘", "⌥"] : ["Ctrl", "Alt"];

/** 行内文案，例如 shortcut("Q") → "Ctrl+Alt+Q" / "⌘⌥Q" */
export function shortcut(key: string) {
  return IS_MAC ? `⌘⌥${key}` : `Ctrl+Alt+${key}`;
}
