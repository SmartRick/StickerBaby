import pet from "@/assets/gestures/pet.webp";
import poke from "@/assets/gestures/poke.webp";
import scoop from "@/assets/gestures/scoop.webp";
import pinch from "@/assets/gestures/pinch.webp";
import highFive from "@/assets/gestures/high-five.webp";
import beckon from "@/assets/gestures/beckon.webp";

type HandFrame = [offset: number, x: number, y: number, angle: number];
type StickerFrame = [offset: number, x: number, y: number, angle: number, scaleX: number, scaleY: number];

interface StickerGesture {
  id: string;
  label: string;
  image: string;
  aspect: number;
  /** The contact point within the image and within the visible sticker bounds. */
  grip: [x: number, y: number];
  target: [x: number, y: number];
  duration: number;
  hand: HandFrame[];
  sticker: StickerFrame[];
}

export const STICKER_GESTURES = [
  {
    id: "pet", label: "抚摸", image: pet, aspect: 395 / 192,
    grip: [0.31, 0.76], target: [0.48, 0.14], duration: 800,
    hand: [[0, 8, -10, -8], [0.19, -7, 0, 1], [0.44, 13, 1, 6], [0.71, -10, 0, -5]],
    sticker: [[0.19, -1, 3, -4, 1.04, 0.94], [0.44, 2, 3, 4, 1.06, 0.94], [0.71, -2, 2, -3, 1.02, 0.97]],
  },
  {
    id: "poke", label: "轻轻戳一下", image: poke, aspect: 345 / 288,
    grip: [0.045, 0.95], target: [0.53, 0.24], duration: 520,
    hand: [[0, 8, -13, -6], [0.21, 0, 0, 0], [0.42, 8, -10, -7]],
    sticker: [[0.22, -5, 4, -8, 1.08, 0.88], [0.47, 1, -3, 3, 0.96, 1.06], [0.73, 0, 1, -2, 1.01, 0.98]],
  },
  {
    id: "scoop", label: "托一托", image: scoop, aspect: 373 / 217,
    grip: [0.44, 0.5], target: [0.51, 0.86], duration: 740,
    hand: [[0, 10, 12, 10], [0.23, 0, 0, 0], [0.55, 0, -13, -8], [0.78, 0, -6, -3]],
    sticker: [[0.25, 0, -3, 2, 0.97, 1.05], [0.55, 0, -14, -4, 0.98, 1.04], [0.83, 0, 2, 1, 1.06, 0.93]],
  },
  {
    id: "pinch", label: "捏一下", image: pinch, aspect: 373 / 229,
    grip: [0.24, 0.55], target: [0.67, 0.43], duration: 630,
    hand: [[0, 11, -7, -7], [0.23, 0, 0, 0], [0.45, -2, 1, 5]],
    sticker: [[0.24, -2, 2, -3, 0.85, 1.08], [0.45, -1, 2, 3, 0.88, 1.09], [0.75, 0, -1, 0, 1.04, 0.98]],
  },
  {
    id: "high-five", label: "击掌", image: highFive, aspect: 319 / 402,
    grip: [0.52, 0.48], target: [0.55, 0.42], duration: 580,
    hand: [[0, 5, 11, 10], [0.2, 0, 0, 0], [0.42, 10, 9, 8]],
    sticker: [[0.22, -4, -6, -10, 0.92, 1.08], [0.5, 2, 2, 5, 1.04, 0.95], [0.75, 0, 0, -2, 1, 1]],
  },
  {
    id: "beckon", label: "招招手", image: beckon, aspect: 351 / 292,
    grip: [0.28, 0.22], target: [0.76, 0.17], duration: 750,
    hand: [[0, 11, -9, 9], [0.19, 2, -4, -7], [0.44, 5, -1, 12], [0.69, 0, -4, -9]],
    sticker: [[0.25, 2, 0, 5, 0.98, 1.04], [0.54, 6, -4, 9, 0.97, 1.05], [0.79, 2, 2, -3, 1.03, 0.97]],
  },
] as const satisfies readonly StickerGesture[];

export type StickerGestureId = (typeof STICKER_GESTURES)[number]["id"];
export type StickerGestureDefinition = (typeof STICKER_GESTURES)[number];

export function getStickerGesture(id: StickerGestureId | undefined): StickerGestureDefinition {
  return STICKER_GESTURES.find((gesture) => gesture.id === id) ?? STICKER_GESTURES[0];
}

let preloaded = false;

export function preloadStickerGestures() {
  if (preloaded) return;
  preloaded = true;
  for (const { image } of STICKER_GESTURES) new Image().src = image;
}
