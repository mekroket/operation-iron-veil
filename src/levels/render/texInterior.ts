/** Interior surfaces plus the small neutral materials props use: rubber, canvas, galvanised steel, chain link. */
import { hash2, mix, sstep } from './noise';
import type { NoiseBank } from './noise';
import { fract, renderMaps } from './texCore';
import type { MapSet } from './texCore';

export function plasterInterior(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, v, p) => {
      const large = b.large.at(x + 13, y + 301);
      const mid = b.mid.at(x + 171, y + 23);
      const fine = b.fine.at(x + 90, y + 7);
      const streak = b.streak.at(x + 211, y);
      const crack = (1 - sstep(0, 0.008, b.crack.edge.at(x + 150, y + 410))) * sstep(0.56, 0.66, b.mid.at(x + 5, y + 390));
      // Grime climbs from the floor. World-space v puts the band at floor level, and it fades both ways so it wraps cleanly.
      const grime = (1 - sstep(0.015, 0.16, v)) * (0.65 + mid * 0.5) + (1 - sstep(0, 0.035, 1 - v)) * 0.6;
      const stain = sstep(0.6, 0.88, streak * (0.5 + large * 0.7)) * 0.42;

      const t = (0.74 + 0.18 * large + 0.1 * mid) * (1 - stain) * (1 - Math.min(1, grime) * 0.55) * (1 - crack * 0.6);
      p.r = t * 0.96;
      p.g = t * 0.98;
      p.b = t;
      p.h = large * 0.0025 + mid * 0.0014 + fine * 0.0006 - crack * 0.002;
      p.rough = 0.86 - large * 0.1;
      p.ao = 1 - Math.min(1, grime) * 0.3 - crack * 0.4;
    },
    { normalBoost: 1.3 },
  );
}

export function floorTile(b: NoiseBank): MapSet {
  const n = 8;
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const fu = fract(u * n);
      const fv = fract(v * n);
      const edge = Math.min(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv)) / n;
      const grout = 1 - sstep(0.0018, 0.004, edge);
      const id = hash2(Math.floor(u * n), Math.floor(v * n), 19);
      const mid = b.mid.at(x + 120, y + 330);
      const fine = b.fine.at(x + 45, y + 88);
      const scuff = sstep(0.55, 0.8, b.grain.at(x + 200, y + 60) * 0.6 + b.mid.at(x + 66, y + 9) * 0.4);
      const dirt = sstep(0.5, 0.8, b.large.at(x + 240, y + 17));

      const t = mix(0.4, 0.46, id) * (0.92 + 0.16 * mid) * (1 - dirt * 0.28) * (1 - scuff * 0.1);
      p.r = mix(t * 0.92, 0.1, grout);
      p.g = mix(t * 0.97, 0.1, grout);
      p.b = mix(t * 0.95, 0.1, grout);
      p.h = sstep(0, 0.008, edge) * 0.003 + fine * 0.00015;
      p.rough = mix(mix(0.26, 0.5, scuff) + dirt * 0.12, 0.92, grout);
      p.ao = 1 - grout * 0.6;
    },
    { normalBoost: 1.2 },
  );
}

export function floorRubber(b: NoiseBank): MapSet {
  const n = 24;
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const fu = fract(u * n) - 0.5;
      const fv = fract(v * n) - 0.5;
      const d = Math.sqrt(fu * fu + fv * fv);
      const stud = 1 - sstep(0.26, 0.34, d);
      const worn = sstep(0.45, 0.75, b.large.at(x + 19, y + 170));
      const mid = b.mid.at(x + 210, y + 50);
      const fine = b.fine.at(x + 31, y + 410);

      const t = (0.12 + mid * 0.03 + stud * 0.02) * (1 + worn * 0.55);
      p.r = t;
      p.g = t * 1.01;
      p.b = t * 1.05;
      p.h = stud * 0.0028 * (1 - worn * 0.4) + fine * 0.0002;
      p.rough = mix(0.74, 0.5, stud * worn);
      p.ao = 1 - (1 - stud) * 0.18;
    },
    { normalBoost: 1.2 },
  );
}

export function woodPlank(b: NoiseBank): MapSet {
  const planks = 10;
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const row = Math.floor(v * planks);
      const fv = v * planks - row;
      const id = hash2(row, 2, 41);
      const fu = fract(u + id);
      const shift = Math.floor(id * 977);

      const butt = Math.min(fu, 1 - fu);
      const gap = 1 - sstep(0, 0.06, Math.min(fv, 1 - fv));
      const joint = 1 - sstep(0.001, 0.003, butt);
      const grain = b.grain.at(x + shift, y + shift * 3);
      const figure = b.grain.at(x + shift * 2, y * 2 + shift);
      const mid = b.mid.at(x + shift, y + 77);
      const fine = b.fine.at(x + shift, y + 19);
      const wet = sstep(0.56, 0.7, b.large.at(x + 33, y + 280));
      const nail = 1 - sstep(0.002, 0.0035, Math.hypot(butt - 0.012, (Math.abs(fv - 0.5) - 0.28) / planks));

      const tone = mix(0.62, 1, id) * (0.68 + grain * 0.48 + figure * 0.14) * (0.88 + mid * 0.22) * mix(1, 0.6, wet);
      const k = (1 - gap * 0.8) * (1 - joint * 0.8);
      p.r = mix(0.44 * tone * k, 0.13, nail);
      p.g = mix(0.35 * tone * k, 0.11, nail);
      p.b = mix(0.26 * tone * k, 0.1, nail);
      p.h = (1 - gap) * 0.004 + grain * 0.0018 + fine * 0.0003 - joint * 0.004;
      p.rough = mix(mix(0.82, 0.3, wet), 0.6, nail);
      p.metal = nail * 0.6;
      p.ao = 1 - gap * 0.6 - joint * 0.5;
    },
    { normalBoost: 1.5 },
  );
}

export function glassDark(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      const streak = sstep(0.55, 0.85, b.streak.at(x + 177, y));
      const salt = sstep(0.58, 0.8, b.mid.at(x + 40, y + 140));
      const t = 0.035 + salt * 0.05 + streak * 0.03;
      p.r = t;
      p.g = t * 1.04;
      p.b = t * 1.1;
      p.h = streak * 0.00012 + b.large.at(x + 20, y + 80) * 0.0006;
      p.rough = 0.05 + salt * 0.22 + streak * 0.1;
    },
    { normalBoost: 1 },
  );
}

/** Hot-dip galvanised steel: spangle cells and brushed grain, properly metallic. */
export function metalBare(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      const spangle = b.pebbles.id.at(x + 50, y + 90);
      const grain = b.grain.at(x + 120, y + 66);
      const mid = b.mid.at(x + 400, y + 20);
      const rust = sstep(0.68, 0.82, b.streak.at(x + 180, y) * 0.5 + b.large.at(x + 70, y + 500) * 0.5);
      const t = (0.55 + spangle * 0.12 + grain * 0.08) * (0.86 + mid * 0.2);
      p.r = mix(t, 0.34, rust);
      p.g = mix(t, 0.18, rust);
      p.b = mix(t * 1.02, 0.1, rust);
      p.h = grain * 0.0004 + rust * mid * 0.001;
      p.rough = mix(0.34 + spangle * 0.16 + mid * 0.1, 0.84, rust);
      p.metal = mix(1, 0.4, rust);
    },
    { normalBoost: 2 },
  );
}

export function rubber(b: NoiseBank): MapSet {
  return renderMaps(
    b.size,
    (x, y, _u, _v, p) => {
      const mid = b.mid.at(x + 90, y + 200);
      const fine = b.fine.at(x + 200, y + 40);
      const dust = sstep(0.55, 0.85, b.large.at(x + 310, y + 150));
      const t = (0.11 + mid * 0.05) * (1 + dust * 0.9);
      p.r = t;
      p.g = t;
      p.b = t * 1.03;
      p.h = fine * 0.0006 + mid * 0.0006;
      p.rough = 0.82 + dust * 0.12;
    },
    { normalBoost: 2 },
  );
}

/** Woven sacking, near white so props tint it per vertex. */
export function canvas(b: NoiseBank): MapSet {
  const threads = 96;
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const warp = Math.sin(u * threads * Math.PI * 2);
      const weft = Math.sin(v * threads * Math.PI * 2);
      const checker = fract(u * threads * 0.5) < 0.5 !== fract(v * threads * 0.5) < 0.5;
      const weave = checker ? warp * warp : weft * weft;
      const mid = b.mid.at(x + 66, y + 130);
      const dirt = sstep(0.42, 0.8, b.large.at(x + 200, y + 44));
      const t = (0.62 + weave * 0.2 + mid * 0.16) * (1 - dirt * 0.4);
      p.r = t;
      p.g = t * 0.97;
      p.b = t * 0.9;
      p.h = weave * 0.0009 + mid * 0.002;
      p.rough = 0.9;
      p.ao = 0.75 + weave * 0.25;
    },
    { normalBoost: 1.2 },
  );
}

/** Galvanised wire diamonds with real alpha. Tile matches geometry at 0.6 m per repeat. */
export function chainLink(b: NoiseBank): MapSet {
  const periods = 6;
  const halfWire = 0.09;
  return renderMaps(
    b.size,
    (x, y, u, v, p) => {
      const a = fract((u + v) * periods);
      const c = fract((u - v) * periods);
      const da = Math.min(a, 1 - a);
      const dc = Math.min(c, 1 - c);
      const d = Math.min(da, dc);
      const wire = 1 - sstep(halfWire * 0.7, halfWire, d);
      const rust = sstep(0.6, 0.78, b.mid.at(x + 121, y + 240));
      const t = 0.5 + b.fine.at(x, y) * 0.1;
      p.r = mix(t, 0.3, rust);
      p.g = mix(t, 0.17, rust);
      p.b = mix(t * 1.03, 0.1, rust);
      p.a = wire;
      p.h = wire * 0.002 * (1 - d / halfWire);
      p.rough = mix(0.42, 0.85, rust);
      p.metal = mix(0.95, 0.35, rust);
    },
    { tileMetres: 0.6, normalBoost: 0.6 },
  );
}
