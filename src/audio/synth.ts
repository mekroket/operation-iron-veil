/** Offline synthesis toolkit: seeded RNG, shared noise buffers and a small graph-building kit for sound definitions. */

export const RENDER_RATE = 44100;

/** Mulberry32. Deterministic so every player hears the same generated bank. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/** FNV-1a, used to derive a stable seed from a sound key. */
export function hashKey(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type NoiseColor = 'white' | 'pink' | 'brown';
export type NoiseSet = Record<NoiseColor, AudioBuffer>;

/** Shared long noise buffers. AudioBuffers are not tied to a context, so these feed offline renders and live ambience. */
export function createNoiseSet(seed: number): NoiseSet | null {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const factory = new OfflineAudioContext(1, 1, RENDER_RATE);
  const rng = new Rng(seed);

  const white = factory.createBuffer(1, RENDER_RATE * 8, RENDER_RATE);
  const whiteData = white.getChannelData(0);
  for (let i = 0; i < whiteData.length; i++) whiteData[i] = rng.next() * 2 - 1;

  const pink = factory.createBuffer(1, RENDER_RATE * 4, RENDER_RATE);
  const pinkData = pink.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < pinkData.length; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pinkData[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }

  const brown = factory.createBuffer(1, RENDER_RATE * 4, RENDER_RATE);
  const brownData = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < brownData.length; i++) {
    last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02;
    brownData[i] = last * 3.5;
  }

  return { white, pink, brown };
}

export interface FilterStep {
  type: BiquadFilterType;
  freq: number;
  q?: number;
  /** Peaking and shelf gain in dB. */
  gain?: number;
  /** Exponential sweep target, reached at the end of the layer. */
  freqEnd?: number;
}

export interface EnvelopeSpec {
  at?: number;
  attack?: number;
  hold?: number;
  decay: number;
  gain: number;
  /** -1..1, only meaningful in stereo definitions. */
  pan?: number;
  /** Destination node. Defaults to the kit output. */
  to?: AudioNode;
}

export interface NoiseSpec extends EnvelopeSpec {
  color?: NoiseColor;
  filters?: readonly FilterStep[];
}

export interface ToneSpec extends EnvelopeSpec {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** Seconds over which freq moves to freqEnd. Defaults to the layer length. */
  glide?: number;
  detune?: number;
  filters?: readonly FilterStep[];
}

function softClipCurve(drive: number) {
  const size = 2048;
  const curve = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

const layerLength = (spec: EnvelopeSpec): number => (spec.attack ?? 0.0008) + (spec.hold ?? 0) + spec.decay;

/** Graph helpers for one offline render. Each layer is one source, its filters and an exponential envelope. */
export class Kit {
  readonly out: GainNode;

  constructor(
    readonly ctx: OfflineAudioContext,
    readonly rng: Rng,
    private readonly noiseSet: NoiseSet,
  ) {
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
  }

  /** Inserts a tanh saturator on the whole sound. */
  shape(drive: number): void {
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = softClipCurve(drive);
    shaper.oversample = '2x';
    this.out.disconnect();
    this.out.connect(shaper);
    shaper.connect(this.ctx.destination);
  }

  noise(spec: NoiseSpec): void {
    const buffer = this.noiseSet[spec.color ?? 'white'];
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const at = spec.at ?? 0;
    const end = at + layerLength(spec);
    this.chain(source, spec.filters, at, end).connect(this.envelope(spec));
    source.start(at, this.rng.next() * buffer.duration);
    source.stop(end + 0.01);
  }

  tone(spec: ToneSpec): void {
    const osc = this.ctx.createOscillator();
    osc.type = spec.type ?? 'sine';
    const at = spec.at ?? 0;
    const end = at + layerLength(spec);
    osc.frequency.setValueAtTime(spec.freq, at);
    if (spec.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(spec.freqEnd, at + (spec.glide ?? end - at));
    }
    osc.detune.value = spec.detune ?? 0;
    this.chain(osc, spec.filters, at, end).connect(this.envelope(spec));
    osc.start(at);
    osc.stop(end + 0.01);
  }

  /** Struck steel: inharmonic partials over a short noise tick. */
  metal(at: number, base: number, gain: number, decay: number, to?: AudioNode): void {
    const ratios = [1, 1.51, 2.27, 3.13];
    const levels = [1, 0.62, 0.38, 0.22];
    for (let i = 0; i < ratios.length; i++) {
      this.tone({
        at,
        freq: base * ratios[i] * this.rng.range(0.985, 1.015),
        decay: decay * (1 - i * 0.16),
        gain: gain * levels[i] * 0.5,
        to,
      });
    }
    this.noise({ at, decay: 0.008, gain: gain * 0.6, filters: [{ type: 'highpass', freq: Math.min(base * 1.5, 8000) }], to });
  }

  /** Fabric movement: a run of soft overlapping band-limited noise grains. */
  cloth(at: number, duration: number, gain: number): void {
    const grains = Math.max(3, Math.round(duration * 22));
    for (let i = 0; i < grains; i++) {
      const offset = at + (i / grains) * duration + this.rng.range(0, 0.012);
      this.noise({
        at: offset,
        attack: this.rng.range(0.006, 0.02),
        decay: this.rng.range(0.02, 0.06),
        gain: gain * this.rng.range(0.35, 1),
        color: 'pink',
        filters: [
          { type: 'bandpass', freq: this.rng.range(1300, 3600), q: 0.7 },
          { type: 'highpass', freq: 500 },
        ],
      });
    }
  }

  private chain(source: AudioNode, filters: readonly FilterStep[] | undefined, at: number, end: number): AudioNode {
    let tail = source;
    for (const step of filters ?? []) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = step.type;
      filter.frequency.setValueAtTime(step.freq, at);
      if (step.freqEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(step.freqEnd, end);
      filter.Q.value = step.q ?? 0.707;
      if (step.gain !== undefined) filter.gain.value = step.gain;
      tail.connect(filter);
      tail = filter;
    }
    return tail;
  }

  private envelope(spec: EnvelopeSpec): GainNode {
    const amp = this.ctx.createGain();
    const at = spec.at ?? 0;
    const attack = spec.attack ?? 0.0008;
    const hold = spec.hold ?? 0;
    const peak = Math.max(spec.gain, 0.0002);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(peak, at + attack);
    amp.gain.setValueAtTime(peak, at + attack + hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + spec.decay);
    const target = spec.to ?? this.out;
    if (spec.pan !== undefined) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = spec.pan;
      amp.connect(panner);
      panner.connect(target);
    } else {
      amp.connect(target);
    }
    return amp;
  }
}

export interface SoundDef {
  key: string;
  variants: number;
  seconds: number;
  channels?: 1 | 2;
  /** Peak level the render is normalised to. Default 0.9. */
  peak?: number;
  /** Skips the anti-click end fade, for buffers that loop continuously. */
  seamless?: boolean;
  build(kit: Kit, variant: number): void;
}

type SoundExtras = Pick<SoundDef, 'channels' | 'peak' | 'seamless'>;

export function sound(
  key: string,
  variants: number,
  seconds: number,
  build: (kit: Kit, variant: number) => void,
  extras: SoundExtras = {},
): SoundDef {
  return { key, variants, seconds, build, ...extras };
}

/** Normalises a finished render and fades its last milliseconds so it can never end on a click. */
export function finishBuffer(buffer: AudioBuffer, targetPeak: number, seamless: boolean): void {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const level = Math.abs(data[i]);
      if (level > peak) peak = level;
    }
  }
  const scale = peak > 1e-5 ? targetPeak / peak : 1;
  const fadeLength = seamless ? 0 : Math.min(buffer.length, Math.ceil(buffer.sampleRate * 0.006));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] *= scale;
    for (let i = 0; i < fadeLength; i++) data[data.length - 1 - i] *= i / fadeLength;
  }
}
