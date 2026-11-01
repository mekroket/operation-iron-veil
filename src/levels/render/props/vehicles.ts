/** Forklift, flatbed truck and the assault boat. Noses face +Z, as the catalog colliders expect. */
import { hex, scaled } from '../Geo';
import type { P3 } from '../Geo';
import { PAINT, plate } from './propTypes';
import type { PropBuild, PropBuilder } from './propTypes';

/** Wheel with axis along X, tread on the rubber surface and a steel hub on the outside. */
function wheel(b: PropBuild, x: number, y: number, z: number, radius: number, width: number, outward: number): void {
  b.geo('rubber').cyl([x - width / 2, y, z], [x + width / 2, y, z], radius, radius, 14, true);
  const hub = b.geo('steelDark');
  const face = x + (outward * width) / 2 + outward * 0.004;
  hub.disc([face, y, z], [outward, 0, 0], radius * 0.58, 10);
  hub.cyl([face, y, z], [face + outward * 0.012, y, z], radius * 0.2, radius * 0.2, 6, true);
}

export const forkliftBuilder: PropBuilder = (b) => {
  const g = b.geo('steelYellow');
  const dark = b.geo('steelDark');
  const hw = 0.6;

  // Chassis, sloped engine cover and counterweight.
  g.box(0, 0.62, -0.32, 1.08, 0.74, 1.72);
  g.extrude(
    [
      [-1.18, 0.98],
      [-0.2, 0.98],
      [-0.28, 1.2],
      [-1.12, 1.2],
    ],
    'x',
    -0.5,
    0.5,
  );
  dark.box(0, 0.62, -1.17, 1.14, 0.84, 0.26);
  b.geo('hazardStripe').box(0, 0.8, -1.3005, 1.0, 0.3, 0.002);
  // Louvres on the engine cover.
  for (let i = 0; i < 5; i++) dark.box(0, 1.205, -1.0 + i * 0.13, 0.7, 0.012, 0.06);

  // Seat and steering.
  dark.box(0, 1.05, -0.05, 0.46, 0.1, 0.42);
  dark.box(0, 1.34, -0.25, 0.46, 0.5, 0.08);
  dark.beam([0.1, 0.98, 0.42], [0.08, 1.32, 0.3], 0.04);
  b.geo('rubber').cyl([0.08, 1.32, 0.3], [0.08, 1.35, 0.27], 0.15, 0.15, 10, true);

  // Overhead guard: four posts and a slatted roof.
  const guard = b.geo('steelYellow');
  const top = 2.16;
  for (const sx of [-1, 1]) {
    guard.beam([sx * 0.5, 0.95, -0.82], [sx * 0.5, top, -0.72], 0.06);
    guard.beam([sx * 0.5, 0.95, 0.5], [sx * 0.5, top, 0.42], 0.06);
    guard.box(sx * 0.5, top, -0.15, 0.06, 0.06, 1.24);
  }
  for (let i = 0; i < 7; i++) guard.box(0, top + 0.01, -0.68 + i * 0.178, 1.04, 0.03, 0.05);
  b.geo('glowAmber').cyl([0, top + 0.02, -0.6], [0, 2.2, -0.6], 0.04, 0.035, 8, true);

  // Mast with carriage and L-shaped forks, carried ahead of the body.
  const mastZ = 0.72;
  for (const sx of [-1, 1]) {
    dark.box(sx * 0.34, 1.1, mastZ, 0.09, 2.2, 0.14);
    dark.box(sx * 0.18, 1.0, mastZ + 0.1, 0.08, 0.3, 0.07);
    dark.box(sx * 0.18, 0.09, 1.16, 0.12, 0.05, 0.68);
    dark.box(sx * 0.18, 0.3, 0.85, 0.12, 0.42, 0.05);
  }
  for (const y of [0.34, 1.2, 2.14]) dark.box(0, y, mastZ, 0.68, 0.08, 0.1);
  dark.box(0, 0.5, mastZ + 0.1, 0.8, 0.12, 0.06);

  wheel(b, hw - 0.14, 0.3, 0.32, 0.3, 0.28, 1);
  wheel(b, -hw + 0.14, 0.3, 0.32, 0.3, 0.28, -1);
  wheel(b, hw - 0.12, 0.24, -0.86, 0.24, 0.24, 1);
  wheel(b, -hw + 0.12, 0.24, -0.86, 0.24, 0.24, -1);
  g.bakeContact(0, 0.7, 0.68);
};

export const truckBuilder: PropBuilder = (b) => {
  const cab = b.geo('paintWorn').tint(PAINT.truckBlue);
  const dark = b.geo('steelDark');
  const hw = 1.2;

  // Cab: a real side profile extruded across the width.
  cab.extrude(
    [
      [1.85, 0.95],
      [3.95, 0.95],
      [3.98, 1.72],
      [3.72, 1.95],
      [3.36, 3.0],
      [3.2, 3.1],
      [1.85, 3.1],
    ],
    'x',
    -hw,
    hw,
  );

  // Glass sits just off the shell.
  const glass = b.geo('glassDark');
  const wnL = Math.hypot(0.36, 1.05);
  const wn: P3 = [0, 0.36 / wnL, 1.05 / wnL];
  const o = 0.004;
  glass.quad(
    [hw - 0.12, 2.0 + wn[1] * o, 3.7 + wn[2] * o],
    [-hw + 0.12, 2.0 + wn[1] * o, 3.7 + wn[2] * o],
    [-hw + 0.12, 2.93 + wn[1] * o, 3.38 + wn[2] * o],
    [hw - 0.12, 2.93 + wn[1] * o, 3.38 + wn[2] * o],
    wn,
  );
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.002);
    glass.quad([x, 1.95, 2.55], [x, 1.95, 3.55], [x, 2.85, 3.3], [x, 2.85, 2.55], [s, 0, 0]);
    plate(b, 'truckDoor', [s * (hw + 0.004), 1.48, 2.9], s > 0 ? 'x+' : 'x-', 1.2, 0.3);
    // Door seam, mirror and step.
    cab.box(s * (hw + 0.002), 1.9, 2.3, 0.004, 1.8, 0.02, { color: PAINT.black });
    dark.beam([s * hw, 2.6, 3.56], [s * 1.25, 2.6, 3.62], 0.03);
    dark.box(s * 1.24, 2.45, 3.62, 0.03, 0.32, 0.14);
    dark.box(s * (hw - 0.1), 0.78, 2.9, 0.22, 0.05, 0.56);
  }

  // Front end.
  dark.box(0, 0.72, 3.9, 2.42, 0.26, 0.2);
  for (let i = 0; i < 6; i++) dark.box(0, 1.12 + i * 0.09, 3.985, 1.3, 0.04, 0.03);
  const lamp = b.geo('metalBare');
  for (const s of [-1, 1]) lamp.disc([s * 0.92, 1.28, 3.985], [0, 0, 1], 0.11, 10);

  // Frame rails, fuel tank, exhaust stack.
  for (const s of [-1, 1]) dark.box(s * 0.48, 0.82, -0.1, 0.12, 0.24, 7.8);
  const tank = b.geo('metalBare');
  tank.cyl([0.92, 0.66, 0.2], [0.92, 0.66, 1.5], 0.24, 0.24, 10, true);
  dark.cyl([-1.02, 1.3, 1.78], [-1.02, 3.08, 1.78], 0.055, 0.055, 7, true);

  // Flatbed: planked deck, steel edge, stake pockets, headboard.
  const deck = b.geo('woodPlank');
  deck.tint(hex(0x8f8066));
  deck.box(0, 1.25, -1.1, 2.42, 0.1, 5.7, { grain: true });
  for (const s of [-1, 1]) {
    dark.box(s * 1.225, 1.2, -1.1, 0.05, 0.2, 5.8);
    for (let i = 0; i < 5; i++) {
      const z = -3.5 + i * 1.2;
      dark.box(s * 1.215, 1.42, z, 0.06, 0.36, 0.07);
      deck.box(s * 1.215, 1.52, z + 0.6, 0.04, 0.14, 1.16, { grain: true });
    }
  }
  dark.box(0, 1.45, -3.98, 2.44, 0.3, 0.04);
  dark.box(0, 1.62, 1.77, 2.3, 0.86, 0.06);
  for (let i = 0; i < 4; i++) dark.box(-0.85 + i * 0.566, 1.62, 1.8, 0.05, 0.86, 0.02);

  // Mudguards and wheels: one steering axle, a tandem at the rear.
  for (const z of [3.0, -1.75, -2.9]) {
    for (const s of [-1, 1]) {
      wheel(b, s * 1.08, 0.5, z, 0.5, 0.34, s);
      if (z < 0) dark.box(s * 1.08, 1.06, z, 0.36, 0.03, 1.02);
    }
    dark.cyl([-0.95, 0.5, z], [0.95, 0.5, z], 0.05, 0.05, 6, false);
  }
  cab.bakeContact(0, 1.3, 0.72);
};

export const rhibBuilder: PropBuilder = (b) => {
  const hull = b.geo('paintWorn').tint(hex(0x3a4044));
  // Stations from stern to bow: z, half beam, keel height, gunwale height.
  const stations: readonly (readonly [number, number, number, number])[] = [
    [-3.3, 1.0, 0.16, 0.78],
    [-2.2, 1.04, 0.06, 0.78],
    [-0.4, 1.04, 0, 0.8],
    [1.4, 0.94, 0.04, 0.86],
    [2.7, 0.62, 0.22, 0.96],
    [3.55, 0.14, 0.56, 1.08],
  ];
  const quad = (p0: P3, p1: P3, p2: P3, p3: P3, side: number): void => {
    const e1: P3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2: P3 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    let n: P3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    // Hull faces always point out and down, away from the boat's centreline.
    if (n[0] * side - n[1] < 0) n = [-n[0], -n[1], -n[2]];
    hull.quad(p0, p1, p2, p3, n);
  };
  for (let i = 0; i + 1 < stations.length; i++) {
    const [z0, w0, k0, g0] = stations[i];
    const [z1, w1, k1, g1] = stations[i + 1];
    for (const s of [-1, 1]) {
      const c0: P3 = [s * w0 * 0.72, k0 + 0.26, z0];
      const c1: P3 = [s * w1 * 0.72, k1 + 0.26, z1];
      quad([0, k0, z0], [0, k1, z1], c1, c0, s);
      quad(c0, c1, [s * w1, g1, z1], [s * w0, g0, z0], s);
    }
  }
  hull.box(0, 0.5, -3.3, 2.0, 0.6, 0.06, { color: scaled(PAINT.darkSteel, 0.8) });
  hull.box(0, 0.74, -0.45, 1.86, 0.04, 5.7, { color: PAINT.darkSteel });

  // Inflatable collar sweeps round the bow in one tube.
  const tube = b.geo('rubber');
  const path: P3[] = [];
  const reach = 1.02;
  for (const [x, y, z] of [
    [-reach, 0.94, -3.25],
    [-reach, 0.92, -2],
    [-reach, 0.95, -0.2],
    [-0.98, 1.0, 1.2],
    [-0.76, 1.1, 2.3],
    [-0.42, 1.2, 3.1],
    [0, 1.26, 3.46],
    [0.42, 1.2, 3.1],
    [0.76, 1.1, 2.3],
    [0.98, 1.0, 1.2],
    [reach, 0.95, -0.2],
    [reach, 0.92, -2],
    [reach, 0.94, -3.25],
  ] as const) {
    path.push([x, y, z]);
  }
  tube.tube(path, 0.27, 8, false, hex(0x3a3d40));
  for (const s of [-1, 1]) tube.disc([s * reach, 0.94, -3.25], [0, 0, -1], 0.27, 8, hex(0x24262a));

  // Console, windscreen, jockey seat and outboard.
  const fit = b.geo('paintWorn');
  fit.box(0, 1.02, 0.1, 0.72, 0.56, 0.6, { color: PAINT.machineGrey });
  fit.box(0, 1.0, -1.0, 0.48, 0.5, 0.42, { color: PAINT.darkSteel });
  fit.box(0, 1.28, -1.0, 0.5, 0.08, 0.44, { color: PAINT.black });
  plate(b, 'rhibNumber', [0.363, 1.05, 0.1], 'x+', 0.5, 0.125);
  const screenL = Math.hypot(0.14, 0.26);
  b.geo('glassDark').quad([0.34, 1.3, 0.34], [-0.34, 1.3, 0.34], [-0.3, 1.56, 0.2], [0.3, 1.56, 0.2], [0, 0.14 / screenL, 0.26 / screenL]);
  const motor = b.geo('steelDark');
  motor.box(0, 1.18, -3.52, 0.42, 0.58, 0.44);
  motor.box(0, 0.54, -3.5, 0.16, 0.74, 0.18);
  motor.cyl([0, 0.2, -3.73], [0, 0.2, -3.4], 0.13, 0.11, 8, true);
};
