/**
 * Cheap atmosphere around fixtures: an additive glow at each head, a soft haze cone under street lamps, and on lower
 * settings a painted pool on the floor where real lights have run out of slots. All thin-instanced, one draw call per kind.
 */
import { Color3, Engine, Material, Mesh, StandardMaterial } from '../../engine/bjs';
import type { Scene, Texture } from '../../engine/bjs';
import { PROP_CATALOG } from '../propCatalog';
import type { BoxSolid, LevelDefinition, LightDef, LightKind } from '../types';
import { Geo, freezeStatic } from './Geo';
import type { P3 } from './Geo';
import { LIGHT_COLORS } from './LightRig';
import { sstep } from './noise';
import { uploadTexture } from './proceduralTextures';
import type { ResolvedGraphics } from '../../settings/settings';

const FLARE_SIZE: Record<LightKind, number> = { sodium: 2.2, fluorescent: 1.0, warning: 0.9, emergency: 1.0, work: 1.5 };
const FLARE_ALPHA: Record<LightKind, number> = { sodium: 0.8, fluorescent: 0.5, warning: 0.65, emergency: 0.6, work: 0.6 };
const POOL_MAX_LIGHTS = 4;
/** Sodium head position on a lamp post, relative to its base, matching the lampPost prop. */
const LAMP_HEAD_X = 0.64;
const LAMP_HEAD_Y = 8.78;

/** Height of the highest walkable surface at (x, z) that is not above `belowY`. */
export function floorHeightAt(solids: readonly BoxSolid[], x: number, z: number, belowY: number): number {
  let best = 0;
  let found = false;
  for (const solid of solids) {
    if (solid.visible === false) continue;
    const top = solid.center.y + solid.size.y / 2;
    if (top > belowY + 0.01 || (found && top <= best)) continue;
    const yaw = solid.yaw ?? 0;
    const dx = x - solid.center.x;
    const dz = z - solid.center.z;
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (Math.abs(lx) <= solid.size.x / 2 && Math.abs(lz) <= solid.size.z / 2) {
      best = top;
      found = true;
    }
  }
  return best;
}

/** RGBA greyscale made from a per-pixel function, for additive blending. Row order follows +v. */
function greyTexture(scene: Scene, name: string, size: number, gfx: ResolvedGraphics, value: (u: number, v: number) => number): Texture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = value((x + 0.5) / size, (y + 0.5) / size) * 255;
      const i = (y * size + x) * 4;
      data[i] = t;
      data[i + 1] = t;
      data[i + 2] = t;
      data[i + 3] = 255;
    }
  }
  return uploadTexture(scene, name, data, size, gfx, false);
}

/** Soft radial falloff with a hot core. */
export function createGlowTexture(scene: Scene, gfx: ResolvedGraphics): Texture {
  return greyTexture(scene, 'fx.glow', 128, gfx, (u, v) => {
    const r = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    const falloff = (1 - r) * (1 - r);
    return falloff * falloff * 0.8 + falloff * 0.2;
  });
}

/** Self-lit additive material. Fog stays off, because fog would add its own colour on top of the blend. */
export function createAdditiveMaterial(scene: Scene, name: string, color: Color3, texture: Texture, alpha: number): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = color.clone();
  material.diffuseTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.alphaMode = Engine.ALPHA_ADD;
  material.alpha = alpha;
  material.disableDepthWrite = true;
  return material;
}

/** Three crossed quads, a unit wide: a glow that holds up from every view without per-frame billboarding. */
export function starGeo(): Geo {
  const g = new Geo();
  const uv = [0, 0, 1, 1] as const;
  const r = 0.5;
  g.quad([-r, -r, 0], [r, -r, 0], [r, r, 0], [-r, r, 0], [0, 0, 1], uv);
  g.quad([0, -r, -r], [0, -r, r], [0, r, r], [0, r, -r], [1, 0, 0], uv);
  g.quad([-r, 0, -r], [r, 0, -r], [r, 0, r], [-r, 0, r], [0, 1, 0], uv);
  return g;
}

function coneGeo(): Geo {
  const g = new Geo();
  const uv = [0, 0, 1, 1] as const;
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const n: P3 = [-s, 0, c];
    g.quad([-c, 0, -s], [c, 0, s], [c, 1, s], [-c, 1, -s], n, uv);
  }
  return g;
}

function floorGeo(): Geo {
  const g = new Geo();
  g.quad([-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [0, 1, 0], [0, 0, 1, 1]);
  return g;
}

const scaleTranslate = (out: number[], sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
  out.push(sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1);
};

export class LightFx {
  private readonly meshes: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];
  private readonly textures: Texture[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly level: LevelDefinition,
    private readonly gfx: ResolvedGraphics,
  ) {}

  build(): void {
    const glow = createGlowTexture(this.scene, this.gfx);
    const haze = greyTexture(this.scene, 'fx.haze', 128, this.gfx, (u, v) => {
      // v = 1 is the fixture. The cone narrows towards it and fades before it reaches the ground.
      const halfWidth = 0.1 + (1 - v) * 0.9;
      const across = Math.min(1, (Math.abs(u - 0.5) * 2) / halfWidth);
      return (1 - sstep(0.25, 1, across)) * sstep(0, 0.85, v) * (1 - sstep(0.96, 1, v));
    });
    this.textures.push(glow, haze);

    const flares = new Map<LightKind, number[]>();
    const cones = new Map<LightKind, number[]>();
    const pools = new Map<LightKind, number[]>();
    const push = (map: Map<LightKind, number[]>, kind: LightKind): number[] => {
      let list = map.get(kind);
      if (!list) {
        list = [];
        map.set(kind, list);
      }
      return list;
    };

    const paintPools = this.gfx.maxLights <= POOL_MAX_LIGHTS;
    for (const def of this.level.lights) {
      if (def.flicker) continue; // Static glow beside a flickering fixture would give the effect away.
      const head = this.headPosition(def);
      const size = FLARE_SIZE[def.kind];
      scaleTranslate(push(flares, def.kind), size, size, size, head[0], head[1], head[2]);
      if (!def.downward || (def.kind !== 'sodium' && def.kind !== 'work')) continue;
      const floor = floorHeightAt(this.level.solids, head[0], head[2], head[1] - 0.5);
      const height = head[1] - floor;
      const radius = height * 0.55;
      scaleTranslate(push(cones, def.kind), radius, height, radius, head[0], floor, head[2]);
      if (paintPools) scaleTranslate(push(pools, def.kind), radius * 1.3, 1, radius * 1.3, head[0], floor + 0.04, head[2]);
    }

    this.emit(starGeo(), flares, 'flare', glow, (k) => FLARE_ALPHA[k]);
    this.emit(coneGeo(), cones, 'cone', haze, () => 0.04);
    this.emit(floorGeo(), pools, 'pool', glow, () => 0.2);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose(false, false);
    for (const material of this.materials) material.dispose(false, false);
    for (const texture of this.textures) texture.dispose();
    this.meshes.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }

  /** Lamp lights are authored on the pole axis, but the glowing lens sits out on the arm. */
  private headPosition(def: LightDef): P3 {
    const p = def.position;
    if (def.kind === 'sodium') {
      for (const prop of this.level.props) {
        if (prop.kind !== 'lampPost' || Math.hypot(prop.position.x - p.x, prop.position.z - p.z) > PROP_CATALOG.lampPost.size.x) continue;
        return [
          prop.position.x + Math.cos(prop.yaw) * LAMP_HEAD_X,
          prop.position.y + LAMP_HEAD_Y,
          prop.position.z - Math.sin(prop.yaw) * LAMP_HEAD_X,
        ];
      }
    }
    return [p.x, p.y, p.z];
  }

  private emit(geo: Geo, groups: Map<LightKind, number[]>, label: string, texture: Texture, alpha: (kind: LightKind) => number): void {
    if (groups.size === 0) return;
    const source = geo.toMesh(`fx.${label}`, this.scene);
    source.setEnabled(false);
    this.meshes.push(source);
    for (const [kind, matrices] of groups) {
      const mesh = new Mesh(`fx.${label}.${kind}`, this.scene);
      source.geometry?.applyToMesh(mesh);
      // Saturated orange at this low alpha grades to red in the dark, so haze uses a paler tint of the light.
      const color = label === 'cone' ? Color3.Lerp(LIGHT_COLORS[kind], Color3.White(), 0.3) : LIGHT_COLORS[kind];
      const material = createAdditiveMaterial(this.scene, `fx.${label}.${kind}`, color, texture, alpha(kind));
      if (label === 'pool') material.zOffset = -2;
      mesh.material = material;
      mesh.useVertexColors = false;
      mesh.isPickable = false;
      mesh.applyFog = false;
      mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
      freezeStatic(mesh);
      this.meshes.push(mesh);
      this.materials.push(material);
    }
  }
}
