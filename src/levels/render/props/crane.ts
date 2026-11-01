/** Ship-to-shore crane, built low-poly because it is only ever seen far overhead. Stays inside the catalog box. */
import type { P3 } from '../Geo';
import { scaled } from '../Geo';
import { PAINT, plate } from './propTypes';
import type { PropBuilder } from './propTypes';

const LX = 8.5;
const LZ = 11;
const SILL = 16;
const PORTAL = 30;
const APEX = 41.4;
const BOOM_Y = 32;

export const craneGantryBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn').tint(PAINT.craneBlue);
  const trim = scaled(PAINT.craneBlue, 0.72);

  const legs: readonly P3[] = [
    [-LX, 0, -LZ],
    [LX, 0, -LZ],
    [LX, 0, LZ],
    [-LX, 0, LZ],
  ];
  for (const [x, , z] of legs) {
    g.box(x, PORTAL / 2, z, 1.2, PORTAL, 1.2);
    // Rail bogie at the foot, hazard band above it.
    b.geo('steelDark').box(x, 0.4, z, 1.0, 0.8, 2.6);
    b.geo('hazardStripe').box(x, 2.2, z, 1.24, 2.8, 1.24);
  }

  // Sill and portal frames. The roadway under the sill stays clear of bracing.
  for (const y of [SILL, PORTAL]) {
    for (let i = 0; i < 4; i++) {
      const a = legs[i];
      const c = legs[(i + 1) % 4];
      g.beam([a[0], y, a[2]], [c[0], y, c[2]], 1, 1.3, trim);
    }
  }

  // Cross bracing between sill and portal on all four faces.
  for (let i = 0; i < 4; i++) {
    const a = legs[i];
    const c = legs[(i + 1) % 4];
    g.beam([a[0], SILL, a[2]], [c[0], PORTAL, c[2]], 0.34, 0.34, trim);
    g.beam([c[0], SILL, c[2]], [a[0], PORTAL, a[2]], 0.34, 0.34, trim);
  }

  // A-frame over the portal.
  for (const sx of [-1, 1]) {
    g.beam([sx * LX, PORTAL, -LZ], [sx * 5, APEX, 0], 0.8);
    g.beam([sx * LX, PORTAL, LZ], [sx * 5, APEX, 0], 0.8);
  }
  g.beam([-5, APEX, 0], [5, APEX, 0], 0.9);
  b.geo('glowRed').box(0, APEX + 0.55, 0, 0.3, 0.2, 0.3);

  // Lattice boom: four chords and zig-zag webbing on both sides, full catalog depth.
  const hx = 1.4;
  const top = BOOM_Y + 2.2;
  const end = 12.9;
  for (const sx of [-1, 1]) {
    g.beam([sx * hx, BOOM_Y, -end], [sx * hx, BOOM_Y, end], 0.42);
    g.beam([sx * hx, top, -end], [sx * hx, top, end], 0.32);
    const bays = 8;
    for (let i = 0; i < bays; i++) {
      const z0 = -end + (2 * end * i) / bays;
      const z1 = -end + (2 * end * (i + 1)) / bays;
      const low = i % 2 === 0;
      g.beam([sx * hx, low ? BOOM_Y : top, z0], [sx * hx, low ? top : BOOM_Y, z1], 0.16, 0.16, trim);
    }
    // Forestays from the apex out to the boom tips.
    g.beam([sx * 5, APEX, 0], [sx * hx, top, end], 0.1, 0.1, PAINT.darkSteel);
    g.beam([sx * 5, APEX, 0], [sx * hx, top, -end], 0.1, 0.1, PAINT.darkSteel);
    g.beam([sx * LX, PORTAL, -LZ], [sx * hx, BOOM_Y, -LZ], 0.5, 0.5, trim);
    g.beam([sx * LX, PORTAL, LZ], [sx * hx, BOOM_Y, LZ], 0.5, 0.5, trim);
  }
  for (const z of [-end, -LZ / 2, 0, LZ / 2, end]) {
    g.beam([-hx, BOOM_Y, z], [hx, BOOM_Y, z], 0.2);
    g.beam([-hx, top, z], [hx, top, z], 0.16);
  }

  // Machinery house at the back, trolley and operator cabin under the boom, then ropes and spreader.
  g.box(0, BOOM_Y + 3.5, -9.5, 4.4, 2.6, 5, { color: PAINT.dirtyWhite });
  const tz = 5;
  const metal = b.geo('steelDark');
  metal.box(0, BOOM_Y - 0.5, tz, 3.6, 0.7, 2.4);
  g.box(0.4, BOOM_Y - 2, tz + 0.6, 1.8, 2.2, 2.2, { color: PAINT.dirtyWhite });
  const glass = b.geo('glassDark');
  const gy = BOOM_Y - 2;
  const gz = tz + 1.705;
  glass.quad([1.2, gy - 0.8, gz], [-0.4, gy - 0.8, gz], [-0.4, gy + 0.9, gz], [1.2, gy + 0.9, gz], [0, 0, 1]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      metal.beam([sx * 1.4, BOOM_Y - 0.8, tz + sz * 1], [sx * 1.1, 19, tz + sz * 0.8], 0.05);
    }
  }
  metal.box(0, 18.8, tz, 2.4, 0.3, 3);
  metal.box(0, 18.5, tz, 2.44, 0.25, 8);

  plate(b, 'craneId', [0, PORTAL, LZ + 0.51], 'z+', 5.2, 1.3);
  plate(b, 'craneId', [0, PORTAL, -LZ - 0.51], 'z-', 5.2, 1.3);
};
