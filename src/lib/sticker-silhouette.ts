interface SilhouetteRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface StickerSilhouette {
  bounds: SilhouetteRect;
  parts: SilhouetteRect[];
}

const fullBox = { left: -0.5, top: -0.5, right: 0.5, bottom: 0.5 };
export const BOX_SILHOUETTE: StickerSilhouette = { bounds: fullBox, parts: [fullBox] };
const SAMPLE_SIZE = 64;
const ALPHA_THRESHOLD = 16;

export async function readStickerSilhouette(src: string): Promise<StickerSilhouette> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();

  // Match object-fit: contain, including its letterboxing for non-square art.
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const width = Math.max(1, Math.round(SAMPLE_SIZE * image.naturalWidth / longestSide));
  const height = Math.max(1, Math.round(SAMPLE_SIZE * image.naturalHeight / longestSide));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return BOX_SILHOUETTE;
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  // Merge identical runs across rows into disjoint rectangles. Concavities,
  // holes and separate islands remain open to other stickers.
  const parts: SilhouetteRect[] = [];
  let previous = new Map<number, SilhouetteRect>();
  const localX = (x: number) => (x - width / 2) / SAMPLE_SIZE;
  const localY = (y: number) => (y - height / 2) / SAMPLE_SIZE;
  const opaque = (x: number, y: number) => data[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD;
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

  for (let y = 0; y < height; y += 1) {
    const runs = new Map<number, SilhouetteRect>();
    let x = 0;
    while (x < width) {
      if (!opaque(x, y)) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && opaque(x, y)) x += 1;
      const key = start * (width + 1) + x;
      let part = previous.get(key);
      if (part) {
        part.bottom = localY(y + 1);
      } else {
        part = { left: localX(start), top: localY(y), right: localX(x), bottom: localY(y + 1) };
        parts.push(part);
      }
      runs.set(key, part);
      bounds.left = Math.min(bounds.left, part.left);
      bounds.top = Math.min(bounds.top, part.top);
      bounds.right = Math.max(bounds.right, part.right);
      bounds.bottom = Math.max(bounds.bottom, part.bottom);
    }
    previous = runs;
  }

  return {
    bounds: parts.length ? bounds : { left: 0, top: 0, right: 0, bottom: 0 },
    parts,
  };
}

export function stickerBounds(silhouette: StickerSilhouette, angle: number, flipped: boolean): SilhouetteRect {
  if (!silhouette.parts.length) return silhouette.bounds;
  if (angle === 0) {
    const bounds = silhouette.bounds;
    return flipped ? { ...bounds, left: -bounds.right, right: -bounds.left } : bounds;
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const part of silhouette.parts) {
    const x = (part.left + part.right) / 2 * (flipped ? -1 : 1);
    const y = (part.top + part.bottom) / 2;
    const halfWidth = (part.right - part.left) / 2;
    const halfHeight = (part.bottom - part.top) / 2;
    const centerX = x * cos - y * sin;
    const centerY = x * sin + y * cos;
    const extentX = halfWidth * Math.abs(cos) + halfHeight * Math.abs(sin);
    const extentY = halfWidth * Math.abs(sin) + halfHeight * Math.abs(cos);
    bounds.left = Math.min(bounds.left, centerX - extentX);
    bounds.right = Math.max(bounds.right, centerX + extentX);
    bounds.top = Math.min(bounds.top, centerY - extentY);
    bounds.bottom = Math.max(bounds.bottom, centerY + extentY);
  }
  return bounds;
}

export function fitStickerCenter(
  x: number,
  y: number,
  size: number,
  bounds: SilhouetteRect,
  width: number,
  height: number,
) {
  return {
    x: Math.min(width - bounds.right * size, Math.max(-bounds.left * size, x)),
    y: Math.min(height - bounds.bottom * size, Math.max(-bounds.top * size, y)),
  };
}
