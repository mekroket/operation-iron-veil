/**
 * The mission's hands on the level: resetting and restoring world state, capturing it for a checkpoint,
 * the scripted blast, and the two mission interactables. The decisions stay in MissionDirector.
 */
import type { GameContext, IEnemyDirector, ILevelVisuals, IWeaponDirector } from '../core/contracts';
import type { Vec3 } from '../core/types';
import type { DoorSystem } from '../interaction/DoorSystem';
import type { InteractionSystem } from '../interaction/InteractionSystem';
import type { PickupSystem } from '../interaction/PickupSystem';
import type { LevelDefinition, TriggerZone } from '../levels/types';
import type { CheckpointStats, MissionCheckpoint } from '../save/SaveStore';
import { MISSION_01 } from './canon';
import {
  BLAST_RADIUS,
  BOARD_PROMPT,
  EXTRACTION_HOLD_SECONDS,
  TERMINAL_HOLD_SECONDS,
  TERMINAL_PROMPT,
  findEastExitDoor,
} from './silentBreakwaterScript';

export interface MissionWorldDeps {
  ctx: GameContext;
  level: LevelDefinition;
  enemies: IEnemyDirector;
  weapons: IWeaponDirector;
  visuals: ILevelVisuals;
  doors: DoorSystem;
  pickups: PickupSystem;
  interaction: InteractionSystem;
}

export interface MissionInteraction {
  isEnabled: () => boolean;
  onComplete: () => void;
}

/** PlayerController has this. It is not on IPlayerControl, so it is detected at runtime. */
interface RestorablePlayer {
  restore(position: Vec3, yaw: number, health: number): void;
}

/** A checkpoint never saves the player with less than this share of their health, to avoid a death loop. */
const CHECKPOINT_MIN_HEALTH_FRACTION = 0.5;
/** Level objective positions sit on the floor. The player aims at the screen, this far above it. */
const TERMINAL_SCREEN_HEIGHT = 1.1;
/** Eye reach beyond the extraction zone's own size. */
const EXTRACTION_REACH = 3;

/** The player's body, from feet to eye, overlaps the box. */
export function playerInZone(feet: Vec3, eye: Vec3, zone: TriggerZone): boolean {
  const { center, size } = zone;
  return (
    Math.abs(feet.x - center.x) <= size.x / 2 &&
    Math.abs(feet.z - center.z) <= size.z / 2 &&
    eye.y >= center.y - size.y / 2 &&
    feet.y <= center.y + size.y / 2
  );
}

export class MissionWorld {
  private readonly eastExitId: string | null;

  constructor(private readonly deps: MissionWorldDeps) {
    this.eastExitId = findEastExitDoor(deps.level.doors);
  }

  isPlayerIn(zone: TriggerZone): boolean {
    const { position, eye } = this.deps.ctx.player;
    return playerInZone(position, eye, zone);
  }

  /** Enemies must be reset before any group is reactivated, so call this first. */
  resetFresh(): void {
    const { enemies, doors, pickups, visuals, level, ctx } = this.deps;
    enemies.resetTo([]);
    doors.reset();
    this.setEastExitLocked(true);
    pickups.restore([]);
    visuals.setBlastDamage(false);
    this.placePlayer(level.playerStart.position, level.playerStart.yaw, ctx.player.maxHealth);
  }

  /** Enemies must be reset before any group is reactivated, so call this first. */
  restore(checkpoint: MissionCheckpoint, pastObjective: boolean): void {
    const { enemies, doors, pickups, weapons, visuals } = this.deps;
    enemies.resetTo(checkpoint.defeatedEnemyIds);
    pickups.restore(checkpoint.collectedPickupIds);
    // Past the objective the east exit is always open, even if the save somehow missed it.
    doors.reset();
    const openIds = [...checkpoint.openDoorIds];
    if (pastObjective && this.eastExitId) openIds.push(this.eastExitId);
    doors.restore(openIds);
    this.setEastExitLocked(!pastObjective);
    visuals.setBlastDamage(pastObjective);
    weapons.restoreSaveState(checkpoint.weapons);
    this.placePlayer(checkpoint.playerPosition, checkpoint.playerYaw, checkpoint.health);
  }

  capture(
    point: { id: string; position: Vec3; yaw: number },
    stageId: string,
    firedTriggerIds: string[],
    stats: CheckpointStats,
  ): MissionCheckpoint {
    const { enemies, weapons, doors, pickups, ctx } = this.deps;
    const { player } = ctx;
    return {
      missionId: MISSION_01.id,
      checkpointId: point.id,
      stageId,
      playerPosition: point.position,
      playerYaw: point.yaw,
      health: Math.max(player.health, player.maxHealth * CHECKPOINT_MIN_HEALTH_FRACTION),
      weapons: weapons.getSaveState(),
      defeatedEnemyIds: enemies.getDefeatedIds(),
      collectedPickupIds: pickups.getCollectedIds(),
      openDoorIds: doors.getOpenIds(),
      firedTriggerIds,
      stats,
    };
  }

  /** The scripted charge: damage, the effect, and the quay door released. */
  detonate(): void {
    const { visuals, doors, level, ctx } = this.deps;
    visuals.setBlastDamage(true);
    ctx.bus.emit('fx:explosion', { position: level.blastPoint, radius: BLAST_RADIUS });
    if (this.eastExitId) {
      doors.setLocked(this.eastExitId, false);
      doors.open(this.eastExitId);
    }
  }

  registerTerminal(rules: MissionInteraction): () => void {
    const { position } = this.deps.level.objective;
    return this.deps.interaction.register({
      id: 'mission:terminal',
      position: { x: position.x, y: position.y + TERMINAL_SCREEN_HEIGHT, z: position.z },
      radius: 2.6,
      facingDegrees: 60,
      losMargin: 0.6,
      holdSeconds: TERMINAL_HOLD_SECONDS,
      prompt: TERMINAL_PROMPT,
      ...rules,
    });
  }

  registerExtraction(rules: MissionInteraction): () => void {
    const { position, zone } = this.deps.level.extraction;
    return this.deps.interaction.register({
      id: 'mission:extraction',
      position,
      radius: Math.hypot(zone.size.x, zone.size.z) / 2 + EXTRACTION_REACH,
      facingDegrees: 180,
      requiresLineOfSight: false,
      holdSeconds: EXTRACTION_HOLD_SECONDS,
      prompt: BOARD_PROMPT,
      isEnabled: () => rules.isEnabled() && this.isPlayerIn(zone),
      onComplete: rules.onComplete,
    });
  }

  /** Without PlayerController.restore only health can be applied, and the game must move the player itself. */
  private placePlayer(position: Vec3, yaw: number, health: number): void {
    const { player } = this.deps.ctx;
    const restorable = player as unknown as Partial<RestorablePlayer>;
    if (typeof restorable.restore === 'function') {
      restorable.restore(position, yaw, health);
      return;
    }
    const delta = health - player.health;
    if (delta > 0) player.heal(delta);
    else if (delta < 0 && player.alive) player.takeDamage(-delta, null);
  }

  private setEastExitLocked(locked: boolean): void {
    if (this.eastExitId) this.deps.doors.setLocked(this.eastExitId, locked);
  }
}
