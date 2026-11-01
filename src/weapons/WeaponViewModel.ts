/** First-person gun and arms: Babylon meshes built from the pure geometry in gunModels.ts. */
import { Color3, Mesh, PBRMaterial, StandardMaterial, TransformNode, VertexData } from '../engine/bjs';
import type { AbstractMesh, FreeCamera, Material, Scene, Vector3 } from '../engine/bjs';
import type { Vec3 } from '../core/types';
import type { GeometryBatch } from './gunGeometry';
import { buildGunGeometry } from './gunModels';
import type { WeaponConfig } from './weaponConfigs';

/** Draws after the world, with the depth buffer cleared, so the gun never clips into walls. */
export const VIEW_MODEL_RENDERING_GROUP = 1;

/** Shared by all three guns. Colour comes from vertex tints, so each material is one shader and one bind. */
export class ViewModelMaterials {
  readonly steel: PBRMaterial;
  readonly polymer: PBRMaterial;
  readonly fabric: PBRMaterial;
  readonly glow: StandardMaterial;

  constructor(scene: Scene) {
    this.steel = createPbr('vmSteel', scene, 0.72, 0.42);
    this.polymer = createPbr('vmPolymer', scene, 0, 0.58);
    this.fabric = createPbr('vmFabric', scene, 0, 0.88);

    this.glow = new StandardMaterial('vmGlow', scene);
    this.glow.diffuseColor = Color3.Black();
    this.glow.specularColor = Color3.Black();
    this.glow.emissiveColor = Color3.White();
    this.glow.disableLighting = true;
    this.glow.fogEnabled = false;
  }

  dispose(): void {
    this.steel.dispose();
    this.polymer.dispose();
    this.fabric.dispose();
    this.glow.dispose();
  }
}

function createPbr(name: string, scene: Scene, metallic: number, roughness: number): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = Color3.White();
  material.metallic = metallic;
  material.roughness = roughness;
  // A faint lift so the gun never reads as a black hole in a dark room.
  material.emissiveColor = new Color3(0.005, 0.005, 0.006);
  return material;
}

/** Turns a batch into one renderable mesh, or null when the batch is empty. */
function meshFromBatch(name: string, batch: GeometryBatch, material: Material, parent: TransformNode, scene: Scene): Mesh | null {
  if (batch.isEmpty) return null;
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = batch.positions;
  data.normals = batch.normals;
  data.colors = batch.colors;
  data.indices = batch.indices;
  data.applyToMesh(mesh);
  mesh.material = material;
  mesh.parent = parent;
  mesh.renderingGroupId = VIEW_MODEL_RENDERING_GROUP;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  // It is attached to the camera, so culling it would only ever waste time.
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

function requireMesh(mesh: Mesh | null, name: string): Mesh {
  if (!mesh) throw new Error(`Weapon view model part has no geometry: ${name}`);
  return mesh;
}

/** One gun with its arms. The animator moves `root`, `magazine`, `bolt` and `leftArm`. */
export class WeaponViewModel {
  readonly root: TransformNode;
  /** Separate so a reload can pull it out. Rests at local zero. */
  readonly magazine: Mesh;
  /** Slide or bolt. Rests at local zero and travels along -Z. */
  readonly bolt: Mesh;
  /** Separate so the support hand can leave the gun during a reload. Rests at local zero. */
  readonly leftArm: Mesh;
  /** Child of root, at the end of the barrel. */
  readonly muzzle: TransformNode;
  readonly leftHandToMag: Vec3;
  readonly magOut: Vec3;

  constructor(scene: Scene, camera: FreeCamera, readonly config: WeaponConfig, materials: ViewModelMaterials) {
    const id = config.id;
    const gun = buildGunGeometry(id);

    this.root = new TransformNode(`vm_${id}`, scene);
    this.root.parent = camera;
    this.leftHandToMag = gun.leftHandToMag;
    this.magOut = gun.magOut;

    meshFromBatch(`vm_${id}_steel`, gun.steel, materials.steel, this.root, scene);
    meshFromBatch(`vm_${id}_polymer`, gun.polymer, materials.polymer, this.root, scene);
    meshFromBatch(`vm_${id}_glow`, gun.glow, materials.glow, this.root, scene);
    meshFromBatch(`vm_${id}_rightArm`, gun.rightArm, materials.fabric, this.root, scene);

    this.magazine = requireMesh(meshFromBatch(`vm_${id}_mag`, gun.magazine, materials.polymer, this.root, scene), 'magazine');
    this.bolt = requireMesh(meshFromBatch(`vm_${id}_bolt`, gun.bolt, materials.steel, this.root, scene), 'bolt');
    this.leftArm = requireMesh(meshFromBatch(`vm_${id}_leftArm`, gun.leftArm, materials.fabric, this.root, scene), 'leftArm');

    this.muzzle = new TransformNode(`vm_${id}_muzzle`, scene);
    this.muzzle.parent = this.root;
    this.muzzle.position.set(gun.muzzle.x, gun.muzzle.y, gun.muzzle.z);
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  get meshes(): AbstractMesh[] {
    return this.root.getChildMeshes();
  }

  /**
   * Muzzle position this instant, even when the camera moved after the last render.
   * The returned vector belongs to the node: copy it before keeping it.
   */
  muzzleWorld(): Vector3 {
    this.root.computeWorldMatrix(true);
    this.muzzle.computeWorldMatrix(true);
    return this.muzzle.getAbsolutePosition();
  }

  /** Removes the nodes and meshes. Materials are shared, so their owner disposes them. */
  dispose(): void {
    this.root.dispose(false, false);
  }
}
