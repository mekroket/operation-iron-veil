/** Continuous environment beds, built from running noise and oscillators, plus their random one-shots. */
import type { AudioEngine } from './AudioEngine';
import { LayerGroup, type NoiseLayer } from './LayerGroup';

export type AmbienceMode = 'menu' | 'mission' | 'none';

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

interface ExteriorParts {
  group: LayerGroup;
  muffle: BiquadFilterNode;
  sea: NoiseLayer;
  wash: NoiseLayer;
  foam: NoiseLayer;
  wind: NoiseLayer;
  whistle: NoiseLayer;
}

export class AmbienceLayer {
  private mode: AmbienceMode = 'none';
  private interior = 0;
  private appliedInterior = -1;
  private exterior: ExteriorParts | null = null;
  private interiorGroup: LayerGroup | null = null;
  private padGroup: LayerGroup | null = null;

  private swellTimer = 0;
  private windTimer = 0;
  private bellTimer = rand(8, 22);
  private clankTimer = rand(6, 22);
  private gullTimer = rand(40, 110);
  private rattleTimer = rand(3, 8);
  private padTimer = rand(3, 9);

  constructor(private readonly engine: AudioEngine) {}

  setMode(mode: AmbienceMode): void {
    this.mode = mode;
    this.sync();
  }

  setInterior(amount: number): void {
    this.interior = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  }

  update(dt: number): void {
    this.sync();
    const ctx = this.engine.liveContext;
    if (!ctx) return;
    const step = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
    this.applyInterior();
    if (this.exterior) this.tickExterior(this.exterior, ctx, step);
    if (this.interiorGroup) this.tickInterior(this.interiorGroup, step);
    if (this.padGroup) this.tickPad(this.padGroup, step);
  }

  dispose(): void {
    this.mode = 'none';
    this.exterior?.group.stop(0.3);
    this.exterior = null;
    this.interiorGroup?.stop(0.3);
    this.interiorGroup = null;
    this.padGroup?.stop(0.3);
    this.padGroup = null;
  }

  /** Builds what the mode needs and fades out what it doesn't. Waits quietly while audio is locked. */
  private sync(): void {
    const ctx = this.engine.liveContext;
    if (!ctx) return;
    const output = this.engine.busNode('ambience');
    const noise = this.engine.noiseBuffer('white');
    if (!output || !noise) return;
    try {
      const wantsExterior = this.mode !== 'none';
      const wantsInterior = this.mode === 'mission';
      const wantsPad = this.mode === 'menu';

      if (wantsExterior && !this.exterior) {
        this.exterior = this.buildExterior(ctx, output, noise);
        this.appliedInterior = -1;
      } else if (!wantsExterior && this.exterior) {
        this.exterior.group.stop(1.5);
        this.exterior = null;
      }
      if (wantsInterior && !this.interiorGroup) {
        this.interiorGroup = this.buildInterior(ctx, output, noise);
        this.appliedInterior = -1;
      } else if (!wantsInterior && this.interiorGroup) {
        this.interiorGroup.stop(1.5);
        this.interiorGroup = null;
      }
      if (wantsPad && !this.padGroup) {
        this.padGroup = this.buildPad(ctx, output);
      } else if (!wantsPad && this.padGroup) {
        this.padGroup.stop(2.5);
        this.padGroup = null;
      }
    } catch {
      // Ambience is decoration: failing to build it must not affect the game.
    }
  }

  private buildExterior(ctx: AudioContext, output: AudioNode, noise: AudioBuffer): ExteriorParts {
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 18000;
    muffle.Q.value = 0.3;
    muffle.connect(output);
    const group = new LayerGroup(ctx, muffle, 1, 2.5);
    group.track(muffle);
    this.swellTimer = 0;
    this.windTimer = 0;
    return {
      group,
      muffle,
      sea: group.noise(noise, 0.6, 'lowpass', 260, 0.2),
      wash: group.noise(noise, 0.05, 'bandpass', 950, 0.5),
      foam: group.noise(noise, 0.004, 'highpass', 3400, 0.3),
      wind: group.noise(noise, 0.3, 'bandpass', 420, 1.2),
      whistle: group.noise(noise, 0.03, 'bandpass', 1500, 6),
    };
  }

  private buildInterior(ctx: AudioContext, output: AudioNode, noise: AudioBuffer): LayerGroup {
    const group = new LayerGroup(ctx, output, this.interior, 1.5);
    const hum = ctx.createBiquadFilter();
    hum.type = 'lowpass';
    hum.frequency.value = 320;
    hum.connect(group.root);
    group.track(hum);
    group.tone('sine', 58, 0.06, hum);
    group.tone('sine', 116, 0.025, hum);
    group.tone('triangle', 174.5, 0.012, hum);
    const air = group.noise(noise, 0.3, 'bandpass', 240, 0.7);
    group.lfo(0.11, 0.05, air.gain.gain);
    return group;
  }

  private buildPad(ctx: AudioContext, output: AudioNode): LayerGroup {
    const group = new LayerGroup(ctx, output, 1, 6);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 230;
    tone.Q.value = 0.8;
    tone.connect(group.root);
    group.track(tone);
    group.tone('sine', 36.71, 0.1, tone);
    group.tone('sawtooth', 73.42, 0.035, tone, -6);
    group.tone('sawtooth', 73.42, 0.035, tone, 5);
    group.tone('sawtooth', 110, 0.022, tone, -4);
    group.tone('sawtooth', 87.31, 0.014, tone, 7);
    group.lfo(0.047, 90, tone.frequency);
    return group;
  }

  private applyInterior(): void {
    const amount = this.interior;
    if (Math.abs(amount - this.appliedInterior) < 0.004) return;
    this.appliedInterior = amount;
    if (this.exterior) {
      const now = this.exterior.muffle.context.currentTime;
      this.exterior.group.setLevel(1 - amount * 0.62, 0.3);
      this.exterior.muffle.frequency.cancelScheduledValues(now);
      this.exterior.muffle.frequency.setTargetAtTime(18000 * Math.pow(650 / 18000, amount), now, 0.3);
    }
    this.interiorGroup?.setLevel(amount, 0.3);
  }

  private tickExterior(parts: ExteriorParts, ctx: AudioContext, dt: number): void {
    const now = ctx.currentTime;

    this.swellTimer -= dt;
    if (this.swellTimer <= 0) {
      // One wave: water drawing up the stone, then falling back.
      const rise = rand(2.2, 3.8);
      const fall = rand(3, 5.5);
      const size = rand(0.55, 1);
      parts.sea.gain.gain.setTargetAtTime(0.55 + size * 0.8, now, rise / 3);
      parts.sea.gain.gain.setTargetAtTime(0.5, now + rise, fall / 3);
      parts.wash.gain.gain.setTargetAtTime(0.05 + size * 0.17, now + rise * 0.3, rise / 3);
      parts.wash.gain.gain.setTargetAtTime(0.04, now + rise * 1.1, fall / 3);
      parts.wash.filter.frequency.setTargetAtTime(950 + size * 1000, now + rise * 0.3, rise / 3);
      parts.wash.filter.frequency.setTargetAtTime(800, now + rise * 1.1, fall / 3);
      parts.foam.gain.gain.setTargetAtTime(0.004 + size * 0.04, now + rise * 0.8, 0.35);
      parts.foam.gain.gain.setTargetAtTime(0.004, now + rise * 1.3, fall / 3);
      this.swellTimer = rise + fall * rand(0.6, 0.95);
    }

    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      const glide = rand(3, 7);
      parts.wind.gain.gain.setTargetAtTime(rand(0.18, 0.46), now, glide / 2.5);
      parts.wind.filter.frequency.setTargetAtTime(rand(300, 640), now, glide / 2.5);
      parts.whistle.gain.gain.setTargetAtTime(rand(0.01, 0.08), now, glide / 2.5);
      parts.whistle.filter.frequency.setTargetAtTime(rand(1200, 1900), now, glide / 2.5);
      this.windTimer = glide;
    }

    const output = parts.group.root;
    this.bellTimer -= dt;
    if (this.bellTimer <= 0) {
      this.bellTimer = rand(20, 40);
      this.engine.play('amb.bell', { output, gain: rand(0.1, 0.17), pan: rand(-0.6, 0.6), priority: 0 });
    }
    this.clankTimer -= dt;
    if (this.clankTimer <= 0) {
      this.clankTimer = rand(12, 38);
      this.engine.play('amb.clank', { output, gain: rand(0.05, 0.12), pan: rand(-0.8, 0.8), lowpass: rand(1500, 2600), rate: rand(0.86, 1.1), priority: 0 });
    }
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = rand(70, 170);
      this.engine.play('amb.gull', { output, gain: rand(0.025, 0.06), pan: rand(-0.8, 0.8), lowpass: 3200, rate: rand(0.92, 1.08), priority: 0 });
    }
  }

  private tickInterior(group: LayerGroup, dt: number): void {
    this.rattleTimer -= dt;
    if (this.rattleTimer > 0) return;
    this.rattleTimer = rand(4, 11);
    if (this.interior < 0.25) return;
    this.engine.play('amb.rattle', { output: group.root, gain: rand(0.05, 0.13), pan: rand(-0.5, 0.5), rate: rand(0.85, 1.15), priority: 0 });
  }

  private tickPad(group: LayerGroup, dt: number): void {
    this.padTimer -= dt;
    if (this.padTimer > 0) return;
    this.padTimer = rand(15, 28);
    const rates = [1, 0.749, 0.891, 0.5];
    this.engine.play('amb.padSwell', { output: group.root, gain: rand(0.1, 0.17), rate: rates[Math.floor(Math.random() * rates.length)], priority: 0 });
  }
}
