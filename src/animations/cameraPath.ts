/**
 * Pure camera path maths: Catmull-Rom through a list of keys, with position, target and FOV.
 * Times are seconds. FOV is in degrees here, and CinematicPlayer converts it for the camera.
 */
import { lerp, saturate } from '../core/math';
import type { Vec3 } from '../core/types';
import type { CameraKey } from '../levels/types';

export const DEFAULT_CAMERA_FOV = 55;

export interface CameraSample {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/** Uniform Catmull-Rom: at t=0 it is p1, at t=1 it is p2. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

export function catmullRomVec3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  return {
    x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
    z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
  };
}

export const smoothstep = (t: number): number => {
  const u = saturate(t);
  return u * u * (3 - 2 * u);
};

/** Eases in and out of the whole shot while keeping some speed through the middle. */
export const easeShot = (u: number): number => lerp(saturate(u), smoothstep(u), 0.65);

/** A looping path also travels from the last key back to the first, using the first key's duration. */
function loopClosingDuration(keys: readonly CameraKey[]): number {
  if (keys[0].duration > 0) return keys[0].duration;
  const inner = keys.slice(1).reduce((sum, key) => sum + Math.max(0, key.duration), 0);
  return keys.length > 1 ? inner / (keys.length - 1) : 0;
}

/** Length of the path in seconds. */
export function pathDuration(keys: readonly CameraKey[], loop = false): number {
  if (keys.length < 2) return 0;
  const open = keys.slice(1).reduce((sum, key) => sum + Math.max(0, key.duration), 0);
  return loop ? open + loopClosingDuration(keys) : open;
}

/** Samples the path. Time is clamped when open and wraps when looping. An empty path returns null. */
export function sampleCameraPath(keys: readonly CameraKey[], time: number, loop = false): CameraSample | null {
  if (keys.length === 0) return null;
  const total = pathDuration(keys, loop);
  if (keys.length === 1 || total <= 0) return sampleAt(keys, keys.length - 1, 0, loop);

  // A loop has no first or last moment to ease into, so only open shots are eased.
  const local = loop ? ((time % total) + total) % total : total * easeShot(time / total);
  const segments = loop ? keys.length : keys.length - 1;
  let start = 0;
  for (let i = 0; i < segments; i += 1) {
    const length = segmentDuration(keys, i, loop);
    if (length <= 0) continue;
    if (local < start + length || i === segments - 1) return sampleAt(keys, i, saturate((local - start) / length), loop);
    start += length;
  }
  return sampleAt(keys, keys.length - 1, 0, loop);
}

/** Duration of the segment leaving key `index`. Duration <= 0 means a hard cut. */
function segmentDuration(keys: readonly CameraKey[], index: number, loop: boolean): number {
  if (index === keys.length - 1) return loop ? loopClosingDuration(keys) : 0;
  return Math.max(0, keys[index + 1].duration);
}

function sampleAt(keys: readonly CameraKey[], index: number, t: number, loop: boolean): CameraSample {
  const count = keys.length;
  const at = (i: number): CameraKey => (loop ? keys[((i % count) + count) % count] : keys[Math.min(count - 1, Math.max(0, i))]);
  const k0 = at(index - 1);
  const k1 = at(index);
  const k2 = at(index + 1);
  const k3 = at(index + 2);
  return {
    position: catmullRomVec3(k0.position, k1.position, k2.position, k3.position, t),
    target: catmullRomVec3(k0.target, k1.target, k2.target, k3.target, t),
    fov: lerp(k1.fov ?? DEFAULT_CAMERA_FOV, k2.fov ?? DEFAULT_CAMERA_FOV, smoothstep(t)),
  };
}
