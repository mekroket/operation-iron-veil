import type { IDoorBlocker } from '../core/contracts';
import { Color4, FreeCamera, Scene, Vector3 } from '../engine/bjs';
import type { Engine } from '../engine/bjs';
import { collectColliders } from '../levels/levelGeometry';
import { LevelRenderer } from '../levels/render/LevelRenderer';
import { SILENT_BREAKWATER } from '../levels/silentBreakwater';
import type { DoorDef, LevelDefinition } from '../levels/types';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { GraphicsManager } from '../scene/GraphicsManager';
import { createEngine } from '../scene/rendererBootstrap';
import { SceneEnvironment } from '../scene/SceneEnvironment';
import { resolveGraphics } from '../settings/settings';
import type { SettingsStore } from '../settings/settings';

/**
 * Everything that survives between mission attempts: renderer, static level, physics, lighting.
 * The main menu renders this same world behind the UI.
 */
export class GameWorld {
  private readonly doorBlockers = new Map<string, IDoorBlocker>();

  private constructor(
    readonly engine: Engine,
    readonly backend: 'webgl2' | 'webgpu',
    readonly scene: Scene,
    readonly camera: FreeCamera,
    readonly physics: PhysicsWorld,
    readonly level: LevelDefinition,
    readonly visuals: LevelRenderer,
    readonly environment: SceneEnvironment,
    readonly graphics: GraphicsManager,
  ) {}

  static async create(
    canvas: HTMLCanvasElement,
    settings: SettingsStore,
    onProgress: (fraction: number, label: string) => void,
  ): Promise<GameWorld> {
    onProgress(0.02, 'Starting renderer');
    const { engine, backend } = await createEngine(canvas);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.03, 0.04, 0.06, 1);
    scene.skipPointerMovePicking = true;
    scene.autoClear = true;
    scene.autoClearDepthAndStencil = true;

    const level = SILENT_BREAKWATER;
    const camera = new FreeCamera('main-camera', new Vector3(0, 10, 0), scene);
    camera.minZ = 0.05;
    camera.maxZ = 1800;
    camera.inputs.clear();

    onProgress(0.08, 'Starting physics');
    const physics = await PhysicsWorld.create(scene);
    physics.buildStatic(collectColliders(level));

    const gfx = resolveGraphics(settings.get().graphics);
    onProgress(0.14, 'Building sky and sea');
    const environment = new SceneEnvironment(scene, level, gfx);
    environment.build();

    const visuals = new LevelRenderer(scene, level, gfx);
    await visuals.build((fraction, label) => onProgress(0.16 + fraction * 0.7, label));
    environment.addShadowCasters(visuals.shadowCasters());

    onProgress(0.88, 'Configuring post-processing');
    const graphics = new GraphicsManager(engine, scene, camera, settings);
    settings.subscribe((next) => environment.setGraphics(resolveGraphics(next.graphics)));

    onProgress(0.92, 'Compiling shaders');
    await scene.whenReadyAsync();
    return new GameWorld(engine, backend, scene, camera, physics, level, visuals, environment, graphics);
  }

  /** Door collision persists across attempts, so sessions must reuse it instead of creating more. */
  doorBlocker(door: DoorDef): IDoorBlocker {
    let blocker = this.doorBlockers.get(door.id);
    if (!blocker) {
      blocker = this.physics.createDoorBlocker(door.center, door.size);
      this.doorBlockers.set(door.id, blocker);
    }
    return blocker;
  }

  /** Per-frame world upkeep that runs in the menu and in missions alike. */
  update(dt: number): void {
    this.visuals.update(dt);
    this.environment.update(dt, this.camera.position);
    this.graphics.update(dt);
  }
}
