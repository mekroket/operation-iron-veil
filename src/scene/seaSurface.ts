import { Mesh, MeshBuilder, PBRMaterial, RawTexture, Texture, Vector3 } from '../engine/bjs';
import type { Scene } from '../engine/bjs';

const SEA_SIZE = 2800;
/** Metres per repeat. The detail tile divides the swell tile, so snapping the plane to the swell tile never shifts either pattern. */
const SWELL_TILE = 28;
const DETAIL_TILE = 7;

interface Wave {
  kx: number;
  ky: number;
  amplitude: number;
  phase: number;
}

/** Sines with integer frequencies: the sum tiles perfectly, and its gradient is analytic. */
function buildWaves(count: number, maxFrequency: number, seed: number): Wave[] {
  let state = seed;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return ((state >>> 8) & 0xffff) / 65535;
  };
  const waves: Wave[] = [];
  for (let i = 0; i < count; i++) {
    const frequency = 1 + Math.floor(next() * maxFrequency);
    const angle = (next() - 0.5) * 2.2 + 0.6;
    const kx = Math.round(Math.cos(angle) * frequency);
    const ky = Math.round(Math.sin(angle) * frequency);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, amplitude: 1 / (Math.hypot(kx, ky) * Math.sqrt(count)), phase: next() * Math.PI * 2 });
  }
  return waves;
}

/** Calls `write` once per texel with the unit normal encoded to 0..255 bytes. */
function forEachNormal(size: number, waves: Wave[], slope: number, write: (offset: number, nx: number, ny: number, nz: number) => void): void {
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let gx = 0;
      let gy = 0;
      for (const wave of waves) {
        const c = Math.cos((wave.kx * u + wave.ky * v) * Math.PI * 2 + wave.phase) * wave.amplitude;
        gx += wave.kx * c;
        gy += wave.ky * c;
      }
      const nx = -gx * slope;
      const ny = -gy * slope;
      const scale = 127 / Math.hypot(nx, ny, 1);
      write((y * size + x) * 4, 128 + nx * scale, 128 + ny * scale, 128 + scale);
    }
  }
}

function buildSwellTexture(scene: Scene): RawTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  forEachNormal(size, buildWaves(12, 9, 4242), 0.55, (o, nx, ny, nz) => {
    data[o] = nx;
    data[o + 1] = ny;
    data[o + 2] = nz;
    data[o + 3] = 255;
  });
  return RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
}

/**
 * Babylon's detail map stores normal X in alpha, normal Y in green, and albedo and roughness offsets in red and blue.
 * Raw data keeps the alpha intact: a canvas would premultiply it.
 */
function buildDetailTexture(scene: Scene): RawTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  forEachNormal(size, buildWaves(10, 7, 777), 0.5, (o, nx, ny) => {
    data[o] = 128;
    data[o + 1] = ny;
    data[o + 2] = 128;
    data[o + 3] = nx;
  });
  return RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
}

/** Large camera-following water plane. Two scrolling normal layers, reflections come only from the environment map. */
export class SeaSurface {
  private readonly mesh: Mesh;
  private readonly material: PBRMaterial;
  private readonly swell: RawTexture;
  private readonly detail: RawTexture;

  constructor(scene: Scene, seaLevel: number, maxLights: number) {
    this.swell = buildSwellTexture(scene);
    this.detail = buildDetailTexture(scene);
    this.swell.uScale = SEA_SIZE / SWELL_TILE;
    this.swell.vScale = SEA_SIZE / SWELL_TILE;
    this.detail.uScale = SEA_SIZE / DETAIL_TILE;
    this.detail.vScale = SEA_SIZE / DETAIL_TILE;
    this.swell.anisotropicFilteringLevel = 8;
    this.detail.anisotropicFilteringLevel = 8;
    this.swell.level = 0.42;

    const material = new PBRMaterial('iv.sea', scene);
    material.albedoColor.set(0.008, 0.038, 0.047);
    material.metallic = 0;
    material.roughness = 0.14;
    material.indexOfRefraction = 1.33;
    material.bumpTexture = this.swell;
    material.detailMap.isEnabled = true;
    material.detailMap.texture = this.detail;
    material.detailMap.diffuseBlendLevel = 0;
    material.detailMap.roughnessBlendLevel = 0;
    material.detailMap.bumpLevel = 0.75;
    material.maxSimultaneousLights = Math.min(maxLights, 4);
    this.material = material;

    // A single quad: fog distance interpolates correctly across it, and the far edge is entirely fog colour.
    const mesh = MeshBuilder.CreateGround('iv.sea', { width: SEA_SIZE, height: SEA_SIZE, subdivisions: 1 }, scene);
    mesh.position.y = seaLevel;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    this.mesh = mesh;
  }

  setMaxLights(maxLights: number): void {
    this.material.maxSimultaneousLights = Math.min(maxLights, 4);
  }

  update(dt: number, camera: Vector3): void {
    this.mesh.position.x = Math.round(camera.x / SWELL_TILE) * SWELL_TILE;
    this.mesh.position.z = Math.round(camera.z / SWELL_TILE) * SWELL_TILE;
    // Offsets are in repeats per second of the texture, and they stay small enough to keep precision over a long session.
    this.swell.uOffset = (this.swell.uOffset + dt * 0.0052) % 1;
    this.swell.vOffset = (this.swell.vOffset + dt * 0.0031) % 1;
    this.detail.uOffset = (this.detail.uOffset - dt * 0.0105) % 1;
    this.detail.vOffset = (this.detail.vOffset + dt * 0.0162) % 1;
  }

  dispose(): void {
    this.mesh.dispose();
    this.material.dispose();
    this.swell.dispose();
    this.detail.dispose();
  }
}
