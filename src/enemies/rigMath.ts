/**
 * Limb solvers for the procedural rig. Pure: no Babylon, no DOM.
 * Limbs hang along local -Y. Rotation signs follow Babylon's left-handed convention:
 * a positive X rotation swings a hanging limb backwards, towards -Z.
 */
import { clamp } from '../core/math';
import type { Vec3 } from '../core/types';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface LegPose {
  /** Thigh rotation around X. */
  thighX: number;
  /** Shin rotation around X, relative to the thigh. Zero when straight. */
  kneeX: number;
}

/** Planar two-bone solve in the YZ plane. The knee always bends forward. */
export function solveLeg(
  hipY: number,
  hipZ: number,
  footY: number,
  footZ: number,
  upper: number,
  lower: number,
  out: LegPose,
): void {
  const vy = footY - hipY;
  const vz = footZ - hipZ;
  const d = clamp(Math.hypot(vy, vz), 0.05, upper + lower - 1e-3);
  const alpha = Math.atan2(vz, -vy);
  const beta = Math.acos(clamp((upper * upper + d * d - lower * lower) / (2 * upper * d), -1, 1));
  const inner = Math.acos(clamp((upper * upper + lower * lower - d * d) / (2 * upper * lower), -1, 1));
  out.thighX = -(alpha + beta);
  out.kneeX = Math.PI - inner;
}

/** Shortest rotation taking local -Y onto a unit direction. */
export function quatFromDown(dir: Vec3, out: Quat): void {
  const w = 1 - dir.y;
  if (w < 1e-5) {
    // Pointing straight up: half a turn around X.
    out.x = 1;
    out.y = 0;
    out.z = 0;
    out.w = 0;
    return;
  }
  const x = -dir.z;
  const z = dir.x;
  const len = Math.hypot(x, z, w);
  out.x = x / len;
  out.y = 0;
  out.z = z / len;
  out.w = w / len;
}

/** out = conjugate(a) * b. The local rotation of a child, given parent and child orientations. */
export function quatLocal(a: Quat, b: Quat, out: Quat): void {
  const ax = -a.x;
  const ay = -a.y;
  const az = -a.z;
  const aw = a.w;
  const x = aw * b.x + ax * b.w + ay * b.z - az * b.y;
  const y = aw * b.y - ax * b.z + ay * b.w + az * b.x;
  const z = aw * b.z + ax * b.y - ay * b.x + az * b.w;
  const w = aw * b.w - ax * b.x - ay * b.y - az * b.z;
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
}

const elbow: Vec3 = { x: 0, y: 0, z: 0 };
const dirUpper: Vec3 = { x: 0, y: 0, z: 0 };
const dirLower: Vec3 = { x: 0, y: 0, z: 0 };
const worldLower: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Full-space two-bone solve. `pole` is the rough direction the elbow points. */
export function solveArm(
  shoulder: Vec3,
  hand: Vec3,
  pole: Vec3,
  upper: number,
  lower: number,
  outUpper: Quat,
  outLower: Quat,
): void {
  let dx = hand.x - shoulder.x;
  let dy = hand.y - shoulder.y;
  let dz = hand.z - shoulder.z;
  const reach = Math.max(Math.hypot(dx, dy, dz), 1e-4);
  dx /= reach;
  dy /= reach;
  dz /= reach;
  const d = clamp(reach, Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3);

  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const poleDot = pole.x * dx + pole.y * dy + pole.z * dz;
  let px = pole.x - dx * poleDot;
  let py = pole.y - dy * poleDot;
  let pz = pole.z - dz * poleDot;
  const poleLen = Math.max(Math.hypot(px, py, pz), 1e-4);
  px /= poleLen;
  py /= poleLen;
  pz /= poleLen;

  elbow.x = dx * along + px * out;
  elbow.y = dy * along + py * out;
  elbow.z = dz * along + pz * out;
  dirUpper.x = elbow.x / upper;
  dirUpper.y = elbow.y / upper;
  dirUpper.z = elbow.z / upper;
  const hx = dx * d - elbow.x;
  const hy = dy * d - elbow.y;
  const hz = dz * d - elbow.z;
  const lowerLen = Math.max(Math.hypot(hx, hy, hz), 1e-4);
  dirLower.x = hx / lowerLen;
  dirLower.y = hy / lowerLen;
  dirLower.z = hz / lowerLen;

  quatFromDown(dirUpper, outUpper);
  quatFromDown(dirLower, worldLower);
  quatLocal(outUpper, worldLower, outLower);
}

/** Rotates a point the way Babylon applies node.rotation with only x and y set: X first, then Y. */
export function rotateXY(v: Vec3, rx: number, ry: number, out: Vec3): void {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const y1 = v.y * cx - v.z * sx;
  const z1 = v.y * sx + v.z * cx;
  out.x = v.x * cy + z1 * sy;
  out.y = y1;
  out.z = -v.x * sy + z1 * cy;
}

/** Ease for accelerating falls. */
export const easeInQuad = (t: number): number => t * t;
export const smoothStep = (t: number): number => t * t * (3 - 2 * t);
