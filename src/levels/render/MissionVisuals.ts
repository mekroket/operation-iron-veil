/** Scripted looks: the objective terminal's screen by state, and the charring and debris left by the charge. */
import { Color3, Matrix, Mesh, PBRMaterial, Quaternion, Vector3 } from '../../engine/bjs';
import type { Scene, Texture } from '../../engine/bjs';
import type { ResolvedGraphics } from '../../settings/settings';
import type { LevelDefinition } from '../types';
import { Geo, freezeStatic, scaled, WHITE } from './Geo';
import { floorHeightAt } from './LightFx';
import type { MaterialLibrary } from './materialLibrary';
import { fbmField, seeded, sstep, worleyField } from './noise';
import { proceduralSize, uploadTexture } from './proceduralTextures';
import { TERMINAL_SCREEN } from './props/interior';

export type ObjectiveState = 'locked' | 'active' | 'working' | 'done';

const SCREEN_OFFSET = 0.005;

const STATE_LOOK: Record<ObjectiveState, { color: Color3; base: number; swing: number; rate: number }> = {
  locked: { color: new Color3(0.8, 0.1, 0.06), base: 0.6, swing: 0, rate: 0 },
  active: { color: new Color3(1, 0.6, 0.14), base: 1.5, swing: 0.7, rate: 4 },
  working: { color: new Color3(0.25, 0.85, 1), base: 1.7, swing: 0.6, rate: 14 },
  done: { color: new Color3(0.2, 1, 0.42), base: 1.7, swing: 0, rate: 0 },
};

export class ObjectiveVisuals {
  private mesh: Mesh | null = null;
  private material: PBRMaterial | null = null;
  private state: ObjectiveState = 'locked';
  private clock = 0;

  constructor(
    private readonly scene: Scene,
    private readonly library: MaterialLibrary,
  ) {}

  /** Sits on the terminal at this base position and yaw. */
  build(x: number, y: number, z: number, yaw: number): void {
    const { corners, normal } = TERMINAL_SCREEN;
    const lift = corners.map((p) => [p[0] + normal[0] * SCREEN_OFFSET, p[1] + normal[1] * SCREEN_OFFSET, p[2] + normal[2] * SCREEN_OFFSET] as const);
    const geo = new Geo().place(x, y, z, yaw);
    geo.quad(lift[0], lift[1], lift[2], lift[3], normal, [0, 0, 1, 1]);
    this.mesh = geo.toMesh('objective.screen', this.scene);
    this.material = this.library.createScreenMaterial('objective.screen');
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    freezeStatic(this.mesh);
    this.setState('locked');
  }

  setState(state: ObjectiveState): void {
    this.state = state;
    if (this.material) this.material.emissiveColor = STATE_LOOK[state].color.clone();
  }

  update(dt: number): void {
    if (!this.material) return;
    this.clock += dt;
    const look = STATE_LOOK[this.state];
    this.material.emissiveIntensity = look.base + look.swing * Math.sin(this.clock * look.rate);
  }

  dispose(): void {
    this.mesh?.dispose(false, false);
    this.material?.dispose(false, false);
    this.mesh = null;
    this.material = null;
  }
}

const SCORCH_RADIUS = 6;
const EMBER_FADE_SECONDS = 30;
const EMBER_REST = 0.1;

export class BlastVisuals {
  /** Everything that appears with the blast, kept disabled until then. */
  readonly meshes: Mesh[] = [];
  private readonly textures: Texture[] = [];
  private scorchMaterial: PBRMaterial | null = null;
  private embers = 0;
  private active = false;

  constructor(
    private readonly scene: Scene,
    private readonly library: MaterialLibrary,
    private readonly gfx: ResolvedGraphics,
  ) {}

  build(level: LevelDefinition): void {
    const point = level.blastPoint;
    const floor = floorHeightAt(level.solids, point.x, point.z, point.y);
    this.buildScorch(point.x, floor, point.z);
    this.buildDebris('concreteDark', this.chunkGeo(), 44, point.x, floor, point.z, 0.18, 0.62, 2);
    this.buildDebris('steelRust', this.barGeo(), 18, point.x, floor, point.z, 0.5, 1.1, 3);
    for (const mesh of this.meshes) mesh.setEnabled(false);
  }

  /** Compiles shaders now, so the detonation frame does not stall. Call after lights are assigned. */
  precompile(): void {
    for (const mesh of this.meshes) {
      mesh.material?.forceCompilation(mesh, undefined, { useInstances: mesh.hasThinInstances });
    }
  }

  setActive(active: boolean): void {
    if (active && !this.active) this.embers = 1;
    this.active = active;
    for (const mesh of this.meshes) mesh.setEnabled(active);
  }

  update(dt: number): void {
    if (!this.active || !this.scorchMaterial) return;
    this.embers = Math.max(0, this.embers - dt / EMBER_FADE_SECONDS);
    this.scorchMaterial.emissiveIntensity = EMBER_REST + this.embers * 2.2;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose(false, false);
    this.scorchMaterial?.dispose(false, false);
    for (const texture of this.textures) texture.dispose();
    this.meshes.length = 0;
    this.textures.length = 0;
    this.scorchMaterial = null;
  }

  private buildScorch(x: number, y: number, z: number): void {
    const size = Math.min(512, proceduralSize(this.gfx));
    const noise = fbmField(size, 6, 6, 5, 1907);
    const cells = worleyField(size, 9, 1913);
    const color = new Uint8Array(size * size * 4);
    const glow = new Uint8Array(size * size * 4);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const r = Math.hypot(px / size - 0.5, py / size - 0.5) * 2;
        const n = noise.at(px, py);
        const i = (py * size + px) * 4;
        const shade = 8 + n * 26 * sstep(0.15, 0.9, r);
        color[i] = shade;
        color[i + 1] = shade * 0.95;
        color[i + 2] = shade * 0.92;
        color[i + 3] = (1 - sstep(0.5, 1, r + (n - 0.5) * 0.55)) * 255;
        const seam = 1 - sstep(0, 0.05, cells.edge.at(px, py));
        const ember = seam * (1 - sstep(0.1, 0.6, r)) * sstep(0.35, 0.6, n);
        glow[i] = ember * 255;
        glow[i + 1] = ember * 95;
        glow[i + 2] = ember * 22;
        glow[i + 3] = 255;
      }
    }
    const albedo = uploadTexture(this.scene, 'blast.scorch', color, size, this.gfx, true);
    albedo.hasAlpha = true;
    const emissive = uploadTexture(this.scene, 'blast.embers', glow, size, this.gfx, true);
    this.textures.push(albedo, emissive);

    const material = new PBRMaterial('blast.scorch', this.scene);
    material.albedoTexture = albedo;
    material.useAlphaFromAlbedoTexture = true;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    material.metallic = 0;
    material.roughness = 0.96;
    material.emissiveTexture = emissive;
    material.emissiveColor = Color3.White();
    material.emissiveIntensity = EMBER_REST;
    material.maxSimultaneousLights = this.gfx.maxLights;
    material.zOffset = -2;
    this.scorchMaterial = material;

    const r = SCORCH_RADIUS;
    const geo = new Geo().place(x, y + 0.035, z);
    geo.quad([-r, 0, -r], [r, 0, -r], [r, 0, r], [-r, 0, r], [0, 1, 0], [0, 0, 1, 1]);
    const mesh = geo.toMesh('blast.scorch', this.scene);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    freezeStatic(mesh);
    this.meshes.push(mesh);
  }

  private chunkGeo(): Geo {
    const g = new Geo();
    g.uvScale = 1.5;
    const tone = scaled(WHITE, 0.55);
    g.box(0, 0, 0, 1, 0.55, 0.8, { color: tone, yaw: 0.4 });
    g.box(0.18, 0.18, -0.1, 0.62, 0.5, 0.5, { color: scaled(tone, 0.8), yaw: 1.1 });
    return g;
  }

  /** A length of bent rebar or torn angle. */
  private barGeo(): Geo {
    const g = new Geo();
    g.tube(
      [
        [-0.5, 0, 0],
        [-0.15, 0.02, 0.02],
        [0.1, 0.1, 0.1],
        [0.5, 0.24, 0.05],
      ],
      0.03,
      5,
    );
    return g;
  }

  private buildDebris(
    surface: 'concreteDark' | 'steelRust',
    geo: Geo,
    count: number,
    x: number,
    y: number,
    z: number,
    minScale: number,
    maxScale: number,
    seed: number,
  ): void {
    const rand = seeded(9000 + seed);
    const data = new Float32Array(count * 16);
    const scale = new Vector3();
    const position = new Vector3();
    for (let i = 0; i < count; i++) {
      // Mostly thrown clear of the crater, thinning out towards the edge.
      const angle = rand() * Math.PI * 2;
      const dist = 1.2 + Math.sqrt(rand()) * (SCORCH_RADIUS + 2);
      const s = minScale + (maxScale - minScale) * rand() * rand();
      scale.set(s, s, s);
      position.set(x + Math.cos(angle) * dist, y + s * 0.14, z + Math.sin(angle) * dist);
      const rotation = Quaternion.RotationYawPitchRoll(rand() * Math.PI * 2, (rand() - 0.5) * 0.7, (rand() - 0.5) * 0.7);
      Matrix.Compose(scale, rotation, position).copyToArray(data, i * 16);
    }
    const mesh: Mesh = geo.toMesh(`blast.debris.${surface}`, this.scene);
    mesh.material = this.library.get(surface);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.thinInstanceSetBuffer('matrix', data, 16, true);
    freezeStatic(mesh);
    this.meshes.push(mesh);
  }
}
