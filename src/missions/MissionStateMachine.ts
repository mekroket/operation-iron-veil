/**
 * The mission's ordered stages and the rules for moving through them. Pure: knows nothing of the world.
 *
 * Progress only moves forward. A trigger names the earliest stage the player must be in once they have
 * touched it, so a missed trigger is healed by the next one. Gated stages are the exception: 'objective'
 * and 'extract' can be entered that way but only left by their own signal, so nothing skips the real work.
 */

export const STAGE_IDS = [
  'briefing',
  'insertion',
  'infiltrate',
  'checkpoint',
  'yard',
  'warehouse',
  'annex',
  'objective',
  'exfil',
  'extract',
  'complete',
] as const;

export type StageId = (typeof STAGE_IDS)[number];

export const isStageId = (value: unknown): value is StageId => (STAGE_IDS as readonly unknown[]).includes(value);
export const stageIndex = (id: StageId): number => STAGE_IDS.indexOf(id);

/** The earliest stage the player must be in after touching each trigger zone. */
export const TRIGGER_FLOORS: Readonly<Record<string, StageId>> = {
  enter_port: 'checkpoint',
  checkpoint_near: 'checkpoint',
  checkpoint_passed: 'yard',
  yard_entry: 'yard',
  yard_mid: 'yard',
  warehouse_entry: 'warehouse',
  warehouse_mid: 'warehouse',
  annex_entry: 'annex',
  server_room: 'objective',
  quay_entry: 'exfil',
  quay_mid: 'exfil',
  extraction_near: 'extract',
  extraction_zone: 'extract',
};

export type MissionSignal = 'briefing_done' | 'insertion_done' | 'terminal_used' | 'transfer_complete' | 'boarded';

interface SignalRule {
  target: StageId;
  /** The signal is only valid in this stage, and it opens this stage's gate. */
  opens?: StageId;
}

const SIGNAL_RULES: Readonly<Record<MissionSignal, SignalRule>> = {
  briefing_done: { target: 'insertion' },
  insertion_done: { target: 'infiltrate' },
  terminal_used: { target: 'objective' },
  transfer_complete: { target: 'exfil', opens: 'objective' },
  boarded: { target: 'complete', opens: 'extract' },
};

const GATED_STAGES: ReadonlySet<StageId> = new Set<StageId>(['objective', 'extract']);

export interface StageDefinition {
  id: StageId;
  objective: string;
  enter?: (info: StageEnterInfo) => void;
  exit?: () => void;
}

export interface StageEnterInfo {
  /** True when arriving from a checkpoint rather than through play. */
  restored: boolean;
  /** Stages jumped over to get here. Their enter and exit never ran. */
  skipped: StageId[];
}

export type MissionStatus = 'idle' | 'running' | 'failed' | 'complete';

export interface MissionHooks {
  onEnter?: (stage: StageDefinition, info: StageEnterInfo) => void;
  onExit?: (stage: StageDefinition) => void;
  onFailed?: (reason: string) => void;
}

export class MissionStateMachine {
  private currentIndex = 0;
  private currentStatus: MissionStatus = 'idle';
  private objectiveOverride: string | null = null;

  /** `stages` must list every id in STAGE_IDS, in that order. */
  constructor(
    private readonly stages: readonly StageDefinition[],
    private readonly hooks: MissionHooks = {},
  ) {
    const inOrder = stages.length === STAGE_IDS.length && stages.every((stage, i) => stage.id === STAGE_IDS[i]);
    if (!inOrder) throw new Error('MissionStateMachine: stages must match STAGE_IDS');
  }

  get status(): MissionStatus {
    return this.currentStatus;
  }

  get stageId(): StageId {
    return this.stages[this.currentIndex].id;
  }

  /** Zero-based position of the current stage. */
  get index(): number {
    return this.currentIndex;
  }

  get total(): number {
    return this.stages.length;
  }

  get objective(): string {
    return this.objectiveOverride ?? this.stages[this.currentIndex].objective;
  }

  /** Replaces the objective text until the next stage. Null returns to the stage's own text. */
  setObjectiveText(text: string | null): void {
    this.objectiveOverride = text;
  }

  /** Begins from the first stage, discarding any earlier run. */
  start(): void {
    this.enter(0, { restored: false, skipped: [] });
  }

  /** Jumps straight to any stage without running exit or enter for the stages before it. */
  restore(id: StageId): boolean {
    if (!isStageId(id)) return false;
    this.enter(stageIndex(id), { restored: true, skipped: [] });
    return true;
  }

  /** Returns true when the stage changed. Unknown triggers are ignored. */
  applyTrigger(triggerId: string): boolean {
    if (!Object.hasOwn(TRIGGER_FLOORS, triggerId)) return false;
    return this.moveTowards(TRIGGER_FLOORS[triggerId], null);
  }

  /** Returns true when the stage changed. A signal sent from the wrong stage does nothing. */
  signal(signal: MissionSignal): boolean {
    const rule = SIGNAL_RULES[signal];
    if (rule.opens && this.stageId !== rule.opens) return false;
    return this.moveTowards(rule.target, rule.opens ?? null);
  }

  /** Only a running mission can fail. Restoring a checkpoint or calling start() recovers from it. */
  fail(reason: string): boolean {
    if (this.currentStatus !== 'running') return false;
    this.currentStatus = 'failed';
    this.hooks.onFailed?.(reason);
    return true;
  }

  private moveTowards(target: StageId, opened: StageId | null): boolean {
    if (this.currentStatus !== 'running') return false;
    const targetIndex = stageIndex(target);
    let next = this.currentIndex;
    while (next < targetIndex) {
      const here = STAGE_IDS[next];
      if (GATED_STAGES.has(here) && here !== opened) break;
      next += 1;
    }
    if (next === this.currentIndex) return false;

    const skipped = STAGE_IDS.slice(this.currentIndex + 1, next);
    const leaving = this.stages[this.currentIndex];
    leaving.exit?.();
    this.hooks.onExit?.(leaving);
    this.enter(next, { restored: false, skipped });
    return true;
  }

  private enter(index: number, info: StageEnterInfo): void {
    this.currentIndex = index;
    this.objectiveOverride = null;
    const stage = this.stages[index];
    this.currentStatus = stage.id === 'complete' ? 'complete' : 'running';
    stage.enter?.(info);
    this.hooks.onEnter?.(stage, info);
  }
}

/** What the grade is computed from. */
export interface GradeInput {
  elapsedSeconds: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  enemiesDefeated: number;
  deaths: number;
}

export const GRADE_THRESHOLDS = { S: 85, A: 70, B: 50 } as const;
/** Finishing at or under this many seconds earns full time points. */
export const PAR_SECONDS = 720;
/** Finishing at or over this many seconds earns no time points. */
export const SLOW_SECONDS = 1800;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Mission score, 0..100, built from four parts:
 * - Survival, 30: loses 10 for each death.
 * - Accuracy, 30: hits / shots fired, with full marks at 50%.
 * - Time, 25: full at PAR_SECONDS or faster, falling in a straight line to 0 at SLOW_SECONDS.
 * - Precision, 15: headshot kills / all kills, with full marks at 40%.
 */
export function computeScore(input: GradeInput): number {
  const accuracy = input.shotsFired > 0 ? input.shotsHit / input.shotsFired : 0;
  const precision = input.enemiesDefeated > 0 ? input.headshots / input.enemiesDefeated : 0;
  const survival = 30 - Math.max(0, input.deaths) * 10;
  const pace = (SLOW_SECONDS - input.elapsedSeconds) / (SLOW_SECONDS - PAR_SECONDS);
  return Math.max(0, survival) + 30 * clamp01(accuracy / 0.5) + 25 * clamp01(pace) + 15 * clamp01(precision / 0.4);
}

/** S from 85, A from 70, B from 50, otherwise C. See computeScore. */
export function computeGrade(input: GradeInput): string {
  const score = computeScore(input);
  if (score >= GRADE_THRESHOLDS.S) return 'S';
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  return 'C';
}
