/**
 * The per-pixel driver behind every procedural material. A shader fills in one Px with sRGB albedo, height in metres
 * and PBR values; this turns the result into albedo, tangent-space normal and ORM byte arrays.
 *
 * Rows run along +v (textures upload with invertY false) and world-space UVs put v = up on walls,
 * so a generator draws "down the wall" as decreasing y.
 */

export interface Px {
  r: number;
  g: number;
  b: number;
  /** Surface height in metres. Normal slopes are derived from this, so it reads at real-world scale. */
  h: number;
  rough: number;
  metal: number;
  ao: number;
  a: number;
}

export type Shader = (x: number, y: number, u: number, v: number, p: Px) => void;

export interface MapSet {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  orm: Uint8Array;
}

export interface MapOptions {
  /** World metres covered by one repeat. Must match how the geometry assigns UVs. */
  tileMetres?: number;
  /** Multiplies slopes to compensate for detail that a real surface shows at a finer scale. */
  normalBoost?: number;
}

export const fract = (x: number): number => x - Math.floor(x);

export function renderMaps(size: number, shade: Shader, options: MapOptions = {}): MapSet {
  const count = size * size;
  const albedo = new Uint8ClampedArray(count * 4);
  const orm = new Uint8ClampedArray(count * 4);
  const normal = new Uint8ClampedArray(count * 4);
  const height = new Float32Array(count);
  const p: Px = { r: 0, g: 0, b: 0, h: 0, rough: 1, metal: 0, ao: 1, a: 1 };

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      p.ao = 1;
      p.a = 1;
      p.metal = 0;
      shade(x, y, (x + 0.5) / size, v, p);
      const i = y * size + x;
      const j = i * 4;
      albedo[j] = p.r * 255;
      albedo[j + 1] = p.g * 255;
      albedo[j + 2] = p.b * 255;
      albedo[j + 3] = p.a * 255;
      orm[j] = p.ao * 255;
      orm[j + 1] = (p.rough < 0.04 ? 0.04 : p.rough) * 255;
      orm[j + 2] = p.metal * 255;
      orm[j + 3] = 255;
      height[i] = p.h;
    }
  }

  // Central differences with wrap, as a true slope: metres of height per metre of surface.
  const tile = options.tileMetres ?? 3;
  const k = (size / (2 * tile)) * (options.normalBoost ?? 1);
  const mask = size - 1;
  for (let y = 0; y < size; y++) {
    const up = ((y + 1) & mask) * size;
    const down = ((y - 1) & mask) * size;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const dx = (height[row + ((x + 1) & mask)] - height[row + ((x - 1) & mask)]) * k;
      const dy = (height[up + x] - height[down + x]) * k;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const j = (row + x) * 4;
      normal[j] = (0.5 - dx * inv * 0.5) * 255;
      normal[j + 1] = (0.5 - dy * inv * 0.5) * 255;
      normal[j + 2] = (0.5 + inv * 0.5) * 255;
      normal[j + 3] = 255;
    }
  }

  return {
    size,
    albedo: new Uint8Array(albedo.buffer),
    normal: new Uint8Array(normal.buffer),
    orm: new Uint8Array(orm.buffer),
  };
}
