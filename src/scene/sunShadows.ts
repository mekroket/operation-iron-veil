import { DirectionalLight, ShadowGenerator, Vector3 } from '../engine/bjs';
import type { AbstractMesh, Scene } from '../engine/bjs';

/** RenderTargetTexture.REFRESHRATE_RENDER_ONCE: the world is static, so the map is only redrawn on demand. */
const RENDER_ONCE = 0;
/** Fraction of the shadow distance the camera may travel before the frustum recentres. */
const RECENTRE_FRACTION = 0.08;
/**
 * Materials compile asynchronously and a caster that is not ready is skipped by the shadow pass. A map rendered
 * once could keep that hole forever, so the map is redrawn a few times after the caster list changes.
 */
const SETTLE_SECONDS = 2.5;
const SETTLE_INTERVAL = 0.25;

/** The weak moon and dawn light with its camera-following, texel-snapped shadow map. */
export class SunShadows {
  readonly light: DirectionalLight;
  private generator: ShadowGenerator | null = null;
  private readonly casters = new Set<AbstractMesh>();
  private mapSize = 0;
  private distance = 60;
  private readonly lastCentre = new Vector3(Number.POSITIVE_INFINITY, 0, 0);
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly axisZ = new Vector3();
  private settleLeft = 0;
  private settleTick = 0;

  constructor(scene: Scene, toLight: readonly [number, number, number]) {
    const direction = new Vector3(-toLight[0], -toLight[1], -toLight[2]);
    this.light = new DirectionalLight('iv.sun', direction, scene);
    this.light.intensity = 1.35;
    this.light.diffuse.set(0.7, 0.76, 0.92);
    this.light.specular.set(0.78, 0.74, 0.72);
    this.light.renderPriority = 10;
    this.light.autoUpdateExtends = false;
    this.light.autoCalcShadowZBounds = false;

    // Same basis as the view matrix ShadowGenerator derives with LookAtLH and Vector3.Up, so snapping lines up with real texels.
    this.axisZ.copyFrom(direction).normalize();
    Vector3.CrossToRef(Vector3.Up(), this.axisZ, this.axisX);
    this.axisX.normalize();
    Vector3.CrossToRef(this.axisZ, this.axisX, this.axisY);
  }

  /** Applies the map size and frustum. Size 0 removes shadows. Rebuilds the generator only when the size changes. */
  configure(mapSize: number, distance: number): void {
    const sizeChanged = mapSize !== this.mapSize;
    const distanceChanged = distance !== this.distance;
    this.mapSize = mapSize;
    this.distance = distance;
    this.light.shadowFrustumSize = distance;
    this.light.shadowMinZ = 1;
    this.light.shadowMaxZ = distance * 2.6;
    this.light.shadowEnabled = mapSize > 0;

    if (sizeChanged) {
      this.generator?.dispose();
      this.generator = null;
      if (mapSize > 0) this.createGenerator();
    }
    if (sizeChanged || distanceChanged) this.lastCentre.x = Number.POSITIVE_INFINITY;
  }

  addCasters(meshes: AbstractMesh[]): void {
    for (const mesh of meshes) {
      this.casters.add(mesh);
      mesh.receiveShadows = true;
      this.generator?.addShadowCaster(mesh, false);
    }
    this.requestRefresh();
  }

  /** Redraws the map over the next frames. Call after a change to casters that moved, such as a door. */
  requestRefresh(): void {
    this.settleLeft = SETTLE_SECONDS;
    this.settleTick = 0;
  }

  update(dt: number, camera: Vector3): void {
    if (!this.generator) return;
    const limit = this.distance * RECENTRE_FRACTION;
    if (Vector3.DistanceSquared(camera, this.lastCentre) > limit * limit) {
      this.recentre(camera);
    } else if (this.settleLeft > 0) {
      this.settleLeft -= dt;
      this.settleTick -= dt;
      if (this.settleTick <= 0) {
        this.settleTick = SETTLE_INTERVAL;
        this.generator.getShadowMap()?.resetRefreshCounter();
      }
    }
  }

  dispose(): void {
    this.generator?.dispose();
    this.generator = null;
    this.casters.clear();
    this.light.dispose();
  }

  private createGenerator(): void {
    const generator = new ShadowGenerator(this.mapSize, this.light);
    // PCF needs WebGL2; Babylon falls back to Poisson sampling on its own where that is unavailable.
    generator.usePercentageCloserFiltering = true;
    generator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    // The depth range spans about 2.6 x distance, so this bias is a few centimetres in world units.
    generator.bias = 0.0003;
    generator.normalBias = 0.02;
    generator.darkness = 0;
    generator.frustumEdgeFalloff = 0.15;
    const map = generator.getShadowMap();
    if (map) map.refreshRate = RENDER_ONCE;
    for (const mesh of this.casters) generator.addShadowCaster(mesh, false);
    this.generator = generator;
    this.requestRefresh();
  }

  /** Moves the frustum in whole shadow texels, so static shadow edges stay put when the map is redrawn. */
  private recentre(camera: Vector3): void {
    this.lastCentre.copyFrom(camera);
    const texel = this.distance / this.mapSize;
    const x = Math.round(Vector3.Dot(camera, this.axisX) / texel) * texel;
    const y = Math.round(Vector3.Dot(camera, this.axisY) / texel) * texel;
    const z = Vector3.Dot(camera, this.axisZ);
    const back = z - this.distance * 1.3;
    this.light.position.set(
      this.axisX.x * x + this.axisY.x * y + this.axisZ.x * back,
      this.axisX.y * x + this.axisY.y * y + this.axisZ.y * back,
      this.axisX.z * x + this.axisY.z * y + this.axisZ.z * back,
    );
    this.generator?.getShadowMap()?.resetRefreshCounter();
  }
}
