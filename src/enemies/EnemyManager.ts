/** Owns every contractor of a session: spawning, shared noise, separation, update LOD and checkpoint resets. */
import { NavGraph } from '../ai/NavGraph';
import type { GameContext, HitTarget, IEnemyDirector, INavDoors } from '../core/contracts';
import { distanceXZ } from '../core/math';
import type { Vec3 } from '../core/types';
import type { AbstractMesh } from '../engine/bjs';
import type { EnemySpawn, LevelDefinition } from '../levels/types';
import { resolveGraphics } from '../settings/settings';
import { Enemy } from './Enemy';
import type { EnemySquad } from './Enemy';
import { ENEMY_CONFIG } from './enemyConfig';
import type { EnemyConfig } from './enemyConfig';
import { EnemyRigAssets } from './EnemyRigAssets';

export type ShadowCasterHook = (meshes: readonly AbstractMesh[]) => void;

/** Multiplier that spreads phases evenly over 0..1 however many enemies spawn (golden ratio). */
const PHASE_STEP = 0.618034;

export class EnemyManager implements IEnemyDirector, EnemySquad {
  private readonly ctx: GameContext;
  private readonly level: LevelDefinition;
  private readonly doors: INavDoors;
  private readonly cfg: EnemyConfig = ENEMY_CONFIG;
  private readonly nav: NavGraph;
  private readonly assets: EnemyRigAssets;

  private enemies: Enemy[] = [];
  private hitTargets: readonly HitTarget[] = [];
  private readonly spawnedIds = new Set<string>();
  private readonly defeated = new Set<string>();
  /** Cover node id to the enemy holding it, and back. */
  private readonly nodeOwner = new Map<string, string>();
  private readonly claimedNode = new Map<string, string>();
  private readonly unsubscribers: (() => void)[] = [];
  private shadowHook: ShadowCasterHook | null = null;
  private frozen = false;
  private disposed = false;
  private spawnCounter = 0;

  constructor(ctx: GameContext, level: LevelDefinition, doors: INavDoors) {
    this.ctx = ctx;
    this.level = level;
    this.doors = doors;
    this.nav = new NavGraph(level.nav);
    this.assets = new EnemyRigAssets(ctx.scene, resolveGraphics(ctx.settings().graphics).maxLights);
    this.unsubscribers.push(
      ctx.bus.on('weapon:fired', (shot) => this.onNoise('gunfire', shot.origin)),
      ctx.bus.on('player:footstep', (step) => {
        if (step.pace === 'sprint') this.onNoise('sprint', step.position);
        else if (step.pace === 'walk') this.onNoise('walk', step.position);
      }),
    );
  }

  get totalEnemies(): number {
    return this.level.enemies.length;
  }

  /** Spawned enemies still alive. */
  get aliveActiveCount(): number {
    return this.hitTargets.length;
  }

  /** Shared source meshes, which is where every enemy instance gets its lights from. */
  get lightReceivers(): readonly AbstractMesh[] {
    return this.assets.sourceMeshes;
  }

  /** Body parts of every spawned enemy, corpses included. */
  get shadowCasters(): readonly AbstractMesh[] {
    return this.enemies.flatMap((enemy) => [...enemy.meshes]);
  }

  /** Called with the meshes of each enemy as it spawns, and now for those already out. Disposal cleans itself up. */
  setShadowCasterHook(hook: ShadowCasterHook | null): void {
    this.shadowHook = hook;
    if (!hook) return;
    for (const enemy of this.enemies) hook(enemy.meshes);
  }

  getHitTargets(): readonly HitTarget[] {
    return this.hitTargets;
  }

  activateGroup(group: string): void {
    if (this.disposed) return;
    let added = false;
    for (const spawn of this.level.enemies) {
      if (spawn.group !== group || this.defeated.has(spawn.id) || this.spawnedIds.has(spawn.id)) continue;
      this.spawn(spawn);
      added = true;
    }
    if (added) this.refreshHitTargets();
  }

  /** Groups that have not been activated have nobody to alert, so this does nothing for them. */
  alertGroup(group: string, lastKnownPosition: Vec3): void {
    for (const enemy of this.enemies) {
      if (enemy.group === group && enemy.alive) enemy.brain.forceCombat(lastKnownPosition);
    }
  }

  remainingInGroup(group: string): number {
    let count = 0;
    for (const spawn of this.level.enemies) {
      if (spawn.group === group && !this.defeated.has(spawn.id)) count++;
    }
    return count;
  }

  getDefeatedIds(): string[] {
    return [...this.defeated];
  }

  resetTo(defeatedIds: readonly string[]): void {
    this.removeAllEnemies();
    this.defeated.clear();
    for (const id of defeatedIds) this.defeated.add(id);
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  update(dt: number): void {
    if (this.frozen || this.disposed || dt <= 0) return;
    this.updateSeparation();

    const lod = this.cfg.lod;
    const player = this.ctx.player.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        enemy.updateCorpse(dt);
        continue;
      }
      const state = enemy.state;
      const fighting = state === 'COMBAT' || state === 'ALERT';
      const distance = distanceXZ(enemy.position, player);
      let think = 0;
      let anim = 0;
      let los = this.cfg.perception.losInterval;
      if (distance > lod.farDistance && !fighting) {
        think = lod.farThink;
        anim = lod.farAnim;
        los = lod.farLos;
      } else if (distance > lod.midDistance) {
        think = lod.midThink;
        anim = lod.midAnim;
        los = lod.midLos;
      }
      enemy.brain.perception.setLosInterval(los);
      enemy.update(dt, think, anim);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.removeAllEnemies();
    this.assets.dispose();
    this.shadowHook = null;
  }

  // EnemySquad

  isNodeFree(nodeId: string, enemyId: string): boolean {
    const owner = this.nodeOwner.get(nodeId);
    return owner === undefined || owner === enemyId;
  }

  claimNode(nodeId: string, enemyId: string): void {
    this.releaseNode(enemyId);
    this.nodeOwner.set(nodeId, enemyId);
    this.claimedNode.set(enemyId, nodeId);
  }

  releaseNode(enemyId: string): void {
    const nodeId = this.claimedNode.get(enemyId);
    if (nodeId === undefined) return;
    this.claimedNode.delete(enemyId);
    this.nodeOwner.delete(nodeId);
  }

  canStartBurst(): boolean {
    let firing = 0;
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.brain.output.bursting) firing++;
    }
    return firing < this.cfg.burst.maxSimultaneous;
  }

  /** Teammates hear a callout within short range, or further when they can see the caller. */
  alertAllies(caller: Enemy, lastKnown: Vec3): void {
    const alert = this.cfg.alert;
    for (const enemy of this.enemies) {
      if (enemy === caller || !enemy.alive) continue;
      const distance = distanceXZ(caller.position, enemy.position);
      if (distance > alert.allyRadius) continue;
      if (distance <= alert.allyShortRange || this.ctx.world.lineOfSight(caller.eye(), enemy.eye())) {
        enemy.brain.notifyAllyAlert(lastKnown);
      }
    }
  }

  onKilled(enemy: Enemy): void {
    this.defeated.add(enemy.id);
    this.releaseNode(enemy.id);
    this.refreshHitTargets();
  }

  private spawn(spawn: EnemySpawn): void {
    const phase = (this.spawnCounter++ * PHASE_STEP) % 1;
    const enemy = new Enemy({
      ctx: this.ctx,
      spawn,
      nav: this.nav,
      doors: this.doors,
      assets: this.assets,
      squad: this,
      cfg: this.cfg,
      phase,
    });
    this.enemies.push(enemy);
    this.spawnedIds.add(spawn.id);
    this.shadowHook?.(enemy.meshes);
  }

  /** A fresh array each time, so a kill during a weapon's loop over the targets cannot disturb it. */
  private refreshHitTargets(): void {
    this.hitTargets = this.enemies.filter((enemy) => enemy.alive);
  }

  private removeAllEnemies(): void {
    for (const enemy of this.enemies) enemy.dispose();
    this.enemies = [];
    this.hitTargets = [];
    this.spawnedIds.clear();
    this.nodeOwner.clear();
    this.claimedNode.clear();
  }

  private onNoise(kind: 'gunfire' | 'sprint' | 'walk', source: Vec3): void {
    if (this.frozen) return;
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.brain.hear(kind, source);
    }
  }

  /** Soft push so nobody stands inside a teammate or the player. */
  private updateSeparation(): void {
    const { enemyRadius, playerRadius, pushSpeed } = this.cfg.separation;
    const list = this.enemies;
    const player = this.ctx.player.position;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      let pushX = 0;
      let pushZ = 0;
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (i === j || !b.alive) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d >= enemyRadius) continue;
        const strength = (1 - d / enemyRadius) * pushSpeed;
        // Exactly overlapping: the index order picks the sides.
        pushX += d > 1e-4 ? (dx / d) * strength : i < j ? strength : -strength;
        pushZ += d > 1e-4 ? (dz / d) * strength : 0;
      }
      const dx = a.position.x - player.x;
      const dz = a.position.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < playerRadius && d > 1e-4) {
        const strength = (1 - d / playerRadius) * pushSpeed;
        pushX += (dx / d) * strength;
        pushZ += (dz / d) * strength;
      }
      a.setPush(pushX, pushZ);
    }
  }
}
