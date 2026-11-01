/**
 * Turns a LevelDefinition into everything visible: materials, batched solids, instanced props, lights and the gameplay
 * visuals behind ILevelVisuals. Babylon's lights and shadows reach the rest of the game only through this class.
 */
import type { AbstractMesh, Mesh, Scene } from '../../engine/bjs';
import type { ILevelVisuals } from '../../core/contracts';
import type { ResolvedGraphics } from '../../settings/settings';
import type { LevelDefinition, PropPlacement } from '../types';
import { DoorVisuals } from './DoorVisuals';
import { GeometryBatcher } from './GeometryBatcher';
import { LightFx } from './LightFx';
import { LightRig } from './LightRig';
import { MaterialLibrary } from './materialLibrary';
import { BlastVisuals, ObjectiveVisuals } from './MissionVisuals';
import { PickupVisuals } from './PickupVisuals';
import { PropInstancer } from './PropInstancer';

/** A terminal prop this close to the objective is treated as the objective's terminal. */
const TERMINAL_MATCH_RADIUS = 1;

const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r));

export class LevelRenderer implements ILevelVisuals {
  private readonly library: MaterialLibrary;
  private readonly batcher: GeometryBatcher;
  private readonly props: PropInstancer;
  private readonly fx: LightFx;
  private readonly doors: DoorVisuals;
  private readonly pickups: PickupVisuals;
  private readonly objective: ObjectiveVisuals;
  private readonly blast: BlastVisuals;
  private rig: LightRig | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly level: LevelDefinition,
    private readonly gfx: ResolvedGraphics,
  ) {
    this.library = new MaterialLibrary(scene, gfx);
    this.batcher = new GeometryBatcher(scene, this.library);
    this.props = new PropInstancer(scene, this.library);
    this.fx = new LightFx(scene, level, gfx);
    this.doors = new DoorVisuals(scene, this.library);
    this.pickups = new PickupVisuals(scene, this.library, gfx);
    this.objective = new ObjectiveVisuals(scene, this.library);
    this.blast = new BlastVisuals(scene, this.library, gfx);
  }

  async build(onProgress: (fraction: number, label: string) => void): Promise<void> {
    await this.library.buildAll((f, label) => onProgress(f * 0.6, label));

    onProgress(0.6, 'Merging level geometry');
    await nextTask();
    this.batcher.build(this.level.solids);

    const { placements, terminal } = this.resolveTerminal();
    onProgress(0.68, 'Placing props');
    await this.props.build(placements, (f, label) => onProgress(0.68 + f * 0.18, label));

    onProgress(0.86, 'Building doors and pickups');
    await nextTask();
    this.doors.build(this.level.doors);
    this.pickups.build(this.level.pickups);
    this.objective.build(terminal.position.x, terminal.position.y, terminal.position.z, terminal.yaw);
    this.blast.build(this.level);

    onProgress(0.93, 'Rigging lights');
    await nextTask();
    this.fx.build();
    const rig = new LightRig(this.scene, this.level.lights, this.gfx);
    const lit: Mesh[] = [...this.batcher.meshes, ...this.props.meshes, ...this.doors.meshes, ...this.pickups.litMeshes, ...this.blast.meshes];
    rig.assign(lit);
    this.rig = rig;
    this.blast.precompile();

    onProgress(1, 'Level ready');
    await nextTask();
  }

  update(dt: number): void {
    this.rig?.update(dt);
    this.library.update(dt);
    this.doors.update(dt);
    this.pickups.update(dt);
    this.objective.update(dt);
    this.blast.update(dt);
  }

  shadowCasters(): AbstractMesh[] {
    return [...this.batcher.shadowCasters, ...this.props.shadowCasters, ...this.doors.shadowCasters];
  }

  /**
   * Level lights only reach meshes assigned to them, so anything moving (enemies, for example) must register here to
   * be lit by sodium and interior fixtures. Otherwise it receives just the sun and the sky.
   */
  addDynamicMesh(mesh: AbstractMesh): void {
    this.rig?.track(mesh);
  }

  removeDynamicMesh(mesh: AbstractMesh): void {
    this.rig?.untrack(mesh);
  }

  setPickupVisible(id: string, visible: boolean): void {
    this.pickups.setVisible(id, visible);
  }

  setDoorOpen(id: string, open: boolean, instant = false): void {
    this.doors.setOpen(id, open, instant);
  }

  setObjectiveState(state: 'locked' | 'active' | 'working' | 'done'): void {
    this.objective.setState(state);
  }

  setBlastDamage(active: boolean): void {
    this.blast.setActive(active);
  }

  dispose(): void {
    this.rig?.dispose();
    this.rig = null;
    this.blast.dispose();
    this.objective.dispose();
    this.pickups.dispose();
    this.doors.dispose();
    this.fx.dispose();
    this.props.dispose();
    this.batcher.dispose();
    this.library.dispose();
  }

  /** Finds the objective's terminal prop, or adds one, so the state screen always sits on real geometry. */
  private resolveTerminal(): { placements: readonly PropPlacement[]; terminal: PropPlacement } {
    const { position, yaw } = this.level.objective;
    const existing = this.level.props.find(
      (p) => p.kind === 'dataTerminal' && Math.hypot(p.position.x - position.x, p.position.z - position.z) <= TERMINAL_MATCH_RADIUS,
    );
    if (existing) return { placements: this.level.props, terminal: existing };
    const terminal: PropPlacement = { kind: 'dataTerminal', position, yaw };
    return { placements: [...this.level.props, terminal], terminal };
  }
}
