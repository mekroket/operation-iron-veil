import type { EventBus, GameEvents } from '../../core/events';
import { Disposer, h, setText } from '../dom';

type RadioLine = GameEvents['mission:radio'];

const MIN_LINE_SECONDS = 1.5;
const GAP_MS = 180;

/** Queued radio captions. The clock stops while the game is paused, so no line is lost behind a menu. */
export class RadioSubtitles {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-radio');
  private readonly speaker = h('span', 'iv-radio__speaker');
  private readonly text = h('span', 'iv-radio__text');
  private readonly queue: RadioLine[] = [];
  private showing = false;
  private paused = true;
  private remainingMs = 0;
  private startedAt = 0;
  private cancelTimer: (() => void) | null = null;

  constructor(parent: HTMLElement, bus: EventBus) {
    this.root.setAttribute('role', 'log');
    this.root.setAttribute('aria-live', 'polite');
    const icon = h('span', 'iv-radio__icon');
    icon.setAttribute('aria-hidden', 'true');
    for (let bar = 0; bar < 3; bar++) icon.append(h('i'));
    const heading = h('div', 'iv-radio__heading');
    heading.append(icon, this.speaker);
    this.root.append(heading, this.text);
    parent.append(this.root);

    this.disposer.add(
      bus.on('mission:radio', (line) => {
        this.queue.push(line);
        if (!this.showing) this.next();
      }),
    );
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      if (this.cancelTimer) {
        this.remainingMs = Math.max(0, this.remainingMs - (performance.now() - this.startedAt));
        this.cancelTimer();
        this.cancelTimer = null;
      }
    } else if (this.showing) {
      this.arm();
    } else {
      this.next();
    }
  }

  clear(): void {
    this.queue.length = 0;
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.showing = false;
    this.root.classList.remove('is-visible');
  }

  dispose(): void {
    this.disposer.dispose();
    this.root.remove();
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line || this.paused) {
      if (line) this.queue.unshift(line);
      return;
    }
    this.showing = true;
    setText(this.speaker, line.speaker);
    setText(this.text, line.text);
    this.root.classList.add('is-visible');
    this.remainingMs = Math.max(MIN_LINE_SECONDS, line.duration) * 1000;
    this.arm();
  }

  private arm(): void {
    this.startedAt = performance.now();
    this.cancelTimer = this.disposer.timeout(() => this.finishLine(), this.remainingMs);
  }

  private finishLine(): void {
    this.cancelTimer = null;
    this.root.classList.remove('is-visible');
    if (this.queue.length === 0) {
      this.showing = false;
      return;
    }
    // A short beat between speakers, so consecutive lines read as separate transmissions.
    this.remainingMs = GAP_MS;
    this.startedAt = performance.now();
    this.cancelTimer = this.disposer.timeout(() => {
      this.cancelTimer = null;
      this.showing = false;
      this.next();
    }, GAP_MS);
  }
}
