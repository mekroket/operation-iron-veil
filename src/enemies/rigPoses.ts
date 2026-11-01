/** Proportions and key poses of the contractor rig, as data. Pure: no Babylon, no DOM. */
import type { Vec3 } from '../core/types';
import { smoothStep } from './rigMath';

export interface RigInput {
  /** Actual speed along the facing direction, metres per second. */
  forwardSpeed: number;
  /** Actual speed to the right of the facing direction. */
  strafeSpeed: number;
  aiming: boolean;
  /** Radians, positive up. */
  aimPitch: number;
  crouching: boolean;
  reloading: boolean;
  reloadProgress: number;
  /** -1 left .. 1 right. */
  lean: number;
}

export const THIGH = 0.44;
export const SHIN = 0.43;
export const ANKLE_HEIGHT = 0.08;
export const STAND_HIP = 0.93;
export const CROUCH_HIP = 0.56;
export const HIP_X = 0.095;
export const CHEST_FROM_HIP = 0.17;
export const UPPER_ARM = 0.3;
export const FOREARM = 0.3;
export const FALL_TIME = 0.75;
export const SETTLE_TIME = 0.2;

export const SHOULDER_R: Vec3 = { x: 0.215, y: 0.34, z: 0 };
export const SHOULDER_L: Vec3 = { x: -0.215, y: 0.34, z: 0 };
export const POLE_R: Vec3 = { x: 0.55, y: -1, z: -0.25 };
export const POLE_L: Vec3 = { x: -0.55, y: -1, z: -0.1 };
export const GRIP_POINT: Vec3 = { x: 0, y: -0.05, z: -0.02 };
export const SUPPORT_POINT: Vec3 = { x: 0, y: -0.015, z: 0.26 };
export const POUCH_POINT: Vec3 = { x: -0.05, y: 0.05, z: 0.21 };

/** Rifle poses in chest space: position then rotation X (positive tips the muzzle down) and Y. */
export const AIM = { x: 0.07, y: 0.34, z: 0.22, rx: 0, ry: 0 };
export const READY = { x: 0.08, y: 0.16, z: 0.18, rx: 0.55, ry: -0.5 };
export const RELOAD = { x: 0.08, y: 0.22, z: 0.22, rx: -0.28, ry: -0.3 };

/** 0 at the rifle, 1 at the pouch: out early in the reload, back near the end. */
export function reloadTrip(progress: number): number {
  if (progress < 0.25) return 0;
  if (progress < 0.45) return smoothStep((progress - 0.25) / 0.2);
  if (progress < 0.6) return 1;
  if (progress < 0.8) return 1 - smoothStep((progress - 0.6) / 0.2);
  return 0;
}
