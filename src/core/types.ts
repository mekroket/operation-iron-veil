/** Plain data types shared by every system. Nothing here may import Babylon, so pure logic stays unit-testable. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type WeaponId = 'assaultRifle' | 'smg' | 'handgun';
export const WEAPON_SLOTS: readonly WeaponId[] = ['assaultRifle', 'smg', 'handgun'];

export type SurfaceType = 'concrete' | 'asphalt' | 'metal' | 'wood' | 'gravel' | 'water' | 'flesh';
export type HitZone = 'head' | 'torso' | 'limb';

export type EnemyStateName =
  | 'IDLE'
  | 'PATROL'
  | 'SUSPICIOUS'
  | 'ALERT'
  | 'COMBAT'
  | 'SEARCH'
  | 'DEFEATED';

export interface MissionStats {
  missionId: string;
  elapsedSeconds: number;
  enemiesDefeated: number;
  enemiesTotal: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  /** 0..1 */
  accuracy: number;
  deaths: number;
  checkpointsReached: number;
  /** Letter grade computed by the mission system: S, A, B, C. */
  grade: string;
}
