import type { EnemyStateName, HitZone, MissionStats, SurfaceType, Vec3, WeaponId } from './types';

/** Every cross-system message in the game. Audio, VFX and HUD are driven only by these. */
export interface GameEvents {
  // Weapons
  'weapon:fired': { weaponId: WeaponId; origin: Vec3; direction: Vec3; muzzle: Vec3 };
  'weapon:dry': { weaponId: WeaponId };
  'weapon:reloadStart': { weaponId: WeaponId; duration: number; empty: boolean };
  'weapon:reloadEnd': { weaponId: WeaponId };
  'weapon:switched': { weaponId: WeaponId };
  /** Emitted whenever anything the HUD shows about the active weapon changes. */
  'weapon:hud': {
    weaponId: WeaponId;
    displayName: string;
    mag: number;
    magSize: number;
    reserve: number;
    reloading: boolean;
    fireMode: string;
    slots: readonly { weaponId: WeaponId; displayName: string; active: boolean }[];
  };
  'weapon:ads': { active: boolean };

  // Combat
  'combat:impact': { point: Vec3; normal: Vec3; surface: SurfaceType };
  'combat:enemyHit': { enemyId: string; zone: HitZone; damage: number; killed: boolean; point: Vec3; direction: Vec3 };

  // Enemies
  'enemy:fired': { enemyId: string; muzzle: Vec3; target: Vec3; hitPlayer: boolean };
  'enemy:stateChanged': { enemyId: string; from: EnemyStateName; to: EnemyStateName };
  'enemy:killed': { enemyId: string; headshot: boolean; position: Vec3 };
  'enemy:callout': { enemyId: string; position: Vec3; kind: 'contact' | 'reloading' | 'search' | 'down' };

  // Player
  'player:damaged': { amount: number; health: number; maxHealth: number; sourcePosition: Vec3 | null };
  'player:healed': { health: number; maxHealth: number };
  'player:died': Record<string, never>;
  'player:footstep': { position: Vec3; surface: SurfaceType; pace: 'crouch' | 'walk' | 'sprint' };
  'player:jumped': Record<string, never>;
  'player:landed': { impactSpeed: number };

  // Interaction
  /** text=null hides the prompt. holdProgress is 0..1 while a hold interaction is in progress. */
  'interaction:prompt': { text: string | null; holdProgress: number };
  'pickup:collected': { kind: 'ammo' | 'medkit'; label: string };
  'door:moved': { position: Vec3; opening: boolean };

  // Mission
  'mission:objective': { stageId: string; text: string; index: number; total: number; targetPosition: Vec3 | null };
  'mission:radio': { speaker: string; text: string; duration: number };
  'mission:checkpoint': { checkpointId: string };
  'mission:complete': MissionStats;
  'mission:failed': { reason: string };

  // Effects
  'fx:explosion': { position: Vec3; radius: number };

  // UI
  'ui:hover': Record<string, never>;
  'ui:click': Record<string, never>;
}

export type GameEventName = keyof GameEvents;
type Listener<K extends GameEventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private readonly listeners = new Map<GameEventName, Set<Listener<GameEventName>>>();

  /** Returns the unsubscribe function. */
  on<K extends GameEventName>(name: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener as unknown as Listener<GameEventName>);
    return () => set.delete(listener as unknown as Listener<GameEventName>);
  }

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      (listener as unknown as Listener<K>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
