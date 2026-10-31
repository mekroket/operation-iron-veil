// Milestone 0 smoke test: proves Babylon + Havok boot in the cloud build and in StackBlitz.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Color4 } from '@babylonjs/core/Maths/math';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.07, 0.09, 1);

  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok));

  const camera = new FreeCamera('cam', new Vector3(0, 3, -8), scene);
  camera.setTarget(Vector3.Zero());
  new HemisphericLight('hemi', Vector3.Up(), scene);

  const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  const box = MeshBuilder.CreateBox('box', { size: 1 }, scene);
  box.position.y = 5;
  new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 1 }, scene);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  (window as unknown as Record<string, unknown>).__smoke = () => ({
    webgl: engine.webGLVersion,
    boxY: box.position.y,
    fps: engine.getFps(),
  });
}

void boot();
