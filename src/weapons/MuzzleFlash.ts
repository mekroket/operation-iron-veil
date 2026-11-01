/** View-model muzzle flash: one additive star mesh and one point light, reused for every shot. */
import { Color3, Engine, Material, Mesh, PointLight, StandardMaterial, VertexData, Vector3 } from '../engine/bjs';
import type { Scene, TransformNode } from '../engine/bjs';
import { VIEW_MODEL_RENDERING_GROUP } from './WeaponViewModel';

/** Frames the flash stays on screen. */
const FLASH_FRAMES = 2;
/** The second frame is a fading echo of the first. */
const ECHO_SCALE = 0.72;
const ECHO_LIGHT = 0.45;
const LIGHT_INTENSITY = 2.4;

const CORE = [1, 0.9, 0.62] as const;
const MID = [0.85, 0.42, 0.09] as const;
const TIP = [0.42, 0.13, 0.02] as const;

type Colour = readonly [number, number, number];

/** A flat star facing back down the barrel, plus two crossed blades along +Z so it has depth from any angle. */
function createStarData(): VertexData {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = (x: number, y: number, z: number, c: Colour): number => {
    positions.push(x, y, z);
    colors.push(c[0], c[1], c[2], 1);
    return positions.length / 3 - 1;
  };

  const centre = vertex(0, 0, 0, CORE);
  const spokes = 8;
  const ring: number[] = [];
  for (let i = 0; i < spokes * 2; i++) {
    const angle = (i / (spokes * 2)) * Math.PI * 2;
    const isTip = i % 2 === 0;
    const radius = isTip ? (i % 4 === 0 ? 0.075 : 0.05) : 0.018;
    ring.push(vertex(Math.cos(angle) * radius, Math.sin(angle) * radius, 0, isTip ? TIP : MID));
  }
  for (let i = 0; i < ring.length; i++) indices.push(centre, ring[i], ring[(i + 1) % ring.length]);

  const blade = (wx: number, wy: number): void => {
    const start = vertex(0, 0, 0, CORE);
    const left = vertex(-wx, -wy, 0.035, MID);
    const right = vertex(wx, wy, 0.035, MID);
    const end = vertex(0, 0, 0.16, TIP);
    indices.push(start, left, right, left, end, right);
  };
  blade(0.028, 0);
  blade(0, 0.028);

  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = indices;
  // The material is unlit, so these only keep the vertex layout conventional.
  data.normals = positions.map((_, index) => (index % 3 === 2 ? -1 : 0));
  return data;
}

export class MuzzleFlash {
  private readonly star: Mesh;
  private readonly material: StandardMaterial;
  private readonly light: PointLight;
  private framesLeft = 0;
  private baseScale = 1;
  private lightPeak = 0;

  constructor(scene: Scene) {
    this.material = new StandardMaterial('vmFlash', scene);
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.emissiveColor = Color3.White();
    this.material.disableLighting = true;
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.material.fogEnabled = false;
    this.material.alphaMode = Engine.ALPHA_ADD;
    this.material.transparencyMode = Material.MATERIAL_ALPHABLEND;

    this.star = new Mesh('vmFlashStar', scene);
    createStarData().applyToMesh(this.star);
    this.star.material = this.material;
    this.star.renderingGroupId = VIEW_MODEL_RENDERING_GROUP;
    this.star.isPickable = false;
    this.star.receiveShadows = false;
    this.star.alwaysSelectAsActiveMesh = true;
    this.star.isVisible = false;
    // Compile now rather than hitching on the first shot of the session.
    this.material.forceCompilation(this.star);

    // Stays enabled at zero intensity: toggling a light would dirty every material and recompile shaders.
    this.light = new PointLight('vmFlashLight', Vector3.Zero(), scene);
    this.light.diffuse = new Color3(1, 0.68, 0.36);
    this.light.specular = new Color3(1, 0.68, 0.36);
    this.light.intensity = 0;
    this.light.range = 9;
    this.light.shadowEnabled = false;
    // Under the light budget the level's own lights win the slot over this one.
    this.light.renderPriority = -1;
  }

  /** Moves the flash to a weapon's muzzle. */
  attach(muzzle: TransformNode, scale: number): void {
    this.star.parent = muzzle;
    this.baseScale = scale;
    this.hide();
  }

  /** Shows the flash at the attached muzzle. `worldPosition` places the light. Allocates nothing. */
  fire(worldPosition: Vector3): void {
    this.framesLeft = FLASH_FRAMES;
    this.star.isVisible = true;
    this.star.rotation.z = Math.random() * Math.PI * 2;
    this.star.scaling.setAll(this.baseScale * (0.85 + Math.random() * 0.35));
    this.light.position.copyFrom(worldPosition);
    this.lightPeak = LIGHT_INTENSITY * (0.85 + Math.random() * 0.3);
    this.light.intensity = this.lightPeak;
  }

  /** Call once at the start of each frame. Fading is counted in frames, so it is equally brief at any frame rate. */
  update(): void {
    if (this.framesLeft <= 0) return;
    this.framesLeft -= 1;
    if (this.framesLeft === 0) {
      this.hide();
      return;
    }
    this.star.scaling.scaleInPlace(ECHO_SCALE);
    this.light.intensity = this.lightPeak * ECHO_LIGHT;
  }

  hide(): void {
    this.framesLeft = 0;
    this.star.isVisible = false;
    this.light.intensity = 0;
  }

  dispose(): void {
    this.star.dispose(false, false);
    this.material.dispose();
    this.light.dispose();
  }
}
