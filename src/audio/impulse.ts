/** Generated convolution impulse responses. Built at the context's own rate, which ConvolverNode requires. */
import { Rng } from './synth';

interface Reflection {
  time: number;
  level: number;
}

interface TailSpec {
  /** Seconds before the diffuse tail starts. */
  start: number;
  /** Exponential time constant of the tail. */
  decay: number;
  level: number;
  /** One-pole low-pass coefficients: how open the tail is at its start and at its end. */
  brightStart: number;
  brightEnd: number;
}

function writeChannel(data: Float32Array, rate: number, rng: Rng, reflections: readonly Reflection[], tail: TailSpec): void {
  const startIndex = Math.floor(tail.start * rate);
  const fadeIn = Math.max(1, Math.floor(rate * 0.02));
  let low = 0;
  for (let i = startIndex; i < data.length; i++) {
    const position = (i - startIndex) / rate;
    const bright = tail.brightEnd + (tail.brightStart - tail.brightEnd) * Math.exp(-position / (tail.decay * 0.8));
    low += bright * (rng.next() * 2 - 1 - low);
    const ramp = Math.min(1, (i - startIndex) / fadeIn);
    data[i] = low * tail.level * ramp * Math.exp(-position / tail.decay);
  }
  // Discrete reflections are short noise grains, which smear less metallically than single impulses.
  const grain = Math.max(8, Math.floor(rate * 0.005));
  for (const reflection of reflections) {
    const at = Math.floor(reflection.time * rate);
    for (let i = 0; i < grain && at + i < data.length; i++) {
      data[at + i] += reflection.level * (1 - i / grain) * (rng.next() * 2 - 1);
    }
  }
  // Fade the end so normalisation never leaves a truncation step.
  const fadeOut = Math.min(data.length, Math.floor(rate * 0.05));
  for (let i = 0; i < fadeOut; i++) data[data.length - 1 - i] *= i / fadeOut;
}

/** Open air and hard harbour walls: distinct slaps over a long, darkening wash. */
export function buildExteriorImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(rate * 1.9), rate);
  const rng = new Rng(0x51a9);
  for (let c = 0; c < 2; c++) {
    const skew = c === 0 ? 1 : 1.07;
    writeChannel(
      buffer.getChannelData(c),
      rate,
      rng,
      [
        { time: 0.085 * skew, level: 0.62 },
        { time: 0.19 / skew, level: 0.44 },
        { time: 0.31 * skew, level: 0.3 },
        { time: 0.52 / skew, level: 0.18 },
        { time: 0.81 * skew, level: 0.09 },
      ],
      { start: 0.11, decay: 0.42, level: 0.28, brightStart: 0.4, brightEnd: 0.06 },
    );
  }
  return buffer;
}

/** A concrete room: dense early reflections and a short, boxy tail. */
export function buildInteriorImpulse(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(rate * 0.75), rate);
  const rng = new Rng(0x7e11);
  for (let c = 0; c < 2; c++) {
    const reflections: Reflection[] = [];
    for (let i = 0; i < 9; i++) {
      reflections.push({ time: rng.range(0.006, 0.05), level: rng.range(0.25, 0.7) * (1 - i * 0.06) });
    }
    writeChannel(buffer.getChannelData(c), rate, rng, reflections, {
      start: 0.012,
      decay: 0.13,
      level: 0.7,
      brightStart: 0.5,
      brightEnd: 0.12,
    });
  }
  return buffer;
}
