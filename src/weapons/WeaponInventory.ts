/** Three weapon slots, switch timing, ammunition pickups and checkpoints. Pure: no Babylon, no DOM. */
import type { WeaponSaveState } from '../core/contracts';
import { WEAPON_SLOTS } from '../core/types';
import type { WeaponId } from '../core/types';
import { WEAPON_CONFIGS } from './weaponConfigs';
import type { WeaponConfig } from './weaponConfigs';
import { WeaponState } from './WeaponState';

/** What happened during one update. The same object is reused every frame. */
export interface InventoryTick {
  /** The active weapon finished reloading. */
  reloadCompleted: boolean;
  /** The old weapon is fully lowered and the new one became active. */
  swapped: boolean;
}

export class WeaponInventory {
  readonly slots: readonly WeaponState[];
  private activeSlot = 0;
  private pendingSlot: number | null = null;
  private holsterLeft = 0;
  private readonly tick: InventoryTick = { reloadCompleted: false, swapped: false };

  constructor(configs: Readonly<Record<WeaponId, WeaponConfig>> = WEAPON_CONFIGS) {
    this.slots = WEAPON_SLOTS.map((id) => new WeaponState(configs[id]));
  }

  get active(): WeaponState {
    return this.slots[this.activeSlot];
  }
  get activeIndex(): number {
    return this.activeSlot;
  }
  /** True while the current weapon is being lowered for a switch. */
  get switching(): boolean {
    return this.pendingSlot !== null;
  }

  /** Starts lowering the current weapon. Returns true when a new switch began or a pending one was changed. */
  switchToSlot(slot: number): boolean {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.slots.length) return false;
    if (this.pendingSlot !== null) {
      if (slot === this.pendingSlot) return false;
      if (slot === this.activeSlot) {
        // Changed their mind before the old weapon was away: raise it again.
        const lowered = this.active.config.holsterSeconds - this.holsterLeft;
        this.pendingSlot = null;
        this.holsterLeft = 0;
        this.active.beginEquip(lowered);
        return true;
      }
      this.pendingSlot = slot;
      return true;
    }
    if (slot === this.activeSlot) return false;
    this.pendingSlot = slot;
    this.holsterLeft = this.active.config.holsterSeconds;
    // The lock lasts as long as the holster; this also cancels any reload.
    this.active.beginEquip(this.holsterLeft);
    return true;
  }

  /** Moves to the next (+1) or previous (-1) slot, wrapping around. */
  cycle(direction: number): boolean {
    if (direction === 0) return false;
    const from = this.pendingSlot ?? this.activeSlot;
    const count = this.slots.length;
    return this.switchToSlot((from + Math.sign(direction) + count) % count);
  }

  update(dt: number): InventoryTick {
    this.tick.reloadCompleted = false;
    this.tick.swapped = false;
    const transition = this.active.update(dt);
    if (transition === 'reloadComplete') this.tick.reloadCompleted = true;

    if (this.pendingSlot !== null) {
      this.holsterLeft -= dt;
      if (this.holsterLeft <= 0) {
        this.activeSlot = this.pendingSlot;
        this.pendingSlot = null;
        this.holsterLeft = 0;
        this.active.beginEquip();
        this.tick.swapped = true;
      }
    }
    return this.tick;
  }

  /** Adds this fraction of each weapon's maximum reserve. Returns true if anything was added. */
  addReserveFraction(fraction: number): boolean {
    let added = 0;
    for (const weapon of this.slots) {
      added += weapon.addReserve(Math.ceil(weapon.config.maxReserve * Math.max(0, fraction)));
    }
    return added > 0;
  }

  canTakeAmmo(): boolean {
    return this.slots.some((weapon) => weapon.reserve < weapon.config.maxReserve);
  }

  getSaveState(): WeaponSaveState {
    const ammo = {} as WeaponSaveState['ammo'];
    for (const weapon of this.slots) {
      ammo[weapon.config.id] = { mag: weapon.mag, reserve: weapon.reserve };
    }
    return { activeWeapon: this.active.config.id, ammo };
  }

  /** Restores a checkpoint. The active weapon is ready at once, and missing entries keep their current ammo. */
  restore(state: WeaponSaveState): void {
    this.pendingSlot = null;
    this.holsterLeft = 0;
    for (const weapon of this.slots) {
      const saved = state.ammo[weapon.config.id] as WeaponSaveState['ammo'][WeaponId] | undefined;
      weapon.restoreAmmo(saved ? saved.mag : weapon.mag, saved ? saved.reserve : weapon.reserve);
    }
    const slot = this.slots.findIndex((weapon) => weapon.config.id === state.activeWeapon);
    if (slot >= 0) this.activeSlot = slot;
  }
}
