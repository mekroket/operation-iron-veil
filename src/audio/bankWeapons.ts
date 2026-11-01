/** Player weapon, enemy weapon and weapon-handling sounds. */
import type { WeaponId } from '../core/types';
import { sound, type Kit, type SoundDef } from './synth';

interface GunProfile {
  id: WeaponId;
  crackHighpass: number;
  crackBand: number;
  crackQ: number;
  crackDecay: number;
  bodyLowpass: number;
  bodyDecay: number;
  bodyGain: number;
  punchFreq: number;
  punchEnd: number;
  punchDecay: number;
  boltGain: number;
  drive: number;
  thumpFreq: number;
  thumpEnd: number;
  thumpDecay: number;
  thumpNoise: number;
}

const GUNS: readonly GunProfile[] = [
  {
    // Sharp mid crack with body.
    id: 'assaultRifle',
    crackHighpass: 850,
    crackBand: 2500,
    crackQ: 0.8,
    crackDecay: 0.055,
    bodyLowpass: 2300,
    bodyDecay: 0.15,
    bodyGain: 0.85,
    punchFreq: 210,
    punchEnd: 85,
    punchDecay: 0.075,
    boltGain: 0.16,
    drive: 2.6,
    thumpFreq: 115,
    thumpEnd: 38,
    thumpDecay: 0.2,
    thumpNoise: 170,
  },
  {
    // Lighter and snappier.
    id: 'smg',
    crackHighpass: 1400,
    crackBand: 3800,
    crackQ: 1,
    crackDecay: 0.032,
    bodyLowpass: 3200,
    bodyDecay: 0.075,
    bodyGain: 0.55,
    punchFreq: 300,
    punchEnd: 130,
    punchDecay: 0.04,
    boltGain: 0.24,
    drive: 2.1,
    thumpFreq: 150,
    thumpEnd: 62,
    thumpDecay: 0.085,
    thumpNoise: 240,
  },
  {
    // Tight pop.
    id: 'handgun',
    crackHighpass: 700,
    crackBand: 1900,
    crackQ: 1.6,
    crackDecay: 0.03,
    bodyLowpass: 1200,
    bodyDecay: 0.065,
    bodyGain: 0.8,
    punchFreq: 260,
    punchEnd: 120,
    punchDecay: 0.045,
    boltGain: 0.1,
    drive: 3,
    thumpFreq: 110,
    thumpEnd: 50,
    thumpDecay: 0.1,
    thumpNoise: 200,
  },
];

function buildCrack(kit: Kit, gun: GunProfile): void {
  const r = kit.rng;
  kit.shape(gun.drive);
  kit.noise({
    decay: gun.crackDecay * r.range(0.85, 1.15),
    gain: 1,
    filters: [
      { type: 'highpass', freq: gun.crackHighpass * r.range(0.92, 1.08) },
      { type: 'peaking', freq: gun.crackBand * r.range(0.9, 1.1), q: gun.crackQ, gain: 9 },
    ],
  });
  const bodyEnd = gun.bodyLowpass * 0.35;
  kit.noise({
    decay: gun.bodyDecay * r.range(0.9, 1.1),
    gain: gun.bodyGain,
    color: 'pink',
    filters: [
      { type: 'lowpass', freq: gun.bodyLowpass, freqEnd: bodyEnd },
      { type: 'highpass', freq: 170 },
    ],
  });
  kit.tone({
    type: 'square',
    freq: gun.punchFreq * r.range(0.95, 1.05),
    freqEnd: gun.punchEnd,
    decay: gun.punchDecay,
    gain: 0.5,
    filters: [{ type: 'lowpass', freq: 1600 }],
  });
  // Bolt cycling tick behind the report.
  kit.noise({
    at: r.range(0.014, 0.024),
    decay: 0.02,
    gain: gun.boltGain,
    filters: [{ type: 'bandpass', freq: r.range(4600, 5800), q: 3 }],
  });
}

function buildThump(kit: Kit, gun: GunProfile): void {
  const r = kit.rng;
  kit.tone({
    freq: gun.thumpFreq * r.range(0.94, 1.06),
    freqEnd: gun.thumpEnd,
    glide: gun.thumpDecay * 0.6,
    decay: gun.thumpDecay * r.range(0.9, 1.1),
    gain: 1,
  });
  kit.noise({
    decay: gun.thumpDecay * 0.5,
    gain: 0.9,
    color: 'brown',
    filters: [{ type: 'lowpass', freq: gun.thumpNoise }],
  });
}

function gunSounds(): SoundDef[] {
  const defs: SoundDef[] = [];
  for (const gun of GUNS) {
    defs.push(sound(`gun.${gun.id}.crack`, 4, 0.34, (kit) => buildCrack(kit, gun)));
    defs.push(sound(`gun.${gun.id}.thump`, 3, 0.3, (kit) => buildThump(kit, gun)));
  }
  return defs;
}

/** Hostile rifle: heavier, darker, with a short baked-in slap so it reads as "out there" rather than in the hands. */
function buildEnemyShot(kit: Kit): void {
  const r = kit.rng;
  kit.shape(2.4);
  kit.noise({
    decay: 0.05 * r.range(0.85, 1.2),
    gain: 0.9,
    filters: [
      { type: 'highpass', freq: 600 },
      { type: 'peaking', freq: r.range(1500, 2200), q: 0.9, gain: 7 },
    ],
  });
  kit.noise({ decay: 0.2, gain: 0.9, color: 'pink', filters: [{ type: 'lowpass', freq: 1500, freqEnd: 350 }] });
  kit.tone({ freq: 105, freqEnd: 40, decay: 0.26, gain: 0.95 });
  kit.noise({
    at: r.range(0.1, 0.17),
    attack: 0.006,
    decay: 0.28,
    gain: 0.16,
    color: 'pink',
    filters: [{ type: 'bandpass', freq: r.range(650, 1000), q: 0.6 }],
  });
}

/** Near miss: a very short N-wave snap and a thin air whip. */
function buildBulletCrack(kit: Kit): void {
  const r = kit.rng;
  kit.noise({ decay: 0.007, gain: 1, filters: [{ type: 'highpass', freq: 2600 }] });
  kit.noise({
    at: 0.004,
    decay: 0.05,
    gain: 0.22,
    filters: [{ type: 'bandpass', freq: r.range(5200, 3800), q: 1.5, freqEnd: 1700 }],
  });
}

function buildDryClick(kit: Kit): void {
  const r = kit.rng;
  kit.metal(0, r.range(2900, 3500), 0.7, 0.02);
  kit.tone({ at: 0.002, freq: 520, freqEnd: 300, decay: 0.018, gain: 0.3 });
}

function buildMagRelease(kit: Kit): void {
  kit.metal(0, kit.rng.range(2100, 2500), 0.75, 0.04);
  kit.noise({ at: 0.006, decay: 0.06, gain: 0.16, filters: [{ type: 'bandpass', freq: 3400, q: 2 }] });
}

function buildMagOut(kit: Kit): void {
  kit.noise({
    attack: 0.03,
    decay: 0.11,
    gain: 0.45,
    filters: [{ type: 'bandpass', freq: 1700, freqEnd: 800, q: 1.1 }],
  });
  kit.metal(0.11, kit.rng.range(820, 980), 0.55, 0.07);
}

function buildMagIn(kit: Kit): void {
  kit.noise({ attack: 0.02, decay: 0.05, gain: 0.3, filters: [{ type: 'bandpass', freq: 1000, freqEnd: 2000, q: 1 }] });
  kit.tone({ at: 0.055, freq: 250, freqEnd: 110, decay: 0.07, gain: 0.8 });
  kit.metal(0.055, kit.rng.range(1400, 1650), 0.85, 0.06);
  kit.metal(0.085, kit.rng.range(2500, 2800), 0.5, 0.03);
}

function buildCharge(kit: Kit): void {
  // Handle pulled back against the spring, then the bolt slamming home.
  kit.metal(0, kit.rng.range(1700, 1950), 0.6, 0.04);
  kit.noise({ attack: 0.05, decay: 0.08, gain: 0.34, filters: [{ type: 'bandpass', freq: 2200, freqEnd: 1200, q: 1.4 }] });
  kit.tone({ at: 0.19, freq: 300, freqEnd: 125, decay: 0.09, gain: 0.9 });
  kit.metal(0.19, kit.rng.range(1150, 1350), 1, 0.08);
  kit.metal(0.205, kit.rng.range(2800, 3200), 0.5, 0.035);
}

function buildSwitch(kit: Kit): void {
  const r = kit.rng;
  kit.cloth(0, 0.2, 0.42);
  const ticks = r.int(3, 5);
  for (let i = 0; i < ticks; i++) kit.metal(0.05 + r.range(0, 0.24), r.range(1500, 3600), r.range(0.25, 0.55), 0.03);
  kit.tone({ at: 0.27, freq: 220, freqEnd: 120, decay: 0.05, gain: 0.3 });
}

export const WEAPON_SOUNDS: readonly SoundDef[] = [
  ...gunSounds(),
  sound('enemy.shot', 4, 0.75, buildEnemyShot),
  sound('bullet.crack', 3, 0.1, buildBulletCrack),
  sound('wpn.dry', 2, 0.06, buildDryClick),
  sound('wpn.magRelease', 2, 0.1, buildMagRelease),
  sound('wpn.magOut', 2, 0.24, buildMagOut),
  sound('wpn.magIn', 2, 0.2, buildMagIn),
  sound('wpn.charge', 2, 0.34, buildCharge),
  sound('wpn.switch', 3, 0.4, buildSwitch),
  sound('wpn.ads', 3, 0.2, (kit) => kit.cloth(0, 0.11, 0.6)),
];
