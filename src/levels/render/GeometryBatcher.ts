/**
 * Merges level solids into one mesh per (material, spatial cell, casts-shadow), with world-space UVs.
 * Large solids are cut along the cell grid first. A single quay slab would otherwise be one huge mesh that every light
 * in the level competes for, and the sodium pools on the ground are the point of the whole look.
 */
import type { Mesh, Scene } from '../../engine/bjs';
import type { BoxSolid, MaterialKey } from '../types';
import { Geo, scaled } from './Geo';
import type { P3, RGB } from './Geo';
import type { MaterialLibrary } from './materialLibrary';
import { NON_CASTING } from './materialLibrary';
import { hash2 } from './noise';

export const BATCH_CELL_SIZE = 32;

/** Metres per texture repeat on level geometry. */
const UV_METRES = 3;
/** Vertical faces taller than this get a damp, dirty band at the foot. */
const BAND_MIN_HEIGHT = 2.2;
const BAND_HEIGHT = 1.2;
const FOOT_SHADE = 0.62;
const TOP_SHADE = 0.94;

interface Batch {
  geo: Geo;
  material: MaterialKey;
  cast: boolean;
}

function cuts(min: number, max: number, aligned: boolean): number[] {
  const result = [min];
  if (aligned) {
    for (let c = (Math.floor(min / BATCH_CELL_SIZE) + 1) * BATCH_CELL_SIZE; c < max - 0.001; c += BATCH_CELL_SIZE) result.push(c);
  } else {
    const n = Math.ceil((max - min) / BATCH_CELL_SIZE);
    for (let i = 1; i < n; i++) result.push(min + ((max - min) * i) / n);
  }
  result.push(max);
  return result;
}

const dot = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Writes a flat quad whose UVs come from its world position, so nothing stretches and neighbours line up. */
function face(geo: Geo, corners: readonly [P3, P3, P3, P3], n: P3, t: P3, b: P3, shades: readonly [RGB, RGB, RGB, RGB]): void {
  const uv = (p: P3): readonly [number, number] => [dot(p, t) / UV_METRES, dot(p, b) / UV_METRES];
  const ids = corners.map((p, i) => {
    const [u, v] = uv(p);
    return geo.vertex(p, n, u, v, shades[i]);
  });
  geo.quadIndices(ids[0], ids[1], ids[2], ids[3]);
}

export class GeometryBatcher {
  readonly meshes: Mesh[] = [];
  readonly shadowCasters: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly library: MaterialLibrary,
  ) {}

  build(solids: readonly BoxSolid[]): void {
    const batches = new Map<string, Batch>();
    for (const solid of solids) {
      if (solid.visible === false) continue;
      this.addSolid(solid, batches);
    }
    for (const [key, batch] of batches) {
      if (batch.geo.isEmpty) continue;
      const mesh = batch.geo.toMesh(`batch.${key}`, this.scene);
      mesh.material = this.library.get(batch.material);
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      mesh.doNotSyncBoundingInfo = true;
      this.meshes.push(mesh);
      if (batch.cast) this.shadowCasters.push(mesh);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose(false, false);
    this.meshes.length = 0;
    this.shadowCasters.length = 0;
  }

  private addSolid(solid: BoxSolid, batches: Map<string, Batch>): void {
    const { center, size } = solid;
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
    const yaw = solid.yaw ?? 0;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ex: P3 = [c, 0, -s];
    const ez: P3 = [s, 0, c];
    const up: P3 = [0, 1, 0];
    const world = (lx: number, y: number, lz: number): P3 => [center.x + lx * c + lz * s, y, center.z - lx * s + lz * c];

    const hx = size.x / 2;
    const hz = size.z / 2;
    const y0 = center.y - size.y / 2;
    const y1 = center.y + size.y / 2;
    const aligned = yaw === 0;
    const xs = cuts(aligned ? center.x - hx : -hx, aligned ? center.x + hx : hx, aligned).map((v) => (aligned ? v - center.x : v));
    const zs = cuts(aligned ? center.z - hz : -hz, aligned ? center.z + hz : hz, aligned).map((v) => (aligned ? v - center.z : v));

    // A slight per-solid shift in tone keeps long runs of the same material from reading as one extrusion.
    const tone = 0.93 + 0.13 * hash2(Math.round(center.x * 7), Math.round(center.z * 7), Math.round(center.y * 7));
    const base: RGB = [tone, tone, tone];
    const foot = scaled(base, FOOT_SHADE);
    const top = scaled(base, TOP_SHADE);
    const banded = size.y > BAND_MIN_HEIGHT;
    const flat: readonly [RGB, RGB, RGB, RGB] = [base, base, base, base];
    const cast = solid.castShadow === true && !NON_CASTING.has(solid.material);

    /** Wall face from a0 to a1 along the ground. Tall ones get a separate foot band. */
    const wall = (geo: Geo, a0: P3, a1: P3, n: P3, t: P3): void => {
      const at = (p: P3, y: number): P3 => [p[0], y, p[2]];
      if (banded) {
        const mid = y0 + BAND_HEIGHT;
        face(geo, [at(a0, y0), at(a1, y0), at(a1, mid), at(a0, mid)], n, t, up, [foot, foot, base, base]);
        face(geo, [at(a0, mid), at(a1, mid), at(a1, y1), at(a0, y1)], n, t, up, [base, base, top, top]);
      } else {
        face(geo, [at(a0, y0), at(a1, y0), at(a1, y1), at(a0, y1)], n, t, up, flat);
      }
    };

    for (let ix = 0; ix + 1 < xs.length; ix++) {
      for (let iz = 0; iz + 1 < zs.length; iz++) {
        const x0 = xs[ix];
        const x1 = xs[ix + 1];
        const z0 = zs[iz];
        const z1 = zs[iz + 1];
        const mid = world((x0 + x1) / 2, center.y, (z0 + z1) / 2);
        const cellX = Math.floor(mid[0] / BATCH_CELL_SIZE);
        const cellZ = Math.floor(mid[2] / BATCH_CELL_SIZE);
        const key = `${solid.material}.${cellX}.${cellZ}.${cast ? 'c' : 'r'}`;
        let batch = batches.get(key);
        if (!batch) {
          batch = { geo: new Geo(), material: solid.material, cast };
          batches.set(key, batch);
        }
        const geo = batch.geo;

        const corner = (lx: number, y: number, lz: number): P3 => world(lx, y, lz);
        face(geo, [corner(x0, y1, z0), corner(x1, y1, z0), corner(x1, y1, z1), corner(x0, y1, z1)], up, ex, ez, flat);
        // The underside of anything sitting on the ground can never be seen.
        if (y0 > 0.01) {
          face(geo, [corner(x0, y0, z0), corner(x1, y0, z0), corner(x1, y0, z1), corner(x0, y0, z1)], [0, -1, 0], ex, ez, flat);
        }
        // Only the outer skin of a cut solid gets sides.
        if (ix === 0) wall(geo, corner(x0, 0, z0), corner(x0, 0, z1), [-ex[0], 0, -ex[2]], ez);
        if (ix + 2 === xs.length) wall(geo, corner(x1, 0, z0), corner(x1, 0, z1), ex, ez);
        if (iz === 0) wall(geo, corner(x0, 0, z0), corner(x1, 0, z0), [-ez[0], 0, -ez[2]], ex);
        if (iz + 2 === zs.length) wall(geo, corner(x0, 0, z1), corner(x1, 0, z1), ez, ex);
      }
    }
  }
}
