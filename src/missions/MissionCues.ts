/**
 * Everything that happens once and must not happen again after a restore: fired triggers, woken enemy
 * groups, cleared groups and radio beats. The set of fired ids is what a checkpoint stores.
 */
import type { IEnemyDirector } from '../core/contracts';
import type { EventBus } from '../core/events';
import type { Vec3 } from '../core/types';
import type { LevelDefinition } from '../levels/types';
import { stageIndex } from './MissionStateMachine';
import { RadioQueue } from './RadioQueue';
import { GROUP_ACTIONS, RADIO_BEATS, TRIGGER_ORDER } from './silentBreakwaterScript';
import type { RadioCue } from './silentBreakwaterScript';

export interface MissionCuesDeps {
  bus: EventBus;
  enemies: IEnemyDirector;
  level: LevelDefinition;
  playerPosition: () => Vec3;
  currentStageIndex: () => number;
}

/** Seconds between checks for cleared groups. */
const CLEARED_CHECK_SECONDS = 0.25;

export class MissionCues {
  readonly radio: RadioQueue;
  /** Trigger ids, mission events, 'cleared:<group>' and 'beat:<id>'. */
  private readonly fired = new Set<string>();
  private readonly activeGroups = new Set<string>();
  private clearedCheckIn = 0;

  constructor(private readonly deps: MissionCuesDeps) {
    this.radio = new RadioQueue((line) => deps.bus.emit('mission:radio', line));
  }

  /** Forgets everything, then re-applies these ids silently. Enemy groups wake but are not alerted. */
  reset(firedIds: readonly string[] = []): void {
    this.radio.clear();
    this.fired.clear();
    this.activeGroups.clear();
    this.clearedCheckIn = 0;
    for (const id of firedIds) {
      this.fired.add(id);
      this.applyGroupAction(id, false);
    }
  }

  has(id: string): boolean {
    return this.fired.has(id);
  }

  mark(id: string): void {
    this.fired.add(id);
  }

  firedIds(): string[] {
    return [...this.fired];
  }

  applyGroupAction(id: string, alert: boolean): void {
    if (!Object.hasOwn(GROUP_ACTIONS, id)) return;
    const { enemies, level } = this.deps;
    const action = GROUP_ACTIONS[id];
    for (const group of action.activate) {
      enemies.activateGroup(group);
      if (level.enemies.some((enemy) => enemy.group === group)) this.activeGroups.add(group);
    }
    if (!alert) return;
    for (const group of action.alert ?? []) enemies.alertGroup(group, this.deps.playerPosition());
  }

  /** Zones before this one that the player missed: they wake their enemies, but stay silent and do not save. */
  markSkippedTriggers(id: string): void {
    const order = TRIGGER_ORDER.indexOf(id);
    for (let i = 0; i < order; i += 1) {
      const earlier = TRIGGER_ORDER[i];
      if (this.fired.has(earlier)) continue;
      this.fired.add(earlier);
      this.applyGroupAction(earlier, false);
    }
  }

  /** Queues each matching beat once. A beat whose moment has passed is used up without playing. */
  playBeats(matches: (cue: RadioCue) => boolean): void {
    for (const beat of RADIO_BEATS) {
      if (!matches(beat.cue)) continue;
      const key = `beat:${beat.id}`;
      if (this.fired.has(key)) continue;
      this.fired.add(key);
      if (beat.until && this.deps.currentStageIndex() > stageIndex(beat.until)) continue;
      this.radio.enqueue(beat.critical ? beat.lines.map((line) => ({ ...line, critical: true })) : beat.lines);
    }
  }

  checkClearedGroups(dt: number): void {
    this.clearedCheckIn -= dt;
    if (this.clearedCheckIn > 0) return;
    this.clearedCheckIn = CLEARED_CHECK_SECONDS;
    for (const group of this.activeGroups) {
      const key = `cleared:${group}`;
      if (this.fired.has(key) || this.deps.enemies.remainingInGroup(group) > 0) continue;
      this.fired.add(key);
      this.playBeats((cue) => cue.kind === 'cleared' && cue.group === group);
    }
  }
}
