/** What one enemy knows about the player: vision, hearing, awareness meter. Pure: no Babylon, no DOM. */
import { clamp, distance, lerp, saturate } from '../core/math';
import type { Vec3 } from '../core/types';
import type { PerceptionConfig } from '../enemies/enemyConfig';

export type LineOfSightFn = (from: Vec3, to: Vec3) => boolean;
export type NoiseKind = 'walk' | 'sprint' | 'gunfire';
export type PerceptionMode = 'calm' | 'searching' | 'engaged';

export interface PerceivedTarget {
  chest: Vec3;
  head: Vec3;
  crouching: boolean;
  sprinting: boolean;
  alive: boolean;
}

const DEG_TO_RAD = Math.PI / 180;

export function detectionRange(cfg: PerceptionConfig, target: PerceivedTarget, mode: PerceptionMode): number {
  let range = cfg.visionRange;
  if (target.crouching) range *= cfg.crouchRangeMult;
  else if (target.sprinting) range *= cfg.sprintRangeMult;
  if (mode === 'engaged') range *= cfg.engagedRangeMult;
  return range;
}

/** Geometric visibility from 0 to 1, walls not considered. 0 means out of range or outside the cone. */
export function visibilityOf(
  cfg: PerceptionConfig,
  eye: Vec3,
  forward: Vec3,
  target: PerceivedTarget,
  mode: PerceptionMode,
): number {
  if (!target.alive) return 0;
  const dx = target.chest.x - eye.x;
  const dy = target.chest.y - eye.y;
  const dz = target.chest.z - eye.z;
  const dist = Math.hypot(dx, dy, dz);
  const range = detectionRange(cfg, target, mode);
  if (dist > range) return 0;

  const near = dist <= cfg.proximityRadius ? cfg.proximityVisibility : 0;
  if (dist < 1e-4) return Math.max(near, 1);
  const cosine = clamp((dx * forward.x + dy * forward.y + dz * forward.z) / dist, -1, 1);
  const angle = Math.acos(cosine);
  const halfFov = ((mode === 'engaged' ? cfg.engagedFovDegrees : cfg.fovDegrees) * DEG_TO_RAD) / 2;
  if (angle > halfFov) return near;

  const distanceFactor = Math.max(Math.pow(1 - dist / range, cfg.distanceFalloff), cfg.minDistanceFactor);
  const edge = angle / halfFov;
  const fovFactor = lerp(1, cfg.fovEdgeFactor, edge * edge);
  return Math.max(near, distanceFactor * fovFactor);
}

export class Perception {
  /** Awareness meter, 0..1. */
  awareness = 0;
  /** Where the player was last seen or heard. Null until then. */
  lastKnownPosition: Vec3 | null = null;
  /** True when the target is inside the cone with a clear line, as of the last ray. */
  visible = false;

  private readonly cfg: PerceptionConfig;
  private readonly lineOfSight: LineOfSightFn;
  private mode: PerceptionMode = 'calm';
  private losInterval: number;
  private losTimer: number;
  private losClear = false;
  private drainDelay = 0;
  private pendingNoise: Vec3 | null = null;

  /** `phase` in 0..1 spreads the rays of different enemies across frames. */
  constructor(cfg: PerceptionConfig, lineOfSight: LineOfSightFn, phase = 0) {
    this.cfg = cfg;
    this.lineOfSight = lineOfSight;
    this.losInterval = cfg.losInterval;
    this.losTimer = cfg.losInterval * saturate(phase);
  }

  setMode(mode: PerceptionMode): void {
    this.mode = mode;
  }

  /** Distance-based LOD widens this. */
  setLosInterval(seconds: number): void {
    this.losInterval = seconds;
  }

  update(dt: number, eye: Vec3, forward: Vec3, target: PerceivedTarget): void {
    const visibility = visibilityOf(this.cfg, eye, forward, target, this.mode);
    this.losTimer -= dt;
    if (visibility <= 0) {
      this.losClear = false;
    } else if (this.losTimer <= 0) {
      // Chest first; the head only when the chest is hidden, so most sightings cost one ray.
      this.losClear = this.lineOfSight(eye, target.chest) || this.lineOfSight(eye, target.head);
      this.losTimer = this.losInterval;
    }
    this.visible = visibility > 0 && this.losClear;

    if (this.visible) {
      this.awareness = saturate(this.awareness + this.cfg.fillRate * visibility * this.fillMultiplier() * dt);
      this.drainDelay = this.cfg.drainDelay;
      if (this.awareness >= this.cfg.trackThreshold) this.remember(target.chest);
    } else if (this.drainDelay > 0) {
      this.drainDelay -= dt;
    } else {
      this.awareness = Math.max(0, this.awareness - this.cfg.drainRate * dt);
    }
  }

  /** Returns true when the noise is within hearing range of the listener. */
  hear(kind: NoiseKind, listener: Vec3, source: Vec3): boolean {
    if (distance(listener, source) > this.hearingRadius(kind)) return false;
    const level = kind === 'gunfire' ? 1 : this.cfg.footstepAwareness;
    this.awareness = Math.max(this.awareness, level);
    this.drainDelay = this.cfg.drainDelay;
    this.remember(source);
    this.pendingNoise = { x: source.x, y: source.y, z: source.z };
    return true;
  }

  hearingRadius(kind: NoiseKind): number {
    if (kind === 'gunfire') return this.cfg.gunfireHearingRadius;
    return kind === 'sprint' ? this.cfg.sprintHearingRadius : this.cfg.walkHearingRadius;
  }

  /** Returns the noise heard since the last call, if any. */
  consumeNoise(): Vec3 | null {
    const noise = this.pendingNoise;
    this.pendingNoise = null;
    return noise;
  }

  /** Full awareness with a known position: being shot, a radio call, a mission script. */
  forceAware(position: Vec3): void {
    this.awareness = 1;
    this.drainDelay = this.cfg.drainDelay;
    this.remember(position);
    // The next update must look for itself, not reuse a stale "not visible" result.
    this.losTimer = 0;
  }

  setAwareness(value: number): void {
    this.awareness = saturate(value);
  }

  /** Forgets everything. Called when an enemy gives up and goes back to patrolling. */
  calm(): void {
    this.awareness = 0;
    this.lastKnownPosition = null;
    this.pendingNoise = null;
    this.drainDelay = 0;
  }

  private fillMultiplier(): number {
    if (this.mode === 'engaged') return this.cfg.engagedFillMult;
    return this.mode === 'searching' ? this.cfg.searchFillMult : 1;
  }

  private remember(position: Vec3): void {
    if (this.lastKnownPosition) {
      this.lastKnownPosition.x = position.x;
      this.lastKnownPosition.y = position.y;
      this.lastKnownPosition.z = position.z;
    } else {
      this.lastKnownPosition = { x: position.x, y: position.y, z: position.z };
    }
  }
}
