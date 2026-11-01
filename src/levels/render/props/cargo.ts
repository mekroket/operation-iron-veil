/** Loose cargo: crates, drums, pallets, sandbags, pipes, spools, tyres. */
import type { Geo } from '../Geo';
import { WHITE, hex, scaled } from '../Geo';
import { hash2 } from '../noise';
import { PAINT, plate } from './propTypes';
import type { PropBuild, PropBuilder } from './propTypes';

function crate(b: PropBuild, w: number, h: number, d: number, tone: number, stencil: boolean): void {
  const wood = b.geo('woodPlank');
  const color = scaled(hex(0xa89878), tone);
  const hw = w / 2;
  const hd = d / 2;
  wood.tint(scaled(color, 0.42));
  wood.box(0, h / 2, 0, w - 0.08, h - 0.04, d - 0.08);

  wood.tint(color);
  const slats = Math.max(4, Math.round(h / 0.22));
  const slatH = h / slats;
  for (let i = 0; i < slats; i++) {
    const y = slatH * (i + 0.5);
    const shade = 0.88 + 0.22 * hash2(i, 3);
    const c = scaled(color, shade);
    wood.box(0, y, hd - 0.025, w - 0.04, slatH - 0.016, 0.03, { color: c, grain: true });
    wood.box(0, y, -hd + 0.025, w - 0.04, slatH - 0.016, 0.03, { color: c, grain: true });
    wood.box(hw - 0.025, y, 0, 0.03, slatH - 0.016, d - 0.04, { color: c, grain: true });
    wood.box(-hw + 0.025, y, 0, 0.03, slatH - 0.016, d - 0.04, { color: c, grain: true });
  }
  const lids = 5;
  for (let i = 0; i < lids; i++) {
    const x = (w - 0.04) * ((i + 0.5) / lids - 0.5);
    wood.box(x, h - 0.02, 0, (w - 0.04) / lids - 0.014, 0.03, d - 0.04, { color: scaled(color, 0.9 + 0.2 * hash2(i, 9)), grain: true });
  }

  // Corner battens and rim stand proud of the slats.
  const batten = scaled(color, 0.78);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) wood.box(sx * (hw - 0.04), h / 2, sz * (hd - 0.04), 0.08, h, 0.08, { color: batten, grain: true });
  }
  for (const y of [0.04, h - 0.06]) {
    for (const s of [-1, 1]) {
      wood.box(0, y, s * (hd - 0.012), w - 0.16, 0.08, 0.024, { color: batten, grain: true });
      wood.box(s * (hw - 0.012), y, 0, 0.024, 0.08, d - 0.16, { color: batten, grain: true });
    }
  }

  // Steel banding wraps the crate at two heights.
  const band = b.geo('metalBare');
  for (const y of [h * 0.28, h * 0.72]) {
    for (const s of [-1, 1]) {
      band.box(0, y, s * (hd - 0.002), w, 0.03, 0.004);
      band.box(s * (hw - 0.002), y, 0, 0.004, 0.03, d);
    }
  }

  if (stencil) {
    plate(b, 'crateStencil', [0, h * 0.5, hd + 0.003], 'z+', w * 0.66, w * 0.33);
    plate(b, 'crateStencil', [hw + 0.003, h * 0.5, 0], 'x+', d * 0.66, d * 0.33);
  }
  wood.bakeContact(0, h * 0.5, 0.62);
}

export const crateBuilder: PropBuilder = (b, variant) => crate(b, 1.2, 1.1, 1.2, variant === 1 ? 0.62 : 1, variant === 1);
export const crateLargeBuilder: PropBuilder = (b) => crate(b, 1.8, 1.6, 1.8, 0.82, true);

const DRUM: readonly (readonly [number, number])[] = [
  [0.27, 0],
  [0.285, 0.02],
  [0.285, 0.29],
  [0.3, 0.3],
  [0.3, 0.32],
  [0.285, 0.33],
  [0.285, 0.59],
  [0.3, 0.6],
  [0.3, 0.62],
  [0.285, 0.63],
  [0.285, 0.87],
  [0.296, 0.88],
  [0.296, 0.9],
  [0.268, 0.9],
  [0.268, 0.875],
  [0, 0.875],
];

export const barrelBuilder: PropBuilder = (b, variant) => {
  const rusted = variant === 1;
  const g = rusted ? b.geo('steelRust') : b.geo('paintWorn');
  g.tint(variant === 2 ? PAINT.hazardYellow : rusted ? WHITE : PAINT.drumBlue);
  g.lathe(0, 0, 0, DRUM, 14);
  const metal = b.geo('steelDark');
  metal.cyl([0.13, 0.875, 0.05], [0.13, 0.89, 0.05], 0.03, 0.03, 6, true);
  metal.cyl([-0.14, 0.875, -0.02], [-0.14, 0.885, -0.02], 0.018, 0.018, 6, true);
  if (variant === 2) plate(b, 'hazardDiamond', [0, 0.46, 0.292], 'z+', 0.24, 0.24);
  g.bakeContact(0, 0.45, 0.62);
};

/** One pallet at height y. `h` stretches the stringers, for stacks whose total height is fixed. */
function palletInto(g: Geo, y: number, h: number, jx: number, jz: number, seed: number): void {
  const w = 1.15;
  const d = 0.96;
  const board = 0.022;
  const tone = (i: number): readonly [number, number, number] => scaled(hex(0xa2906e), 0.72 + 0.3 * hash2(i, seed));
  for (let i = 0; i < 3; i++) g.box(jx, y + h / 2, jz + (i - 1) * (d / 2 - 0.045), w, h - board * 2, 0.09, { color: tone(i + 20), grain: true });
  for (let i = 0; i < 7; i++) {
    g.box(jx + (w - 0.1) * (i / 6 - 0.5), y + h - board / 2, jz, 0.1, board, d, { color: tone(i), grain: true });
  }
  for (let i = 0; i < 3; i++) g.box(jx + (w - 0.12) * (i / 2 - 0.5), y + board / 2, jz, 0.12, board, d, { color: tone(i + 10), grain: true });
}

export const palletBuilder: PropBuilder = (b) => {
  palletInto(b.geo('woodPlank'), 0, 0.15, 0, 0, 1);
};

export const palletStackBuilder: PropBuilder = (b) => {
  const g = b.geo('woodPlank');
  const count = 6;
  for (let i = 0; i < count; i++) {
    palletInto(g, (i * 1) / count, 1 / count, (hash2(i, 5) - 0.5) * 0.045, (hash2(i, 6) - 0.5) * 0.035, i + 2);
  }
  g.bakeContact(0, 0.5, 0.58);
};

export const sandbagsBuilder: PropBuilder = (b) => {
  const g = b.geo('canvas');
  g.box(0, 0.5, 0, 2.1, 0.96, 0.46, { color: scaled(PAINT.sackTan, 0.28) });
  const rows = 4;
  const rowH = 1.1 / rows;
  for (let r = 0; r < rows; r++) {
    const count = r % 2 === 0 ? 5 : 4;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 0.47;
      const n = hash2(r, i, 13);
      const tone = scaled(PAINT.sackTan, 0.74 + n * 0.42);
      g.blob(x, rowH * (r + 0.5), (n - 0.5) * 0.05, 0.245, rowH * 0.56, 0.36, 7, 4, 0.72, (n - 0.5) * 0.14, tone);
    }
  }
  g.bakeContact(0, 0.5, 0.6);
};

export const pipeBundleBuilder: PropBuilder = (b) => {
  const pipe = b.geo('steelRust');
  const wood = b.geo('woodPlank');
  const r = 0.25;
  const base = 0.06;
  const hl = 2.5;
  const place = (x: number, y: number): void => {
    pipe.tint(WHITE);
    pipe.cyl([x, y, -hl], [x, y, hl], r, r, 10, true);
    pipe.disc([x, y, hl + 0.003], [0, 0, 1], r * 0.82, 10, PAINT.inner);
    pipe.disc([x, y, -hl - 0.003], [0, 0, -1], r * 0.82, 10, PAINT.inner);
  };
  for (const x of [-0.75, -0.25, 0.25, 0.75]) place(x, base + r);
  for (const x of [-0.5, 0, 0.5]) place(x, base + r + 0.433);
  for (const z of [-1.6, 1.6]) wood.box(0, base / 2, z, 2, base, 0.14, { grain: true, color: scaled(WHITE, 0.7) });
  const strap = b.geo('metalBare');
  for (const z of [-1.2, 1.2]) {
    strap.beam([-1, base + r, z], [-0.5, 0.99, z], 0.03, 0.006);
    strap.beam([-0.5, 0.99, z], [0.5, 0.99, z], 0.03, 0.006);
    strap.beam([0.5, 0.99, z], [1, base + r, z], 0.03, 0.006);
  }
  pipe.bakeContact(0, 0.5, 0.65);
};

export const cableSpoolBuilder: PropBuilder = (b) => {
  const wood = b.geo('woodPlank');
  const flange: readonly (readonly [number, number])[] = [
    [0, 0],
    [0.7, 0],
    [0.7, 0.05],
    [0, 0.05],
  ];
  wood.tint(scaled(WHITE, 0.72));
  wood.lathe(0, 0, 0, flange, 16);
  wood.lathe(0, 0.95, 0, flange, 16);

  const cable = b.geo('rubber');
  const turns = 6;
  const profile: [number, number][] = [];
  for (let i = 0; i <= turns * 2; i++) {
    profile.push([i % 2 === 0 ? 0.52 : 0.56, 0.05 + (0.9 * i) / (turns * 2)]);
  }
  cable.tint(hex(0x55585c));
  cable.lathe(0, 0, 0, profile, 16);

  const steel = b.geo('steelDark');
  steel.cyl([0, 0.998, 0], [0, 1.0, 0], 0.11, 0.11, 10, true, PAINT.inner);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    steel.box(Math.cos(t) * 0.42, 0.995, Math.sin(t) * 0.42, 0.04, 0.01, 0.04);
  }
  cable.tube(
    [
      [0.54, 0.5, 0.05],
      [0.62, 0.32, 0.2],
      [0.6, 0.12, 0.34],
      [0.45, 0.07, 0.5],
    ],
    0.02,
    5,
  );
  wood.bakeContact(0, 0.4, 0.7);
};

const TYRE: readonly (readonly [number, number])[] = [
  [0.24, 0.02],
  [0.33, 0],
  [0.42, 0.03],
  [0.45, 0.15],
  [0.42, 0.27],
  [0.33, 0.3],
  [0.24, 0.28],
  [0.22, 0.15],
  [0.24, 0.02],
];

export const tyreStackBuilder: PropBuilder = (b) => {
  const g = b.geo('rubber');
  for (let i = 0; i < 3; i++) g.lathe(0, i * 0.3, 0, TYRE, 14, scaled(WHITE, 0.8 + 0.4 * hash2(i, 4)));
  g.disc([0, 0.012, 0], [0, 1, 0], 0.25, 10, PAINT.inner);
  g.bakeContact(0, 0.5, 0.65);
};
