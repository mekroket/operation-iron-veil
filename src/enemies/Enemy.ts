/** One Black Meridian contractor: glues the brain, the physics capsule, the rig and the game events together. */
import { EnemyBrain } from '../ai/EnemyBrain';
import type { BrainDeps, BrainTarget, ShotRequest } from '../ai/EnemyBrain';
import type { NavGraph } from '../ai/NavGraph';
import type { GameContext, HitCapsule, HitTarget, ICharacterBody, INavDoors } from '../core/contracts';
import { lerp } from '../core/math';
import type { EnemyStateName, HitZone, Vec3 } from '../core/types';
import type { EnemySpawn } from '../levels/types';
import type { AbstractMesh } from '../engine/bjs';
import type { EnemyConfig } from './enemyConfig';
import { EnemyRig } from './EnemyRig';
import type { RigInput } from './EnemyRig';
import type { EnemyRigAssets } from './EnemyRigAssets';

/** What an enemy asks of the group it belongs to. Implemented by EnemyManager. */
export interface EnemySquad {
  isNodeFree(nodeId: string, enemyId: string): boolean;
  claimNode(nodeId: string, enemyId: string): void;
  releaseNode(enemyId: string): void;
  canStartBurst(): boolean;
  alertAllies(caller: Enemy, lastKnown: Vec3): void;
  onKilled(enemy: Enemy): void;
}

export interface EnemySetup {
  ctx: GameContext;
  spawn: EnemySpawn;
  nav: NavGraph;
  doors: INavDoors;
  assets: EnemyRigAssets;
  squad: EnemySquad;
  cfg: EnemyConfig;
  /** 0..1, spreads line-of-sight rays and thinking across frames. */
  phase: number;
}

/** Fraction of the way from feet to eye taken as the player's chest. */
const CHEST_FRACTION = 0.72;
/** How far past the aim point a missed bullet flies, in metres. */
const MISS_OVERSHOOT = 40;
const NO_CAPSULES: readonly HitCapsule[] = [];

const copy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export class Enemy implements HitTarget {
  readonly id: string;
  readonly group: string;
  readonly brain: EnemyBrain;

  private readonly ctx: GameContext;
  private readonly cfg: EnemyConfig;
  private readonly squad: EnemySquad;
  private readonly rig: EnemyRig;
  private readonly body: ICharacterBody;
  private readonly feet: Vec3;

  private health: number;
  private bodyDisposed = false;
  private disposed = false;
  private pushX = 0;
  private pushZ = 0;
  private thinkAccum: number;
  private animAccum = 0;

  private readonly moveVelocity: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly muzzlePoint: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly target: BrainTarget = {
    position: { x: 0, y: 0, z: 0 },
    chest: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    crouching: false,
    sprinting: false,
    alive: true,
  };
  private readonly rigInput: RigInput = {
    forwardSpeed: 0,
    strafeSpeed: 0,
    aiming: false,
    aimPitch: 0,
    crouching: false,
    reloading: false,
    reloadProgress: 0,
    lean: 0,
  };

  private capsulesDirty = true;
  private readonly headPoint: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly chestPoint: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly spinePoint: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly pelvisPoint: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly anklePoint: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly hitCapsules: readonly HitCapsule[];

  constructor(setup: EnemySetup) {
    const { ctx, spawn, cfg, squad } = setup;
    this.ctx = ctx;
    this.cfg = cfg;
    this.squad = squad;
    this.id = spawn.id;
    this.group = spawn.group;
    this.health = cfg.health;
    this.thinkAccum = setup.phase * cfg.lod.midThink;
    this.feet = copy(spawn.position);
    this.body = ctx.world.createCharacter(copy(spawn.position), cfg.body.height, cfg.body.radius);
    this.rig = new EnemyRig(ctx.scene, setup.assets, spawn.id, setup.phase);
    this.rig.setTransform(this.feet, spawn.yaw);
    this.hitCapsules = [
      { a: this.headPoint, b: this.headPoint, radius: cfg.hitbox.headRadius, zone: 'head' },
      { a: this.spinePoint, b: this.chestPoint, radius: cfg.hitbox.torsoRadius, zone: 'torso' },
      { a: this.pelvisPoint, b: this.anklePoint, radius: cfg.hitbox.legsRadius, zone: 'limb' },
    ];
    this.brain = new EnemyBrain(this.createDeps(setup.doors), {
      cfg,
      nav: setup.nav,
      patrol: spawn.patrol,
      home: spawn.position,
      homeYaw: spawn.yaw,
      losPhase: setup.phase,
    });
  }

  get alive(): boolean {
    return this.health > 0;
  }

  /** Feet position. Stays at the corpse after death. */
  get position(): Vec3 {
    return this.feet;
  }

  get state(): EnemyStateName {
    return this.brain.state;
  }

  /** Body parts of this enemy, for shadow casting. */
  get meshes(): readonly AbstractMesh[] {
    return this.rig.meshes;
  }

  eye(): Vec3 {
    return { x: this.feet.x, y: this.feet.y + this.cfg.body.eyeHeight, z: this.feet.z };
  }

  /** Soft push from the separation pass, in metres per second. */
  setPush(x: number, z: number): void {
    this.pushX = x;
    this.pushZ = z;
  }

  /** Only while alive. Corpses use updateCorpse. */
  update(dt: number, thinkInterval: number, animInterval: number): void {
    this.thinkAccum += dt;
    if (this.thinkAccum >= thinkInterval) {
      this.brain.update(this.thinkAccum);
      this.thinkAccum = 0;
    }

    const out = this.brain.output;
    const previousX = this.feet.x;
    const previousZ = this.feet.z;
    this.moveVelocity.x = out.velocity.x + this.pushX;
    this.moveVelocity.z = out.velocity.z + this.pushZ;
    this.body.move(dt, this.moveVelocity);
    const position = this.body.position;
    this.feet.x = position.x;
    this.feet.y = position.y;
    this.feet.z = position.z;
    this.rig.setTransform(this.feet, out.yaw);
    this.capsulesDirty = true;

    this.animAccum += dt;
    if (this.animAccum < animInterval) return;
    const vx = dt > 0 ? (this.feet.x - previousX) / dt : 0;
    const vz = dt > 0 ? (this.feet.z - previousZ) / dt : 0;
    const sin = Math.sin(out.yaw);
    const cos = Math.cos(out.yaw);
    const input = this.rigInput;
    input.forwardSpeed = vx * sin + vz * cos;
    input.strafeSpeed = vx * cos - vz * sin;
    input.aiming = out.weaponRaised && !out.reloading;
    input.aimPitch = out.aimPitch;
    input.crouching = out.crouching;
    input.reloading = out.reloading;
    input.reloadProgress = out.reloadProgress;
    input.lean = out.lean;
    this.rig.update(this.animAccum, input);
    this.animAccum = 0;
  }

  /** Plays the death fall until the body has settled. */
  updateCorpse(dt: number): void {
    if (!this.rig.settled) this.rig.update(dt, this.rigInput);
  }

  capsules(): readonly HitCapsule[] {
    if (!this.alive) return NO_CAPSULES;
    if (this.capsulesDirty) {
      this.rig.readHitPoints(this.headPoint, this.chestPoint, this.spinePoint, this.pelvisPoint);
      this.anklePoint.x = this.feet.x;
      this.anklePoint.y = this.feet.y + 0.1;
      this.anklePoint.z = this.feet.z;
      this.capsulesDirty = false;
    }
    return this.hitCapsules;
  }

  applyDamage(damage: number, zone: HitZone, _point: Vec3, direction: Vec3): number {
    if (!this.alive) return 0;
    const dealt = Math.min(damage, this.health);
    this.health -= dealt;
    const yaw = this.brain.output.yaw;
    if (this.health <= 0) {
      this.die(zone === 'head', direction.x * Math.sin(yaw) + direction.z * Math.cos(yaw) > 0);
    } else {
      this.rig.triggerFlinch(direction.x * Math.cos(yaw) - direction.z * Math.sin(yaw));
      this.brain.onDamaged(copy(this.ctx.player.eye));
    }
    return dealt;
  }

  /** Removes the body and the capsule. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeBody();
    this.rig.dispose();
  }

  private die(headshot: boolean, fallForward: boolean): void {
    this.brain.kill();
    this.disposeBody();
    this.rig.triggerDeath(fallForward);
    this.squad.onKilled(this);
    this.ctx.bus.emit('enemy:killed', { enemyId: this.id, headshot, position: copy(this.feet) });
    this.ctx.bus.emit('enemy:callout', { enemyId: this.id, position: copy(this.feet), kind: 'down' });
  }

  private disposeBody(): void {
    if (this.bodyDisposed) return;
    this.bodyDisposed = true;
    this.body.dispose();
  }

  private createDeps(doors: INavDoors): BrainDeps {
    const { ctx, squad } = this;
    return {
      position: () => this.feet,
      muzzle: () => {
        this.rig.readMuzzle(this.muzzlePoint);
        return this.muzzlePoint;
      },
      target: () => this.readTarget(),
      lineOfSight: (from, to) => ctx.world.lineOfSight(from, to),
      isLinkBlocked: (a, b) => doors.isLinkBlocked(a, b),
      openLink: (a, b) => doors.openLink(a, b),
      isNodeFree: (nodeId) => squad.isNodeFree(nodeId, this.id),
      claimNode: (nodeId) => squad.claimNode(nodeId, this.id),
      releaseNode: () => squad.releaseNode(this.id),
      canStartBurst: () => squad.canStartBurst(),
      alertAllies: (lastKnown) => squad.alertAllies(this, lastKnown),
      fire: (shot) => this.fire(shot),
      callout: (kind) => ctx.bus.emit('enemy:callout', { enemyId: this.id, position: copy(this.feet), kind }),
      stateChanged: (from, to) => ctx.bus.emit('enemy:stateChanged', { enemyId: this.id, from, to }),
      random: Math.random,
    };
  }

  private readTarget(): BrainTarget {
    const player = this.ctx.player;
    const t = this.target;
    const feet = player.position;
    const eye = player.eye;
    t.position.x = feet.x;
    t.position.y = feet.y;
    t.position.z = feet.z;
    t.head.x = eye.x;
    t.head.y = eye.y;
    t.head.z = eye.z;
    t.chest.x = lerp(feet.x, eye.x, CHEST_FRACTION);
    t.chest.y = lerp(feet.y, eye.y, CHEST_FRACTION);
    t.chest.z = lerp(feet.z, eye.z, CHEST_FRACTION);
    t.velocity.x = player.velocity.x;
    t.velocity.y = player.velocity.y;
    t.velocity.z = player.velocity.z;
    t.crouching = player.crouching;
    t.sprinting = player.sprinting;
    t.alive = player.alive;
    return t;
  }

  private fire(shot: ShotRequest): void {
    const { ctx } = this;
    this.rig.triggerRecoil();
    let end = shot.target;
    if (shot.hit) {
      ctx.player.takeDamage(shot.damage, copy(shot.muzzle));
    } else {
      // A miss flies on past the player until something stops it.
      const dx = shot.target.x - shot.muzzle.x;
      const dy = shot.target.y - shot.muzzle.y;
      const dz = shot.target.z - shot.muzzle.z;
      const length = Math.max(Math.hypot(dx, dy, dz), 1e-4);
      const reach = (length + MISS_OVERSHOOT) / length;
      end = { x: shot.muzzle.x + dx * reach, y: shot.muzzle.y + dy * reach, z: shot.muzzle.z + dz * reach };
      const impact = ctx.world.raycast(shot.muzzle, end);
      if (impact) {
        end = copy(impact.point);
        ctx.bus.emit('combat:impact', { point: copy(impact.point), normal: copy(impact.normal), surface: impact.surface });
      }
    }
    ctx.bus.emit('enemy:fired', { enemyId: this.id, muzzle: copy(shot.muzzle), target: copy(end), hitPlayer: shot.hit });
  }
}
