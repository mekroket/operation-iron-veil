/**
 * Interfaces between systems. Owners implement these; consumers depend only on these.
 * Changing a signature here is a Technical Director decision.
 */
import type { FreeCamera, Scene } from '../engine/bjs';
import type { GameSettings } from '../settings/settings';
import type { EventBus } from './events';
import type { HitZone, SurfaceType, Vec3, WeaponId } from './types';

export interface WorldHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
  surface: SurfaceType;
}

/** A capsule driven through the static world by Havok. Implemented in src/physics/CharacterBody.ts. */
export interface ICharacterBody {
  /** Position of the capsule's feet. */
  readonly position: Vec3;
  readonly grounded: boolean;
  /** Current vertical speed: negative while falling. Gravity is handled internally. */
  readonly verticalSpeed: number;
  readonly surface: SurfaceType;
  /** Advances by dt. Only x and z of `velocity` are used. A positive `jumpSpeed` launches when grounded. */
  move(dt: number, velocity: Vec3, jumpSpeed?: number): void;
  teleport(feet: Vec3): void;
  /** Returns false when there is no headroom to grow to this height. */
  setHeight(height: number): boolean;
  dispose(): void;
}

export interface IPhysicsWorld {
  /** Closest hit against the static world and closed doors, or null. */
  raycast(from: Vec3, to: Vec3): WorldHit | null;
  /** True when nothing solid lies between the two points. */
  lineOfSight(from: Vec3, to: Vec3): boolean;
  createCharacter(feet: Vec3, height: number, radius: number): ICharacterBody;
}

/** Read-only view of the player for AI, weapons and missions. */
export interface IPlayerView {
  /** Feet position. */
  readonly position: Vec3;
  /** Camera position. */
  readonly eye: Vec3;
  /** Normalised look direction. */
  readonly forward: Vec3;
  readonly velocity: Vec3;
  readonly grounded: boolean;
  readonly crouching: boolean;
  readonly sprinting: boolean;
  readonly alive: boolean;
  readonly health: number;
  readonly maxHealth: number;
}

/** What the weapon system and enemies may do to the player. */
export interface IPlayerControl extends IPlayerView {
  takeDamage(amount: number, sourcePosition: Vec3 | null): void;
  heal(amount: number): void;
  /** Kicks the view: positive pitch looks up, positive yaw turns right. Radians. */
  addRecoil(pitch: number, yaw: number): void;
  /** Multiplier applied to the settings FOV. Used for ADS. */
  setFovMultiplier(multiplier: number): void;
  /** Multiplier applied to look sensitivity. Used for ADS. */
  setLookMultiplier(multiplier: number): void;
  /** Multiplier applied to move speed. Weapons use this for ADS and heavy guns. */
  setSpeedMultiplier(multiplier: number): void;
  /** While true the player cannot start or keep sprinting. */
  setSprintBlocked(blocked: boolean): void;
}

/** Sampled once per frame by src/core/Input.ts. All "Pressed" flags are true for exactly one frame. */
export interface FrameInput {
  /** -1..1, strafe right is positive. */
  moveX: number;
  /** -1..1, forward is positive. */
  moveZ: number;
  /** Raw pointer delta for this frame, in CSS pixels. */
  lookX: number;
  lookY: number;
  fireHeld: boolean;
  firePressed: boolean;
  adsHeld: boolean;
  reloadPressed: boolean;
  sprintHeld: boolean;
  crouchPressed: boolean;
  jumpPressed: boolean;
  interactHeld: boolean;
  interactPressed: boolean;
  /** 0, 1, 2 when a weapon slot key was pressed this frame, else null. */
  slotPressed: number | null;
  /** -1, 0, 1 from the mouse wheel. */
  slotCycle: number;
}

/** One piece of an enemy's hit volume, in world space. */
export interface HitCapsule {
  a: Vec3;
  b: Vec3;
  radius: number;
  zone: HitZone;
}

export interface HitTarget {
  readonly id: string;
  readonly alive: boolean;
  capsules(): readonly HitCapsule[];
  /** Returns the damage actually dealt. */
  applyDamage(damage: number, zone: HitZone, point: Vec3, direction: Vec3): number;
}

export interface IHitTargetProvider {
  getHitTargets(): readonly HitTarget[];
}

/** Handed to gameplay systems when a mission session starts. */
export interface GameContext {
  scene: Scene;
  camera: FreeCamera;
  bus: EventBus;
  world: IPhysicsWorld;
  player: IPlayerControl;
  settings: () => GameSettings;
}

/** Common lifecycle for everything created per session. */
export interface ISystem {
  update(dt: number): void;
  dispose(): void;
}

/** Ammo state, stored in checkpoints. */
export interface WeaponSaveState {
  activeWeapon: WeaponId;
  ammo: Record<WeaponId, { mag: number; reserve: number }>;
}

/** Implemented by src/weapons/WeaponSystem.ts, consumed by the mission layer. */
export interface IWeaponDirector {
  /** False hides the view model and ignores input (cinematics, death). */
  setEnabled(enabled: boolean): void;
  /** Refills reserve ammunition of every weapon by this fraction of its maximum. Returns true if anything was added. */
  addReserveAmmo(fraction: number): boolean;
  /** True if at least one weapon has room for more reserve ammunition. */
  canTakeAmmo(): boolean;
  getSaveState(): WeaponSaveState;
  restoreSaveState(state: WeaponSaveState): void;
}

/** Implemented by src/enemies/EnemyManager.ts, consumed by the mission layer. */
export interface IEnemyDirector extends IHitTargetProvider {
  /** Spawns every not-yet-defeated enemy of the group and starts its patrol. Idempotent. */
  activateGroup(group: string): void;
  /** Puts an active group straight into combat, aware of this position. */
  alertGroup(group: string, lastKnownPosition: Vec3): void;
  /** Alive enemies left in a group, counting those not spawned yet. */
  remainingInGroup(group: string): number;
  /** Ids of every defeated enemy, for checkpoints. */
  getDefeatedIds(): string[];
  /** Removes all enemies then marks these as already defeated. Groups must be reactivated afterwards. */
  resetTo(defeatedIds: readonly string[]): void;
  /** While frozen, enemies neither think nor animate. Used in cinematics and pause. */
  setFrozen(frozen: boolean): void;
  readonly totalEnemies: number;
}

/** AI access to doors. Implemented by src/interaction/DoorSystem.ts. */
export interface INavDoors {
  /** True when the nav link between these two nodes goes through a closed door. */
  isLinkBlocked(nodeA: string, nodeB: string): boolean;
  /** Opens whichever door the link passes through. */
  openLink(nodeA: string, nodeB: string): void;
}

/** Physics half of a door. Implemented by src/physics/PhysicsWorld.ts. */
export interface IDoorBlocker {
  setBlocking(blocking: boolean): void;
}

/** Visual state of the level that gameplay may change. Implemented by src/levels/render/LevelRenderer.ts. */
export interface ILevelVisuals {
  setPickupVisible(id: string, visible: boolean): void;
  /** Slides the door panel. `instant` skips the animation, for checkpoint restores. */
  setDoorOpen(id: string, open: boolean, instant?: boolean): void;
  setObjectiveState(state: 'locked' | 'active' | 'working' | 'done'): void;
  /** Visual damage at the blast point after the scripted detonation. */
  setBlastDamage(active: boolean): void;
}
