/**
 * Tileable noise fields for the procedural textures. Everything is precomputed into power-of-two Float32Arrays,
 * so a material can combine many layers per pixel for the cost of array lookups. No Babylon in here.
 */

export const sat = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sstep = (a: number, b: number, x: number): number => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Fast seeded generator (mulberry32) returning 0..1. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 0..1 hash of an integer pair: per-tile, per-plank and per-block variation. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A square power-of-two scalar field. `at` wraps, which is what makes every combination tile. */
export class Field {
  private readonly mask: number;
  private readonly shift: number;

  constructor(
    readonly size: number,
    readonly data: Float32Array,
  ) {
    this.mask = size - 1;
    this.shift = Math.round(Math.log2(size));
  }

  at(x: number, y: number): number {
    return this.data[((y & this.mask) << this.shift) | (x & this.mask)];
  }
}

function normalise(data: Float32Array): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - lo) * k;
}

/** Adds one wrapped value-noise octave. Lattice columns are resolved once per row to keep the inner loop trivial. */
function addOctave(target: Float32Array, size: number, px: number, py: number, amp: number, seed: number): void {
  const rand = seeded(seed);
  const lattice = new Float32Array(px * py);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();

  const cellX = new Int32Array(size);
  const fracX = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const fx = (x / size) * px;
    const ix = Math.floor(fx);
    const t = fx - ix;
    cellX[x] = ix % px;
    fracX[x] = t * t * (3 - 2 * t);
  }

  const column = new Float32Array(px);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * py;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    const row0 = (iy % py) * px;
    const row1 = ((iy + 1) % py) * px;
    for (let c = 0; c < px; c++) column[c] = lattice[row0 + c] + (lattice[row1 + c] - lattice[row0 + c]) * sy;
    const offset = y * size;
    for (let x = 0; x < size; x++) {
      const c0 = cellX[x];
      const c1 = c0 + 1 === px ? 0 : c0 + 1;
      target[offset + x] += (column[c0] + (column[c1] - column[c0]) * fracX[x]) * amp;
    }
  }
}

/** Fractal value noise, normalised to 0..1. Different periods per axis produce wrapped streaks and grain. */
export function fbmField(size: number, periodX: number, periodY: number, octaves: number, seed: number, gain = 0.5): Field {
  const data = new Float32Array(size * size);
  let amp = 1;
  let px = periodX;
  let py = periodY;
  for (let o = 0; o < octaves; o++) {
    addOctave(data, size, Math.min(px, size), Math.min(py, size), amp, seed + o * 101);
    amp *= gain;
    px *= 2;
    py *= 2;
  }
  normalise(data);
  return new Field(size, data);
}

export interface Worley {
  /** Distance to the nearest point, 0 at the point. */
  f1: Field;
  /** F2 - F1: reaches zero along cell borders, which is what cracks and seams threshold on. */
  edge: Field;
  /** Random 0..1 per cell. */
  id: Field;
}

/** Wrapped cellular noise with one jittered point per grid cell. */
export function worleyField(size: number, cells: number, seed: number): Worley {
  const rand = seeded(seed);
  const pointX = new Float32Array(cells * cells);
  const pointY = new Float32Array(cells * cells);
  const pointId = new Float32Array(cells * cells);
  for (let i = 0; i < pointX.length; i++) {
    pointX[i] = rand();
    pointY[i] = rand();
    pointId[i] = rand();
  }

  const f1 = new Float32Array(size * size);
  const edge = new Float32Array(size * size);
  const id = new Float32Array(size * size);
  const toCell = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * toCell;
    const iy = Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = x * toCell;
      const ix = Math.floor(fx);
      let best = 1e9;
      let second = 1e9;
      let bestId = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const gy = iy + dy;
        const wy = gy < 0 ? gy + cells : gy >= cells ? gy - cells : gy;
        for (let dx = -1; dx <= 1; dx++) {
          const gx = ix + dx;
          const wx = gx < 0 ? gx + cells : gx >= cells ? gx - cells : gx;
          const index = wy * cells + wx;
          const ax = gx + pointX[index] - fx;
          const ay = gy + pointY[index] - fy;
          const d = ax * ax + ay * ay;
          if (d < best) {
            second = best;
            best = d;
            bestId = pointId[index];
          } else if (d < second) {
            second = d;
          }
        }
      }
      const i = y * size + x;
      const a = Math.sqrt(best);
      f1[i] = a > 1 ? 1 : a;
      edge[i] = Math.sqrt(second) - a;
      id[i] = bestId;
    }
  }
  return { f1: new Field(size, f1), edge: new Field(size, edge), id: new Field(size, id) };
}

/** Layers shared by all materials. Each material samples them at its own offsets so nothing lines up. */
export class NoiseBank {
  readonly large: Field;
  readonly mid: Field;
  readonly fine: Field;
  /** Fine across u, slow along v: drips and streaks running down a wall. */
  readonly streak: Field;
  /** Slow along u, fine across v: wood grain and brushed metal. */
  readonly grain: Field;
  /** Big cells whose borders become cracks and tar seams. */
  readonly crack: Worley;
  /** Aggregate-sized cells. */
  readonly stones: Worley;
  /** Coarse stone cells for gravel. */
  readonly pebbles: Worley;

  constructor(readonly size: number) {
    this.large = fbmField(size, 3, 3, 5, 11);
    this.mid = fbmField(size, 9, 9, 5, 23);
    this.fine = fbmField(size, 64, 64, 3, 37);
    this.streak = fbmField(size, 40, 2, 4, 53);
    this.grain = fbmField(size, 3, 56, 4, 71);
    this.crack = worleyField(size, 5, 83);
    this.stones = worleyField(size, Math.min(96, Math.floor(size / 6)), 97);
    this.pebbles = worleyField(size, 22, 113);
  }
}

/** Nearest power of two, never below 64: Field wrapping relies on it. */
export function powerOfTwo(size: number): number {
  return Math.max(64, 2 ** Math.round(Math.log2(Math.max(1, size))));
}
