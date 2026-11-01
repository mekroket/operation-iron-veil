/** Owns the AudioContext, the volume state and the pre-rendered sound bank. Never throws at callers. */
import type { Vec3 } from '../core/types';
import type { SettingsStore } from '../settings/settings';
import { applyListenerPose, createAudioGraph, type AudioGraph, type PausableBus } from './audioGraph';
import { renderSoundBank } from './soundBank';
import { createNoiseSet, type NoiseColor, type NoiseSet } from './synth';
import type { BusName, PlayOptions, VoiceHandle } from './voices';

export type { BusName, PlayOptions, VoiceHandle } from './voices';

/** Trim ahead of the limiter so ordinary play stays out of its way. */
const HEADROOM = 0.8;
const PAUSED_LEVEL: Readonly<Record<PausableBus, number>> = { sfx: 0.08, ambience: 0.3, voice: 0.08 };
const PAUSABLE_BUSES: readonly PausableBus[] = ['sfx', 'ambience', 'voice'];
const NOISE_SEED = 0x1f0a7c3;

export class AudioEngine {
  private graph: AudioGraph | null = null;
  private noiseSet: NoiseSet | null = null;
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private readonly lastVariant = new Map<string, number>();
  private readonly progressListeners: ((fraction: number) => void)[] = [];
  private preparing: Promise<void> | null = null;
  private prepared = false;
  private paused = false;
  private disposed = false;
  private interior = 0;
  private duckUntil = 0;
  private duckLevel = 1;
  private readonly unsubscribeSettings: () => void;

  constructor(private readonly settings: SettingsStore) {
    this.unsubscribeSettings = settings.subscribe(() => this.applyVolumes());
  }

  /** Call synchronously in a user gesture. Creates/resumes the AudioContext. Safe to call repeatedly. */
  unlock(): void {
    if (this.disposed) return;
    try {
      if (!this.graph) {
        this.graph = createAudioGraph();
        if (this.graph) {
          this.applyVolumes();
          this.applyPause(0.01);
          this.applyInterior(0.01);
          if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
        }
      }
      this.resume();
    } catch {
      // No audio on this device: the game simply runs silent.
    }
  }

  get unlocked(): boolean {
    return this.graph !== null && this.graph.ctx.state === 'running';
  }

  /** Pre-renders sound banks in chunks; safe to call before unlock (uses OfflineAudioContext). */
  prepare(onProgress?: (fraction: number) => void): Promise<void> {
    if (this.prepared) {
      if (onProgress) this.safeReport(onProgress, 1);
      return Promise.resolve();
    }
    if (onProgress) this.progressListeners.push(onProgress);
    this.preparing ??= this.runPrepare();
    return this.preparing;
  }

  /** Ducks gameplay and ambience, keeps UI sounds alive. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyPause(0.12);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeSettings();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibilityChange);
    const graph = this.graph;
    this.graph = null;
    this.buffers.clear();
    this.progressListeners.length = 0;
    if (!graph) return;
    try {
      graph.pool.stopAll(0.01);
      void graph.ctx.close().catch(() => undefined);
    } catch {
      // Already closed.
    }
  }

  // Internal to src/audio: used by AudioDirector and its layers.

  /** The context when sound can actually be heard, otherwise null. */
  get liveContext(): AudioContext | null {
    return this.graph !== null && this.graph.ctx.state === 'running' ? this.graph.ctx : null;
  }

  busNode(bus: BusName): AudioNode | null {
    return this.graph ? this.graph.buses[bus] : null;
  }

  noiseBuffer(color: NoiseColor): AudioBuffer | null {
    return this.getNoise()?.[color] ?? null;
  }

  /** Returns null when locked, unprepared, over the voice cap or unavailable. Nothing is queued while suspended. */
  play(key: string, options: PlayOptions = {}): VoiceHandle | null {
    const graph = this.graph;
    if (!graph || graph.ctx.state !== 'running') return null;
    const variants = this.buffers.get(key);
    if (!variants || variants.length === 0) return null;
    try {
      return graph.pool.spawn(key, this.pickVariant(key, variants), options);
    } catch {
      return null;
    }
  }

  setListenerPose(position: Vec3, forward: Vec3): void {
    if (this.graph) applyListenerPose(this.graph.ctx.listener, position, forward);
  }

  /** Crossfades the reverb between the exterior slap and the interior room. */
  setInterior(amount: number): void {
    const next = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
    if (Math.abs(next - this.interior) < 0.002) return;
    this.interior = next;
    this.applyInterior(0.25);
  }

  /** Dips the ambience to `level` for `hold` seconds. A stronger duck in progress wins. */
  duckAmbience(level: number, hold: number, release: number): void {
    const graph = this.graph;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    if (now < this.duckUntil && level > this.duckLevel) return;
    this.duckUntil = now + hold;
    this.duckLevel = level;
    const param = graph.duck.gain;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(level, now, 0.04);
    param.setTargetAtTime(1, now + hold, release / 3);
  }

  private resume(): void {
    const ctx = this.graph?.ctx;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    void ctx.resume().catch(() => undefined);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.resume();
  };

  private applyVolumes(): void {
    const graph = this.graph;
    if (!graph) return;
    const audio = this.settings.get().audio;
    const now = graph.ctx.currentTime;
    const set = (gain: GainNode, value: number): void => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(value, now, 0.03);
    };
    set(graph.master, audio.master * HEADROOM);
    set(graph.buses.sfx, audio.sfx);
    set(graph.buses.ambience, audio.ambience);
    set(graph.buses.voice, audio.voice);
    set(graph.buses.ui, audio.ui);
  }

  private applyPause(smoothing: number): void {
    const graph = this.graph;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    for (const name of PAUSABLE_BUSES) {
      const param = graph.pause[name].gain;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(this.paused ? PAUSED_LEVEL[name] : 1, now, smoothing);
    }
  }

  private applyInterior(smoothing: number): void {
    const graph = this.graph;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    const angle = this.interior * Math.PI * 0.5;
    graph.exteriorWet.gain.cancelScheduledValues(now);
    graph.exteriorWet.gain.setTargetAtTime(Math.cos(angle) * 0.9, now, smoothing);
    graph.interiorWet.gain.cancelScheduledValues(now);
    graph.interiorWet.gain.setTargetAtTime(Math.sin(angle) * 0.75, now, smoothing);
  }

  /** Never the same variant twice running, which is most of what stops autofire sounding like a machine. */
  private pickVariant(key: string, variants: readonly AudioBuffer[]): AudioBuffer {
    if (variants.length === 1) return variants[0];
    const last = this.lastVariant.get(key) ?? -1;
    let index = Math.floor(Math.random() * variants.length);
    if (index === last) index = (index + 1) % variants.length;
    this.lastVariant.set(key, index);
    return variants[index];
  }

  private getNoise(): NoiseSet | null {
    if (!this.noiseSet) {
      try {
        this.noiseSet = createNoiseSet(NOISE_SEED);
      } catch {
        this.noiseSet = null;
      }
    }
    return this.noiseSet;
  }

  private async runPrepare(): Promise<void> {
    try {
      // Yield first so the caller's loading screen can paint before noise generation.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const noise = this.getNoise();
      if (noise && !this.disposed) {
        await renderSoundBank(noise, this.buffers, (fraction) => this.report(fraction), () => this.disposed);
      }
    } catch {
      // A missing sound is silence, never a failed load.
    }
    this.prepared = true;
    this.report(1);
    this.progressListeners.length = 0;
  }

  private report(fraction: number): void {
    for (const listener of this.progressListeners) this.safeReport(listener, fraction);
  }

  private safeReport(listener: (fraction: number) => void, fraction: number): void {
    try {
      listener(fraction);
    } catch {
      // A broken progress bar must not stop audio loading.
    }
  }
}
