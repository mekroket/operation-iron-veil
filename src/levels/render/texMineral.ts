/** Ground and masonry: asphalt, the concrete family, quay stone and gravel. */
import { hash2, mix, sstep } from './noise';
import type { NoiseBank } from './noise';
import { fract, renderMaps } from './texCore';
import type { MapSet } from './texCore';

export function asphalt(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      const large = b.large.at(x + 11, y + 7);
      const mid = b.mid.at(x + 41, y + 3);
      const fine = b.fine.at(x, y);
      const stone = 1 - sstep(0.16, 0.55, b.stones.f1.at(x, y));
      const speck = b.stones.id.at(x, y);
      // Tar seams only along some cell borders, so they read as repairs and not as a net.
      const seam = (1 - sstep(0, 0.02, b.crack.edge.at(x + 200, y + 90))) * sstep(0.42, 0.56, b.mid.at(x + 300, y + 170));
      const wet = sstep(0.5, 0.64, large * 0.72 + mid * 0.28);
      const worn = sstep(0.55, 0.8, b.large.at(x + 512, y + 77));

      let t = mix(0.15, 0.25, stone * (0.35 + speck * 0.65)) * (0.84 + 0.32 * mid);
      if (speck > 0.93) t += stone * 0.16;
      t = mix(t, t * 1.2, worn);
      t *= mix(1, 0.56, wet);
      t = mix(t, 0.045, seam);
      p.r = t * 0.97;
      p.g = t * 0.985;
      p.b = t * 1.05;
      p.h = (stone * 0.0055 + fine * 0.001) * (1 - wet * 0.85) - seam * 0.003;
      p.rough = mix(mix(0.93, 0.08, wet), 0.32, seam);
      p.ao = 1 - (1 - stone) * 0.25 * (1 - wet);
    },
    { normalBoost: 1.2 },
  );
}

interface ConcreteLook {
  tone: readonly [number, number, number];
  /** Form-board lines and tie holes. */
  boards: boolean;
  /** How much of the surface is wet, 0..1. */
  wetness: number;
  offset: number;
  /** Two-tone paint over the concrete, peeling. */
  paint?: { upper: readonly [number, number, number]; dado: readonly [number, number, number] };
}

function concreteMaps(b: NoiseBank, look: ConcreteLook): MapSet {
  const o = look.offset;
  const wetCut = mix(0.78, 0.5, look.wetness);
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const large = b.large.at(x + o, y + o * 3);
      const mid = b.mid.at(x + o * 2, y + o);
      const fine = b.fine.at(x + o, y + o * 5);
      const streak = b.streak.at(x + o * 7, y);
      const crack = (1 - sstep(0, 0.014, b.crack.edge.at(x + o * 3, y + o * 2))) * sstep(0.5, 0.62, b.mid.at(x + o * 4, y + 200));

      let board = 1;
      let boardTone = 1;
      let tie = 0;
      if (look.boards) {
        const f = fract(v * 4);
        board = sstep(0, 0.012, f) * (1 - sstep(0.988, 1, f));
        boardTone = 0.94 + 0.12 * hash2(Math.floor(v * 4), 3, o);
        const tu = (fract(u * 3) - 0.5) / 3;
        const tv = (fract(v * 2) - 0.5) / 2;
        tie = 1 - sstep(0.008, 0.013, Math.sqrt(tu * tu + tv * tv));
      }

      const stain = sstep(0.55, 0.85, streak * (0.55 + 0.65 * large));
      const salt = sstep(0.62, 0.82, b.mid.at(x + o * 9, y + 400)) * 0.5;
      const wet = sstep(wetCut, wetCut + 0.12, large * 0.6 + mid * 0.4);
      const pores = 1 - sstep(0.02, 0.14, b.stones.f1.at(x + o, y + o));

      let t = (0.78 + 0.32 * mid) * boardTone * (1 - stain * 0.38) + salt * 0.14;
      t *= 1 - pores * 0.18;
      t *= mix(1, 0.62, wet);
      t *= 1 - (1 - board) * 0.45;
      t *= 1 - crack * 0.72;
      t *= 1 - tie * 0.75;

      let r = look.tone[0] * t;
      let g = look.tone[1] * t;
      let bl = look.tone[2] * t;
      let rough = mix(0.88 + fine * 0.08, 0.2, wet);
      let h = fine * 0.0012 + mid * 0.002 - pores * 0.0018 - (1 - board) * 0.005 - crack * 0.004 - tie * 0.008;

      if (look.paint) {
        const peel = sstep(0.61, 0.645, b.mid.at(x + o * 11, y + 90) * 0.68 + fine * 0.32);
        const coat = look.paint[fract(v * 2) < 0.25 && v < 0.5 ? 'dado' : 'upper'];
        const shade = (0.86 + 0.2 * mid) * (1 - stain * 0.3) * mix(1, 0.72, wet);
        r = mix(coat[0] * shade, r, peel);
        g = mix(coat[1] * shade, g, peel);
        bl = mix(coat[2] * shade, bl, peel);
        rough = mix(mix(0.52, 0.16, wet), rough, peel);
        h += (1 - peel) * 0.0009;
      }

      p.r = r;
      p.g = g;
      p.b = bl;
      p.h = h;
      p.rough = rough;
      p.ao = 1 - crack * 0.5 - (1 - board) * 0.3 - tie * 0.6;
    },
    { normalBoost: 1.4 },
  );
}

export const concrete = (b: NoiseBank): MapSet =>
  concreteMaps(b, { tone: [0.5, 0.49, 0.47], boards: true, wetness: 0.35, offset: 31 });

export const concreteDark = (b: NoiseBank): MapSet =>
  concreteMaps(b, { tone: [0.3, 0.3, 0.31], boards: true, wetness: 0.6, offset: 67 });

export const concretePainted = (b: NoiseBank): MapSet =>
  concreteMaps(b, {
    tone: [0.46, 0.45, 0.43],
    boards: false,
    wetness: 0.2,
    offset: 103,
    paint: { upper: [0.56, 0.6, 0.58], dado: [0.2, 0.3, 0.32] },
  });

export function quayStone(b: NoiseBank): MapSet {
  const rows = 4;
  const cols = 2;
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const rowF = v * rows;
      const row = Math.floor(rowF);
      const colF = u * cols + (row % 2 === 1 ? 0.5 : 0);
      const col = Math.floor(colF) % cols;
      const fu = colF - Math.floor(colF);
      const fv = rowF - row;
      // Distance to the nearest joint in tile units, so both axes are in the same scale.
      const edge = Math.min(Math.min(fu, 1 - fu) / cols, Math.min(fv, 1 - fv) / rows);
      const seam = 1 - sstep(0.003, 0.009, edge);
      const chamfer = sstep(0, 0.02, edge);
      const id = hash2(col, row, 7);

      const large = b.large.at(x + 7 + Math.floor(id * 300), y + 19);
      const mid = b.mid.at(x + Math.floor(id * 511), y + Math.floor(id * 257));
      const fine = b.fine.at(x + 61, y + 29);
      const pit = 1 - sstep(0.03, 0.16, b.stones.f1.at(x + 90, y + 45));
      const streak = b.streak.at(x + 150, y);
      const salt = sstep(0.6, 0.82, streak * 0.55 + b.mid.at(x + 77, y + 301) * 0.45);
      const algae = sstep(0.62, 0.8, b.large.at(x + 390, y + 210)) * (1 - salt);
      const wet = sstep(0.5, 0.64, b.large.at(x + 21, y + 400) * 0.7 + mid * 0.3);

      let t = mix(0.33, 0.47, id) * (0.82 + 0.36 * mid) * (1 - pit * 0.25);
      t *= mix(1, 0.6, wet);
      t = mix(t, 0.07, seam);
      let r = t * 1.02;
      let g = t;
      let bl = t * 0.96;
      r = mix(r, 0.62, salt * 0.34);
      g = mix(g, 0.62, salt * 0.34);
      bl = mix(bl, 0.6, salt * 0.34);
      r = mix(r, 0.07, algae * 0.65);
      g = mix(g, 0.11, algae * 0.65);
      bl = mix(bl, 0.07, algae * 0.65);

      p.r = r;
      p.g = g;
      p.b = bl;
      p.h = chamfer * 0.012 + (large * 0.008 + mid * 0.006 + fine * 0.0015 - pit * 0.003) * chamfer * (1 - wet * 0.6);
      p.rough = mix(mix(0.9, 0.14, wet), 0.95, seam);
      p.ao = 1 - seam * 0.7;
    },
    { normalBoost: 1.1 },
  );
}

export function gravel(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      const f1 = b.pebbles.f1.at(x, y);
      const edge = b.pebbles.edge.at(x, y);
      const id = b.pebbles.id.at(x, y);
      const small = 1 - sstep(0.1, 0.5, b.stones.f1.at(x + 77, y + 13));
      const mid = b.mid.at(x + 200, y + 91);
      const fine = b.fine.at(x + 33, y + 71);
      const crevice = 1 - sstep(0, 0.14, edge);
      const wet = sstep(0.6, 0.74, b.large.at(x + 91, y + 233));
      const dome = 1 - f1 * f1;

      const t = mix(0.24, 0.54, id) * (0.8 + 0.3 * mid) * (1 - crevice * 0.85) * mix(1, 0.58, wet);
      const warm = hash2(Math.floor(id * 97), 5);
      p.r = t * mix(0.94, 1.08, warm);
      p.g = t * mix(0.98, 1.0, warm);
      p.b = t * mix(1.05, 0.88, warm);
      p.h = dome * 0.028 + small * 0.004 + fine * 0.001;
      p.rough = mix(0.88 - id * 0.14, 0.2, wet);
      p.ao = 1 - crevice * 0.75;
    },
    { normalBoost: 0.9 },
  );
}
