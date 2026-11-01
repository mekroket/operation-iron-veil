/** Ammo and medkit models with a slow glow, so they read from across a dark yard. */
import { Color3, Mesh } from '../../engine/bjs';
import type { Scene, StandardMaterial, Texture } from '../../engine/bjs';
import type { ResolvedGraphics } from '../../settings/settings';
import type { PickupDef } from '../types';
import { Geo, freezeStatic, hex, shareGeometry } from './Geo';
import { createAdditiveMaterial, createGlowTexture, starGeo } from './LightFx';
import type { MaterialLibrary, SurfaceKey } from './materialLibrary';
import { hash2 } from './noise';
import { PropBuild, plate } from './props/propTypes';

type PickupKind = PickupDef['kind'];

const GLOW: Record<PickupKind, Color3> = {
  ammo: new Color3(1, 0.72, 0.28),
  medkit: new Color3(0.35, 1, 0.55),
};
const GLOW_SIZE = 1.15;
const GLOW_HEIGHT = 0.2;

function buildAmmo(b: PropBuild): void {
  const olive = hex(0x47502f);
  const g = b.geo('paintWorn').tint(olive);
  g.box(0, 0.13, 0, 0.5, 0.26, 0.28);
  g.box(0, 0.28, 0, 0.52, 0.04, 0.3, { color: hex(0x3a4226) });
  const steel = b.geo('steelDark');
  steel.box(-0.19, 0.17, 0.145, 0.05, 0.13, 0.012);
  steel.box(0.19, 0.17, 0.145, 0.05, 0.13, 0.012);
  steel.box(0, 0.315, 0, 0.16, 0.02, 0.03);
  plate(b, 'ammo', [0, 0.12, 0.142], 'z+', 0.3, 0.15);
  plate(b, 'ammo', [0, 0.12, -0.142], 'z-', 0.3, 0.15);
}

function buildMedkit(b: PropBuild): void {
  const g = b.geo('paintWorn').tint(hex(0xc8c6ba));
  g.box(0, 0.1, 0, 0.44, 0.2, 0.28);
  g.box(0, 0.102, 0, 0.452, 0.012, 0.292, { color: hex(0x7c7a70) });
  const red = hex(0xa81a14);
  g.box(0, 0.203, 0, 0.17, 0.006, 0.05, { color: red });
  g.box(0, 0.203, 0, 0.05, 0.006, 0.17, { color: red });
  g.box(0, 0.1, 0.142, 0.13, 0.04, 0.004, { color: red });
  g.box(0, 0.1, 0.142, 0.04, 0.13, 0.004, { color: red });
  const steel = b.geo('steelDark');
  steel.box(0, 0.215, -0.12, 0.14, 0.02, 0.025);
  steel.box(-0.14, 0.13, 0.145, 0.03, 0.05, 0.01);
  steel.box(0.14, 0.13, 0.145, 0.03, 0.05, 0.01);
}

interface PickupParts {
  kind: PickupKind;
  meshes: Mesh[];
}

export class PickupVisuals {
  /** Solid parts, for light assignment. Glows are self-lit and do not need it. */
  readonly litMeshes: Mesh[] = [];
  private readonly sources: Mesh[] = [];
  private readonly pickups = new Map<string, PickupParts>();
  private readonly glowMaterials = new Map<PickupKind, StandardMaterial>();
  private glowTexture: Texture | null = null;
  private clock = 0;

  constructor(
    private readonly scene: Scene,
    private readonly library: MaterialLibrary,
    private readonly gfx: ResolvedGraphics,
  ) {}

  build(defs: readonly PickupDef[]): void {
    if (defs.length === 0) return;
    const models = new Map<PickupKind, { surface: SurfaceKey; source: Mesh }[]>();
    for (const kind of ['ammo', 'medkit'] as const) {
      const b = new PropBuild();
      if (kind === 'ammo') buildAmmo(b);
      else buildMedkit(b);
      const parts: { surface: SurfaceKey; source: Mesh }[] = [];
      for (const [surface, geo] of b.parts) {
        geo.bakeContact(0, 0.12, 0.7);
        const source = geo.toMesh(`pickupSource.${kind}.${surface}`, this.scene);
        source.setEnabled(false);
        this.sources.push(source);
        parts.push({ surface, source });
      }
      models.set(kind, parts);
    }

    this.glowTexture = createGlowTexture(this.scene, this.gfx);
    const glowSource: Geo = starGeo();
    const star = glowSource.toMesh('pickupSource.glow', this.scene);
    star.setEnabled(false);
    this.sources.push(star);

    for (const def of defs) {
      const yaw = hash2(def.id.length, def.id.charCodeAt(def.id.length - 1) || 0) * Math.PI * 2;
      const meshes: Mesh[] = [];
      for (const part of models.get(def.kind) ?? []) {
        const mesh = shareGeometry(part.source, `pickup.${def.id}.${part.surface}`, this.scene);
        mesh.material = this.library.get(part.surface);
        mesh.receiveShadows = true;
        mesh.position.set(def.position.x, def.position.y, def.position.z);
        mesh.rotation.y = yaw;
        freezeStatic(mesh);
        meshes.push(mesh);
        this.litMeshes.push(mesh);
      }
      const glow = shareGeometry(star, `pickup.${def.id}.glow`, this.scene);
      glow.material = this.glowMaterial(def.kind);
      glow.useVertexColors = false;
      glow.applyFog = false;
      glow.position.set(def.position.x, def.position.y + GLOW_HEIGHT, def.position.z);
      glow.scaling.setAll(GLOW_SIZE);
      freezeStatic(glow);
      meshes.push(glow);
      this.pickups.set(def.id, { kind: def.kind, meshes });
    }
  }

  setVisible(id: string, visible: boolean): void {
    const pickup = this.pickups.get(id);
    if (!pickup) return;
    for (const mesh of pickup.meshes) mesh.setEnabled(visible);
  }

  update(dt: number): void {
    this.clock += dt;
    const pulse = 0.16 + 0.12 * (0.5 + 0.5 * Math.sin(this.clock * 2.4));
    for (const material of this.glowMaterials.values()) material.alpha = pulse;
  }

  dispose(): void {
    for (const pickup of this.pickups.values()) {
      for (const mesh of pickup.meshes) mesh.dispose(false, false);
    }
    for (const source of this.sources) source.dispose(false, false);
    for (const material of this.glowMaterials.values()) material.dispose(false, false);
    this.glowTexture?.dispose();
    this.pickups.clear();
    this.glowMaterials.clear();
    this.litMeshes.length = 0;
    this.sources.length = 0;
  }

  private glowMaterial(kind: PickupKind): StandardMaterial {
    let material = this.glowMaterials.get(kind);
    if (!material && this.glowTexture) {
      material = createAdditiveMaterial(this.scene, `pickup.glow.${kind}`, GLOW[kind], this.glowTexture, 0.2);
      this.glowMaterials.set(kind, material);
    }
    return material as StandardMaterial;
  }
}
