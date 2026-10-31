// Milestone 0 smoke test: exercises every Babylon feature the game depends on, in the production bundle.
import {
  Engine, Scene, Vector3, Color3, Color4, FreeCamera, HemisphericLight, DirectionalLight, ShadowGenerator,
  MeshBuilder, PBRMaterial, DynamicTexture, ParticleSystem, DefaultRenderingPipeline, SSAO2RenderingPipeline,
  HavokPlugin, PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsCharacterController, CharacterSupportedState,
  PhysicsRaycastResult, Quaternion, Matrix, Texture, TransformNode,
} from './engine/bjs';
import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const engine = new Engine(canvas, true, { stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.07, 0.09, 1);

  const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
  const plugin = new HavokPlugin(true, havok);
  const enabled = scene.enablePhysics(new Vector3(0, -9.81, 0), plugin);

  const camera = new FreeCamera('cam', new Vector3(0, 3, -9), scene);
  camera.setTarget(Vector3.Zero());
  new HemisphericLight('hemi', Vector3.Up(), scene).intensity = 0.4;
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.4), scene);
  sun.position = new Vector3(10, 20, -10);
  const shadows = new ShadowGenerator(1024, sun);

  const tex = new DynamicTexture('t', 256, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = '#556';
  ctx.fillRect(0, 0, 256, 256);
  tex.update();
  const pbr = new PBRMaterial('pbr', scene);
  pbr.albedoTexture = tex;
  pbr.metallic = 0.2;
  pbr.roughness = 0.7;

  const ground = MeshBuilder.CreateBox('ground', { width: 30, height: 1, depth: 30 }, scene);
  ground.position.y = -0.5;
  ground.material = pbr;
  ground.receiveShadows = true;
  const groundBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  groundBody.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(30, 1, 30), scene);

  const box = MeshBuilder.CreateBox('box', { size: 1 }, scene);
  box.position.set(1.5, 0.5, 0);
  box.material = pbr;
  box.thinInstanceAdd(Matrix.Translation(0, 0, 0));
  box.thinInstanceAdd(Matrix.Translation(-3, 0, 1));
  shadows.addShadowCaster(box);
  const wall = new TransformNode('wall', scene);
  wall.position.set(1.5, 0.5, 0);
  const wallBody = new PhysicsBody(wall, PhysicsMotionType.STATIC, false, scene);
  wallBody.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(1, 1, 1), scene);

  const character = new PhysicsCharacterController(new Vector3(-3, 1.5, 0), { capsuleHeight: 1.8, capsuleRadius: 0.35 }, scene);
  const gravity = new Vector3(0, -18, 0);
  const down = new Vector3(0, -1, 0);
  let lastSupport = CharacterSupportedState.UNSUPPORTED;
  scene.onAfterPhysicsObservable.add(() => {
    const dt = Math.max(scene.getEngine().getDeltaTime() / 1000, 1 / 240);
    const support = character.checkSupport(dt, down);
    lastSupport = support.supportedState;
    const v = character.getVelocity();
    const desired = new Vector3(2, lastSupport === CharacterSupportedState.SUPPORTED ? 0 : v.y + gravity.y * dt, 0);
    character.setVelocity(desired);
    character.integrate(dt, support, gravity);
  });

  const particleTex = new DynamicTexture('p', 32, scene, false);
  const pctx = particleTex.getContext();
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, 32, 32);
  particleTex.update();
  const ps = new ParticleSystem('dust', 200, scene);
  ps.particleTexture = particleTex as unknown as Texture;
  ps.emitter = new Vector3(0, 2, 0);
  ps.color1 = new Color4(1, 1, 1, 0.3);
  ps.start();

  const pipeline = new DefaultRenderingPipeline('post', true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.fxaaEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  const ssao = new SSAO2RenderingPipeline('ssao', scene, 0.5, [camera]);
  ssao.totalStrength = 1;
  scene.ambientColor = new Color3(0.1, 0.1, 0.1);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  const ray = new PhysicsRaycastResult();
  (window as unknown as Record<string, unknown>).__smoke = () => {
    plugin.raycast(new Vector3(0, 0.5, -5), new Vector3(1.5, 0.5, 5), ray);
    return {
      enabled,
      webgl: engine.webGLVersion,
      charPos: character.getPosition().asArray(),
      support: lastSupport,
      rayHit: ray.hasHit,
      rayPoint: ray.hitPointWorld.asArray(),
      fps: engine.getFps(),
      ssaoSupported: SSAO2RenderingPipeline.IsSupported,
    };
  };
}

void boot();
