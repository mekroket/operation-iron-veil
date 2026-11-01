/** Warehouse and annex furniture: racking, desks, server cabinets, the terminal, the generator. */
import { WHITE, hex, scaled } from '../Geo';
import type { Geo, P3 } from '../Geo';
import { hash2 } from '../noise';
import { PAINT, plate } from './propTypes';
import type { PropBuilder } from './propTypes';

export const shelfRackBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn');
  const hw = 1.45;
  const hd = 0.55;
  g.tint(PAINT.rackBlue);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.box(sx * hw, 2.5, sz * hd, 0.09, 5, 0.09);
      g.box(sx * hw, 0.01, sz * hd, 0.16, 0.02, 0.14, { color: PAINT.darkSteel });
    }
    for (let i = 0; i < 4; i++) {
      const y0 = 0.3 + i * 1.15;
      g.beam([sx * hw, y0, -hd], [sx * hw, y0 + 1.15, hd], 0.035);
      g.box(sx * hw, y0, 0, 0.04, 0.04, hd * 2);
    }
  }

  // Beam pairs with plywood decks, and the goods on them.
  const levels = [0, 1.28, 2.56, 3.84];
  const deck = b.geo('woodPlank');
  const box = b.geo('canvas');
  const drum = b.geo('steelRust');
  for (let l = 0; l < levels.length; l++) {
    const y = levels[l];
    if (l > 0) {
      for (const sz of [-1, 1]) g.box(0, y - 0.05, sz * hd, hw * 2 - 0.08, 0.12, 0.05, { color: PAINT.rackOrange });
      deck.box(0, y + 0.015, 0, hw * 2 - 0.1, 0.03, hd * 2 - 0.05, { color: scaled(WHITE, 0.72), grain: true });
    }
    const floor = y + (l > 0 ? 0.03 : 0);
    for (let i = 0; i < 3; i++) {
      const kind = hash2(l, i, 21);
      const x = (i - 1) * 0.95;
      if (kind < 0.18) continue; // Gaps let the player see through, as the catalog promises.
      if (kind < 0.42) {
        drum.cyl([x - 0.24, floor, 0], [x - 0.24, floor + 0.86, 0], 0.27, 0.27, 8, true, scaled(WHITE, 0.8));
        drum.cyl([x + 0.3, floor, 0.05], [x + 0.3, floor + 0.86, 0.05], 0.27, 0.27, 8, true, scaled(WHITE, 0.6));
      } else {
        const w = 0.62 + kind * 0.24;
        const h = 0.34 + hash2(l, i, 22) * 0.56;
        const tone = scaled(PAINT.cardboard, 0.7 + hash2(l, i, 23) * 0.5);
        box.box(x, floor + 0.06 + h / 2, 0, w, h, 0.9, { color: tone });
        if (kind > 0.7) box.box(x - 0.06, floor + 0.06 + h + 0.13, 0.05, w * 0.72, 0.26, 0.66, { color: scaled(tone, 0.82) });
        deck.box(x, floor + 0.03, 0, w + 0.06, 0.06, 0.94, { color: scaled(WHITE, 0.6), grain: true });
      }
    }
  }
  g.bakeContact(0, 1.4, 0.7);
  box.bakeContact(0, 1.6, 0.68);
};

export const deskBuilder: PropBuilder = (b) => {
  const top = b.geo('woodPlank');
  top.box(0, 0.74, 0, 1.6, 0.04, 0.8, { color: scaled(WHITE, 0.62), grain: true });
  const g = b.geo('paintWorn').tint(PAINT.machineGrey);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.box(sx * 0.74, 0.36, sz * 0.34, 0.05, 0.72, 0.05, { color: PAINT.darkSteel });
  }
  g.box(0, 0.42, -0.34, 1.42, 0.5, 0.02);
  g.box(0.48, 0.38, 0, 0.56, 0.68, 0.68);
  for (let i = 0; i < 3; i++) {
    const y = 0.16 + i * 0.22;
    g.box(0.48, y, 0.343, 0.52, 0.2, 0.008, { color: scaled(PAINT.machineGrey, 1.25) });
    b.geo('metalBare').box(0.48, y + 0.04, 0.352, 0.18, 0.016, 0.012);
  }
  // Paperwork stays below the declared height.
  const paper = b.geo('canvas');
  paper.box(-0.32, 0.765, 0.05, 0.3, 0.012, 0.22, { yaw: 0.22, color: hex(0xcfcbbd) });
  paper.box(-0.27, 0.774, 0.03, 0.29, 0.006, 0.21, { yaw: -0.1, color: hex(0xb8b6a8) });
  g.bakeContact(0, 0.3, 0.7);
};

export const serverRackBuilder: PropBuilder = (b) => {
  const g = b.geo('steelDark');
  const led = b.geo('led');
  const hw = 0.4;
  const hd = 0.55;
  const front = hd - 0.012;
  g.box(0, 1.06, 0, 0.8, 2.0, 1.08);
  g.box(0, 2.08, 0, 0.8, 0.04, 1.1);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) g.box(sx * 0.33, 0.03, sz * 0.46, 0.08, 0.06, 0.08);
    for (let i = 0; i < 6; i++) g.box(sx * (hw + 0.0), 1.5 + i * 0.07, 0, 0.004, 0.03, 0.8, { color: PAINT.black });
  }

  // Eleven server fronts, each with a status row and a vent.
  const units = 11;
  const unitH = 0.165;
  for (let i = 0; i < units; i++) {
    const y = 0.16 + (i + 0.5) * unitH;
    const tone = scaled(PAINT.darkSteel, 0.8 + 0.5 * hash2(i, 31));
    g.box(0, y, front + 0.006, 0.66, unitH - 0.014, 0.012, { color: tone });
    g.box(-0.1, y - 0.03, front + 0.0135, 0.4, 0.05, 0.002, { color: PAINT.black });
    const v0 = Math.floor(hash2(i, 32) * 16) / 16;
    const u0 = Math.floor(hash2(i, 33) * 16) / 16;
    const z = front + 0.0135;
    led.quad([0.3, y + 0.014, z], [-0.28, y + 0.014, z], [-0.28, y + 0.046, z], [0.3, y + 0.046, z], [0, 0, 1], [u0, v0, u0 + 1, v0 + 1 / 16]);
  }
  const steel = b.geo('metalBare');
  for (const sx of [-1, 1]) steel.box(sx * 0.37, 1.05, front + 0.012, 0.018, 1.86, 0.018);
  g.bakeContact(0, 0.6, 0.7);
};

/** Screen corners in prop space, front-facing at yaw 0. The objective visual overlays exactly this rectangle. */
export const TERMINAL_SCREEN: { corners: readonly [P3, P3, P3, P3]; normal: P3 } = {
  corners: [
    [0.36, 1.012, 0.118],
    [-0.36, 1.012, 0.118],
    [-0.36, 1.408, 0.028],
    [0.36, 1.408, 0.028],
  ],
  normal: [0, 0.2217, 0.9751],
};

export const dataTerminalBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn').tint(PAINT.machineGrey);
  g.extrude(
    [
      [-0.28, 0],
      [0.16, 0],
      [0.16, 0.8],
      [0.3, 0.86],
      [0.3, 0.9],
      [0.12, 0.98],
      [0.02, 1.42],
      [-0.05, 1.5],
      [-0.28, 1.5],
    ],
    'x',
    -0.5,
    0.5,
  );
  const dark = b.geo('steelDark');
  // Vent slats and an access door on the pedestal.
  for (let i = 0; i < 7; i++) dark.box(0, 0.22 + i * 0.045, 0.163, 0.5, 0.02, 0.008);
  dark.box(0, 0.62, 0.162, 0.72, 0.22, 0.004, { color: PAINT.black });
  // Keyboard lying on the sloped shelf, which falls 0.08 m over 0.18 m towards the user.
  dark.extrude(
    [
      [0.13, 0.976],
      [0.29, 0.905],
      [0.29, 0.917],
      [0.13, 0.988],
    ],
    'x',
    -0.34,
    0.34,
    true,
    PAINT.black,
  );
  for (let r = 0; r < 3; r++) {
    const z = 0.165 + r * 0.05;
    const y = 0.98 - (z - 0.12) * (0.08 / 0.18) + 0.016;
    for (let k = 0; k < 11; k++) dark.box(-0.28 + k * 0.056, y, z, 0.044, 0.012, 0.04, { color: scaled(PAINT.machineGrey, 0.7) });
  }
  // Idle screen, which the objective overlay covers on the mission terminal.
  const { corners, normal } = TERMINAL_SCREEN;
  b.geo('screen').quad(corners[0], corners[1], corners[2], corners[3], normal, [0, 0, 1, 1]);
  const led = b.geo('led');
  led.quad([0.4, 0.74, 0.1645], [0.1, 0.74, 0.1645], [0.1, 0.77, 0.1645], [0.4, 0.77, 0.1645], [0, 0, 1], [0, 0, 0.5, 1 / 16]);
  g.bakeContact(0, 0.5, 0.65);
};

function louvres(g: Geo, x: number, z: number, y0: number, count: number, facingX: boolean): void {
  for (let i = 0; i < count; i++) {
    const y = y0 + i * 0.075;
    if (facingX) g.box(x, y, z, 0.012, 0.035, 0.44);
    else g.box(x, y, z, 0.44, 0.035, 0.012);
  }
}

export const generatorBuilder: PropBuilder = (b) => {
  const g = b.geo('paintWorn').tint(PAINT.olive);
  const dark = b.geo('steelDark');
  const hd = 0.55;
  g.box(0, 0.74, 0, 2.1, 1.08, 1.0);
  g.box(0, 1.3, 0, 2.14, 0.05, 1.04, { color: scaled(PAINT.olive, 0.78) });

  // Skid rails and forklift pockets.
  for (const s of [-1, 1]) dark.box(0, 0.1, s * 0.46, 2.2, 0.2, 0.14);
  for (const x of [-0.7, 0.7]) dark.box(x, 0.14, 0, 0.26, 0.1, 1.1, { color: PAINT.inner });

  // Access panels with louvres, handles and door lines.
  for (const x of [-0.72, 0, 0.72]) {
    g.box(x, 0.74, hd - 0.04, 0.62, 0.92, 0.012, { color: scaled(PAINT.olive, 1.15) });
    g.box(x, 0.74, -hd + 0.04, 0.62, 0.92, 0.012, { color: scaled(PAINT.olive, 1.15) });
    louvres(dark, x, hd - 0.03, 0.9, 5, false);
    louvres(dark, x, -hd + 0.03, 0.9, 5, false);
    b.geo('metalBare').box(x + 0.22, 0.7, hd - 0.025, 0.03, 0.14, 0.018);
  }
  louvres(dark, 1.056, 0, 0.5, 8, true);
  louvres(dark, -1.056, 0, 0.5, 8, true);

  // Exhaust with a rain cap, fuel filler, and a small control panel.
  dark.cyl([0.75, 1.32, -0.2], [0.75, 1.46, -0.2], 0.05, 0.05, 8, false);
  dark.box(0.75, 1.48, -0.2, 0.15, 0.02, 0.15);
  dark.cyl([-0.8, 1.32, 0.3], [-0.8, 1.36, 0.3], 0.05, 0.05, 8, true);
  dark.box(-0.25, 0.92, hd - 0.022, 0.32, 0.22, 0.012, { color: PAINT.black });
  b.geo('glowAmber').box(-0.33, 0.96, hd - 0.014, 0.025, 0.025, 0.006);
  b.geo('glowRed').box(-0.27, 0.96, hd - 0.014, 0.025, 0.025, 0.006);
  plate(b, 'dangerVolts', [0.42, 1.06, hd - 0.022], 'z+', 0.28, 0.14);
  plate(b, 'hazardDiamond', [-0.7, 1.06, hd - 0.022], 'z+', 0.18, 0.18);
  g.bakeContact(0, 0.7, 0.62);
};
