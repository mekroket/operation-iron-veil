/** Chance that one enemy shot connects. Pure: no Babylon, no DOM. */
import { clamp, lerp, saturate } from '../core/math';
import type { AccuracyConfig } from '../enemies/enemyConfig';

export interface AccuracyInput {
  distance: number;
  /** Target speed in metres per second. */
  targetSpeed: number;
  targetCrouching: boolean;
  /** Seconds this enemy has held the target in sight. First shots miss more. */
  timeOnTarget: number;
  shooterMoving: boolean;
}

export function computeHitChance(cfg: AccuracyConfig, input: AccuracyInput): number {
  const range = saturate((input.distance - cfg.nearDistance) / (cfg.farDistance - cfg.nearDistance));
  let chance = lerp(cfg.nearChance, cfg.farChance, range);
  chance *= lerp(1, cfg.movingTargetMult, saturate(input.targetSpeed / cfg.referenceSpeed));
  if (input.targetCrouching) chance *= cfg.crouchMult;
  chance *= lerp(cfg.firstShotMult, 1, saturate(input.timeOnTarget / cfg.settleTime));
  if (input.shooterMoving) chance *= cfg.shooterMovingMult;
  return clamp(chance, cfg.minChance, cfg.maxChance);
}
