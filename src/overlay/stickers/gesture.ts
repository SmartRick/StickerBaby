/**
 * 手势互动（中键 / 主界面“互动”页触发）：一只手的贴图按关键帧摸、戳、托、捏贴纸，
 * 贴纸在接触时跟着变形。手的位置按贴纸可见区域（而不是整张图片）计算接触点。
 */
import type { StickerGestureDefinition } from "@/lib/sticker-gestures";
import type { Rect01 } from "./mask";

export interface GesturePlacement {
  left: number;
  top: number;
  width: number;
  originX: number;
  originY: number;
}

/** sprite：贴纸在屏幕上的外框；bounds：可见区域（以中心为原点的归一化坐标） */
export function placeGesture(
  def: StickerGestureDefinition,
  sprite: { left: number; top: number; width: number; height: number },
  bounds: Rect01,
  viewport: { width: number; height: number },
): GesturePlacement {
  const margin = 8;
  let width = Math.max(
    1,
    Math.min(Math.max(40, sprite.width * 1.15), 320, viewport.width - margin * 2, (viewport.height - margin * 2) * def.aspect),
  );
  let height = width / def.aspect;
  const [tx, ty] = def.target;
  const contactX = sprite.left + (0.5 + bounds.left + (bounds.right - bounds.left) * tx) * sprite.width;
  const contactY = sprite.top + (0.5 + bounds.top + (bounds.bottom - bounds.top) * ty) * sprite.height;
  const [originX, originY] = def.grip;
  // 手从上方伸入（grip 靠近图底）而上方放不下时，整体缩小手型图，保住接触点
  // 与朝向；不做上下翻转——翻转后的手从下往上戳，看起来是反的
  if (originY > 0.5) {
    const shrink = Math.min(1, Math.max(0.45, (contactY - margin) / (height * originY)));
    width *= shrink;
    height *= shrink;
  }
  const left = Math.min(viewport.width - margin - width, Math.max(margin, contactX - width * originX));
  const top = Math.min(viewport.height - margin - height, Math.max(margin, contactY - height * originY));
  return { left, top, width, originX, originY };
}

/**
 * 播放一次手势。hand 挂在 root 上（屏幕坐标），motion 是贴纸内部专供手势变形的元素。
 * 返回取消函数；onContact 在手碰到贴纸时触发（用于反馈），onDone 结束时触发。
 */
export function playGesture(
  root: HTMLElement,
  def: StickerGestureDefinition,
  at: GesturePlacement,
  motion: HTMLElement,
  reduceMotion: boolean,
  onContact: () => void,
  onDone: () => void,
): () => void {
  const hand = document.createElement("div");
  hand.className = "sb-gesture";
  Object.assign(hand.style, {
    left: `${at.left}px`,
    top: `${at.top}px`,
    width: `${at.width}px`,
    opacity: "0",
    transformOrigin: `${at.originX * 100}% ${at.originY * 100}%`,
  });
  const img = document.createElement("img");
  img.src = def.image;
  img.draggable = false;
  hand.appendChild(img);
  root.appendChild(hand);

  let disposed = false;
  let handAnim: Animation | undefined;
  let spriteAnim: Animation | undefined;
  let contactTimer = 0;
  const first = def.hand[0];
  const last = def.hand[def.hand.length - 1];
  const handFrames = [...def.hand, [0.83, last[1], last[2], last[3]], [1, last[1] + 7, first[2], first[3]]].map(
    ([offset, x, y, angle]) => ({
      offset,
      transform: `translate(${x}%, ${y}%) rotate(${angle}deg)`,
      opacity: offset === 1 ? 0 : 1,
    }),
  );
  const spriteFrames = [[0, 0, 0, 0, 1, 1], ...def.sticker, [1, 0, 0, 0, 1, 1]].map(([offset, x, y, angle, sx, sy]) => ({
    offset,
    transform: `translate(${x}%, ${y}%) rotate(${angle}deg) scale(${sx}, ${sy})`,
  }));

  const finish = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(contactTimer);
    handAnim?.cancel();
    spriteAnim?.cancel();
    hand.remove();
    onDone();
  };

  const play = () => {
    if (disposed) return;
    if (reduceMotion) {
      handAnim = hand.animate([{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 480, fill: "both" });
    } else {
      handAnim = hand.animate(handFrames, { duration: def.duration, easing: "ease-in-out", fill: "both" });
      spriteAnim = motion.animate(spriteFrames, { duration: def.duration, easing: "ease-in-out" });
      contactTimer = window.setTimeout(onContact, def.duration * def.sticker[0][0]);
    }
    handAnim.onfinish = finish;
  };
  img.decode().then(play, finish);
  return finish;
}
