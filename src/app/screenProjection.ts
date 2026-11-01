import type { Vec3 } from '../core/types';

/** How far inside the screen edge a point must be before the marker stops treating it as off-screen. */
const ON_SCREEN_LIMIT = 0.94;

/**
 * Projects a world point to CSS pixels using a column-major view-projection matrix (Babylon's layout).
 * A point behind the camera keeps its left/right side and is pushed to the bottom edge, so the marker
 * still tells the player which way to turn.
 */
export function projectToScreen(
  point: Vec3,
  m: ArrayLike<number>,
  width: number,
  height: number,
): { x: number; y: number; onScreen: boolean } {
  const clipX = point.x * m[0] + point.y * m[4] + point.z * m[8] + m[12];
  const clipY = point.x * m[1] + point.y * m[5] + point.z * m[9] + m[13];
  const w = point.x * m[3] + point.y * m[7] + point.z * m[11] + m[15];
  if (w <= 1e-4) {
    const side = clipX === 0 ? 0.001 : clipX;
    return { x: width / 2 + Math.sign(side) * width, y: height * 1.5, onScreen: false };
  }
  const ndcX = clipX / w;
  const ndcY = clipY / w;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    onScreen: Math.abs(ndcX) < ON_SCREEN_LIMIT && Math.abs(ndcY) < ON_SCREEN_LIMIT,
  };
}
