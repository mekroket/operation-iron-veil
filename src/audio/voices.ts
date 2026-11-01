/** Short-lived playback voices over shared buffers, with a global cap, per-sound limits and priority-based stealing. */
import type { Vec3 } from '../core/types';

export type BusName = 'sfx' | 'ambience' | 'voice' | 'ui';

export interface PlayOptions {
  bus?: BusName;
  /** Overrides `bus` with a specific node, for sounds that belong to a layer. */
  output?: AudioNode;
  gain?: number;
  rate?: number;
  /** Delay before the sound starts, in seconds. */
  when?: number;
  lowpass?: number;
  highpass?: number;
  /** Level sent to the shared reverb. */
  send?: number;
  /** World position (left-handed game space). Makes the voice spatial. */
  position?: Vec3;
  refDistance?: number;
  rolloff?: number;
  /** Requests HRTF panning; falls back to equal power once the HRTF budget is used. */
  hrtf?: boolean;
  /** Plain stereo placement for non-spatial sounds, -1..1. */
  pan?: number;
  /** Loops are exempt from the voice cap; the caller owns them and must stop them. */
  loop?: boolean;
  /** Total play time in seconds, with a short fade at the end. */
  duration?: number;
  fadeIn?: number;
  /** Starting position as a fraction of the buffer, 0..1. */
  offsetFraction?: number;
  /** Higher survives stealing. 0 background, 1 default, 2 important, 3 never stolen by gameplay. */
  priority?: number;
  /** Maximum simultaneous voices of this sound. The oldest is stopped to make room. */
  keyLimit?: number;
  /** Drops the request if this sound started less than this many seconds ago. */
  minGap?: number;
}

export interface VoiceHandle {
  readonly startTime: number;
  stop(fade?: number): void;
  setGain(value: number, smoothing?: number): void;
  setRate(rate: number, smoothing?: number): void;
}

const MAX_VOICES = 40;
const MAX_HRTF_VOICES = 4;
const DEFAULT_KEY_LIMIT = 8;
const STEAL_FADE = 0.015;

const finiteOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

class Voice implements VoiceHandle {
  /** Set once the voice stops counting against the cap. */
  released = false;
  private finished = false;

  constructor(
    private readonly pool: VoicePool,
    readonly key: string,
    readonly priority: number,
    readonly startTime: number,
    readonly endTime: number,
    readonly usesHrtf: boolean,
    private readonly source: AudioBufferSourceNode,
    private readonly amp: GainNode,
    private readonly nodes: readonly AudioNode[],
  ) {}

  stop(fade = 0.02): void {
    if (this.released) return;
    this.pool.release(this);
    const now = this.amp.context.currentTime;
    const seconds = Math.max(fade, 0.005);
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setTargetAtTime(0, now, seconds / 3);
    try {
      this.source.stop(now + seconds + 0.01);
    } catch {
      // Already stopped: nothing left to do.
    }
  }

  setGain(value: number, smoothing = 0.1): void {
    if (this.released || !Number.isFinite(value)) return;
    const now = this.amp.context.currentTime;
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setTargetAtTime(Math.max(0, value), now, smoothing);
  }

  setRate(rate: number, smoothing = 0.2): void {
    if (this.released || !Number.isFinite(rate)) return;
    const now = this.amp.context.currentTime;
    this.source.playbackRate.cancelScheduledValues(now);
    this.source.playbackRate.setTargetAtTime(rate, now, smoothing);
  }

  /** Called when the source ended. Disconnects the short-lived nodes. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.pool.release(this);
    this.source.disconnect();
    for (const node of this.nodes) node.disconnect();
  }
}

export class VoicePool {
  /** One-shots in start order, oldest first. */
  private readonly active: Voice[] = [];
  private readonly loops = new Set<Voice>();
  private readonly lastStart = new Map<string, number>();
  private hrtfCount = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly buses: Readonly<Record<BusName, AudioNode>>,
    private readonly reverbInput: AudioNode | null,
  ) {}

  spawn(key: string, buffer: AudioBuffer, options: PlayOptions): VoiceHandle | null {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const priority = options.priority ?? 1;
    const isLoop = options.loop === true;

    if (options.minGap !== undefined) {
      const last = this.lastStart.get(key);
      if (last !== undefined && now - last < options.minGap) return null;
    }
    if (!isLoop && !this.admit(key, priority, options.keyLimit ?? DEFAULT_KEY_LIMIT, now)) return null;
    this.lastStart.set(key, now);

    const rate = Math.min(4, Math.max(0.25, finiteOr(options.rate, 1)));
    const level = Math.max(0, finiteOr(options.gain, 1));
    const start = now + Math.max(0, finiteOr(options.when, 0));

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = isLoop;
    source.playbackRate.value = rate;

    const amp = ctx.createGain();
    const nodes: AudioNode[] = [amp];
    let tail: AudioNode = source;
    if (options.highpass !== undefined) tail = this.insertFilter(tail, 'highpass', options.highpass, nodes);
    if (options.lowpass !== undefined && options.lowpass < 18000) tail = this.insertFilter(tail, 'lowpass', options.lowpass, nodes);
    tail.connect(amp);

    const fadeIn = finiteOr(options.fadeIn, 0);
    if (fadeIn > 0) {
      amp.gain.setValueAtTime(0, start);
      amp.gain.linearRampToValueAtTime(level, start + fadeIn);
    } else {
      amp.gain.value = level;
    }

    const usesHrtf = this.route(amp, options, nodes);

    const timed = options.duration !== undefined && Number.isFinite(options.duration);
    let endTime = isLoop ? Number.POSITIVE_INFINITY : start + buffer.duration / rate;
    if (timed) {
      const duration = Math.max(0.02, finiteOr(options.duration, 0.02));
      const fade = Math.min(0.06, duration / 4);
      endTime = start + duration;
      amp.gain.setValueAtTime(level, endTime - fade);
      amp.gain.linearRampToValueAtTime(0, endTime);
    }

    const voice = new Voice(this, key, priority, start, endTime, usesHrtf, source, amp, nodes);
    source.onended = () => voice.finish();
    source.start(start, buffer.duration * Math.min(0.999, Math.max(0, finiteOr(options.offsetFraction, 0))));
    // stop() before start() throws, so the scheduled end has to come second.
    if (timed) source.stop(endTime + 0.005);
    if (usesHrtf) this.hrtfCount++;
    if (isLoop) this.loops.add(voice);
    else this.active.push(voice);
    return voice;
  }

  /** Removes the voice from the accounting. Its nodes stay connected until the source ends. */
  release(voice: Voice): void {
    if (voice.released) return;
    voice.released = true;
    if (voice.usesHrtf) this.hrtfCount = Math.max(0, this.hrtfCount - 1);
    const index = this.active.indexOf(voice);
    if (index >= 0) this.active.splice(index, 1);
    this.loops.delete(voice);
  }

  stopAll(fade: number): void {
    for (const voice of [...this.active, ...this.loops]) voice.stop(fade);
  }

  private admit(key: string, priority: number, keyLimit: number, now: number): boolean {
    // Safety net for browsers that fail to deliver `ended` on a stopped source.
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].endTime < now - 0.5) this.active[i].finish();
    }

    let sameKey = 0;
    let oldestSameKey: Voice | null = null;
    for (const voice of this.active) {
      if (voice.key !== key) continue;
      sameKey++;
      oldestSameKey ??= voice;
    }
    if (sameKey >= keyLimit && oldestSameKey) oldestSameKey.stop(STEAL_FADE);
    if (this.active.length < MAX_VOICES) return true;

    let victim: Voice | null = null;
    for (const voice of this.active) {
      if (!victim || voice.priority < victim.priority) victim = voice;
    }
    if (!victim || victim.priority > priority) return false;
    victim.stop(STEAL_FADE);
    return true;
  }

  private insertFilter(input: AudioNode, type: BiquadFilterType, frequency: number, nodes: AudioNode[]): AudioNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = Math.max(20, finiteOr(frequency, 1000));
    filter.Q.value = 0.4;
    input.connect(filter);
    nodes.push(filter);
    return filter;
  }

  /** Connects the voice to its output and reverb send. Returns whether it took an HRTF slot. */
  private route(amp: GainNode, options: PlayOptions, nodes: AudioNode[]): boolean {
    const ctx = this.ctx;
    const target = options.output ?? this.buses[options.bus ?? 'sfx'];
    let usesHrtf = false;
    if (options.position) {
      usesHrtf = options.hrtf === true && this.hrtfCount < MAX_HRTF_VOICES;
      const panner = ctx.createPanner();
      panner.panningModel = usesHrtf ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = Math.max(0.1, finiteOr(options.refDistance, 6));
      panner.rolloffFactor = Math.max(0, finiteOr(options.rolloff, 1));
      panner.maxDistance = 10000;
      placePanner(panner, options.position);
      amp.connect(panner);
      panner.connect(target);
      nodes.push(panner);
    } else if (options.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.min(1, Math.max(-1, finiteOr(options.pan, 0)));
      amp.connect(panner);
      panner.connect(target);
      nodes.push(panner);
    } else {
      amp.connect(target);
    }
    if (options.send !== undefined && options.send > 0 && this.reverbInput) {
      const send = ctx.createGain();
      send.gain.value = options.send;
      amp.connect(send);
      send.connect(this.reverbInput);
      nodes.push(send);
    }
    return usesHrtf;
  }
}

/** The game is left-handed (+Z forward, +X right) and Web Audio right-handed, so Z flips or left and right would swap. */
function placePanner(panner: PannerNode, position: Vec3): void {
  const x = finiteOr(position.x, 0);
  const y = finiteOr(position.y, 0);
  const z = -finiteOr(position.z, 0);
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
}
