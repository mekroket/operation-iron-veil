/** Sliding door panels: reinforced slab with stiles and a pull handle, eased between closed and open. */
import type { Mesh, Scene } from '../../engine/bjs';
import type { DoorDef } from '../types';
import { Geo, scaled, WHITE } from './Geo';
import type { MaterialLibrary } from './materialLibrary';

const SLIDE_SECONDS = 1.1;

interface DoorState {
  def: DoorDef;
  panel: Mesh;
  /** 0 closed, 1 open. */
  t: number;
  target: number;
}

export class DoorVisuals {
  readonly meshes: Mesh[] = [];
  readonly shadowCasters: Mesh[] = [];
  private readonly doors = new Map<string, DoorState>();

  constructor(
    private readonly scene: Scene,
    private readonly library: MaterialLibrary,
  ) {}

  build(defs: readonly DoorDef[]): void {
    for (const def of defs) {
      const panel = this.buildPanel(def);
      const state: DoorState = { def, panel, t: def.startsOpen ? 1 : 0, target: def.startsOpen ? 1 : 0 };
      this.doors.set(def.id, state);
      this.place(state);
    }
  }

  setOpen(id: string, open: boolean, instant: boolean): void {
    const state = this.doors.get(id);
    if (!state) return;
    state.target = open ? 1 : 0;
    if (instant) {
      state.t = state.target;
      this.place(state);
    }
  }

  update(dt: number): void {
    for (const state of this.doors.values()) {
      if (state.t === state.target) continue;
      const step = dt / SLIDE_SECONDS;
      state.t = state.t < state.target ? Math.min(state.target, state.t + step) : Math.max(state.target, state.t - step);
      this.place(state);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose(false, false);
    this.meshes.length = 0;
    this.shadowCasters.length = 0;
    this.doors.clear();
  }

  private place(state: DoorState): void {
    const e = state.t * state.t * (3 - 2 * state.t);
    const { center, openOffset } = state.def;
    state.panel.position.set(center.x + openOffset.x * e, center.y + openOffset.y * e, center.z + openOffset.z * e);
  }

  private buildPanel(def: DoorDef): Mesh {
    const { x: sx, y: sy, z: sz } = def.size;
    const thinX = sx < sz;
    const thickness = thinX ? sx : sz;
    const width = thinX ? sz : sx;

    /** Box in door axes: `along` runs across the opening, `out` through the slab. */
    const part = (g: Geo, along: number, y: number, out: number, w: number, h: number, t: number, color = WHITE): void => {
      if (thinX) g.box(out, y, along, t, h, w, { color });
      else g.box(along, y, out, w, h, t, { color });
    };

    const g = new Geo();
    part(g, 0, 0, 0, width, sy, thickness * 0.72);
    const rib = scaled(WHITE, 0.84);
    for (const y of [-sy * 0.42, -sy * 0.14, sy * 0.14, sy * 0.42]) part(g, 0, y, 0, width, 0.09, thickness, rib);
    for (const s of [-1, 1]) part(g, s * (width / 2 - 0.05), 0, 0, 0.1, sy, thickness, rib);
    g.bakeContact(-sy / 2, -sy / 2 + 0.9, 0.62);

    const panel = g.toMesh(`door.${def.id}`, this.scene);
    panel.material = this.library.get(def.material);
    panel.receiveShadows = true;
    panel.isPickable = false;
    this.meshes.push(panel);
    this.shadowCasters.push(panel);

    const h = new Geo();
    for (const s of [-1, 1]) {
      const out = s * (thickness / 2 + 0.02);
      part(h, width * 0.34, -sy * 0.02, out, 0.03, 0.32, 0.03);
      part(h, width * 0.34, sy * 0.1, out * 0.75, 0.03, 0.03, Math.abs(out) * 0.5);
      part(h, width * 0.34, -sy * 0.14, out * 0.75, 0.03, 0.03, Math.abs(out) * 0.5);
    }
    const handle = h.toMesh(`door.${def.id}.handle`, this.scene);
    handle.material = this.library.get('metalBare');
    handle.isPickable = false;
    handle.parent = panel;
    this.meshes.push(handle);
    return panel;
  }
}
