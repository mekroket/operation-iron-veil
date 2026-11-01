/** One radio transmission at a time: squelch in, static bed and low babble for the duration, squelch out. */
import type { AudioEngine, VoiceHandle } from './AudioEngine';

const MIN_DURATION = 0.4;
const MAX_DURATION = 30;

export class RadioChannel {
  private layers: VoiceHandle[] = [];

  constructor(private readonly engine: AudioEngine) {}

  play(duration: number): void {
    this.cut();
    const seconds = Number.isFinite(duration) ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration)) : MIN_DURATION;
    const engine = this.engine;
    const shared = { bus: 'voice', priority: 3 } as const;

    const handles = [
      engine.play('radio.squelchIn', { ...shared, gain: 0.34 }),
      engine.play('radio.static', {
        ...shared,
        gain: 0.05,
        loop: true,
        when: 0.03,
        fadeIn: 0.09,
        duration: seconds,
        offsetFraction: Math.random(),
      }),
      engine.play('radio.babble', {
        ...shared,
        gain: 0.085,
        loop: true,
        rate: 0.94 + Math.random() * 0.12,
        when: 0.12,
        fadeIn: 0.06,
        duration: Math.max(0.1, seconds - 0.16),
        offsetFraction: Math.random(),
      }),
      engine.play('radio.squelchOut', { ...shared, gain: 0.3, when: seconds }),
    ];
    this.layers = handles.filter((handle): handle is VoiceHandle => handle !== null);
    if (this.layers.length > 0) engine.duckAmbience(0.72, seconds, 1);
  }

  /** Cuts any transmission still running, including its pending squelch out. */
  cut(): void {
    for (const layer of this.layers) layer.stop(0.04);
    this.layers = [];
  }
}
