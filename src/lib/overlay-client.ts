/**
 * 主界面调用悬浮层能力的唯一入口：玩法指令、运行状态、窗口扰动、显示器。
 * 贴纸摆放相关的持久状态走共享 store（lib/store.ts），不经过这里。
 */
import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  EV,
  type OverlayCommand,
  type OverlayStateSnapshot,
  type WindowFxKind,
  type WindowFxTarget,
} from "@/shared/protocol";
import { inTauri, invokeSafe, onAppEvent } from "@/lib/tauri";

/** 发送玩法指令。贴纸指令广播给两层（贴纸可能在任一层），其余只发给置顶层 */
export function sendToOverlay(cmd: OverlayCommand) {
  if (!inTauri) return Promise.resolve();
  const promise = cmd.type.startsWith("sticker.") ? emit(EV.command, cmd) : emitTo("pet", EV.command, cmd);
  return promise.catch((error: unknown) => console.warn("[overlay] send failed", error));
}

/** 一键清场：停止全部特效 / 恶作剧 / 扰动，还原被移动的窗口和桌面图标 */
export function clearAll() {
  return invokeSafe("clear_all");
}

/** 真实窗口扰动，返回受影响的窗口数 */
export function windowFx(kind: WindowFxKind, target: WindowFxTarget = "foreground", durationMs = 900, intensity = 0.6) {
  return invokeSafe<number>("window_fx", { req: { kind, target, durationMs, intensity } });
}

export interface MonitorDesc {
  index: number;
  name: string;
  rect: { x: number; y: number; width: number; height: number };
  scale: number;
  primary: boolean;
}

export function listMonitors() {
  return invokeSafe<MonitorDesc[]>("list_monitors");
}

export function setOverlayMonitor(index: number) {
  return invokeSafe("overlay_set_monitor", { index });
}

const EMPTY: OverlayStateSnapshot = { pranks: [], effects: [], distorting: null };

/** 置顶层当前运行中的玩法（主界面各页共享） */
export const useOverlayRuntime = create<OverlayStateSnapshot & { hidden: boolean }>(() => ({ ...EMPTY, hidden: false }));

let subscribed = false;
export function subscribeOverlayRuntime() {
  if (subscribed || !inTauri) return;
  subscribed = true;
  onAppEvent<OverlayStateSnapshot>(EV.state, (snapshot) => useOverlayRuntime.setState(snapshot));
  onAppEvent<boolean>(EV.hidden, (hidden) => useOverlayRuntime.setState({ hidden }));
  void sendToOverlay({ type: "state.request" });
}

export function runningCount(state: OverlayStateSnapshot) {
  return state.pranks.length + state.effects.length + (state.distorting ? 1 : 0);
}

export { invoke };
