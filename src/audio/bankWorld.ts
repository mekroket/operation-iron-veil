/** Explosions, feedback tones, interface sounds and the one-shots used by the ambience. */
import { sound, type Kit, type SoundDef } from './synth';

function buildBoom(kit: Kit): void {
  const r = kit.rng;
  kit.shape(1.8);
  kit.tone({ freq: r.range(62, 76), freqEnd: 24, glide: 0.8, attack: 0.004, decay: 2, gain: 1 });
  kit.noise({ attack: 0.005, hold: 0.04, decay: 2.8, gain: 1, color: 'brown', pan: -0.25, filters: [{ type: 'lowpass', freq: 280, freqEnd: 60 }] });
  kit.noise({ attack: 0.005, hold: 0.04, decay: 2.5, gain: 0.95, color: 'brown', pan: 0.25, filters: [{ type: 'lowpass', freq: 240, freqEnd: 70 }] });
  kit.noise({ decay: 0.8, gain: 0.65, color: 'pink', filters: [{ type: 'lowpass', freq: 1700, freqEnd: 200 }] });
  kit.noise({ decay: 0.07, gain: 0.8, filters: [{ type: 'highpass', freq: 1000 }] });
}

function buildDebris(kit: Kit): void {
  const r = kit.rng;
  kit.noise({ attack: 0.2, hold: 0.3, decay: 1.9, gain: 0.3, color: 'pink', filters: [{ type: 'bandpass', freq: 1500, q: 0.4 }, { type: 'lowpass', freq: 3000, freqEnd: 800 }] });
  const pieces = r.int(18, 26);
  for (let i = 0; i < pieces; i++) {
    const at = 0.05 + Math.pow(r.next(), 1.7) * 2.4;
    const level = (1 - at / 3) * r.range(0.25, 1);
    const pan = r.range(-0.8, 0.8);
    if (r.next() < 0.25) {
      kit.tone({ at, freq: r.range(800, 2400), decay: r.range(0.03, 0.09), gain: level * 0.22, pan });
    }
    kit.noise({ at, decay: r.range(0.012, 0.06), gain: level * 0.8, pan, filters: [{ type: 'bandpass', freq: r.range(700, 4200), q: 1.4 }] });
  }
}

function softNote(kit: Kit, at: number, freq: number, gain: number, decay: number): void {
  kit.tone({ at, attack: 0.006, freq, decay, gain });
  kit.tone({ at, attack: 0.006, type: 'triangle', freq: freq * 2, decay: decay * 0.5, gain: gain * 0.18 });
}

function buildObjective(kit: Kit): void {
  softNote(kit, 0, 880, 0.7, 0.3);
  softNote(kit, 0.11, 1174.66, 0.8, 0.42);
}

function buildCheckpoint(kit: Kit): void {
  softNote(kit, 0, 659.25, 0.6, 0.5);
  softNote(kit, 0.02, 987.77, 0.34, 0.45);
}

function chordSwell(kit: Kit, freqs: readonly number[], attack: number, hold: number, decay: number, cutoff: number, cutoffEnd: number): void {
  const r = kit.rng;
  freqs.forEach((freq, i) => {
    const pan = i % 2 === 0 ? -0.35 : 0.35;
    for (const detune of [-7, 6]) {
      kit.tone({
        type: 'sawtooth',
        freq,
        detune: detune + r.range(-2, 2),
        attack,
        hold,
        decay,
        gain: 0.2,
        pan,
        filters: [{ type: 'lowpass', freq: cutoff, freqEnd: cutoffEnd, q: 0.9 }],
      });
    }
  });
}

function buildComplete(kit: Kit): void {
  chordSwell(kit, [73.42, 110, 146.83, 220], 2.2, 0.4, 3.8, 260, 980);
  kit.tone({ freq: 36.71, attack: 2.2, hold: 0.4, decay: 3.8, gain: 0.8 });
}

function buildFailed(kit: Kit): void {
  chordSwell(kit, [65.41, 77.78, 98], 0.5, 0.2, 2.8, 700, 150);
  kit.tone({ freq: 49, freqEnd: 32, attack: 0.5, hold: 0.2, decay: 2.8, gain: 0.8 });
}

function buildHover(kit: Kit): void {
  kit.tone({ freq: kit.rng.range(2500, 2700), decay: 0.014, gain: 0.5 });
  kit.noise({ decay: 0.005, gain: 0.08, filters: [{ type: 'highpass', freq: 6000 }] });
}

function buildClick(kit: Kit): void {
  kit.tone({ freq: kit.rng.range(1450, 1550), freqEnd: 1100, decay: 0.024, gain: 0.6 });
  kit.tone({ freq: 420, decay: 0.016, gain: 0.25 });
  kit.noise({ decay: 0.007, gain: 0.25, filters: [{ type: 'bandpass', freq: 3200, q: 1 }] });
}

function buildHitTick(kit: Kit): void {
  kit.tone({ freq: 2300, decay: 0.02, gain: 0.8 });
  kit.noise({ decay: 0.004, gain: 0.22, filters: [{ type: 'highpass', freq: 5000 }] });
}

function buildHeadTick(kit: Kit): void {
  kit.tone({ freq: 3100, decay: 0.024, gain: 0.75 });
  kit.tone({ freq: 4650, decay: 0.016, gain: 0.3 });
}

function buildKillTick(kit: Kit): void {
  kit.tone({ freq: 1900, decay: 0.03, gain: 0.8 });
  kit.tone({ at: 0.052, freq: 1267, decay: 0.07, gain: 0.8 });
  kit.tone({ at: 0.052, freq: 180, freqEnd: 110, decay: 0.05, gain: 0.3 });
}

/** A buoy bell across the water: two uneven strikes, heavily rolled off by distance. */
function buildBell(kit: Kit): void {
  const r = kit.rng;
  const base = r.range(330, 355);
  const ratios = [1, 2.01, 2.42, 3.02, 4.2];
  const levels = [1, 0.55, 0.42, 0.22, 0.12];
  const strike = (at: number, force: number): void => {
    ratios.forEach((ratio, i) => {
      kit.tone({
        at,
        attack: 0.002,
        freq: base * ratio,
        decay: 5.2 - i * 0.9,
        gain: levels[i] * force * 0.4,
        filters: [{ type: 'lowpass', freq: 2600 }],
      });
    });
  };
  strike(0, 1);
  strike(r.range(0.75, 1.05), 0.55);
}

function buildClank(kit: Kit): void {
  const r = kit.rng;
  const base = r.range(320, 620);
  kit.metal(0, base, 0.85, r.range(0.32, 0.6));
  kit.metal(r.range(0.13, 0.28), base * r.range(0.96, 1.2), 0.32, 0.26);
  kit.noise({ at: 0.28, attack: 0.04, decay: 0.7, gain: 0.05, color: 'pink', filters: [{ type: 'bandpass', freq: base * 1.5, q: 1.1 }] });
}

function buildGull(kit: Kit): void {
  const r = kit.rng;
  const cries = r.int(2, 4);
  let at = r.range(0.02, 0.1);
  for (let i = 0; i < cries; i++) {
    const length = r.range(0.14, 0.32);
    const peak = r.range(1250, 1750);
    const filters = [{ type: 'bandpass', freq: peak, q: 1.8 }] as const;
    kit.tone({ at, attack: 0.03, type: 'sawtooth', freq: peak * 0.72, freqEnd: peak, glide: length * 0.3, decay: length, gain: 0.9, filters });
    at += length + r.range(0.1, 0.24);
  }
}

function buildRattle(kit: Kit): void {
  const r = kit.rng;
  const ticks = r.int(8, 15);
  for (let i = 0; i < ticks; i++) {
    const at = 0.02 + (i / ticks) * r.range(0.35, 0.72);
    kit.noise({ at, decay: r.range(0.008, 0.024), gain: r.range(0.2, 1), filters: [{ type: 'bandpass', freq: r.range(1000, 2800), q: 5 }] });
  }
}

function buildPadSwell(kit: Kit): void {
  const r = kit.rng;
  const pans = [-0.4, 0.4, 0];
  [146.83, 174.61, 220].forEach((freq, i) => {
    kit.tone({ freq, detune: r.range(-5, 5), attack: 3.5, hold: 0.6, decay: 6.4, gain: 0.3, pan: pans[i], filters: [{ type: 'lowpass', freq: 900 }] });
    kit.tone({ type: 'triangle', freq, detune: r.range(-9, 9), attack: 4, hold: 0.3, decay: 6, gain: 0.08, pan: -pans[i], filters: [{ type: 'lowpass', freq: 620 }] });
  });
}

export const WORLD_SOUNDS: readonly SoundDef[] = [
  sound('ui.hover', 2, 0.03, buildHover),
  sound('ui.click', 2, 0.05, buildClick),
  sound('hit.tick', 1, 0.04, buildHitTick),
  sound('hit.head', 1, 0.05, buildHeadTick),
  sound('hit.kill', 1, 0.14, buildKillTick),
  sound('tone.objective', 1, 0.62, buildObjective),
  sound('tone.checkpoint', 1, 0.6, buildCheckpoint),
  sound('tone.complete', 1, 6.6, buildComplete, { channels: 2 }),
  sound('tone.failed', 1, 3.6, buildFailed, { channels: 2 }),
  sound('fx.boom', 2, 3.4, buildBoom, { channels: 2, peak: 1 }),
  sound('fx.debris', 2, 3, buildDebris, { channels: 2 }),
  sound('amb.bell', 2, 7, buildBell),
  sound('amb.clank', 3, 1.2, buildClank),
  sound('amb.gull', 3, 1.8, buildGull),
  sound('amb.rattle', 3, 0.85, buildRattle),
  sound('amb.padSwell', 2, 10.8, buildPadSwell, { channels: 2 }),
];
