/** ISO shipping containers with real corrugated wall geometry. */
import type { Geo, P3 } from '../Geo';
import { scaled } from '../Geo';
import type { DecalName } from '../decalAtlas';
import { PAINT, plate } from './propTypes';
import type { PropBuilder } from './propTypes';

const WIDTH = 2.44;
const HEIGHT = 2.59;
const PITCH = 0.28;
const DEPTH = 0.035;

const COLORS = [PAINT.rustRed, PAINT.navy, PAINT.teal, PAINT.dirtyWhite];
const MARKS: readonly DecalName[] = ['containerId0', 'containerId1', 'containerId2', 'containerId3'];

/**
 * Trapezoid sheet along an axis. `point` maps (along, out, y) to prop space, and normals tilt with each slope so the
 * ridges catch sodium light the way real sheet steel does.
 */
function corrugate(
  g: Geo,
  point: (along: number, out: number, y: number) => P3,
  alongDir: P3,
  outDir: P3,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  uShift: number,
): void {
  const count = Math.max(1, Math.round((a1 - a0) / PITCH));
  const pitch = (a1 - a0) / count;
  const stops: readonly (readonly [number, number])[] = [
    [0, 0],
    [0.36, 0],
    [0.5, -DEPTH],
    [0.86, -DEPTH],
    [1, 0],
  ];
  for (let i = 0; i < count; i++) {
    const start = a0 + i * pitch;
    for (let k = 0; k < 4; k++) {
      const p = start + stops[k][0] * pitch;
      const q = start + stops[k + 1][0] * pitch;
      const dp = stops[k][1];
      const dq = stops[k + 1][1];
      const da = q - p;
      const dd = dq - dp;
      const l = Math.hypot(da, dd);
      const n: P3 = [
        (outDir[0] * da - alongDir[0] * dd) / l,
        (outDir[1] * da - alongDir[1] * dd) / l,
        (outDir[2] * da - alongDir[2] * dd) / l,
      ];
      g.quad(point(p, dp, y0), point(q, dq, y0), point(q, dq, y1), point(p, dp, y1), n, [(p + uShift) / 3, y0 / 3, (q + uShift) / 3, y1 / 3]);
    }
  }
}

export const containerBuilder = (length: number): PropBuilder => (b, variant) => {
  const color = COLORS[variant % COLORS.length];
  const frameTone = scaled(color, 0.72);
  const g = b.geo('paintWorn').tint(color);
  const hw = WIDTH / 2;
  const hl = length / 2;
  const wall = hw - 0.015;
  const shift = variant * 1.7;

  // Long walls run between the corner posts.
  corrugate(g, (a, o, y) => [wall + o, y, a], [0, 0, 1], [1, 0, 0], -hl + 0.12, hl - 0.12, 0.16, HEIGHT - 0.14, shift);
  corrugate(g, (a, o, y) => [-wall - o, y, a], [0, 0, 1], [-1, 0, 0], -hl + 0.12, hl - 0.12, 0.16, HEIGHT - 0.14, shift + 0.9);
  // Blind end.
  corrugate(g, (a, o, y) => [a, y, -hl + 0.015 - o], [1, 0, 0], [0, 0, -1], -hw + 0.12, hw - 0.12, 0.16, HEIGHT - 0.14, shift + 0.4);

  // Roof and floor: closes the shell, so nothing shows through at any angle.
  g.box(0, HEIGHT - 0.06, 0, WIDTH - 0.12, 0.05, length - 0.12);
  g.box(0, 0.13, 0, WIDTH - 0.06, 0.05, length - 0.06, { color: frameTone });

  g.tint(frameTone);
  for (const sx of [-1, 1]) {
    g.box(sx * (hw - 0.06), 0.08, 0, 0.12, 0.16, length);
    g.box(sx * (hw - 0.05), HEIGHT - 0.07, 0, 0.1, 0.14, length);
    for (const sz of [-1, 1]) g.box(sx * (hw - 0.07), HEIGHT / 2, sz * (hl - 0.07), 0.14, HEIGHT, 0.14);
  }
  for (const sz of [-1, 1]) {
    g.box(0, 0.08, sz * (hl - 0.05), WIDTH, 0.16, 0.1);
    g.box(0, HEIGHT - 0.08, sz * (hl - 0.05), WIDTH, 0.16, 0.1);
  }

  // Corner castings stand proud of the frame, in bare steel.
  const steel = b.geo('steelDark');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const y of [0.06, HEIGHT - 0.06]) steel.box(sx * (hw - 0.09), y, sz * (hl - 0.09), 0.18, 0.12, 0.18);
    }
  }

  // Door end: two leaves, four locking rods with handles and hinge blocks.
  g.tint(color);
  const doorZ = hl - 0.05;
  for (const sx of [-1, 1]) {
    g.box(sx * (hw / 2 - 0.03), HEIGHT / 2, doorZ, hw - 0.1, HEIGHT - 0.34, 0.05);
    for (let i = 0; i < 3; i++) g.box(sx * (hw / 2 - 0.03), 0.62 + i * 0.68, doorZ + 0.03, hw - 0.28, 0.46, 0.012, { color: scaled(color, 0.88) });
    for (const y of [0.5, 1.3, 2.1]) g.box(sx * (hw - 0.14), y, doorZ + 0.03, 0.05, 0.1, 0.03, { color: frameTone });
  }
  for (const x of [-0.82, -0.3, 0.3, 0.82]) {
    steel.cyl([x, 0.18, doorZ + 0.03], [x, HEIGHT - 0.18, doorZ + 0.03], 0.016, 0.016, 5, false);
    steel.box(x, 0.2, doorZ + 0.04, 0.09, 0.06, 0.03);
    steel.box(x, HEIGHT - 0.2, doorZ + 0.04, 0.09, 0.06, 0.03);
    const toward = x < 0 ? 0.2 : -0.2;
    steel.beam([x, 1.12, doorZ + 0.05], [x + toward, 1.12, doorZ + 0.06], 0.022, 0.022);
  }

  const mark = MARKS[variant % MARKS.length];
  const markX = hw - 0.008;
  const markZ = hl - 1.7;
  plate(b, mark, [markX, HEIGHT - 0.52, markZ], 'x+', 2.2, 0.55);
  plate(b, mark, [-markX, HEIGHT - 0.52, markZ], 'x-', 2.2, 0.55);
  plate(b, mark, [0, HEIGHT - 0.42, hl - 0.008], 'z+', 1.5, 0.375);

  g.bakeContact(0, 0.9, 0.62);
  steel.bakeContact(0, 0.9, 0.7);
};
