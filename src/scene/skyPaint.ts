/**
 * Procedural blue-hour sky. One analytic function drives both the visible dome and the environment cube,
 * so reflections always agree with what the player sees. Pure maths and typed arrays: no Babylon.
 *
 * All colours are sRGB bytes. World convention: left-handed, Y up, East = +X, North = +Z.
 */

type Triple = readonly [number, number, number];

const HORIZON: Triple = [78, 92, 108];
const MID_SKY: Triple = [52, 64, 84];
const ZENITH: Triple = [20, 28, 44];
const CLOUD_DARK: Triple = [29, 35, 47];
const CLOUD_LIT: Triple = [66, 72, 86];
const WARM_BAND: Triple = [196, 128, 84];
const MOON_GLOW: Triple = [176, 188, 210];
/** What metals and water see below the horizon: the dark sea, not the fog. */
const SEA_BELOW: Triple = [13, 25, 31];

function unit(x: number, y: number, z: number): Triple {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

/** Unit vector from the ground towards the weak moon and dawn light: low in the east-south-east. */
export const TO_LIGHT = unit(0.8, 0.375, -0.46);
const WARM_AZIMUTH = unit(1, 0, -0.25);

const NOISE_SIZE = 256;
const noiseTable = buildNoiseTable();

function buildNoiseTable(): Float32Array {
  const table = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  let seed = 1337;
  for (let i = 0; i < table.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    table[i] = ((seed >>> 8) & 0xffff) / 65535;
  }
  return table;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const x0 = xi & (NOISE_SIZE - 1);
  const x1 = (xi + 1) & (NOISE_SIZE - 1);
  const y0 = (yi & (NOISE_SIZE - 1)) * NOISE_SIZE;
  const y1 = ((yi + 1) & (NOISE_SIZE - 1)) * NOISE_SIZE;
  const top = noiseTable[y0 + x0] + (noiseTable[y0 + x1] - noiseTable[y0 + x0]) * u;
  const bottom = noiseTable[y1 + x0] + (noiseTable[y1 + x1] - noiseTable[y1 + x0]) * u;
  return top + (bottom - top) * v;
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, y) * amp;
    norm += amp;
    amp *= 0.5;
    x = x * 2.03 + 17.3;
    y = y * 2.03 + 9.1;
  }
  return sum / norm;
}

const smooth = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function mixInto(out: number[], color: Triple, t: number): void {
  out[0] += (color[0] - out[0]) * t;
  out[1] += (color[1] - out[1]) * t;
  out[2] += (color[2] - out[2]) * t;
}

/**
 * Sky colour for a unit direction, written to `out` as sRGB 0..255.
 * @param forEnvironment true replaces the fog colour under the horizon with the dark sea.
 */
export function sampleSky(dx: number, dy: number, dz: number, forEnvironment: boolean, out: number[]): void {
  if (dy <= 0) {
    out[0] = HORIZON[0];
    out[1] = HORIZON[1];
    out[2] = HORIZON[2];
    if (forEnvironment) mixInto(out, SEA_BELOW, smooth(0, -0.04, dy));
    return;
  }

  out[0] = HORIZON[0];
  out[1] = HORIZON[1];
  out[2] = HORIZON[2];
  mixInto(out, MID_SKY, smooth(0, 0.22, dy));
  mixInto(out, ZENITH, smooth(0.12, 0.85, dy));

  // Dim warm band hugging the eastern horizon. It starts just above elevation 0 so the fogged sea reads as a dark line under it.
  const horizontal = Math.max(1e-5, Math.hypot(dx, dz));
  const towardsEast = (dx * WARM_AZIMUTH[0] + dz * WARM_AZIMUTH[2]) / horizontal;
  const eastFactor = Math.pow(Math.max(0, towardsEast * 0.5 + 0.5), 6);
  const bandOffset = (dy - 0.045) / 0.06;
  const band = Math.exp(-bandOffset * bandOffset) * eastFactor * smooth(0, 0.012, dy);
  mixInto(out, WARM_BAND, band * 0.75);
  mixInto(out, WARM_BAND, Math.exp(-dy / 0.25) * eastFactor * 0.16);

  // Heavy overcast: noise projected on a flat ceiling, so features compress naturally towards the horizon and never show a seam.
  const proj = 1.1 / (dy + 0.16);
  const u = dx * proj + 11.0;
  const v = dz * proj + 7.0;
  const cover = smooth(0.3, 0.68, fbm(u, v, 4)) * smooth(0, 0.07, dy);
  const shade = fbm(u * 2.1 + 31.0, v * 2.1 + 5.0, 2);
  const cloudWarm = Math.exp(-dy / 0.2) * eastFactor * 0.3;
  for (let i = 0; i < 3; i++) {
    const cloud = CLOUD_DARK[i] + (CLOUD_LIT[i] - CLOUD_DARK[i]) * shade + (WARM_BAND[i] - CLOUD_LIT[i]) * cloudWarm;
    out[i] += (cloud - out[i]) * cover * 0.92;
  }

  // Moon behind thin cloud.
  const toLight = Math.max(0, dx * TO_LIGHT[0] + dy * TO_LIGHT[1] + dz * TO_LIGHT[2]);
  const glow = Math.pow(toLight, 48) * 0.34 * (1 - cover * 0.6);
  mixInto(out, MOON_GLOW, glow);
}

/** Linear-space horizon colour. Equal to the fog colour, so distant geometry dissolves into the sky. */
export function horizonLinear(): [number, number, number] {
  return [Math.pow(HORIZON[0] / 255, 2.2), Math.pow(HORIZON[1] / 255, 2.2), Math.pow(HORIZON[2] / 255, 2.2)];
}

/** sRGB colour between the horizon and the zenith side, for unlit silhouettes. `darkness` 0 is the horizon colour. */
export function silhouetteSrgb(darkness: number): [number, number, number] {
  const k = 1 - darkness;
  return [(HORIZON[0] * k) / 255, (HORIZON[1] * k) / 255, (HORIZON[2] * k) / 255];
}

/** Equirectangular paint for the dome. Canvas row 0 is the zenith, column 0 faces +Z, matching domeArrays. */
export function paintSkyImage(width: number, height: number): ImageData {
  const image = new ImageData(width, height);
  const data = image.data;
  const out = [0, 0, 0];
  let seed = 90210;
  let p = 0;
  for (let y = 0; y < height; y++) {
    const elevation = (0.5 - (y + 0.5) / height) * Math.PI;
    const sinEl = Math.sin(elevation);
    const cosEl = Math.cos(elevation);
    for (let x = 0; x < width; x++) {
      const azimuth = ((x + 0.5) / width) * Math.PI * 2;
      sampleSky(Math.sin(azimuth) * cosEl, sinEl, Math.cos(azimuth) * cosEl, false, out);
      // Dither: a dark 8-bit gradient bands badly once it has been tone mapped.
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const dither = ((seed >>> 16) & 0xff) / 255 - 0.5;
      data[p++] = out[0] + dither;
      data[p++] = out[1] + dither;
      data[p++] = out[2] + dither;
      data[p++] = 255;
    }
  }
  return image;
}

/** Face layout of a cube map file: outward normal, then the world axes for increasing column and increasing row. */
const CUBE_FACES: readonly (readonly [Triple, Triple, Triple])[] = [
  [[1, 0, 0], [0, 0, -1], [0, -1, 0]], // +X
  [[-1, 0, 0], [0, 0, 1], [0, -1, 0]], // -X
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]], // +Y
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]], // -Y
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]], // +Z
  [[0, 0, -1], [-1, 0, 0], [0, -1, 0]], // -Z
];

/** Six RGBA8 faces in +X, -X, +Y, -Y, +Z, -Z order, gamma encoded. */
export function buildCubeFaces(size: number): Uint8Array[] {
  const out = [0, 0, 0];
  return CUBE_FACES.map(([normal, column, row]) => {
    const face = new Uint8Array(size * size * 4);
    let p = 0;
    for (let y = 0; y < size; y++) {
      const b = ((y + 0.5) / size) * 2 - 1;
      for (let x = 0; x < size; x++) {
        const a = ((x + 0.5) / size) * 2 - 1;
        const dx = normal[0] + column[0] * a + row[0] * b;
        const dy = normal[1] + column[1] * a + row[1] * b;
        const dz = normal[2] + column[2] * a + row[2] * b;
        const len = Math.hypot(dx, dy, dz);
        sampleSky(dx / len, dy / len, dz / len, true, out);
        face[p++] = out[0];
        face[p++] = out[1];
        face[p++] = out[2];
        face[p++] = 255;
      }
    }
    return face;
  });
}

/** Latitude and longitude sphere whose UVs map exactly onto paintSkyImage. */
export function domeArrays(radius: number, columns: number, rows: number): { positions: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const elevation = (v - 0.5) * Math.PI;
    for (let c = 0; c <= columns; c++) {
      const u = c / columns;
      const azimuth = u * Math.PI * 2;
      positions.push(Math.sin(azimuth) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, Math.cos(azimuth) * Math.cos(elevation) * radius);
      uvs.push(u, v);
    }
  }
  const stride = columns + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const a = r * stride + c;
      indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
    }
  }
  return { positions, uvs, indices };
}
