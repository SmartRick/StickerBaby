/** Base CSS size of one sticker before global / per-pet scale. */
export const PET_BASE_SIZE = 168;

export function getPetSize(globalScale: number, scale: number, width: number, height: number) {
  // Keep even the diagonal of an oversized sticker inside a narrow viewport.
  const limit = Math.floor(Math.min(width, height) * Math.SQRT1_2);
  return Math.max(1, Math.min(limit, Math.round(PET_BASE_SIZE * globalScale * scale)));
}

export function petHalfExtent(size: number, angle: number) {
  return size / 2 * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
}

export function clampPetAxis(position: number, halfExtent: number, viewportSize: number) {
  const edge = Math.min(halfExtent, viewportSize / 2);
  return Math.min(viewportSize - edge, Math.max(edge, position));
}
