/** Counts the run's statistics from bus events. Pure. */
import type { IEnemyDirector } from '../core/contracts';
import type { EventBus } from '../core/events';
import { saturate } from '../core/math';
import type { MissionStats } from '../core/types';
import type { CheckpointStats } from '../save/SaveStore';
import { MISSION_01 } from './canon';
import { computeGrade } from './MissionStateMachine';

const emptyStats = (): CheckpointStats => ({
  elapsedSeconds: 0,
  shotsFired: 0,
  shotsHit: 0,
  headshots: 0,
  deaths: 0,
  checkpointsReached: 0,
});

export class MissionStatsTracker {
  private stats = emptyStats();
  private final: MissionStats | null = null;
  private readonly unsubscribe: (() => void)[];

  /** Shots and hits only count while `isCounting` is true. */
  constructor(
    bus: EventBus,
    private readonly enemies: IEnemyDirector,
    isCounting: () => boolean,
  ) {
    this.unsubscribe = [
      bus.on('weapon:fired', () => {
        if (isCounting()) this.stats.shotsFired += 1;
      }),
      bus.on('combat:enemyHit', () => {
        if (isCounting()) this.stats.shotsHit += 1;
      }),
      bus.on('enemy:killed', (event) => {
        if (isCounting() && event.headshot) this.stats.headshots += 1;
      }),
    ];
  }

  /** Starts over, either from zero or from a checkpoint's numbers. */
  reset(from?: CheckpointStats): void {
    this.stats = from ? { ...from } : emptyStats();
    this.final = null;
  }

  tick(dt: number): void {
    this.stats.elapsedSeconds += dt;
  }

  addDeath(): void {
    this.stats.deaths += 1;
  }

  addCheckpoint(): void {
    this.stats.checkpointsReached += 1;
  }

  snapshot(): CheckpointStats {
    return { ...this.stats };
  }

  /** After freeze() this keeps returning the frozen result. */
  current(): MissionStats {
    if (this.final) return this.final;
    const s = this.stats;
    const enemiesDefeated = this.enemies.getDefeatedIds().length;
    return {
      missionId: MISSION_01.id,
      elapsedSeconds: s.elapsedSeconds,
      enemiesDefeated,
      enemiesTotal: this.enemies.totalEnemies,
      headshots: s.headshots,
      shotsFired: s.shotsFired,
      shotsHit: s.shotsHit,
      accuracy: s.shotsFired > 0 ? saturate(s.shotsHit / s.shotsFired) : 0,
      deaths: s.deaths,
      checkpointsReached: s.checkpointsReached,
      grade: computeGrade({ ...s, enemiesDefeated }),
    };
  }

  /** Locks in the final result, the moment the player boards. */
  freeze(): MissionStats {
    this.final = this.current();
    return this.final;
  }

  dispose(): void {
    for (const remove of this.unsubscribe) remove();
    this.unsubscribe.length = 0;
  }
}
