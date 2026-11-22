/**
 * 播放 / 停止一个玩法：把业务目录项翻译成悬浮层指令或原生调用。
 */
import { clearAll, sendToOverlay, windowFx } from "@/lib/overlay-client";
import { invokeSafe } from "@/lib/tauri";
import type { WindowFxTarget } from "@/shared/protocol";
import type { Playable, PlayDomain } from "./playables";

export interface PlayParams {
  /** 0..1 */
  intensity: number;
  /** 窗口扰动对象 */
  target: WindowFxTarget;
}

/** 返回窗口扰动影响的窗口数；其他玩法返回 null */
export async function play(p: Playable, { intensity, target }: PlayParams): Promise<number | null> {
  const options = { intensity };
  switch (p.engine) {
    case "effect":
      await sendToOverlay({ type: "effect.play", kind: p.kind, options });
      return null;
    case "prank":
      await sendToOverlay({ type: "prank.start", kind: p.kind, options });
      return null;
    case "distort":
      await sendToOverlay({ type: "distort.play", kind: p.kind, options });
      return null;
    case "combo":
      await sendToOverlay({ type: "combo.play", kind: p.kind, options });
      return null;
    case "window":
      return (await windowFx(p.kind, target, 600 + intensity * 900, intensity)) ?? 0;
  }
}

export async function stop(p: Playable) {
  if (p.engine === "effect") await sendToOverlay({ type: "effect.stop", kind: p.kind });
  else if (p.engine === "prank") await sendToOverlay({ type: "prank.stop", kind: p.kind });
}

/** 停止某个领域里的全部玩法：扰动页还原窗口，其余一键清场 */
export async function stopDomain(domain: PlayDomain) {
  if (domain === "disturb") {
    await invokeSafe("window_fx_cancel");
    return;
  }
  await clearAll();
}
