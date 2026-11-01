/** Plays radio lines one at a time, so subtitles and voice never overlap. Pure. */
import type { GameEvents } from '../core/events';

export interface RadioLine {
  speaker: string;
  text: string;
  /** Silence before this line starts, in seconds. */
  pauseBefore?: number;
  /** Plot lines. Everything else may be dropped when the queue falls behind the action. */
  critical?: boolean;
}

/** Seconds of quiet between two lines. */
export const RADIO_GAP = 0.35;
/** More waiting lines than this and the oldest non-critical ones are dropped. */
export const RADIO_MAX_PENDING = 6;

/** Reading time for a subtitle: roughly 18 characters a second, with a short floor. */
export const radioDuration = (text: string): number => Math.min(7, Math.max(1.6, 1 + text.length * 0.055));

export class RadioQueue {
  private readonly pending: RadioLine[] = [];
  /** Counts down whatever is happening now: a line playing, a gap or a pause. */
  private wait = 0;

  constructor(private readonly emit: (line: GameEvents['mission:radio']) => void) {}

  /** True once nothing is playing and nothing is waiting. */
  get idle(): boolean {
    return this.wait <= 0 && this.pending.length === 0;
  }

  enqueue(lines: readonly RadioLine[]): void {
    this.pending.push(...lines);
    while (this.pending.length > RADIO_MAX_PENDING) {
      const droppable = this.pending.findIndex((line) => !line.critical);
      if (droppable < 0) break;
      this.pending.splice(droppable, 1);
    }
  }

  update(dt: number): void {
    this.wait -= dt;
    while (this.wait <= 0 && this.pending.length > 0) {
      const line = this.pending[0];
      if (line.pauseBefore && line.pauseBefore > 0) {
        this.wait += line.pauseBefore;
        this.pending[0] = { ...line, pauseBefore: 0 };
        continue;
      }
      this.pending.shift();
      const duration = radioDuration(line.text);
      this.emit({ speaker: line.speaker, text: line.text, duration });
      // Carrying the overshoot in `wait` keeps pacing the same at any frame rate.
      this.wait += duration + RADIO_GAP;
    }
    if (this.wait < 0) this.wait = 0;
  }

  clear(): void {
    this.pending.length = 0;
    this.wait = 0;
  }
}
