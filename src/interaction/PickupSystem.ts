/** Ammunition and medkits lying in the level. Useless pickups explain why and stay where they are. */
import type { ILevelVisuals, IPlayerControl, IWeaponDirector } from '../core/contracts';
import type { EventBus } from '../core/events';
import type { PickupDef } from '../levels/types';
import type { InteractionSystem } from './InteractionSystem';

export interface PickupSystemDeps {
  pickups: readonly PickupDef[];
  bus: EventBus;
  visuals: ILevelVisuals;
  interaction: InteractionSystem;
  weapons: IWeaponDirector;
  player: IPlayerControl;
}

/** Fraction of each weapon's maximum reserve that one ammo crate refills. */
export const AMMO_PICKUP_FRACTION = 0.4;
/** Health restored by one medkit. */
export const MEDKIT_HEAL = 50;

const PICKUP_REACH = 2.2;
const PICKUP_FACING_DEGREES = 55;

export const PICKUP_LABELS: Record<PickupDef['kind'], string> = {
  ammo: 'Ammunition',
  medkit: 'Medkit',
};

export class PickupSystem {
  private readonly collected = new Set<string>();
  private readonly unregister: (() => void)[] = [];

  constructor(private readonly deps: PickupSystemDeps) {
    for (const def of deps.pickups) {
      this.unregister.push(
        deps.interaction.register({
          id: `pickup:${def.id}`,
          position: def.position,
          radius: PICKUP_REACH,
          facingDegrees: PICKUP_FACING_DEGREES,
          holdSeconds: 0,
          prompt: () => this.promptFor(def),
          isEnabled: () => !this.collected.has(def.id),
          onComplete: () => this.collect(def),
        }),
      );
    }
  }

  getCollectedIds(): string[] {
    return [...this.collected];
  }

  /** Makes exactly these pickups collected and every other one available. */
  restore(ids: readonly string[]): void {
    this.collected.clear();
    for (const id of ids) this.collected.add(id);
    for (const def of this.deps.pickups) this.deps.visuals.setPickupVisible(def.id, !this.collected.has(def.id));
  }

  dispose(): void {
    for (const remove of this.unregister) remove();
    this.unregister.length = 0;
  }

  private canUse(def: PickupDef): boolean {
    const { weapons, player } = this.deps;
    return def.kind === 'ammo' ? weapons.canTakeAmmo() : player.health < player.maxHealth;
  }

  private promptFor(def: PickupDef): string {
    if (def.kind === 'ammo') return this.canUse(def) ? 'Take ammunition' : 'Ammo full';
    return this.canUse(def) ? 'Use medkit' : 'Health full';
  }

  private collect(def: PickupDef): void {
    if (this.collected.has(def.id) || !this.canUse(def)) return;
    if (def.kind === 'ammo') this.deps.weapons.addReserveAmmo(AMMO_PICKUP_FRACTION);
    else this.deps.player.heal(MEDKIT_HEAL);
    this.collected.add(def.id);
    this.deps.visuals.setPickupVisible(def.id, false);
    this.deps.bus.emit('pickup:collected', { kind: def.kind, label: PICKUP_LABELS[def.kind] });
  }
}
