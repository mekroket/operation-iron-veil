/** Footsteps, bullet impacts, body hits, player foley, pickups and the door roller. */
import type { SurfaceType } from '../core/types';
import { sound, type Kit, type SoundDef } from './synth';

function crunch(kit: Kit, start: number, spread: number, grains: number, gain: number): void {
  const r = kit.rng;
  for (let i = 0; i < grains; i++) {
    kit.noise({
      at: start + r.range(0, spread),
      decay: r.range(0.006, 0.022),
      gain: gain * r.range(0.3, 1),
      filters: [{ type: 'bandpass', freq: r.range(2000, 5200), q: 1.6 }],
    });
  }
}

function heel(kit: Kit, freq: number, gain: number, decay = 0.06): void {
  const r = kit.rng;
  kit.tone({ freq: freq * r.range(0.92, 1.08), freqEnd: freq * 0.62, decay, gain });
}

const STEP_BUILDERS: Readonly<Record<Exclude<SurfaceType, 'flesh'>, (kit: Kit) => void>> = {
  concrete: (kit) => {
    heel(kit, 105, 0.9);
    kit.noise({ decay: 0.04, gain: 0.5, color: 'pink', filters: [{ type: 'lowpass', freq: 1900 }] });
    kit.noise({ at: kit.rng.range(0.04, 0.07), decay: 0.05, gain: 0.12, filters: [{ type: 'highpass', freq: 2000 }] });
  },
  asphalt: (kit) => {
    heel(kit, 92, 0.9);
    kit.noise({ decay: 0.05, gain: 0.45, color: 'pink', filters: [{ type: 'lowpass', freq: 1300 }] });
    crunch(kit, 0.02, 0.05, 4, 0.08);
  },
  metal: (kit) => {
    heel(kit, 135, 0.8);
    kit.metal(0, kit.rng.range(380, 470), 0.6, 0.2);
    kit.metal(0.012, kit.rng.range(1050, 1300), 0.2, 0.08);
  },
  wood: (kit) => {
    heel(kit, 175, 0.9, 0.07);
    kit.noise({ decay: 0.05, gain: 0.45, color: 'pink', filters: [{ type: 'bandpass', freq: kit.rng.range(520, 720), q: 1.3 }] });
    kit.tone({ at: 0.05, type: 'triangle', freq: kit.rng.range(780, 960), decay: 0.04, gain: 0.05 });
  },
  gravel: (kit) => {
    heel(kit, 88, 0.55);
    kit.noise({ decay: 0.06, gain: 0.25, color: 'pink', filters: [{ type: 'lowpass', freq: 1500 }] });
    crunch(kit, 0, 0.15, kit.rng.int(9, 14), 0.42);
  },
  water: (kit) => {
    const r = kit.rng;
    heel(kit, 80, 0.3);
    kit.noise({ attack: 0.018, decay: 0.2, gain: 0.8, filters: [{ type: 'bandpass', freq: 850, freqEnd: 2500, q: 0.8 }] });
    for (let i = 0; i < 3; i++) {
      const freq = r.range(550, 950);
      kit.tone({ at: 0.03 + r.range(0, 0.12), freq, freqEnd: freq * 1.8, decay: 0.03, gain: 0.14 });
    }
  },
};

const IMPACT_BUILDERS: Readonly<Record<SurfaceType, (kit: Kit) => void>> = {
  metal: (kit) => {
    const r = kit.rng;
    kit.metal(0, r.range(1500, 2100), 1, r.range(0.2, 0.32));
    kit.noise({ decay: 0.012, gain: 0.5, filters: [{ type: 'highpass', freq: 3000 }] });
  },
  concrete: (kit) => {
    kit.noise({ decay: 0.016, gain: 1, filters: [{ type: 'highpass', freq: 1700 }] });
    kit.noise({ decay: 0.1, gain: 0.5, color: 'pink', filters: [{ type: 'lowpass', freq: 1000 }] });
    kit.tone({ freq: 190, freqEnd: 90, decay: 0.04, gain: 0.45 });
    crunch(kit, 0.02, 0.1, 4, 0.14);
  },
  asphalt: (kit) => {
    kit.noise({ decay: 0.016, gain: 0.8, filters: [{ type: 'bandpass', freq: 1500, q: 0.7 }] });
    kit.noise({ decay: 0.12, gain: 0.5, color: 'pink', filters: [{ type: 'lowpass', freq: 700 }] });
    crunch(kit, 0.015, 0.08, 3, 0.12);
  },
  wood: (kit) => {
    const r = kit.rng;
    kit.tone({ freq: r.range(360, 480), freqEnd: 180, decay: 0.07, gain: 1 });
    kit.noise({ decay: 0.03, gain: 0.65, filters: [{ type: 'bandpass', freq: r.range(800, 1100), q: 1.2 }] });
    kit.noise({ at: 0.012, decay: 0.05, gain: 0.14, filters: [{ type: 'highpass', freq: 2800 }] });
  },
  gravel: (kit) => {
    kit.noise({ decay: 0.03, gain: 0.7, color: 'pink', filters: [{ type: 'lowpass', freq: 1600 }] });
    crunch(kit, 0, 0.16, 10, 0.5);
  },
  water: (kit) => {
    const r = kit.rng;
    kit.noise({ attack: 0.004, decay: 0.22, gain: 0.9, filters: [{ type: 'bandpass', freq: 1400, freqEnd: 4200, q: 0.8 }] });
    const freq = r.range(380, 620);
    kit.tone({ at: 0.012, freq, freqEnd: freq * 2.4, decay: 0.09, gain: 0.3 });
  },
  flesh: (kit) => {
    kit.tone({ freq: 125, freqEnd: 68, decay: 0.09, gain: 1 });
    kit.noise({ decay: 0.05, gain: 0.5, color: 'pink', filters: [{ type: 'lowpass', freq: 750 }] });
  },
};

function surfaceSounds(): SoundDef[] {
  const defs: SoundDef[] = [];
  for (const [surface, build] of Object.entries(STEP_BUILDERS)) {
    defs.push(sound(`step.${surface}`, 4, surface === 'water' ? 0.3 : 0.24, build));
  }
  for (const [surface, build] of Object.entries(IMPACT_BUILDERS)) {
    defs.push(sound(`impact.${surface}`, 3, surface === 'metal' || surface === 'water' ? 0.38 : 0.24, build));
  }
  return defs;
}

function buildBodyHit(kit: Kit): void {
  const r = kit.rng;
  kit.tone({ freq: r.range(105, 135), freqEnd: 62, decay: 0.1, gain: 1 });
  kit.noise({ decay: 0.06, gain: 0.55, color: 'pink', filters: [{ type: 'lowpass', freq: r.range(600, 900) }] });
  kit.noise({ at: 0.006, decay: 0.035, gain: 0.08, filters: [{ type: 'bandpass', freq: 2100, q: 1 }] });
}

function buildPlayerThud(kit: Kit): void {
  const r = kit.rng;
  kit.tone({ freq: r.range(92, 118), freqEnd: 42, decay: 0.2, gain: 1 });
  kit.noise({ decay: 0.1, gain: 0.7, color: 'brown', filters: [{ type: 'lowpass', freq: 420 }] });
  kit.noise({ decay: 0.03, gain: 0.25, color: 'pink', filters: [{ type: 'bandpass', freq: 1300, q: 0.8 }] });
}

/** Pained exhale: shaped noise through a pair of vowel-like resonances. */
function buildBreath(kit: Kit): void {
  const r = kit.rng;
  const low = r.range(620, 860);
  const high = r.range(1500, 2000);
  kit.noise({ attack: 0.05, hold: 0.04, decay: 0.34, gain: 1, color: 'pink', filters: [{ type: 'bandpass', freq: low, freqEnd: low * 0.8, q: 2.4 }] });
  kit.noise({ attack: 0.05, hold: 0.04, decay: 0.28, gain: 0.5, color: 'pink', filters: [{ type: 'bandpass', freq: high, freqEnd: high * 0.75, q: 3 }] });
}

/** One lub-dub cycle with silence around it: loops cleanly and playbackRate sets the pulse. */
function buildHeart(kit: Kit): void {
  kit.tone({ at: 0.02, attack: 0.012, freq: 66, freqEnd: 46, decay: 0.15, gain: 1 });
  kit.tone({ at: 0.31, attack: 0.012, freq: 58, freqEnd: 42, decay: 0.13, gain: 0.72 });
}

function buildJump(kit: Kit): void {
  kit.cloth(0, 0.14, 0.45);
  kit.noise({ decay: 0.05, gain: 0.3, color: 'pink', filters: [{ type: 'lowpass', freq: 900 }] });
}

function buildLand(kit: Kit): void {
  const r = kit.rng;
  kit.tone({ freq: r.range(82, 104), freqEnd: 44, decay: 0.15, gain: 1 });
  kit.noise({ decay: 0.08, gain: 0.7, color: 'pink', filters: [{ type: 'lowpass', freq: 1100 }] });
  kit.cloth(0.012, 0.12, 0.2);
  kit.metal(0.03, r.range(1700, 2400), 0.09, 0.04);
}

/** Medkit: a velcro rip followed by fabric handling. */
function buildMedic(kit: Kit): void {
  const r = kit.rng;
  let t = 0;
  while (t < 0.2) {
    kit.noise({ at: t, attack: 0.002, decay: 0.012, gain: r.range(0.4, 0.8), filters: [{ type: 'bandpass', freq: r.range(2600, 4800), q: 1.2 }] });
    t += r.range(0.008, 0.02);
  }
  kit.cloth(0.2, 0.42, 0.42);
}

function buildPickupAmmo(kit: Kit): void {
  const r = kit.rng;
  kit.cloth(0, 0.1, 0.32);
  for (let i = 0; i < 4; i++) kit.metal(0.03 + i * r.range(0.024, 0.045), r.range(1300, 2700), r.range(0.35, 0.75), 0.05);
}

/** A steel shutter: low motor rumble, slats rattling on the run and a clunk at the stop. */
function buildDoorRoller(kit: Kit): void {
  const r = kit.rng;
  kit.noise({ attack: 0.25, hold: 2, decay: 0.45, gain: 1, color: 'brown', filters: [{ type: 'lowpass', freq: 230 }] });
  kit.tone({ attack: 0.3, hold: 1.9, decay: 0.4, type: 'sawtooth', freq: 47, gain: 0.3, filters: [{ type: 'lowpass', freq: 190 }] });
  let t = 0.1;
  while (t < 2.5) {
    kit.metal(t, r.range(520, 1250), r.range(0.05, 0.17), r.range(0.04, 0.09));
    t += r.range(0.055, 0.1);
  }
  kit.tone({ at: 2.56, freq: 135, freqEnd: 58, decay: 0.24, gain: 0.8 });
  kit.metal(2.56, r.range(360, 460), 0.5, 0.26);
}

export const FOLEY_SOUNDS: readonly SoundDef[] = [
  ...surfaceSounds(),
  sound('body.hit', 3, 0.18, buildBodyHit),
  sound('player.thud', 3, 0.3, buildPlayerThud),
  sound('player.breath', 3, 0.5, buildBreath),
  sound('player.heart', 1, 1, buildHeart, { seamless: true }),
  sound('player.jump', 2, 0.24, buildJump),
  sound('player.land', 3, 0.26, buildLand),
  sound('medic.rustle', 2, 0.75, buildMedic),
  sound('pickup.ammo', 2, 0.3, buildPickupAmmo),
  sound('pickup.medkit', 1, 0.75, buildMedic),
  sound('door.roller', 2, 3, buildDoorRoller),
];
