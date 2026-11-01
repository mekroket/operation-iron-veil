/**
 * Runs Silent Breakwater: watches trigger zones, drives the stages, saves checkpoints and handles the
 * transfer and extraction set pieces. It has no Babylon imports, so plain fakes can test it.
 * It does not drive InteractionSystem: the game calls interaction.update() itself with the frame's input.
 */
import type { MissionStats, Vec3 } from '../core/types';
import type { MissionCheckpoint, SaveStore } from '../save/SaveStore';
import { MISSION_01 } from './canon';
import { MissionCues } from './MissionCues';
import { MissionStateMachine, TRIGGER_FLOORS, isStageId, stageIndex } from './MissionStateMachine';
import type { StageDefinition, StageEnterInfo, StageId } from './MissionStateMachine';
import { MissionStatsTracker } from './MissionStatsTracker';
import { MissionWorld } from './MissionWorld';
import type { MissionWorldDeps } from './MissionWorld';
import * as S from './silentBreakwaterScript';

export interface MissionDirectorDeps extends MissionWorldDeps {
  save: SaveStore;
}

/** The results screen waits for the closing radio, but never longer than this. */
const OUTRO_TIMEOUT_SECONDS = 30;

const EXFIL_INDEX = stageIndex('exfil');
const OBJECTIVE_INDEX = stageIndex('objective');
const ANNEX_INDEX = stageIndex('annex');

export class MissionDirector {
  /** Fires with the same stats as 'mission:complete', once the closing radio has finished. */
  onComplete: ((stats: MissionStats) => void) | null = null;
  onFailed: ((reason: string) => void) | null = null;
  /** Fires the moment the player boards, before the closing radio. Start the extraction cinematic here. */
  onBoarded: (() => void) | null = null;

  private readonly sm: MissionStateMachine;
  private readonly cues: MissionCues;
  private readonly tracker: MissionStatsTracker;
  private readonly world: MissionWorld;
  private readonly cleanups: (() => void)[] = [];
  private started = false;
  private target: Vec3 | null = null;
  private stageElapsed = 0;
  /** Null until the terminal has been used. */
  private transferElapsed: number | null = null;
  private realertIn = 0;
  private outroLeft = 0;
  private completionSent = false;

  constructor(private readonly deps: MissionDirectorDeps) {
    const { ctx, level, enemies } = deps;
    const stages: StageDefinition[] = S.STAGE_SCRIPT.map((stage) => ({ id: stage.id, objective: stage.objective }));
    this.sm = new MissionStateMachine(stages, {
      onEnter: (stage, info) => this.handleStageEnter(stage, info),
      onFailed: (reason) => this.handleFailed(reason),
    });
    this.cues = new MissionCues({
      bus: ctx.bus,
      enemies,
      level,
      playerPosition: () => ctx.player.position,
      currentStageIndex: () => this.sm.index,
    });
    this.tracker = new MissionStatsTracker(ctx.bus, enemies, () => this.sm.status === 'running');
    this.world = new MissionWorld(deps);
    this.cleanups.push(
      ctx.bus.on('player:died', () => this.handleDeath()),
      () => this.tracker.dispose(),
      this.world.registerTerminal({
        isEnabled: () => this.sm.status === 'running' && this.transferElapsed === null && this.sm.index < EXFIL_INDEX,
        onComplete: () => this.startTransfer(),
      }),
      this.world.registerExtraction({
        isEnabled: () => this.sm.status === 'running' && this.sm.index >= EXFIL_INDEX,
        onComplete: () => this.board(),
      }),
    );
  }

  get stageId(): StageId {
    return this.sm.stageId;
  }

  get objectiveTarget(): Vec3 | null {
    return this.target;
  }

  /** Seconds until the copy finishes, or null when no transfer is running. */
  get transferSecondsLeft(): number | null {
    if (this.transferElapsed === null || this.cues.has(S.TRANSFER_COMPLETE)) return null;
    return Math.max(0, S.TRANSFER_SECONDS - this.transferElapsed);
  }

  /** Call again to retry. A checkpoint that belongs elsewhere is ignored and the mission starts fresh. */
  start(fromCheckpoint: MissionCheckpoint | null): void {
    const { enemies, weapons, interaction } = this.deps;
    this.completionSent = false;
    this.transferElapsed = null;
    this.started = true;
    enemies.setFrozen(false);
    weapons.setEnabled(true);
    interaction.reset();

    const checkpoint = fromCheckpoint && fromCheckpoint.missionId === MISSION_01.id ? fromCheckpoint : null;
    const stage = checkpoint?.stageId;
    if (checkpoint && isStageId(stage) && stage !== 'complete') {
      this.tracker.reset(checkpoint.stats);
      this.world.restore(checkpoint, stageIndex(stage) >= EXFIL_INDEX);
      this.cues.reset(checkpoint.firedTriggerIds);
      this.sm.restore(stage);
    } else {
      this.tracker.reset();
      this.world.resetFresh();
      this.cues.reset();
      this.sm.start();
    }
  }

  update(dt: number): void {
    if (!this.started || this.sm.status === 'failed' || this.sm.status === 'idle') return;
    this.cues.radio.update(dt);
    if (this.sm.status === 'complete') {
      this.updateOutro(dt);
      return;
    }
    this.tracker.tick(dt);
    this.stageElapsed += dt;
    if (!this.deps.ctx.player.alive) return;

    this.checkTriggers();
    const auto = S.STAGE_SCRIPT[this.sm.index].autoAdvance;
    if (auto && this.stageElapsed >= auto.after) this.sm.signal(auto.signal);
    this.updateTransfer(dt);
    this.cues.checkClearedGroups(dt);

    const stage = this.sm.stageId;
    const elapsed = this.stageElapsed;
    const terminalUnused = this.transferElapsed === null;
    this.cues.playBeats(
      (cue) => cue.kind === 'stageTimer' && cue.stage === stage && elapsed >= cue.after && (stage !== 'objective' || terminalUnused),
    );
  }

  getStats(): MissionStats {
    return this.tracker.current();
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.cues.radio.clear();
    this.started = false;
  }

  private handleStageEnter(stage: StageDefinition, info: StageEnterInfo): void {
    this.stageElapsed = 0;
    this.target = S.STAGE_SCRIPT[stageIndex(stage.id)].target(this.deps.level);
    this.syncTerminalVisual();
    this.emitObjective();
    if (!info.restored) this.cues.playBeats((cue) => cue.kind === 'stage' && cue.stage === stage.id);
  }

  private handleFailed(reason: string): void {
    this.cues.radio.clear();
    this.deps.ctx.bus.emit('mission:failed', { reason });
    this.onFailed?.(reason);
  }

  private handleDeath(): void {
    if (this.sm.status !== 'running') return;
    this.tracker.addDeath();
    // Retrying rewinds the stats to the checkpoint, so the death is written into the save as well.
    const { save } = this.deps;
    const saved = save.loadCheckpoint();
    if (saved && saved.missionId === MISSION_01.id) {
      save.saveCheckpoint({ ...saved, stats: { ...saved.stats, deaths: saved.stats.deaths + 1 } });
    }
    this.sm.fail(S.FAILURE_REASON);
  }

  private syncTerminalVisual(): void {
    const index = this.sm.index;
    const { visuals } = this.deps;
    if (index > OBJECTIVE_INDEX) visuals.setObjectiveState('done');
    else if (this.transferElapsed !== null) visuals.setObjectiveState('working');
    else visuals.setObjectiveState(index >= ANNEX_INDEX ? 'active' : 'locked');
  }

  private emitObjective(): void {
    this.deps.ctx.bus.emit('mission:objective', {
      stageId: this.sm.stageId,
      text: this.sm.objective,
      index: this.sm.index,
      total: this.sm.total,
      targetPosition: this.target,
    });
  }

  private checkTriggers(): void {
    const { level } = this.deps;
    for (const zone of level.triggers) {
      if (this.cues.has(zone.id) || !this.world.isPlayerIn(zone) || this.isWaitingForObjective(zone.id)) continue;
      this.fireTrigger(zone.id);
    }
    if (this.sm.index >= EXFIL_INDEX && this.world.isPlayerIn(level.extraction.zone)) {
      this.sm.applyTrigger('extraction_zone');
    }
  }

  /** Zones beyond the objective stay unfired until it is done, so they still count when the player returns. */
  private isWaitingForObjective(triggerId: string): boolean {
    if (!Object.hasOwn(TRIGGER_FLOORS, triggerId)) return false;
    return stageIndex(TRIGGER_FLOORS[triggerId]) > OBJECTIVE_INDEX && this.sm.index <= OBJECTIVE_INDEX;
  }

  private fireTrigger(id: string): void {
    this.cues.markSkippedTriggers(id);
    this.cues.mark(id);
    this.cues.applyGroupAction(id, true);
    this.sm.applyTrigger(id);
    this.cues.playBeats((cue) => cue.kind === 'trigger' && cue.id === id);
    const checkpoint = this.deps.level.checkpoints.find((def) => def.trigger === id);
    // Mid-transfer checkpoints are skipped: restoring one would lose the copy's radio beats.
    if (!checkpoint || this.transferSecondsLeft !== null) return;
    this.tracker.addCheckpoint();
    this.deps.save.saveCheckpoint(this.world.capture(checkpoint, this.sm.stageId, this.cues.firedIds(), this.tracker.snapshot()));
    this.deps.ctx.bus.emit('mission:checkpoint', { checkpointId: checkpoint.id });
  }

  private startTransfer(): void {
    if (this.transferElapsed !== null) return;
    this.transferElapsed = 0;
    this.realertIn = S.TRANSFER_REALERT_SECONDS;
    // Reaching the terminal proves the player got past every zone before it, touched or not.
    this.cues.markSkippedTriggers('server_room');
    this.cues.mark('server_room');
    this.sm.signal('terminal_used');
    this.sm.setObjectiveText(S.TRANSFER_OBJECTIVE);
    this.syncTerminalVisual();
    this.emitObjective();
    this.cues.mark(S.TRANSFER_STARTED);
    this.cues.applyGroupAction(S.TRANSFER_STARTED, true);
    this.cues.playBeats((cue) => cue.kind === 'event' && cue.event === 'terminal_started');
  }

  private updateTransfer(dt: number): void {
    if (this.transferElapsed === null || this.cues.has(S.TRANSFER_COMPLETE)) return;
    this.transferElapsed += dt;
    const elapsed = this.transferElapsed;
    this.cues.playBeats((cue) => cue.kind === 'transfer' && elapsed >= cue.after);

    this.realertIn -= dt;
    if (this.realertIn <= 0) {
      this.realertIn = S.TRANSFER_REALERT_SECONDS;
      const { enemies, ctx } = this.deps;
      for (const group of S.TRANSFER_HUNTERS) {
        if (enemies.remainingInGroup(group) > 0) enemies.alertGroup(group, ctx.player.position);
      }
    }
    if (elapsed >= S.TRANSFER_SECONDS) this.completeTransfer();
  }

  private completeTransfer(): void {
    this.cues.mark(S.TRANSFER_COMPLETE);
    this.world.detonate();
    this.cues.applyGroupAction(S.TRANSFER_COMPLETE, true);
    this.sm.signal('transfer_complete');
    this.cues.playBeats((cue) => cue.kind === 'event' && cue.event === 'transfer_complete');
  }

  private board(): void {
    const { enemies, weapons, save } = this.deps;
    this.sm.applyTrigger('extraction_zone');
    if (!this.sm.signal('boarded')) return;
    const stats = this.tracker.freeze();
    this.outroLeft = OUTRO_TIMEOUT_SECONDS;
    enemies.setFrozen(true);
    weapons.setEnabled(false);
    save.recordCompletion(stats.grade);
    save.clearCheckpoint();
    this.cues.playBeats((cue) => cue.kind === 'event' && cue.event === 'boarded');
    this.onBoarded?.();
  }

  private updateOutro(dt: number): void {
    if (this.completionSent) return;
    this.outroLeft -= dt;
    if (!this.cues.radio.idle && this.outroLeft > 0) return;
    this.completionSent = true;
    const stats = this.tracker.current();
    this.deps.ctx.bus.emit('mission:complete', stats);
    this.onComplete?.(stats);
  }
}
