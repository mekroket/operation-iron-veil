import {
  Color3,
  Color4,
  CubeMapToSphericalPolynomialTools,
  DynamicTexture,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  RawCubeTexture,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  VertexData,
} from '../engine/bjs';
import type { AbstractMesh, BaseTexture } from '../engine/bjs';
import type { LevelDefinition } from '../levels/types';
import type { ResolvedGraphics } from '../settings/settings';
import { SeaSurface } from './seaSurface';
import { buildCubeFaces, domeArrays, horizonLinear, paintSkyImage, silhouetteSrgb, TO_LIGHT } from './skyPaint';
import { SunShadows } from './sunShadows';

const DOME_RADIUS = 1800;
/** The dome and the far silhouettes must fit inside the camera's far plane. */
const REQUIRED_MAX_Z = 2600;
const ENV_FACE_SIZE = 128;

/**
 * Fog density for the look of 120-200 m visibility. PBR raises the fog factor to 2.2 before mixing, so the
 * effective density on level geometry is about 1.48 times this: 72% clear at 60 m, 26% at 120 m, 5% at 180 m.
 */
const FOG_DENSITY = 0.0065;

/** Sky, fog, sea, sun and shadows, ambient and environment lighting for one level. */
export class SceneEnvironment {
  private gfx: ResolvedGraphics;
  private built = false;
  private sun: SunShadows | null = null;
  private sea: SeaSurface | null = null;
  private hemi: HemisphericLight | null = null;
  private dome: Mesh | null = null;
  private domeMaterial: StandardMaterial | null = null;
  private skyTexture: DynamicTexture | null = null;
  private environment: BaseTexture | null = null;
  private readonly silhouettes: { mesh: Mesh; material: StandardMaterial }[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly level: LevelDefinition,
    gfx: ResolvedGraphics,
  ) {
    this.gfx = gfx;
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.buildAtmosphere();
    this.buildDome();
    this.buildEnvironmentTexture();
    this.buildLights();
    this.sea = new SeaSurface(this.scene, this.level.seaLevel, this.gfx.maxLights);
    this.buildSilhouettes();
  }

  /** Casters also receive, since a caster with no self shadow looks wrong under a low sun. Other receivers set receiveShadows themselves. */
  addShadowCasters(meshes: AbstractMesh[]): void {
    this.sun?.addCasters(meshes);
  }

  /** Redraws the shadow map. For the rare case a caster moved: doors, blast damage. */
  refreshShadows(): void {
    this.sun?.requestRefresh();
  }

  setGraphics(gfx: ResolvedGraphics): void {
    this.gfx = gfx;
    this.sun?.configure(gfx.shadowMapSize, gfx.shadowDistance);
    this.sea?.setMaxLights(gfx.maxLights);
  }

  update(dt: number, cameraPosition: Vector3): void {
    // The dome follows the active camera through infiniteDistance, without touching a transform here.
    const camera = this.scene.activeCamera;
    if (camera && camera.maxZ > 0 && camera.maxZ < REQUIRED_MAX_Z) camera.maxZ = REQUIRED_MAX_Z;
    this.sea?.update(dt, cameraPosition);
    this.sun?.update(dt, cameraPosition);
  }

  dispose(): void {
    if (this.scene.environmentTexture === this.environment) this.scene.environmentTexture = null;
    this.scene.fogMode = Scene.FOGMODE_NONE;
    this.environment?.dispose();
    this.environment = null;
    this.sun?.dispose();
    this.sun = null;
    this.sea?.dispose();
    this.sea = null;
    this.hemi?.dispose();
    this.hemi = null;
    this.dome?.dispose();
    this.dome = null;
    this.domeMaterial?.dispose();
    this.domeMaterial = null;
    this.skyTexture?.dispose();
    this.skyTexture = null;
    for (const { mesh, material } of this.silhouettes) {
      mesh.dispose();
      material.dispose();
    }
    this.silhouettes.length = 0;
    this.built = false;
  }

  private buildAtmosphere(): void {
    const [r, g, b] = horizonLinear();
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = FOG_DENSITY;
    // PBR mixes fog in linear space. The sky dome is unlit and fog free, so this linear colour meets it exactly at the horizon.
    this.scene.fogColor = new Color3(r, g, b);
    this.scene.clearColor = new Color4(r, g, b, 1);
  }

  private buildDome(): void {
    const scene = this.scene;
    const width = Math.min(2048, Math.max(1024, this.gfx.textureSize * 2));
    const height = width / 2;
    const texture = new DynamicTexture('iv.sky', { width, height }, scene, false, Texture.BILINEAR_SAMPLINGMODE);
    texture.getContext().putImageData(paintSkyImage(width, height), 0, 0);
    texture.update();
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    this.skyTexture = texture;

    const material = new StandardMaterial('iv.sky', scene);
    material.emissiveTexture = texture;
    material.diffuseColor = new Color3(0, 0, 0);
    material.specularColor = new Color3(0, 0, 0);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.fogEnabled = false;
    this.domeMaterial = material;

    const { positions, uvs, indices } = domeArrays(DOME_RADIUS, 48, 24);
    const data = new VertexData();
    data.positions = positions;
    // Lighting ignores these, but the geometry buffer binds a normal attribute for every mesh it draws.
    data.normals = positions.map((value) => value / DOME_RADIUS);
    data.uvs = uvs;
    data.indices = indices;
    const dome = new Mesh('iv.sky', scene);
    data.applyToMesh(dome);
    dome.material = material;
    dome.infiniteDistance = true;
    dome.applyFog = false;
    dome.isPickable = false;
    dome.alwaysSelectAsActiveMesh = true;
    this.dome = dome;
  }

  /**
   * Environment cube uploaded directly from the same function that paints the dome, in place of a ReflectionProbe.
   * A probe would need a render-once pass whose output depends on the image processing state at that moment, plus an
   * asynchronous GPU read back for irradiance. Here the data is on the CPU, so irradiance is computed synchronously.
   */
  private buildEnvironmentTexture(): void {
    const scene = this.scene;
    const faces = buildCubeFaces(ENV_FACE_SIZE);
    const FORMAT_RGBA = 5;
    const TYPE_BYTE = 0;
    const cube = new RawCubeTexture(scene, faces, ENV_FACE_SIZE, FORMAT_RGBA, TYPE_BYTE, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    cube.gammaSpace = true;
    // Roughness picks a mip level through these. Without them the internal texture reports a scale of 0, and every metal looks like a mirror.
    cube.lodGenerationScale = 0.8;
    cube.lodGenerationOffset = 0;
    // The mips are plain box filtered, not GGX prefiltered.
    cube.linearSpecularLOD = true;
    cube.sphericalPolynomial = CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial(
      {
        size: ENV_FACE_SIZE,
        right: faces[0],
        left: faces[1],
        up: faces[2],
        down: faces[3],
        front: faces[4],
        back: faces[5],
        format: FORMAT_RGBA,
        type: TYPE_BYTE,
        gammaSpace: true,
      },
      32,
    );
    scene.environmentTexture = cube;
    // The sky is dim by design. This keeps metals readable instead of black.
    scene.environmentIntensity = 1.5;
    this.environment = cube;
  }

  private buildLights(): void {
    const hemi = new HemisphericLight('iv.ambient', Vector3.Up(), this.scene);
    hemi.intensity = 0.3;
    hemi.diffuse.set(0.42, 0.52, 0.72);
    hemi.groundColor.set(0.1, 0.07, 0.05);
    hemi.specular.set(0, 0, 0);
    hemi.renderPriority = 9;
    hemi.shadowEnabled = false;
    this.hemi = hemi;

    const sun = new SunShadows(this.scene, TO_LIGHT);
    sun.configure(this.gfx.shadowMapSize, this.gfx.shadowDistance);
    this.sun = sun;
  }

  /** Far hills to the north and west, and a breakwater with gantries against the dawn. Fog would erase them, so they are painted faded by hand. */
  private buildSilhouettes(): void {
    const { min, max } = this.level.bounds;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    const reach = Math.hypot(max.x - min.x, max.z - min.z) / 2;
    const base = this.level.seaLevel - 2;
    let seed = 2024;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 8) & 0xffff) / 65535;
    };

    const hills: number[] = [];
    for (let i = 0; i < 18; i++) {
      const azimuth = (-120 + (160 * i) / 17 + (random() - 0.5) * 6) * (Math.PI / 180);
      const distance = reach + 700 + random() * 280;
      const height = 40 + random() * 75;
      pushBox(hills, cx + Math.sin(azimuth) * distance, base + height / 2, cz + Math.cos(azimuth) * distance, 180 + random() * 220, height, 110 + random() * 120, azimuth + (random() - 0.5) * 0.7);
    }
    this.addSilhouette('iv.hills', hills, 0.13);

    const breakwater: number[] = [];
    const angle = (128 * Math.PI) / 180;
    const distance = reach + 430;
    const along = angle + Math.PI / 2;
    const px = cx + Math.sin(angle) * distance;
    const pz = cz + Math.cos(angle) * distance;
    pushBox(breakwater, px, base + 3.5, pz, 12, 7, 620, along);
    for (let i = 0; i < 5; i++) {
      const offset = -240 + i * 120 + (random() - 0.5) * 30;
      const height = 22 + random() * 22;
      pushBox(breakwater, px + Math.sin(along) * offset, base + height / 2, pz + Math.cos(along) * offset, 5, height, 5, along);
      pushBox(breakwater, px + Math.sin(along) * offset, base + height, pz + Math.cos(along) * offset, 26, 3, 3, along);
    }
    this.addSilhouette('iv.breakwater', breakwater, 0.32);
  }

  private addSilhouette(name: string, matrices: number[], darkness: number): void {
    const [r, g, b] = silhouetteSrgb(darkness);
    const material = new StandardMaterial(name, this.scene);
    material.emissiveColor = new Color3(r, g, b);
    material.diffuseColor = new Color3(0, 0, 0);
    material.specularColor = new Color3(0, 0, 0);
    material.disableLighting = true;
    material.fogEnabled = false;

    const mesh = MeshBuilder.CreateBox(name, { size: 1 }, this.scene);
    mesh.material = material;
    mesh.applyFog = false;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.thinInstanceSetBuffer('matrix', new Float32Array(matrices), 16, true);
    this.silhouettes.push({ mesh, material });
  }
}

/** Appends a scale, yaw and translate matrix in Babylon's row layout. */
function pushBox(out: number[], x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.push(sx * c, 0, -sx * s, 0, 0, sy, 0, 0, sz * s, 0, sz * c, 0, x, y, z, 1);
}
