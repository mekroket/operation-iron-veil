/** Runtime state of a single weapon: timers, magazine and reserve. Pure: no Babylon, no DOM. */
import type { WeaponConfig } from './weaponConfigs';

export type WeaponPhase = 'idle' | 'cooldown' | 'reloading' | 'equipping';
export type FireResult = 'fired' | 'cooldown' | 'reloading' | 'equipping' | 'empty';
export type WeaponTransition = 'reloadComplete' | 'equipComplete' | null;

export class WeaponState {
  private magCount: number;
  private reserveCount: number;
  private cooldownLeft = 0;
  /** Time by which the last cooldown overshot this frame, so low frame rates keep the true fire rate. */
  private cooldownCarry = 0;
  private reloadLeft = 0;
  private reloadTotal = 0;
  private reloadWasEmpty = false;
  private equipLeft = 0;

  constructor(readonly config: WeaponConfig) {
    this.magCount = config.magSize;
    this.reserveCount = Math.min(config.startReserve, config.maxReserve);
  }

  get mag(): number {
    return this.magCount;
  }
  get reserve(): number {
    return this.reserveCount;
  }
  get phase(): WeaponPhase {
    if (this.equipLeft > 0) return 'equipping';
    if (this.reloadLeft > 0) return 'reloading';
    return this.cooldownLeft > 0 ? 'cooldown' : 'idle';
  }
  get reloading(): boolean {
    return this.reloadLeft > 0;
  }
  /** Full length of the reload in progress. */
  get reloadDuration(): number {
    return this.reloadTotal;
  }
  /** True when the reload in progress started with an empty magazine. */
  get reloadIsEmpty(): boolean {
    return this.reloadWasEmpty;
  }
  /** Seconds between shots. */
  get shotInterval(): number {
    return 60 / this.config.rpm;
  }
  /** True when a reload would change anything. */
  get canReload(): boolean {
    return this.magCount < this.config.magSize && this.reserveCount > 0;
  }

  /** Spends one round when the weapon is ready. Fire-rate overshoot from the last update carries over. */
  tryFire(): FireResult {
    if (this.equipLeft > 0) return 'equipping';
    if (this.reloadLeft > 0) return 'reloading';
    if (this.magCount <= 0) return 'empty';
    if (this.cooldownLeft > 0) return 'cooldown';
    this.magCount -= 1;
    const next = this.shotInterval - this.cooldownCarry;
    if (next > 0) {
      this.cooldownLeft = next;
      this.cooldownCarry = 0;
    } else {
      // The frame was long enough for another shot straight away.
      this.cooldownLeft = 0;
      this.cooldownCarry = -next;
    }
    return 'fired';
  }

  /** Starts the reload. False when equipping, already reloading, full, or there is nothing to load. */
  startReload(): boolean {
    if (this.equipLeft > 0 || this.reloadLeft > 0 || !this.canReload) return false;
    this.reloadWasEmpty = this.magCount === 0;
    this.reloadTotal = this.reloadWasEmpty ? this.config.reloadEmptySeconds : this.config.reloadTacticalSeconds;
    this.reloadLeft = this.reloadTotal;
    this.cooldownLeft = 0;
    this.cooldownCarry = 0;
    return true;
  }

  /** Abandons a reload in progress. Ammunition only moves when a reload completes, so nothing is lost. */
  cancelReload(): boolean {
    if (this.reloadLeft <= 0) return false;
    this.reloadLeft = 0;
    return true;
  }

  /** Locks the weapon for this long, cancelling any reload. Used for both raising and lowering. */
  beginEquip(seconds: number = this.config.equipSeconds): void {
    this.reloadLeft = 0;
    this.cooldownLeft = 0;
    this.cooldownCarry = 0;
    this.equipLeft = Math.max(0, seconds);
  }

  update(dt: number): WeaponTransition {
    if (this.cooldownLeft > 0) {
      this.cooldownLeft -= dt;
      if (this.cooldownLeft <= 0) {
        this.cooldownCarry = -this.cooldownLeft;
        this.cooldownLeft = 0;
      }
    } else {
      this.cooldownCarry = 0;
    }

    if (this.equipLeft > 0) {
      this.equipLeft -= dt;
      if (this.equipLeft > 0) return null;
      this.equipLeft = 0;
      return 'equipComplete';
    }
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft > 0) return null;
      this.reloadLeft = 0;
      this.finishReload();
      return 'reloadComplete';
    }
    return null;
  }

  /** Adds up to `amount` reserve rounds. Returns how many fitted. */
  addReserve(amount: number): number {
    const added = Math.min(Math.max(0, Math.floor(amount)), this.config.maxReserve - this.reserveCount);
    this.reserveCount += added;
    return added;
  }

  /** Sets ammunition from a save and clears every timer. Corrupt values are clamped into range. */
  restoreAmmo(mag: number, reserve: number): void {
    this.magCount = sanitizeCount(mag, this.config.magSize);
    this.reserveCount = sanitizeCount(reserve, this.config.maxReserve);
    this.reloadLeft = 0;
    this.equipLeft = 0;
    this.cooldownLeft = 0;
    this.cooldownCarry = 0;
  }

  /** Tops the magazine up from reserve. Rounds left in the old magazine are kept, so totals never change. */
  private finishReload(): void {
    const moved = Math.min(this.config.magSize - this.magCount, this.reserveCount);
    this.magCount += moved;
    this.reserveCount -= moved;
  }
}

function sanitizeCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.floor(value)));
}
