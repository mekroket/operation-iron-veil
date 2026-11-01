/** Salt-stained steel: painted plate chipping to rust, heavy rust, corrugated sheet and hazard paint. */
import { mix, sstep } from './noise';
import type { NoiseBank } from './noise';
import { fract, renderMaps } from './texCore';
import type { MapSet, Px } from './texCore';

type RGB = readonly [number, number, number];

interface PaintLook {
  paint: RGB;
  /** Fraction of the surface where the paint is gone, roughly. */
  chip: number;
  /** Strength of rust running down from damage. */
  drip: number;
  /** True shows bright bare steel in chips, false shows rust. */
  bareSteel: boolean;
  gloss: number;
  offset: number;
}

/** Shared paint-over-metal model. `extraDrip` lets corrugated sheet concentrate streaks under its laps. */
function shadePaint(b: NoiseBank, look: PaintLook, x: number, y: number, extraDrip: number, p: Px): void {
  const o = look.offset;
  const large = b.large.at(x + o, y + o * 2);
  const mid = b.mid.at(x + o * 3, y + o);
  const fine = b.fine.at(x + o * 5, y + o * 3);
  const streak = b.streak.at(x + o * 7, y);

  const cut = 1 - look.chip;
  const n = b.mid.at(x + o * 9, y + o * 4) * 0.6 + fine * 0.4;
  const chip = sstep(cut, cut + 0.03, n);
  const halo = sstep(cut - 0.07, cut, n) * (1 - chip);

  const rustTone = fine * 0.5 + mid * 0.5;
  const rustR = mix(0.25, 0.47, rustTone);
  const rustG = mix(0.12, 0.25, rustTone);
  const rustB = mix(0.07, 0.11, rustTone);

  const run = Math.min(1, sstep(0.58, 0.82, streak) * sstep(0.3, 0.72, large) * look.drip + extraDrip * streak * 1.6);
  const grime = sstep(0.42, 0.85, streak) * 0.3;
  const salt = sstep(0.68, 0.86, b.mid.at(x + o * 2, y + o * 11)) * 0.16;

  const shade = (0.8 + 0.34 * mid) * (1 - grime);
  let r = look.paint[0] * shade + salt;
  let g = look.paint[1] * shade + salt;
  let bl = look.paint[2] * shade + salt;
  r = mix(r, rustR, run * 0.68 + halo * 0.5);
  g = mix(g, rustG, run * 0.68 + halo * 0.5);
  bl = mix(bl, rustB, run * 0.68 + halo * 0.5);

  const under = look.bareSteel ? 0.42 + fine * 0.12 : 0;
  r = mix(r, look.bareSteel ? under : rustR, chip);
  g = mix(g, look.bareSteel ? under : rustG, chip);
  bl = mix(bl, look.bareSteel ? under * 1.03 : rustB, chip);

  p.r = r;
  p.g = g;
  p.b = bl;
  p.h = (1 - chip) * 0.0011 + fine * 0.00035 + halo * 0.0009 + (chip * mid * 0.0008 * (look.bareSteel ? 0 : 1));
  p.rough = mix(mix(look.gloss + mid * 0.2, 0.82, run), look.bareSteel ? 0.38 : 0.88, chip);
  p.metal = mix(run * 0.12, look.bareSteel ? 0.95 : 0.35, chip);
}

const painted = (look: PaintLook) => (b: NoiseBank): MapSet =>
  renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      shadePaint(b, look, x, y, 0, p);
      p.h += b.large.at(x + 44, y + 12) * 0.002;
    },
    { normalBoost: 1.6 },
  );

export const steelDark = painted({ paint: [0.15, 0.17, 0.2], chip: 0.24, drip: 0.5, bareSteel: true, gloss: 0.36, offset: 13 });
export const steelYellow = painted({ paint: [0.72, 0.54, 0.09], chip: 0.26, drip: 0.8, bareSteel: false, gloss: 0.42, offset: 29 });
/** Neutral coat tinted per vertex by props, so one material covers every painted variant. */
export const paintWorn = painted({ paint: [0.82, 0.82, 0.81], chip: 0.2, drip: 0.75, bareSteel: false, gloss: 0.4, offset: 47 });

export function steelRust(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      const large = b.large.at(x + 200, y + 31);
      const mid = b.mid.at(x + 59, y + 17);
      const fine = b.fine.at(x + 113, y + 201);
      const pit = 1 - sstep(0.04, 0.22, b.stones.f1.at(x + 7, y + 150));
      const flake = sstep(0.55, 0.72, b.mid.at(x + 180, y + 310));
      const streak = b.streak.at(x + 310, y);
      const paintLeft = 1 - sstep(0.3, 0.4, b.large.at(x + 77, y + 460));

      const t = mid * 0.55 + fine * 0.25 + streak * 0.2;
      let r = mix(0.2, 0.56, t);
      let g = mix(0.1, 0.29, t);
      let bl = mix(0.06, 0.12, t);
      r = mix(r, r * 0.55, pit);
      g = mix(g, g * 0.55, pit);
      bl = mix(bl, bl * 0.55, pit);
      r = mix(r, 0.14, paintLeft * 0.8);
      g = mix(g, 0.15, paintLeft * 0.8);
      bl = mix(bl, 0.16, paintLeft * 0.8);

      p.r = r;
      p.g = g;
      p.b = bl;
      p.h = flake * 0.0016 + fine * 0.0013 - pit * 0.0014 + large * 0.002;
      p.rough = mix(0.8 + fine * 0.15, 0.5, paintLeft);
      p.metal = mix(0.28, 0.55, paintLeft);
      p.ao = 1 - pit * 0.35;
    },
    { normalBoost: 2.2 },
  );
}

/** Real ridges in the height map, sheet laps with fasteners, and rust running down from every lap. */
function corrugated(look: PaintLook, rustBias: number) {
  const ridges = 12;
  return (b: NoiseBank): MapSet =>
    renderMaps(
      b.size,
      (x, y, u, v, p) => {
        const phase = fract(u * ridges);
        const wave = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
        const ridge = sstep(0.12, 0.88, wave);

        // Sheets lap at v = 0 and v = 0.5. Below a lap means just under it, because v grows upward.
        const below = fract(-v * 2);
        const lap = 1 - sstep(0, 0.02, below);
        const fx = (phase - 0.5) / ridges;
        const fy = Math.min(below, 1 - below) / 2 - 0.012;
        const fastener = 1 - sstep(0.0035, 0.006, Math.sqrt(fx * fx + fy * fy));

        const drip = (1 - sstep(0, 0.65, below)) * (1 - ridge * 0.6) * rustBias;
        shadePaint(b, look, x, y, drip, p);

        p.h += ridge * 0.03 + lap * 0.005 + fastener * 0.0035;
        const valley = 1 - ridge;
        p.ao = 1 - valley * 0.28 - lap * 0.25;
        const k = 1 - valley * 0.14 - lap * 0.3;
        p.r *= k;
        p.g *= k;
        p.b *= k;
        if (fastener > 0.5) {
          p.r = mix(p.r, 0.33, 0.7);
          p.g = mix(p.g, 0.17, 0.7);
          p.b = mix(p.b, 0.1, 0.7);
          p.rough = 0.8;
        }
      },
      { normalBoost: 1 },
    );
}

export const corrugatedGrey = corrugated({ paint: [0.44, 0.46, 0.48], chip: 0.15, drip: 0.6, bareSteel: false, gloss: 0.42, offset: 71 }, 0.45);
export const corrugatedRust = corrugated({ paint: [0.3, 0.17, 0.11], chip: 0.42, drip: 1, bareSteel: false, gloss: 0.62, offset: 97 }, 1);
export const corrugatedWhite = corrugated({ paint: [0.72, 0.72, 0.68], chip: 0.12, drip: 0.75, bareSteel: false, gloss: 0.38, offset: 127 }, 0.6);

export function hazardStripe(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const s = fract((u + v) * 4);
      const yellow = sstep(0, 0.012, s) * (1 - sstep(0.49, 0.502, s));
      const mid = b.mid.at(x + 70, y + 310);
      const fine = b.fine.at(x + 140, y + 60);
      const wear = sstep(0.6, 0.66, b.mid.at(x + 410, y + 77) * 0.62 + fine * 0.38);
      const dirt = sstep(0.4, 0.85, b.streak.at(x + 90, y)) * 0.3;
      const shade = (0.82 + 0.3 * mid) * (1 - dirt);

      const baseT = 0.3 * (0.8 + 0.4 * mid);
      p.r = mix(mix(0.06, 0.82, yellow) * shade, baseT, wear);
      p.g = mix(mix(0.06, 0.6, yellow) * shade, baseT, wear);
      p.b = mix(mix(0.06, 0.07, yellow) * shade, baseT * 0.97, wear);
      p.h = (1 - wear) * 0.0012 + fine * 0.0008;
      p.rough = mix(0.48 + mid * 0.2, 0.88, wear);
    },
    { normalBoost: 1.5 },
  );
}
