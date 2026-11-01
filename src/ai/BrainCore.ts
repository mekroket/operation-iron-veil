/** State shared by every brain state: dependencies, senses, steering and output. Pure: no Babylon, no DOM. */
import { angleDelta, clamp, damp } from '../core/math';
import type { EnemyStateName, Vec3 } from '../core/types';
import type { EnemyConfig } from '../enemies/enemyConfig';
import { NavFollower } from './NavFollower';
import type { NavDoorsLike } from './NavFollower';
import type { NavGraph } from './NavGraph';
import { Perception } from './Perception';
import type { PerceivedTarget } from './Perception';

export interface BrainTarget extends PerceivedTarget {
  /** Feet. */
  position: Vec3;
  velocity: Vec3;
}

export interface ShotRequest {
  muzzle: Vec3;
  target: Vec3;
  hit: boolean;
  damage: number;
}

export type BrainCallout = 'contact' | 'reloading' | 'search';

/** Everything the brain needs from the outside world. Tests provide fakes. */
export interface BrainDeps extends NavDoorsLike {
  position(): Vec3;
  muzzle(): Vec3;
  target(): BrainTarget;
  lineOfSight(from: Vec3, to: Vec3): boolean;
  isNodeFree(nodeId: string): boolean;
  claimNode(nodeId: string): void;
  releaseNode(): void;
  /** False while too many enemies are already firing. Keeps fights fair. */
  canStartBurst(): boolean;
  alertAllies(lastKnown: Vec3): void;
  fire(shot: ShotRequest): void;
  callout(kind: BrainCallout): void;
  stateChanged(from: EnemyStateName, to: EnemyStateName): void;
  /** 0..1, like Math.random. */
  random(): number;
}

export interface BrainOutput {
  /** Desired world velocity in metres per second; y stays 0. */
  velocity: Vec3;
  yaw: number;
  /** Radians, positive looks up. */
  aimPitch: number;
  weaponRaised: boolean;
  crouching: boolean;
  reloading: boolean;
  /** 0..1 through the current reload. */
  reloadProgress: number;
  /** Leans into the target's sideways motion. -1 left .. 1 right. */
  lean: number;
  bursting: boolean;
}

export interface CombatMemory {
  coverNodeId: string | null;
  moving: boolean;
  repositionTimer: number;
  repositionGap: number;
  losLost: number;
  timeOnTarget: number;
  burstLeft: number;
  shotTimer: number;
  burstCooldown: number;
  reloadLeft: number;
  strafeDir: number;
  strafeTimer: number;
}

export interface InvestigateMemory {
  phase: 'stop' | 'walk' | 'linger';
  timer: number;
  point: Vec3;
}

export interface SearchMemory {
  phase: 'walk' | 'linger';
  timer: number;
  nodes: string[];
}

export interface BrainSetup {
  cfg: EnemyConfig;
  nav: NavGraph;
  /** Nav node ids walked in a loop. Empty means stand guard at home. */
  patrol: readonly string[];
  home: Vec3;
  homeYaw: number;
  /** 0..1, spreads line-of-sight rays of different enemies across frames. */
  losPhase: number;
}

export class BrainCore {
  readonly deps: BrainDeps;
  readonly cfg: EnemyConfig;
  readonly nav: NavGraph;
  readonly perception: Perception;
  readonly follower: NavFollower;
  readonly patrol: readonly string[];
  readonly home: Vec3;
  readonly homeYaw: number;
  readonly out: BrainOutput;
  readonly eye: Vec3 = { x: 0, y: 0, z: 0 };
  readonly forward: Vec3 = { x: 0, y: 0, z: 1 };

  target: BrainTarget;
  patrolIndex = 0;
  /** The next ALERT was passed on by a teammate: no contact callout, no re-broadcast. */
  silentAlert = false;
  /** The next ALERT comes from being shot: react faster. */
  quickReaction = false;
  flinchLeft = 0;
  rounds: number;

  /** Timers for the look-around in IDLE and in patrol pauses. */
  lookTimer = 0;
  lookYaw = 0;
  /** Direction the look-around scans around. */
  baseYaw = 0;
  stateTimer = 0;

  readonly combat: CombatMemory = {
    coverNodeId: null,
    moving: false,
    repositionTimer: 0,
    repositionGap: 0,
    losLost: 0,
    timeOnTarget: 0,
    burstLeft: 0,
    shotTimer: 0,
    burstCooldown: 0,
    reloadLeft: 0,
    strafeDir: 1,
    strafeTimer: 0,
  };
  readonly investigate: InvestigateMemory = { phase: 'stop', timer: 0, point: { x: 0, y: 0, z: 0 } };
  readonly search: SearchMemory = { phase: 'walk', timer: 0, nodes: [] };

  constructor(deps: BrainDeps, setup: BrainSetup) {
    this.deps = deps;
    this.cfg = setup.cfg;
    this.nav = setup.nav;
    this.patrol = setup.patrol.filter((id) => setup.nav.node(id) !== undefined);
    this.home = { x: setup.home.x, y: setup.home.y, z: setup.home.z };
    this.homeYaw = setup.homeYaw;
    this.lookYaw = setup.homeYaw;
    this.rounds = setup.cfg.burst.magSize;
    this.target = deps.target();
    this.follower = new NavFollower(setup.nav, deps);
    this.perception = new Perception(setup.cfg.perception, (from, to) => deps.lineOfSight(from, to), setup.losPhase);
    this.out = {
      velocity: { x: 0, y: 0, z: 0 },
      yaw: setup.homeYaw,
      aimPitch: 0,
      weaponRaised: false,
      crouching: false,
      reloading: false,
      reloadProgress: 0,
      lean: 0,
      bursting: false,
    };
  }

  /** Refreshes eye, facing and target, then runs perception. */
  sense(dt: number): void {
    const position = this.deps.position();
    this.eye.x = position.x;
    this.eye.z = position.z;
    this.eye.y = position.y + (this.out.crouching ? this.cfg.body.crouchEyeHeight : this.cfg.body.eyeHeight);
    this.forward.x = Math.sin(this.out.yaw);
    this.forward.z = Math.cos(this.out.yaw);
    this.target = this.deps.target();
    this.perception.update(dt, this.eye, this.forward, this.target);
  }

  random(min: number, max: number): number {
    return min + (max - min) * this.deps.random();
  }

  stopMoving(): void {
    this.out.velocity.x = 0;
    this.out.velocity.z = 0;
  }

  turnTo(yaw: number, rate: number, dt: number): void {
    const step = rate * dt;
    this.out.yaw += clamp(angleDelta(this.out.yaw, yaw), -step, step);
  }

  /** Turns to face a point and pitches the aim at it. */
  lookAt(point: Vec3, rate: number, dt: number): void {
    const dx = point.x - this.eye.x;
    const dz = point.z - this.eye.z;
    if (dx * dx + dz * dz > 1e-4) this.turnTo(Math.atan2(dx, dz), rate, dt);
    const pitch = Math.atan2(point.y - this.eye.y, Math.hypot(dx, dz));
    this.out.aimPitch = damp(this.out.aimPitch, pitch, 8, dt);
  }

  /** Level the gaze again. */
  relaxPitch(dt: number): void {
    this.out.aimPitch = damp(this.out.aimPitch, 0, 4, dt);
  }

  /** Follows the current path. Returns true on arrival, or when there is nothing to follow. */
  steer(dt: number, speed: number, faceMovement: boolean): boolean {
    const status = this.follower.update(dt, this.deps.position(), this.cfg.patrol.arriveRadius);
    if (status !== 'moving') {
      this.stopMoving();
      return status === 'arrived';
    }
    this.out.velocity.x = this.follower.dirX * speed;
    this.out.velocity.z = this.follower.dirZ * speed;
    if (faceMovement) {
      this.turnTo(Math.atan2(this.follower.dirX, this.follower.dirZ), this.cfg.speed.turn, dt);
      this.relaxPitch(dt);
    }
    return false;
  }

  /** Slow scan left and right around a base direction. */
  lookAround(baseYaw: number, dt: number): void {
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      const arc = this.cfg.idle.lookArc;
      this.lookYaw = baseYaw + this.random(-arc, arc);
      this.lookTimer = this.random(this.cfg.idle.lookMin, this.cfg.idle.lookMax);
    }
    this.turnTo(this.lookYaw, this.cfg.speed.turn * 0.4, dt);
    this.relaxPitch(dt);
  }
}
