/**
 * Builds each prop variant once, then draws every placement with thin instances, split per spatial cell.
 * A thin-instance mesh spanning the whole level would have to share one light list; per-cell meshes each get their own.
 */
import { Mesh } from '../../engine/bjs';
import type { Scene } from '../../engine/bjs';
import { PROP_CATALOG } from '../propCatalog';
import type { PropKind, PropSpec } from '../propCatalog';
import type { PropPlacement } from '../types';
import { freezeStatic, shareGeometry } from './Geo';
import type { MaterialLibrary, SurfaceKey } from './materialLibrary';
import { NON_CASTING } from './materialLibrary';
import { PROP_BUILDERS } from './props';
import { PropBuild } from './props/propTypes';

/** Wider than the terrain cells: each prop kind is its own draw call per cell, and props are the bulk of the draw count. */
const PROP_CELL_SIZE = 56;

interface ModelPart {
  surface: SurfaceKey;
  source: Mesh;
}

interface CellGroup {
  kind: PropKind;
  variant: number;
  name: string;
  /** World matrices in Babylon's array layout, 16 numbers per placement. */
  matrices: number[];
}

export class PropInstancer {
  readonly meshes: Mesh[] = [];
  readonly shadowCasters: Mesh[] = [];
  private readonly models = new Map<string, ModelPart[]>();

  constructor(
    private readonly scene: Scene,
    private readonly library: MaterialLibrary,
  ) {}

  async build(props: readonly PropPlacement[], onProgress: (fraction: number, label: string) => void): Promise<void> {
    const groups = new Map<string, CellGroup>();
    for (const prop of props) {
      const spec: PropSpec = PROP_CATALOG[prop.kind];
      const variant = Math.abs(Math.floor(prop.variant ?? 0)) % (spec.variants ?? 1);
      const cellX = Math.floor(prop.position.x / PROP_CELL_SIZE);
      const cellZ = Math.floor(prop.position.z / PROP_CELL_SIZE);
      const name = `${prop.kind}.${variant}.${cellX}.${cellZ}`;
      let group = groups.get(name);
      if (!group) {
        group = { kind: prop.kind, variant, name, matrices: [] };
        groups.set(name, group);
      }
      // Babylon's RotationY layout: +Z turns towards +X with positive yaw, matching the level convention.
      const c = Math.cos(prop.yaw);
      const s = Math.sin(prop.yaw);
      group.matrices.push(c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, prop.position.x, prop.position.y, prop.position.z, 1);
    }

    let done = 0;
    for (const group of groups.values()) {
      onProgress(done / groups.size, `Placing ${group.kind}`);
      // Yielding on each new model only: instancing an already-built one costs next to nothing.
      if (!this.models.has(`${group.kind}.${group.variant}`)) await new Promise((r) => setTimeout(r));
      this.instantiate(group);
      done++;
    }
    onProgress(1, 'Props placed');
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose(false, false);
    for (const parts of this.models.values()) {
      for (const part of parts) part.source.dispose(false, false);
    }
    this.meshes.length = 0;
    this.shadowCasters.length = 0;
    this.models.clear();
  }

  private instantiate(group: CellGroup): void {
    const parts = this.model(group.kind, group.variant);
    const spec: PropSpec = PROP_CATALOG[group.kind];
    const data = new Float32Array(group.matrices);
    for (const part of parts) {
      const mesh = shareGeometry(part.source, `prop.${group.name}.${part.surface}`, this.scene);
      mesh.material = this.library.get(part.surface);
      mesh.receiveShadows = true;
      mesh.thinInstanceSetBuffer('matrix', data, 16, true);
      freezeStatic(mesh);
      this.meshes.push(mesh);
      if (spec.castShadow === true && !NON_CASTING.has(part.surface)) this.shadowCasters.push(mesh);
    }
  }

  private model(kind: PropKind, variant: number): ModelPart[] {
    const key = `${kind}.${variant}`;
    const cached = this.models.get(key);
    if (cached) return cached;
    const build = new PropBuild();
    PROP_BUILDERS[kind](build, variant);
    const parts: ModelPart[] = [];
    for (const [surface, geo] of build.parts) {
      if (geo.isEmpty) continue;
      const source = geo.toMesh(`propSource.${key}.${surface}`, this.scene);
      source.isPickable = false;
      source.setEnabled(false);
      parts.push({ surface, source });
    }
    this.models.set(key, parts);
    return parts;
  }
}
