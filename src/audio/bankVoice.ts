/** Wordless radio voice imitation and radio channel sounds. No speech, only formant-shaped babble. */
import type { GameEvents } from '../core/events';
import { sound, type Kit, type SoundDef } from './synth';

/** First three formants of a handful of vowels, in Hz. */
const VOWELS: readonly (readonly [number, number, number])[] = [
  [730, 1090, 2440],
  [270, 2290, 3010],
  [570, 840, 2410],
  [440, 1020, 2240],
  [530, 1840, 2480],
  [660, 1720, 2410],
];

interface BabbleSpec {
  seconds: number;
  syllables: number;
  pitch: number;
  /** Multiplies syllable length. Below 1 is more urgent. */
  pace: number;
  /** Chance of a word break after each syllable. */
  pauseChance: number;
  bandLow: number;
  bandHigh: number;
}

function babble(kit: Kit, spec: BabbleSpec): void {
  const { ctx, rng } = kit;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = spec.bandLow;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = spec.bandHigh;
  highpass.connect(lowpass);
  lowpass.connect(kit.out);

  const glottis = ctx.createOscillator();
  glottis.type = 'sawtooth';
  glottis.frequency.value = spec.pitch;
  const voicing = ctx.createGain();
  voicing.gain.value = 0;
  glottis.connect(voicing);

  const formantQ = [7, 9, 11];
  const formantLevel = [1, 0.7, 0.35];
  const formants = formantQ.map((q, i) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.value = VOWELS[0][i];
    const level = ctx.createGain();
    level.gain.value = formantLevel[i];
    voicing.connect(filter);
    filter.connect(level);
    level.connect(highpass);
    return filter;
  });

  const shift = rng.range(0.94, 1.08);
  const limit = spec.seconds - 0.2;
  let t = rng.range(0.02, 0.06);
  for (let s = 0; s < spec.syllables && t < limit; s++) {
    const vowel = rng.pick(VOWELS);
    const length = rng.range(0.09, 0.2) * spec.pace;
    formants.forEach((filter, i) => filter.frequency.setTargetAtTime(vowel[i] * shift, t, 0.022));
    glottis.frequency.setTargetAtTime(spec.pitch * rng.range(0.84, 1.18), t, 0.035);
    voicing.gain.setTargetAtTime(rng.range(0.6, 1), t, 0.012);
    voicing.gain.setTargetAtTime(0, t + length * 0.7, 0.02);
    if (rng.next() < 0.45) {
      kit.noise({ at: t, decay: 0.028, gain: 0.05, filters: [{ type: 'bandpass', freq: rng.range(1800, 2600), q: 1.1 }], to: highpass });
    }
    t += length + (rng.next() < spec.pauseChance ? rng.range(0.14, 0.34) : rng.range(0.012, 0.05));
  }
  glottis.start(0);
  glottis.stop(Math.min(t + 0.15, spec.seconds));
}

type CalloutKind = GameEvents['enemy:callout']['kind'];

const CALLOUTS: Readonly<Record<CalloutKind, Omit<BabbleSpec, 'seconds' | 'bandLow' | 'bandHigh'>>> = {
  contact: { syllables: 7, pitch: 152, pace: 0.72, pauseChance: 0.1 },
  reloading: { syllables: 5, pitch: 128, pace: 0.85, pauseChance: 0.14 },
  search: { syllables: 6, pitch: 104, pace: 1.15, pauseChance: 0.24 },
  down: { syllables: 3, pitch: 168, pace: 0.95, pauseChance: 0 },
};

function calloutSounds(): SoundDef[] {
  const defs: SoundDef[] = [];
  for (const [kind, voice] of Object.entries(CALLOUTS)) {
    defs.push(
      sound(`callout.${kind}`, 3, 1.3, (kit) => {
        kit.shape(2.6);
        kit.noise({ attack: 0.02, hold: 1.1, decay: 0.1, gain: 0.012, filters: [{ type: 'bandpass', freq: 1900, q: 0.6 }] });
        babble(kit, { ...voice, seconds: 1.3, bandLow: 420, bandHigh: 2500 });
      }),
    );
  }
  return defs;
}

function buildStatic(kit: Kit): void {
  const r = kit.rng;
  const seconds = 3.5;
  kit.noise({ attack: 0.001, hold: seconds, decay: 0.01, gain: 0.5, filters: [{ type: 'bandpass', freq: 2400, q: 0.5 }] });
  kit.noise({ attack: 0.001, hold: seconds, decay: 0.01, gain: 0.2, color: 'pink', filters: [{ type: 'bandpass', freq: 900, q: 0.7 }] });
  for (let i = 0; i < 16; i++) {
    kit.noise({ at: r.range(0.05, seconds - 0.05), decay: r.range(0.002, 0.008), gain: r.range(0.2, 0.7), filters: [{ type: 'highpass', freq: 3000 }] });
  }
}

function buildSquelchIn(kit: Kit): void {
  kit.tone({ type: 'square', freq: 1850, decay: 0.006, gain: 0.45, filters: [{ type: 'bandpass', freq: 2100, q: 1 }] });
  kit.noise({ at: 0.004, attack: 0.01, decay: 0.07, gain: 0.8, filters: [{ type: 'bandpass', freq: 2400, q: 0.6 }] });
}

function buildSquelchOut(kit: Kit): void {
  kit.noise({ attack: 0.005, decay: 0.09, gain: 0.8, filters: [{ type: 'bandpass', freq: 2900, freqEnd: 1500, q: 0.7 }] });
  kit.tone({ at: 0.075, type: 'square', freq: 1320, freqEnd: 880, decay: 0.028, gain: 0.28, filters: [{ type: 'bandpass', freq: 1500, q: 1 }] });
}

export const VOICE_SOUNDS: readonly SoundDef[] = [
  ...calloutSounds(),
  sound('radio.static', 1, 3.5, buildStatic, { seamless: true }),
  sound('radio.babble', 3, 4.6, (kit) => {
    kit.shape(2);
    babble(kit, { seconds: 4.6, syllables: 26, pitch: 118, pace: 1, pauseChance: 0.2, bandLow: 520, bandHigh: 2200 });
  }),
  sound('radio.squelchIn', 2, 0.12, buildSquelchIn),
  sound('radio.squelchOut', 2, 0.14, buildSquelchOut),
];
