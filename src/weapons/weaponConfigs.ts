/** Data-driven weapon tuning. Pure data: all three weapons are fictional. Angles are radians, distances metres, times seconds. */
import type { Vec3, WeaponId } from '../core/types';

export type FireMode = 'auto' | 'semi';

/** One entry of the shot-by-shot recoil pattern, as multipliers of pitchPerShot and yawPerShot. */
export interface RecoilStep {
  pitch: number;
  yaw: number;
}

export interface RecoilConfig {
  /** View kick per shot. The player controller settles the view back by itself. */
  pitchPerShot: number;
  yawPerShot: number;
  /** Consumed shot by shot while firing. The last step holds for the rest of the burst. */
  pattern: readonly RecoilStep[];
  /** Horizontal sway added to yaw once the pattern has run out. */
  tailYawSway: number;
  /** Random extra kick, plus or minus. */
  randomPitch: number;
  randomYaw: number;
  /** Kick and bloom multiplier while fully aimed. */
  adsMultiplier: number;
  /** Quiet time after the last shot before the pattern winds back. */
  recoveryDelay: number;
  /** Pattern steps recovered per second once the delay has passed. */
  patternRecoveryRate: number;
  /** Spread added per shot. */
  bloomPerShot: number;
  bloomMax: number;
  /** Bloom removed per second. */
  bloomRecovery: number;
}

export interface SpreadConfig {
  hipSpread: number;
  adsSpread: number;
  /** Extra hip spread at full run speed. */
  moveSpreadPenalty: number;
  /** Extra hip spread while airborne. */
  airSpreadPenalty: number;
  /** Multiplier on the final spread while crouched. */
  crouchSpreadMultiplier: number;
}

/** First-person presentation. Offsets are camera-space: +X right, +Y up, +Z away from the eye. */
export interface ViewModelConfig {
  hipOffset: Vec3;
  /** x must be 0 and y must be -sightHeight, so the sight line crosses screen centre. */
  adsOffset: Vec3;
  sprintOffset: Vec3;
  /** Pitch (+ is nose down), yaw (+ is nose right), roll. */
  sprintRotation: Vec3;
  /** Height of the sight line above the model origin. */
  sightHeight: number;
  /** Gun slides back this far on each shot. */
  kickBack: number;
  /** Muzzle climbs this far on each shot. */
  kickPitch: number;
  kickRollRandom: number;
  /** Bolt or slide travel. */
  boltTravel: number;
  /** One full back-and-forward bolt cycle. */
  boltCycleSeconds: number;
  /** Bigger values make the gun trail mouse movement further. */
  swayScale: number;
  /** Roll of the gun during a reload, towards the player's chest. */
  reloadRoll: number;
  /** Flash scale at the muzzle. */
  flashScale: number;
}

export interface WeaponConfig extends SpreadConfig {
  id: WeaponId;
  displayName: string;
  fireMode: FireMode;
  rpm: number;
  damage: number;
  headMultiplier: number;
  limbMultiplier: number;
  range: number;
  /** Full damage up to this distance. */
  falloffStart: number;
  /** Damage settles at falloffMinMultiplier from here outwards. */
  falloffEnd: number;
  falloffMinMultiplier: number;
  magSize: number;
  maxReserve: number;
  startReserve: number;
  reloadEmptySeconds: number;
  reloadTacticalSeconds: number;
  equipSeconds: number;
  holsterSeconds: number;
  /** Delay after sprinting ends before the gun can fire. */
  sprintRecoverSeconds: number;
  recoil: RecoilConfig;
  adsFovMultiplier: number;
  adsSeconds: number;
  /** Player speed while this weapon is held. */
  moveSpeedMultiplier: number;
  /** Multiplies moveSpeedMultiplier while aimed. */
  adsMoveMultiplier: number;
  view: ViewModelConfig;
}

const WARDEN: WeaponConfig = {
  id: 'assaultRifle',
  displayName: 'VR-7 WARDEN',
  fireMode: 'auto',
  rpm: 680,
  damage: 30,
  headMultiplier: 2.2,
  limbMultiplier: 0.75,
  range: 180,
  falloffStart: 40,
  falloffEnd: 110,
  falloffMinMultiplier: 0.6,
  magSize: 30,
  maxReserve: 210,
  startReserve: 120,
  reloadEmptySeconds: 2.75,
  reloadTacticalSeconds: 2.05,
  equipSeconds: 0.55,
  holsterSeconds: 0.28,
  sprintRecoverSeconds: 0.2,
  hipSpread: 0.024,
  adsSpread: 0.0016,
  moveSpreadPenalty: 0.022,
  airSpreadPenalty: 0.05,
  crouchSpreadMultiplier: 0.8,
  recoil: {
    pitchPerShot: 0.0115,
    yawPerShot: 0.0045,
    pattern: [
      { pitch: 1.3, yaw: 0.2 },
      { pitch: 1.1, yaw: 0.45 },
      { pitch: 1, yaw: 0.8 },
      { pitch: 0.95, yaw: 1 },
      { pitch: 0.9, yaw: 0.5 },
      { pitch: 0.85, yaw: -0.4 },
      { pitch: 0.8, yaw: -0.9 },
      { pitch: 0.8, yaw: -0.5 },
      { pitch: 0.75, yaw: 0.3 },
    ],
    tailYawSway: 0.9,
    randomPitch: 0.0012,
    randomYaw: 0.0014,
    adsMultiplier: 0.62,
    recoveryDelay: 0.14,
    patternRecoveryRate: 22,
    bloomPerShot: 0.0028,
    bloomMax: 0.038,
    bloomRecovery: 0.05,
  },
  adsFovMultiplier: 0.72,
  adsSeconds: 0.24,
  moveSpeedMultiplier: 0.95,
  adsMoveMultiplier: 0.62,
  view: {
    hipOffset: { x: 0.17, y: -0.16, z: 0.58 },
    adsOffset: { x: 0, y: -0.108, z: 0.2 },
    sprintOffset: { x: 0.02, y: -0.075, z: -0.05 },
    sprintRotation: { x: 0.42, y: -0.92, z: 0.3 },
    sightHeight: 0.108,
    kickBack: 0.016,
    kickPitch: 0.024,
    kickRollRandom: 0.014,
    boltTravel: 0.05,
    boltCycleSeconds: 0.075,
    swayScale: 1,
    reloadRoll: -0.42,
    flashScale: 1,
  },
};

const HORNET: WeaponConfig = {
  id: 'smg',
  displayName: 'SX-4 HORNET',
  fireMode: 'auto',
  rpm: 960,
  damage: 18,
  headMultiplier: 1.7,
  limbMultiplier: 0.8,
  range: 85,
  falloffStart: 11,
  falloffEnd: 34,
  falloffMinMultiplier: 0.34,
  magSize: 36,
  maxReserve: 288,
  startReserve: 144,
  reloadEmptySeconds: 2.3,
  reloadTacticalSeconds: 1.75,
  equipSeconds: 0.38,
  holsterSeconds: 0.2,
  sprintRecoverSeconds: 0.12,
  hipSpread: 0.03,
  adsSpread: 0.0058,
  moveSpreadPenalty: 0.012,
  airSpreadPenalty: 0.03,
  crouchSpreadMultiplier: 0.85,
  recoil: {
    pitchPerShot: 0.0058,
    yawPerShot: 0.0048,
    pattern: [
      { pitch: 1.15, yaw: -0.3 },
      { pitch: 1.05, yaw: 0.65 },
      { pitch: 0.95, yaw: -0.8 },
      { pitch: 0.9, yaw: 0.9 },
      { pitch: 0.85, yaw: -0.7 },
      { pitch: 0.85, yaw: 0.5 },
    ],
    tailYawSway: 1.3,
    randomPitch: 0.0014,
    randomYaw: 0.0022,
    adsMultiplier: 0.72,
    recoveryDelay: 0.09,
    patternRecoveryRate: 34,
    bloomPerShot: 0.0021,
    bloomMax: 0.05,
    bloomRecovery: 0.075,
  },
  adsFovMultiplier: 0.82,
  adsSeconds: 0.17,
  moveSpeedMultiplier: 1,
  adsMoveMultiplier: 0.74,
  view: {
    hipOffset: { x: 0.145, y: -0.125, z: 0.46 },
    adsOffset: { x: 0, y: -0.085, z: 0.2 },
    sprintOffset: { x: 0.015, y: -0.07, z: -0.04 },
    sprintRotation: { x: 0.36, y: -0.8, z: 0.42 },
    sightHeight: 0.085,
    kickBack: 0.0095,
    kickPitch: 0.012,
    kickRollRandom: 0.024,
    boltTravel: 0.036,
    boltCycleSeconds: 0.052,
    swayScale: 1.15,
    reloadRoll: -0.5,
    flashScale: 0.72,
  },
};

const MARSHAL: WeaponConfig = {
  id: 'handgun',
  displayName: 'PX-2 MARSHAL',
  fireMode: 'semi',
  rpm: 420,
  damage: 36,
  headMultiplier: 2.6,
  limbMultiplier: 0.8,
  range: 110,
  falloffStart: 26,
  falloffEnd: 65,
  falloffMinMultiplier: 0.55,
  magSize: 13,
  maxReserve: 91,
  startReserve: 52,
  reloadEmptySeconds: 1.95,
  reloadTacticalSeconds: 1.5,
  equipSeconds: 0.28,
  holsterSeconds: 0.16,
  sprintRecoverSeconds: 0.08,
  hipSpread: 0.015,
  adsSpread: 0.0007,
  moveSpreadPenalty: 0.014,
  airSpreadPenalty: 0.035,
  crouchSpreadMultiplier: 0.78,
  recoil: {
    pitchPerShot: 0.03,
    yawPerShot: 0.004,
    pattern: [{ pitch: 1, yaw: 0.5 }, { pitch: 1.1, yaw: -0.5 }, { pitch: 1.15, yaw: 0.4 }],
    tailYawSway: 0.8,
    randomPitch: 0.003,
    randomYaw: 0.0035,
    adsMultiplier: 0.7,
    recoveryDelay: 0.2,
    patternRecoveryRate: 10,
    bloomPerShot: 0.0065,
    bloomMax: 0.03,
    bloomRecovery: 0.045,
  },
  adsFovMultiplier: 0.84,
  adsSeconds: 0.15,
  moveSpeedMultiplier: 1.04,
  adsMoveMultiplier: 0.78,
  view: {
    hipOffset: { x: 0.095, y: -0.095, z: 0.4 },
    adsOffset: { x: 0, y: -0.056, z: 0.27 },
    sprintOffset: { x: -0.01, y: -0.1, z: -0.1 },
    sprintRotation: { x: 0.72, y: -0.3, z: 0.18 },
    sightHeight: 0.056,
    kickBack: 0.022,
    kickPitch: 0.075,
    kickRollRandom: 0.02,
    boltTravel: 0.042,
    boltCycleSeconds: 0.11,
    swayScale: 0.85,
    reloadRoll: -0.32,
    flashScale: 0.62,
  },
};

export const WEAPON_CONFIGS: Readonly<Record<WeaponId, WeaponConfig>> = {
  assaultRifle: WARDEN,
  smg: HORNET,
  handgun: MARSHAL,
};
