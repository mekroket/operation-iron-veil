/**
 * Procedural shape of each fictional weapon, one batch per material or moving part. Pure: no Babylon, no DOM.
 * Model space: +Z towards the muzzle, +Y up, origin near the top of the grip. Metres.
 */
import type { Vec3, WeaponId } from '../core/types';
import { addCradleHand, addGripHand } from './gunArms';
import { GeometryBatch } from './gunGeometry';

export interface GunGeometry {
  steel: GeometryBatch;
  polymer: GeometryBatch;
  glow: GeometryBatch;
  magazine: GeometryBatch;
  bolt: GeometryBatch;
  rightArm: GeometryBatch;
  leftArm: GeometryBatch;
  muzzle: Vec3;
  /** Moves the left hand from its resting place onto the seated magazine. */
  leftHandToMag: Vec3;
  /** Moves a seated magazine clear of the magazine well. */
  magOut: Vec3;
}

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const BLACK = [0.045, 0.047, 0.05] as const;
const DARK_INSET = [0.012, 0.012, 0.014] as const;
const GUNMETAL = [0.2, 0.205, 0.22] as const;
const WORN_STEEL = [0.34, 0.345, 0.36] as const;
const TAN = [0.13, 0.115, 0.08] as const;
const OLIVE = [0.11, 0.125, 0.075] as const;
const SIGNAL_ORANGE = [0.62, 0.2, 0.04] as const;
const SIGHT_DOT = [0.75, 0.82, 0.22] as const;

type Tint = readonly [number, number, number];
const paint = (batch: GeometryBatch, c: Tint): GeometryBatch => batch.tint(c[0], c[1], c[2]);

function emptyGun(muzzle: Vec3, leftHandToMag: Vec3, magOut: Vec3): GunGeometry {
  return {
    steel: new GeometryBatch(),
    polymer: new GeometryBatch(),
    glow: new GeometryBatch(),
    magazine: new GeometryBatch(),
    bolt: new GeometryBatch(),
    rightArm: new GeometryBatch(),
    leftArm: new GeometryBatch(),
    muzzle,
    leftHandToMag,
    magOut,
  };
}

function addRailTeeth(batch: GeometryBatch, y: number, startZ: number, step: number, count: number): void {
  for (let i = 0; i < count; i++) batch.box(0, y, startZ + i * step, 0.027, 0.003, step * 0.46);
}

function addTrigger(steel: GeometryBatch, polymer: GeometryBatch, topZ: number, y: number): void {
  paint(steel, WORN_STEEL).tube(at(0, y, topZ), at(0, y - 0.022, topZ - 0.009), 0.0032, 0.0026, 5);
  polymer.box(0, y - 0.03, topZ - 0.004, 0.011, 0.004, 0.052);
  polymer.tube(at(0, y, topZ + 0.028), at(0, y - 0.03, topZ + 0.021), 0.0032, 0.0032, 5);
}

/** VR-7 WARDEN: long tan handguard, solid stock, curved magazine and a reflex sight. */
function buildWarden(): GunGeometry {
  const gun = emptyGun(at(0, 0.03, 0.575), at(0, -0.125, -0.205), at(0, -0.17, 0.026));
  const { steel, polymer, glow, magazine, bolt, rightArm, leftArm } = gun;

  paint(steel, GUNMETAL);
  steel.box(0, 0.047, 0.035, 0.04, 0.03, 0.25, 0.005);
  steel.box(0, 0.068, 0.13, 0.024, 0.012, 0.45, 0.002);
  addRailTeeth(steel, 0.0755, -0.08, 0.035, 13);
  steel.tube(at(0, 0.03, 0.395), at(0, 0.03, 0.52), 0.0095, 0.0095, 10);
  steel.tube(at(0, 0.04, -0.09), at(0, 0.04, -0.215), 0.015, 0.015, 10);
  paint(steel, BLACK);
  steel.tube(at(0, 0.03, 0.515), at(0, 0.03, 0.57), 0.0145, 0.0135, 8);
  steel.tube(at(0, 0.03, 0.53), at(0, 0.03, 0.537), 0.016, 0.016, 8);
  steel.tube(at(0, 0.03, 0.552), at(0, 0.03, 0.559), 0.016, 0.016, 8);

  // Reflex sight. The window is open so the dot sits on the line of sight.
  paint(steel, BLACK);
  steel.box(0, 0.081, 0.06, 0.03, 0.008, 0.05, 0.002);
  steel.box(-0.022, 0.108, 0.06, 0.005, 0.048, 0.034, 0.0012);
  steel.box(0.022, 0.108, 0.06, 0.005, 0.048, 0.034, 0.0012);
  steel.box(0, 0.133, 0.06, 0.049, 0.005, 0.034, 0.0012);
  steel.box(0, 0.083, 0.06, 0.045, 0.004, 0.034, 0.0012);
  glow.tint(1, 0.09, 0.07).tube(at(0, 0.108, 0.05), at(0, 0.108, 0.0525), 0.0011, 0.0011, 8);

  paint(polymer, TAN);
  polymer.box(0, 0.012, 0.03, 0.036, 0.042, 0.2, 0.005);
  polymer.side([[0.052, 0], [0.104, 0], [0.108, -0.03], [0.056, -0.03]], 0.034);
  polymer.side([[-0.04, -0.005], [0.012, -0.005], [-0.01, -0.1], [-0.058, -0.094]], 0.03);
  polymer.box(0, 0.03, 0.27, 0.05, 0.052, 0.25, 0.012);
  polymer.box(0, 0.059, 0.27, 0.03, 0.006, 0.25);
  polymer.side([[-0.2, 0.06], [-0.335, 0.068], [-0.345, -0.055], [-0.3, -0.06], [-0.205, -0.005]], 0.032);
  paint(polymer, DARK_INSET);
  for (const z of [0.2, 0.26, 0.32]) {
    polymer.box(-0.0255, 0.033, z, 0.0012, 0.017, 0.04);
    polymer.box(0.0255, 0.033, z, 0.0012, 0.017, 0.04);
  }
  polymer.box(0, 0.003, -0.35, 0.034, 0.126, 0.012, 0.004);
  paint(polymer, TAN);
  addTrigger(steel, polymer, 0.03, -0.006);

  paint(magazine, BLACK);
  magazine.side([[0.058, -0.002], [0.1, -0.002], [0.112, -0.085], [0.066, -0.092]], 0.026);
  magazine.side([[0.066, -0.092], [0.112, -0.085], [0.132, -0.165], [0.086, -0.176]], 0.026);
  paint(magazine, OLIVE);
  magazine.side([[0.082, -0.176], [0.136, -0.163], [0.138, -0.172], [0.085, -0.187]], 0.03);

  paint(bolt, WORN_STEEL);
  bolt.box(0.0205, 0.046, 0.055, 0.003, 0.015, 0.055);
  bolt.box(0, 0.066, -0.083, 0.03, 0.008, 0.02, 0.002);
  bolt.box(-0.0255, 0.05, 0.075, 0.012, 0.008, 0.018, 0.002);

  addGripHand(rightArm, at(0, -0.05, -0.022), 1, 0.22, at(0.12, -0.2, -0.42), true);
  addCradleHand(leftArm, at(0, 0.004, 0.3), 0.027, at(-0.2, -0.24, -0.42));
  return gun;
}

/** SX-4 HORNET: square black body, shrouded stub barrel, wire stock, stick magazine and foregrip. */
function buildHornet(): GunGeometry {
  const gun = emptyGun(at(0, 0.03, 0.335), at(0, -0.07, -0.09), at(0, -0.21, 0.008));
  const { steel, polymer, glow, magazine, bolt, rightArm, leftArm } = gun;

  paint(polymer, BLACK);
  polymer.box(0, 0.022, 0.055, 0.044, 0.06, 0.27, 0.007);
  polymer.side([[-0.05, -0.005], [0, -0.005], [-0.018, -0.092], [-0.064, -0.087]], 0.03);
  polymer.side([[0.046, -0.005], [0.098, -0.005], [0.1, -0.026], [0.05, -0.026]], 0.032);
  polymer.tube(at(0, -0.008, 0.165), at(0, -0.095, 0.155), 0.017, 0.015, 10);
  paint(polymer, SIGNAL_ORANGE);
  polymer.tube(at(0, -0.093, 0.155), at(0, -0.1, 0.154), 0.0165, 0.0165, 10);
  polymer.box(-0.0225, 0.026, 0.09, 0.0012, 0.004, 0.1);
  polymer.box(0.0225, 0.026, 0.09, 0.0012, 0.004, 0.1);
  paint(polymer, BLACK);
  polymer.box(0, 0.005, -0.29, 0.03, 0.095, 0.012, 0.004);
  addTrigger(steel, polymer, 0.016, -0.008);

  paint(steel, GUNMETAL);
  steel.box(0, 0.056, 0.06, 0.024, 0.008, 0.25, 0.002);
  addRailTeeth(steel, 0.0615, -0.05, 0.04, 6);
  steel.tube(at(0, 0.03, 0.19), at(0, 0.03, 0.3), 0.021, 0.021, 8);
  steel.tube(at(0, 0.03, 0.296), at(0, 0.03, 0.303), 0.0235, 0.0235, 8);
  steel.tube(at(0.016, 0.04, -0.08), at(0.016, 0.03, -0.285), 0.0045, 0.0045, 6);
  steel.tube(at(-0.016, 0.04, -0.08), at(-0.016, 0.03, -0.285), 0.0045, 0.0045, 6);
  steel.tube(at(0, -0.002, -0.08), at(0, -0.02, -0.285), 0.0045, 0.0045, 6);
  paint(steel, DARK_INSET);
  for (const z of [0.215, 0.245, 0.275]) {
    steel.box(-0.0205, 0.03, z, 0.002, 0.012, 0.018);
    steel.box(0.0205, 0.03, z, 0.002, 0.012, 0.018);
    steel.box(0, 0.0505, z, 0.012, 0.002, 0.018);
  }
  paint(steel, BLACK);
  steel.tube(at(0, 0.03, 0.3), at(0, 0.03, 0.332), 0.0088, 0.0085, 8);

  // Aperture rear sight and hooded front post.
  steel.ring(0, 0.085, -0.018, 0.012, 0.0024, 12);
  steel.box(0, 0.0665, -0.018, 0.016, 0.013, 0.008, 0.001);
  steel.box(0, 0.072, 0.172, 0.0038, 0.024, 0.006);
  steel.box(-0.011, 0.0725, 0.172, 0.003, 0.025, 0.012);
  steel.box(0.011, 0.0725, 0.172, 0.003, 0.025, 0.012);
  glow.tint(0.35, 1, 0.3).tube(at(0, 0.085, 0.1683), at(0, 0.085, 0.1692), 0.0017, 0.0017, 8);

  paint(magazine, GUNMETAL);
  magazine.side([[0.05, -0.003], [0.094, -0.003], [0.1, -0.18], [0.056, -0.184]], 0.024);
  paint(magazine, SIGNAL_ORANGE);
  magazine.side([[0.052, -0.184], [0.104, -0.178], [0.106, -0.19], [0.054, -0.196]], 0.028);

  paint(bolt, WORN_STEEL);
  bolt.box(-0.0265, 0.04, 0.11, 0.009, 0.012, 0.02, 0.002);
  bolt.box(-0.0232, 0.04, 0.09, 0.002, 0.008, 0.04);
  bolt.box(0.0225, 0.04, 0.05, 0.002, 0.014, 0.05);

  addGripHand(rightArm, at(0, -0.05, -0.032), 1, 0.2, at(0.12, -0.2, -0.42), true);
  addGripHand(leftArm, at(0, -0.052, 0.16), -1, 0.1, at(-0.18, -0.22, -0.42), false);
  return gun;
}

/** PX-2 MARSHAL: steel slide on a black frame, carried in a two-handed grip. */
function buildMarshal(): GunGeometry {
  const gun = emptyGun(at(0, 0.026, 0.14), at(0, -0.05, -0.022), at(0, -0.13, -0.024));
  const { steel, polymer, magazine, bolt, rightArm, leftArm } = gun;

  paint(polymer, BLACK);
  polymer.box(0, 0.004, 0.05, 0.024, 0.022, 0.135, 0.004);
  polymer.side([[-0.052, 0.005], [-0.004, 0.005], [-0.022, -0.082], [-0.07, -0.072]], 0.029);
  paint(polymer, DARK_INSET);
  polymer.side([[-0.047, -0.018], [-0.02, -0.018], [-0.03, -0.066], [-0.062, -0.058]], 0.0298);
  paint(polymer, BLACK);
  addTrigger(steel, polymer, 0.028, -0.007);
  paint(steel, WORN_STEEL);
  steel.tube(at(0, 0.026, 0.12), at(0, 0.026, 0.137), 0.0075, 0.0075, 10);

  paint(magazine, GUNMETAL);
  magazine.side([[-0.046, 0], [-0.016, 0], [-0.034, -0.088], [-0.06, -0.082]], 0.02);
  paint(magazine, BLACK);
  magazine.side([[-0.036, -0.088], [-0.064, -0.08], [-0.068, -0.09], [-0.038, -0.098]], 0.025);

  // The slide carries the sights, so they move with it.
  paint(bolt, GUNMETAL);
  bolt.box(0, 0.03, 0.045, 0.026, 0.03, 0.18, 0.004);
  paint(bolt, DARK_INSET);
  for (let i = 0; i < 5; i++) {
    const z = -0.04 + i * 0.0055;
    bolt.box(-0.0132, 0.031, z, 0.0008, 0.021, 0.0026);
    bolt.box(0.0132, 0.031, z, 0.0008, 0.021, 0.0026);
  }
  bolt.box(0.0132, 0.036, 0.055, 0.0008, 0.012, 0.03);
  bolt.box(-0.0132, 0.022, 0.06, 0.0008, 0.0035, 0.1);
  paint(bolt, BLACK);
  bolt.box(-0.007, 0.0505, -0.03, 0.005, 0.011, 0.008);
  bolt.box(0.007, 0.0505, -0.03, 0.005, 0.011, 0.008);
  bolt.box(0, 0.047, -0.03, 0.019, 0.004, 0.008);
  bolt.box(0, 0.0505, 0.12, 0.0042, 0.011, 0.006);
  paint(bolt, SIGHT_DOT);
  bolt.box(0, 0.0542, 0.1168, 0.0026, 0.0026, 0.0006);
  bolt.box(-0.007, 0.0535, -0.0342, 0.0024, 0.0024, 0.0006);
  bolt.box(0.007, 0.0535, -0.0342, 0.0024, 0.0024, 0.0006);

  addGripHand(rightArm, at(0, -0.04, -0.036), 1, 0.2, at(0.1, -0.2, -0.42), true);
  addGripHand(leftArm, at(-0.006, -0.05, -0.028), -1, 0.2, at(-0.12, -0.2, -0.42), false);
  return gun;
}

const BUILDERS: Readonly<Record<WeaponId, () => GunGeometry>> = {
  assaultRifle: buildWarden,
  smg: buildHornet,
  handgun: buildMarshal,
};

export function buildGunGeometry(id: WeaponId): GunGeometry {
  return BUILDERS[id]();
}
