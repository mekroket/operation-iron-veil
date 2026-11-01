/**
 * Shot-by-shot view kick, pattern recovery and spread bloom. Pure: no Babylon, no DOM.
 *
 * The view itself settles back inside PlayerController (it decays addRecoil on its own), so this model
 * never sends a counter-kick. What recovers here is the position in the pattern and the bloom.
 */
import { approach, clamp, lerp } from '../core/math';
import type { RecoilConfig, SpreadConfig } from './weaponConfigs';

export interface RecoilKick {
  pitch: number;
  yaw: number;
}

export class RecoilModel {
  private shots = 0;
  private sinceShot = Number.POSITIVE_INFINITY;
  private bloomValue = 0;
  /** Reused for every shot. */
  private readonly kick: RecoilKick = { pitch: 0, yaw: 0 };

  constructor(private config: RecoilConfig) {}

  /** Accumulated pattern position: 0 means fully recovered. */
  get patternPosition(): number {
    return this.shots;
  }
  get bloom(): number {
    return this.bloomValue;
  }

  /** Changes weapon and forgets the old weapon's recoil. */
  setConfig(config: RecoilConfig): void {
    this.config = config;
    this.reset();
  }

  reset(): void {
    this.shots = 0;
    this.sinceShot = Number.POSITIVE_INFINITY;
    this.bloomValue = 0;
  }

  /**
   * Advances the pattern and returns the kick for this shot. The returned object is reused: read it straight away.
   * @param ads 0 at the hip, 1 fully aimed.
   * @param random Source of 0..1 numbers.
   */
  shoot(ads: number, random: () => number): RecoilKick {
    const c = this.config;
    const index = Math.floor(this.shots);
    const step = c.pattern[Math.min(index, c.pattern.length - 1)];
    const tail = index >= c.pattern.length ? Math.sin(index * 0.85) * c.tailYawSway : 0;
    const scale = lerp(1, c.adsMultiplier, clamp(ads, 0, 1));
    this.kick.pitch = (c.pitchPerShot * step.pitch + (random() * 2 - 1) * c.randomPitch) * scale;
    this.kick.yaw = (c.yawPerShot * (step.yaw + tail) + (random() * 2 - 1) * c.randomYaw) * scale;
    this.bloomValue = Math.min(c.bloomMax, this.bloomValue + c.bloomPerShot * scale);
    this.shots += 1;
    this.sinceShot = 0;
    return this.kick;
  }

  update(dt: number): void {
    const c = this.config;
    this.sinceShot += dt;
    this.bloomValue = approach(this.bloomValue, 0, c.bloomRecovery * dt);
    if (this.sinceShot >= c.recoveryDelay) {
      this.shots = approach(this.shots, 0, c.patternRecoveryRate * dt);
    }
  }
}

/** Half-angle of the shot cone right now, in radians. Also what the crosshair should show. */
export function computeSpread(
  config: SpreadConfig,
  ads: number,
  moveFactor: number,
  airborne: boolean,
  crouching: boolean,
  bloom: number,
): number {
  const t = clamp(ads, 0, 1);
  const penalties = config.moveSpreadPenalty * clamp(moveFactor, 0, 1) + (airborne ? config.airSpreadPenalty : 0);
  const spread = lerp(config.hipSpread, config.adsSpread, t) + penalties * lerp(1, 0.25, t) + bloom * lerp(1, 0.4, t);
  return crouching ? spread * config.crouchSpreadMultiplier : spread;
}
