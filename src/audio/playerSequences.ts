/** Player sounds that outlive one event: the scheduled reload sequence and the low-health heartbeat. */
import { lerp, saturate } from '../core/math';
import type { WeaponId } from '../core/types';
import type { AudioEngine, VoiceHandle } from './AudioEngine';

const jitter = (center: number, amount: number): number => center * (1 + (Math.random() * 2 - 1) * amount);

/** Health fraction under which the heartbeat fades in. */
const HEART_THRESHOLD = 0.35;

export class ReloadSequence {
  private voices: (VoiceHandle | null)[] = [];

  constructor(private readonly engine: AudioEngine) {}

  /** Times the mag sequence to the reload duration, ahead of time, so it stays tight without per-frame work. */
  start(duration: number, empty: boolean, weaponId: WeaponId): void {
    this.stop(true);
    const seconds = Number.isFinite(duration) ? Math.max(0.2, duration) : 2;
    const rate = weaponId === 'handgun' ? 1.12 : weaponId === 'smg' ? 1.05 : 1;
    const step = (key: string, fraction: number, gain: number): VoiceHandle | null =>
      this.engine.play(key, { when: seconds * fraction, gain, rate: jitter(rate, 0.03), send: 0.04, priority: 2 });
    this.voices = empty
      ? [step('wpn.magRelease', 0.07, 0.45), step('wpn.magOut', 0.17, 0.5), step('wpn.magIn', 0.52, 0.65), step('wpn.charge', 0.76, 0.75)]
      : [step('wpn.magRelease', 0.1, 0.45), step('wpn.magOut', 0.24, 0.5), step('wpn.magIn', 0.72, 0.7)];
  }

  /** With `all` false only unstarted steps are cancelled, so a normal reload end doesn't clip the last sound. */
  stop(all: boolean): void {
    if (this.voices.length === 0) return;
    const now = this.engine.liveContext?.currentTime ?? 0;
    for (const voice of this.voices) {
      if (voice && (all || voice.startTime > now)) voice.stop(0.03);
    }
    this.voices = [];
  }
}

export class Heartbeat {
  private voice: VoiceHandle | null = null;
  private healthFraction = 1;

  constructor(private readonly engine: AudioEngine) {}

  setHealth(health: number, maxHealth: number): void {
    this.healthFraction = maxHealth > 0 ? saturate(health / maxHealth) : 0;
    this.sync();
  }

  /** Picks up low health that happened before audio unlocked or finished preparing. */
  update(): void {
    if (!this.voice && this.isNeeded()) this.sync();
  }

  stop(): void {
    this.voice?.stop(0.1);
    this.voice = null;
  }

  private isNeeded(): boolean {
    return this.healthFraction > 0 && this.healthFraction < HEART_THRESHOLD;
  }

  private sync(): void {
    if (!this.isNeeded()) {
      this.voice?.stop(0.8);
      this.voice = null;
      return;
    }
    const urgency = 1 - this.healthFraction / HEART_THRESHOLD;
    const gain = lerp(0.3, 0.8, urgency);
    const rate = lerp(0.95, 1.55, urgency);
    if (this.voice) {
      this.voice.setGain(gain, 0.4);
      this.voice.setRate(rate, 0.8);
    } else {
      this.voice = this.engine.play('player.heart', { loop: true, gain, rate, fadeIn: 0.6, priority: 3 });
    }
  }
}
