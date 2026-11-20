import { useEffect, useRef, useState } from "react";
import { characterOf } from "@/lib/characters";
import { stickerSrc, type Sticker, type StickerState } from "@/lib/stickers";

const IDLE_SCHEDULE = [
  { state: "idle", delay: 15_000 },
  { state: "nap", delay: 45_000 },
  { state: "sleep", delay: 90_000 },
] as const;

const QUICK_POSES: StickerState[] = ["drag", "wink", "surprise", "love"];
const preloaded = new Set<string>();

export function useStickerPose(sticker: Sticker, pinned: StickerState | undefined, visible: boolean) {
  const character = characterOf(sticker);
  const variants = character?.variants;
  const base = character?.defaultVariant ?? sticker;
  const multiple = Boolean(variants && variants.length > 1);
  const pinnedPose = variants?.find((variant) => variant.state === pinned);
  const [motion, setMotion] = useState(false);
  const [idle, setIdle] = useState<StickerState>();
  const [reaction, setReaction] = useState<StickerState>();
  const [activity, setActivity] = useState(0);
  const lastClick = useRef(0);
  const reactionTimer = useRef<number | undefined>(undefined);
  const find = (state: StickerState | undefined) => variants?.find((pose) => pose.state === state);

  useEffect(() => {
    setIdle(undefined);
    if (!multiple || !visible || pinnedPose || motion) return;
    const timers = IDLE_SCHEDULE
      .filter(({ state }) => variants?.some((variant) => variant.state === state))
      .map(({ state, delay }) => window.setTimeout(() => setIdle(state), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activity, motion, multiple, pinnedPose, variants, visible]);

  useEffect(() => {
    lastClick.current = 0;
    setReaction(undefined);
    return () => window.clearTimeout(reactionTimer.current);
  }, [variants, pinnedPose]);

  useEffect(() => {
    if (!multiple || !visible || preloaded.has(base.id)) return;
    const preload = () => {
      preloaded.add(base.id);
      for (const variant of variants ?? []) {
        if (!QUICK_POSES.includes(variant.state)) continue;
        const image = new Image();
        image.src = stickerSrc(variant.id);
        void image.decode().catch(() => {});
      }
    };
    const job = window.requestIdleCallback(preload, { timeout: 1_500 });
    return () => window.cancelIdleCallback(job);
  }, [base.id, multiple, variants, visible]);

  const resetIdle = () => {
    setIdle(undefined);
    setActivity((value) => value + 1);
  };

  const enterDrag = () => {
    if (!multiple) return;
    window.clearTimeout(reactionTimer.current);
    setReaction(undefined);
    setMotion(true);
    resetIdle();
  };

  const endDrag = () => {
    if (!multiple) return;
    setMotion(false);
    resetIdle();
  };

  const react = () => {
    if (!multiple) return;
    const now = Date.now();
    const sleepy = IDLE_SCHEDULE.some(({ state }) => state === (pinnedPose?.state ?? idle));
    const choice = sleepy && find("surprise")
      ? "surprise"
      : now - lastClick.current < 550 && find("love")
        ? "love"
        : find("wink") ? "wink" : "happy";
    const pose = find(choice);
    lastClick.current = now;
    resetIdle();
    window.clearTimeout(reactionTimer.current);
    setReaction(pose?.state);
    if (pose) reactionTimer.current = window.setTimeout(() => setReaction(undefined), 1_600);
    return pose;
  };

  const shown = (motion ? find("drag") : undefined) ?? find(reaction) ?? pinnedPose ?? find(idle) ?? base;
  return { shown, variants: multiple ? variants : undefined, enterDrag, endDrag, react };
}
