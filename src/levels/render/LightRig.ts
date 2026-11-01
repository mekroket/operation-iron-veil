/**
 * One Babylon light per LightDef, each restricted to nearby meshes through includedOnlyMeshes, so no mesh exceeds
 * gfx.maxLights - 2. The sun and the sky take the two reserved slots and affect everything.
 */
import { Color3, Light, PointLight, SpotLight, Vector3 } from '../../engine/bjs';
import type { AbstractMesh, Scene } from '../../engine/bjs';
import type { Vec3 } from '../../core/types';
import type { ResolvedGraphics } from '../../settings/settings';
import type { LightDef, LightKind } from '../types';

export const LIGHT_COLORS: Record<LightKind, Color3> = {
  sodium: new Color3(1, 0.46, 0.13),
  fluorescent: new Color3(0.76, 0.89, 1),
  warning: new Color3(1, 0.6, 0.1),
  emergency: new Color3(1, 0.07, 0.05),
  work: new Color3(1, 0.93, 0.8),
};

/**
 * Candela per square metre of range. Scaling with range squared keeps a light equally bright at the far end of its
 * reach, whether it is a 26 m street lamp or an 8 m office tube. LightDef.intensity multiplies the result.
 */
const CANDELA_PER_RANGE2: Record<LightKind, number> = {
  sodium: 0.75,
  fluorescent: 0.6,
  warning: 0.22,
  emergency: 0.25,
  work: 0.45,
};

const CONE_ANGLE: Record<LightKind, number> = {
  sodium: 2.3,
  fluorescent: 2.6,
  warning: 2.2,
  emergency: 2.2,
  work: 2.0,
};

/** Indoor fixtures compete for slots with street lamps that are much further away but also in range of a cell. */
const INDOOR_BONUS: Record<LightKind, number> = {
  sodium: 0,
  fluorescent: 0.25,
  warning: 0.1,
  emergency: 0.25,
  work: 0.1,
};

const TRACK_INTERVAL = 0.5;

interface RigLight {
  def: LightDef;
  light: Light;
  base: number;
  /** Horizontal limit of what a downward cone can reach, given the height of the thing being lit. */
  tanHalf: number;
  phase: number;
  clock: number;
  dropout: number;
  meshes: AbstractMesh[];
}

interface Tracked {
  mesh: AbstractMesh;
  lights: RigLight[];
  anchor?: () => Vec3;
}

export class LightRig {
  private readonly lights: RigLight[] = [];
  private readonly flickering: RigLight[] = [];
  private readonly tracked: Tracked[] = [];
  private readonly slots: number;
  private trackClock = 0;

  constructor(scene: Scene, defs: readonly LightDef[], gfx: ResolvedGraphics) {
    this.slots = Math.max(0, gfx.maxLights - 2);
    defs.forEach((def, i) => {
      const position = new Vector3(def.position.x, def.position.y, def.position.z);
      const name = `level.${def.kind}.${i}`;
      const angle = CONE_ANGLE[def.kind];
      let light: Light;
      if (def.downward) {
        const spot = new SpotLight(name, position, Vector3.Down(), angle, 1, scene);
        spot.innerAngle = angle * 0.5;
        light = spot;
      } else {
        light = new PointLight(name, position, scene);
      }
      const base = CANDELA_PER_RANGE2[def.kind] * def.range * def.range * (def.intensity ?? 1);
      light.diffuse = LIGHT_COLORS[def.kind].clone();
      light.specular = LIGHT_COLORS[def.kind].clone();
      light.intensity = base;
      light.range = def.range;
      // The physical default ignores range; this one fades to zero at it, so a light can stop at a cell boundary unseen.
      light.falloffType = Light.FALLOFF_GLTF;
      const rig: RigLight = {
        def,
        light,
        base,
        tanHalf: Math.tan(angle / 2),
        phase: i * 1.73,
        clock: 0,
        dropout: 0,
        meshes: [],
      };
      this.lights.push(rig);
      if (def.flicker) this.flickering.push(rig);
    });
  }

  /** Static mesh assignment. Call once after every static mesh exists, with their bounds final. */
  assign(meshes: readonly AbstractMesh[]): void {
    for (const mesh of meshes) {
      for (const rig of this.pick(mesh)) rig.meshes.push(mesh);
    }
    for (const rig of this.lights) {
      // An empty includedOnlyMeshes means "everything" to Babylon, so an unused light must be switched off instead.
      if (rig.meshes.length === 0) rig.light.setEnabled(false);
      else rig.light.includedOnlyMeshes = rig.meshes;
    }
  }

  /**
   * Keeps a moving mesh lit by whichever lights are closest to it. Re-evaluated a couple of times per second.
   * `anchor` replaces the mesh's own bounds, for source meshes of instances, whose transform means nothing.
   */
  track(mesh: AbstractMesh, anchor?: () => Vec3): void {
    const entry: Tracked = { mesh, lights: [], anchor };
    this.tracked.push(entry);
    this.refresh(entry);
  }

  untrack(mesh: AbstractMesh): void {
    const index = this.tracked.findIndex((t) => t.mesh === mesh);
    if (index < 0) return;
    this.apply(this.tracked[index], []);
    this.tracked.splice(index, 1);
  }

  update(dt: number): void {
    for (const rig of this.flickering) {
      rig.clock += dt;
      if (rig.dropout > 0) {
        rig.dropout -= dt;
        rig.light.intensity = rig.base * 0.1;
        continue;
      }
      if (Math.random() < dt * 0.7) rig.dropout = 0.04 + Math.random() * 0.22;
      const t = rig.clock;
      rig.light.intensity = rig.base * (0.86 + 0.14 * Math.sin(t * 37 + rig.phase) * Math.sin(t * 11.3 + rig.phase * 2));
    }

    if (this.tracked.length === 0) return;
    this.trackClock += dt;
    if (this.trackClock < TRACK_INTERVAL) return;
    this.trackClock = 0;
    for (const entry of this.tracked) this.refresh(entry);
  }

  dispose(): void {
    for (const rig of this.lights) rig.light.dispose();
    this.lights.length = 0;
    this.flickering.length = 0;
    this.tracked.length = 0;
  }

  private refresh(entry: Tracked): void {
    const next = this.pick(entry.mesh, entry.anchor?.());
    if (next.length === entry.lights.length && next.every((rig) => entry.lights.includes(rig))) return;
    this.apply(entry, next);
  }

  /** includedOnlyMeshes is a hooked array: push and splice resync the light for us. */
  private apply(entry: Tracked, next: RigLight[]): void {
    for (const rig of entry.lights) {
      if (next.includes(rig)) continue;
      const index = rig.meshes.indexOf(entry.mesh);
      if (index >= 0) rig.meshes.splice(index, 1);
      // Emptied array would mean "all meshes".
      if (rig.meshes.length === 0) rig.light.setEnabled(false);
    }
    for (const rig of next) {
      if (entry.lights.includes(rig)) continue;
      const wasEmpty = rig.meshes.length === 0;
      rig.meshes.push(entry.mesh);
      if (wasEmpty) {
        rig.light.includedOnlyMeshes = rig.meshes;
        rig.light.setEnabled(true);
      }
    }
    entry.lights = next;
  }

  /** The most relevant lights for this mesh's bounds, at most `slots` of them. */
  private pick(mesh: AbstractMesh, anchor?: Vec3): RigLight[] {
    if (this.slots === 0) return [];
    let min: Vec3;
    let max: Vec3;
    if (anchor) {
      min = anchor;
      max = anchor;
    } else {
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = box.minimumWorld;
      max = box.maximumWorld;
    }
    const scored: { rig: RigLight; score: number }[] = [];
    for (const rig of this.lights) {
      const p = rig.def.position;
      const dx = Math.max(min.x - p.x, 0, p.x - max.x);
      const dy = Math.max(min.y - p.y, 0, p.y - max.y);
      const dz = Math.max(min.z - p.z, 0, p.z - max.z);
      const d = Math.hypot(dx, dy, dz);
      if (d >= rig.def.range) continue;
      if (rig.def.downward) {
        if (min.y > p.y) continue; // Wholly above the fixture.
        const footprint = rig.tanHalf * Math.max(0.5, p.y - min.y) + 2;
        if (Math.hypot(dx, dz) > footprint) continue;
      }
      const toCentre = Math.hypot((min.x + max.x) / 2 - p.x, (min.y + max.y) / 2 - p.y, (min.z + max.z) / 2 - p.z);
      const span = rig.def.range + Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
      const score = 1 - d / rig.def.range + 0.35 * (1 - Math.min(1, toCentre / span)) + INDOOR_BONUS[rig.def.kind];
      scored.push({ rig, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.slots).map((s) => s.rig);
  }
}
