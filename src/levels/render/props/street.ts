/** Street furniture: barriers, gates, lamp posts, fences, signs, bollards, cleats and the sentry booth. */
import { hex, scaled } from '../Geo';
import type { P3 } from '../Geo';
import { PAINT, plate } from './propTypes';
import type { PropBuilder } from './propTypes';

export const jerseyBarrierBuilder: PropBuilder = (b) => {
  const g = b.geo('concrete');
  const half: readonly (readonly [number, number])[] = [
    [0.3, 0],
    [0.3, 0.08],
    [0.17, 0.32],
    [0.085, 0.93],
    [0.07, 0.95],
  ];
  const outline: [number, number][] = [];
  for (const [z, y] of half) outline.push([z, y]);
  for (let i = half.length - 1; i >= 0; i--) outline.push([-half[i][0], half[i][1]]);
  g.extrude(outline, 'x', -1.5, 1.5);
  g.bakeContact(0, 0.4, 0.58);

  // Paint strip and lifting loops give it scale.
  const strip = b.geo('hazardStripe');
  strip.box(0, 0.948, 0, 2.7, 0.004, 0.13);
  const steel = b.geo('steelRust');
  for (const x of [-1.1, 1.1]) {
    steel.tube(
      [
        [x - 0.07, 0.945, 0],
        [x - 0.05, 0.95, 0],
        [x + 0.05, 0.95, 0],
        [x + 0.07, 0.945, 0],
      ],
      0.009,
      4,
    );
  }
  // Forklift slots through the base.
  for (const x of [-0.7, 0.7]) {
    g.box(x, 0.04, 0, 0.22, 0.05, 0.605, { color: PAINT.inner });
  }
};

export const boomGateBuilder: PropBuilder = (b) => {
  const post = b.geo('paintWorn').tint(PAINT.hazardYellow);
  const px = -2.8;
  post.box(px, 0.55, 0, 0.4, 1.1, 0.4);
  post.box(px, 1.13, 0, 0.3, 0.06, 0.3, { color: PAINT.darkSteel });
  post.box(px, 0.03, 0, 0.5, 0.06, 0.5, { color: PAINT.darkSteel });
  post.box(px + 0.205, 0.55, 0, 0.01, 0.5, 0.26, { color: PAINT.darkSteel });
  post.bakeContact(0, 0.5, 0.6);

  // Counterweight behind the pivot, striped arm ahead of it.
  const steel = b.geo('steelDark');
  steel.cyl([px, 1.03, -0.21], [px, 1.03, 0.21], 0.06, 0.06, 8, true);
  steel.box(px - 0.08, 1.03, 0.1, 0.24, 0.16, 0.1);
  const arm = b.geo('hazardStripe');
  arm.box(0.12, 1.03, 0.1, 5.76, 0.11, 0.07);
  // Rest post at the far end, so the arm visibly sits on something.
  steel.box(2.9, 0.48, 0.1, 0.07, 0.96, 0.07);
  steel.box(2.9, 0.965, 0.1, 0.16, 0.02, 0.12);
  b.geo('glowRed').box(px, 1.24, 0, 0.11, 0.1, 0.11);
};

export const bollardBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn').tint(PAINT.hazardYellow);
  g.lathe(
    0,
    0,
    0,
    [
      [0.15, 0],
      [0.15, 0.015],
      [0.11, 0.03],
      [0.11, 0.62],
    ],
    10,
  );
  g.lathe(
    0,
    0,
    0,
    [
      [0.11, 0.62],
      [0.11, 0.76],
    ],
    10,
    PAINT.black,
  );
  g.lathe(
    0,
    0,
    0,
    [
      [0.11, 0.76],
      [0.11, 0.95],
      [0.09, 0.99],
      [0, 1.0],
    ],
    10,
  );
  g.bakeContact(0, 0.3, 0.6);
};

export const mooringCleatBuilder: PropBuilder = (b) => {
  const g = b.geo('steelDark');
  g.lathe(
    0,
    0,
    0,
    [
      [0.23, 0],
      [0.23, 0.03],
      [0.12, 0.05],
      [0.1, 0.32],
      [0.16, 0.4],
      [0.16, 0.45],
      [0, 0.48],
    ],
    12,
  );
  const rope = b.geo('canvas');
  for (const [r, y] of [
    [0.135, 0.11],
    [0.14, 0.17],
    [0.13, 0.23],
  ] as const) {
    const loop: P3[] = [];
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      loop.push([Math.cos(t) * r, y, Math.sin(t) * r]);
    }
    rope.tube(loop, 0.025, 5, true, hex(0x8a7a58));
  }
  g.bakeContact(0, 0.2, 0.7);
};

export const fencePanelBuilder: PropBuilder = (b) => {
  const metal = b.geo('metalBare');
  const hw = 2;
  for (const x of [-hw + 0.05, hw - 0.05]) {
    metal.cyl([x, 0, 0], [x, 3, 0], 0.05, 0.05, 8, true);
    metal.box(x, 0.012, 0, 0.11, 0.024, 0.11);
  }
  for (const y of [0.1, 1.5, 2.92]) {
    metal.cyl([-hw + 0.05, y, 0], [hw - 0.05, y, 0], 0.024, 0.024, 6, false);
  }
  const link = b.geo('chainLink', 0.6);
  const n: P3 = [0, 0, 1];
  const u = 3.9 / 0.6;
  const v = 2.8 / 0.6;
  link.quad([-1.95, 0.1, 0], [1.95, 0.1, 0], [1.95, 2.92, 0], [-1.95, 2.92, 0], n, [0, 0, u, v]);
  metal.bakeContact(0, 0.4, 0.7);
};

export const warningSignBuilder: PropBuilder = (b) => {
  const steel = b.geo('metalBare');
  for (const x of [-0.3, 0.3]) {
    steel.box(x, 0.8, -0.03, 0.05, 1.6, 0.04);
    steel.box(x, 0.012, -0.03, 0.14, 0.024, 0.1);
  }
  const back = b.geo('paintWorn').tint(PAINT.machineGrey);
  back.box(0, 1.24, 0.005, 0.9, 0.72, 0.012);
  plate(b, 'warning', [0, 1.24, 0.013], 'z+', 0.88, 0.7);
  steel.bakeContact(0, 0.4, 0.7);
};

export const lampPostBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn').tint(PAINT.machineGrey);
  g.cyl([0, 0.3, 0], [0, 8.7, 0], 0.125, 0.07, 8, false);
  g.tube(
    [
      [0, 8.6, 0],
      [0.06, 8.82, 0],
      [0.24, 8.92, 0],
      [0.42, 8.93, 0],
    ],
    0.045,
    6,
  );
  g.disc([0, 0.3, 0], [0, 1, 0], 0.13, 8);
  g.box(0.127, 1.1, 0, 0.012, 0.42, 0.13, { color: PAINT.darkSteel });
  g.bakeContact(0, 2.2, 0.72);

  const base = b.geo('concrete');
  base.box(0, 0.15, 0, 0.4, 0.3, 0.4);
  base.bakeContact(0, 0.3, 0.6);

  const head = b.geo('steelDark');
  head.extrude(
    [
      [-0.13, 8.82],
      [0.13, 8.82],
      [0.1, 8.97],
      [-0.1, 8.97],
    ],
    'x',
    0.38,
    0.9,
  );
  b.geo('glowSodium').box(0.64, 8.81, 0, 0.42, 0.025, 0.2);
};

export const guardBoothBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn').tint(PAINT.boothWhite);
  const hw = 1.1;
  const wallY = 2.56;
  // Lower wall band all round, with posts carrying the window band.
  g.box(0, 0.5, 0, 2.2, 1, 2.2);
  g.box(0, wallY - 0.1, 0, 2.2, 0.2, 2.2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.box(sx * (hw - 0.05), 1.7, sz * (hw - 0.05), 0.1, 1.5, 0.1);
  }
  g.box(0, 0.03, 0, 2.3, 0.06, 2.3, { color: PAINT.darkSteel });
  // Roof overhang fills the catalog size.
  g.box(0, 2.68, 0, 2.4, 0.1, 2.4, { color: PAINT.darkSteel });
  g.box(0, 2.76, 0, 2.1, 0.08, 2.1, { color: PAINT.machineGrey });

  // Inner dark volume, so the glass has something behind it.
  g.box(0, 1.7, 0, 2.08, 1.5, 2.08, { color: PAINT.inner });

  const glass = b.geo('glassDark');
  const a = hw - 0.1;
  const y0 = 1;
  const y1 = 2.38;
  glass.quad([a, y0, hw + 0.001], [-a, y0, hw + 0.001], [-a, y1, hw + 0.001], [a, y1, hw + 0.001], [0, 0, 1]);
  glass.quad([-a, y0, -hw - 0.001], [a, y0, -hw - 0.001], [a, y1, -hw - 0.001], [-a, y1, -hw - 0.001], [0, 0, -1]);
  glass.quad([hw + 0.001, y0, -a], [hw + 0.001, y0, a], [hw + 0.001, y1, a], [hw + 0.001, y1, -a], [1, 0, 0]);
  glass.quad([-hw - 0.001, y0, a], [-hw - 0.001, y0, -a], [-hw - 0.001, y1, -a], [-hw - 0.001, y1, a], [-1, 0, 0]);

  // Door on the east face, standing over the window band.
  g.box(hw + 0.012, 1.15, 0.42, 0.024, 2.2, 0.86, { color: scaled(PAINT.boothWhite, 0.8) });
  glass.quad([hw + 0.026, 1.35, 0.1], [hw + 0.026, 1.35, 0.74], [hw + 0.026, 2.05, 0.74], [hw + 0.026, 2.05, 0.1], [1, 0, 0]);
  const steel = b.geo('metalBare');
  steel.box(hw + 0.035, 1.05, 0.08, 0.03, 0.03, 0.12);
  // Window mullions and the sign over the front window.
  for (const x of [-0.35, 0.35]) g.box(x, 1.7, hw + 0.004, 0.05, 1.4, 0.012);
  plate(b, 'security', [0, 2.46, hw + 0.004], 'z+', 1.1, 0.22);
  g.bakeContact(0, 0.9, 0.62);
};
