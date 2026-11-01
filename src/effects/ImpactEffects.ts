import { Color3, Color4, Material, MeshBuilder, StandardMaterial } from '../engine/bjs';
import type { BaseTexture, Scene } from '../engine/bjs';
import type { SurfaceType, Vec3 } from '../core/types';
import type { ResolvedGraphics } from '../settings/settings';
import { BurstEmitter, ThinPool } from './fxPools';
import type { FxTextures } from './fxTextures';

/** Pushed off the surface so a decal survives shallow angles, on top of the material's depth offset. */
const SURFACE_LIFT = 0.006;

/** Ring buffer of bullet marks with one look. The oldest is recycled when it is full. */
class DecalSet {
  private readonly pool: ThinPool;
  private readonly material: StandardMaterial;
  private next = 0;

  constructor(scene: Scene, name: string, texture: BaseTexture, capacity: number) {
    const material = new StandardMaterial(`iv.decal.${name}`, scene);
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    // Explicit: a diffuse texture with alpha would otherwise also switch on alpha testing, which hardens the soft edges.
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.diffuseColor = new Color3(0, 0, 0);
    material.specularColor = new Color3(0, 0, 0);
    // Unlit: the emissive term selects the texture's own colour, since a hole is dark in any light.
    material.emissiveColor = new Color3(1, 1, 1);
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.zOffset = -2;
    this.material = material;

    const mesh = MeshBuilder.CreatePlane(`iv.decal.${name}`, { size: 1 }, scene);
    mesh.material = material;
    this.pool = new ThinPool(mesh, capacity);
  }

  place(point: Vec3, normal: Vec3, size: number): void {
    // Tangent basis from whichever world axis is least parallel to the normal, rolled at random so marks do not repeat.
    const upX = Math.abs(normal.y) > 0.9 ? 1 : 0;
    const upY = upX === 1 ? 0 : 1;
    let tx = upY * normal.z;
    let ty = -upX * normal.z;
    let tz = upX * normal.y - upY * normal.x;
    const inverse = 1 / Math.max(1e-5, Math.hypot(tx, ty, tz));
    tx *= inverse;
    ty *= inverse;
    tz *= inverse;
    const bx = normal.y * tz - normal.z * ty;
    const by = normal.z * tx - normal.x * tz;
    const bz = normal.x * ty - normal.y * tx;
    const roll = Math.random() * Math.PI * 2;
    const c = Math.cos(roll) * size;
    const s = Math.sin(roll) * size;
    this.pool.write(
      this.next,
      tx * c + bx * s, ty * c + by * s, tz * c + bz * s,
      bx * c - tx * s, by * c - ty * s, bz * c - tz * s,
      -normal.x, -normal.y, -normal.z,
      point.x + normal.x * SURFACE_LIFT, point.y + normal.y * SURFACE_LIFT, point.z + normal.z * SURFACE_LIFT,
    );
    this.next = (this.next + 1) % this.pool.capacity;
  }

  flush(): void {
    this.pool.flush();
  }

  dispose(): void {
    this.pool.dispose();
    this.material.dispose();
  }
}

/** Bullet impacts: a decal plus a surface-appropriate burst. */
export class ImpactEffects {
  private readonly metalDecals: DecalSet;
  private readonly concreteDecals: DecalSet;
  private readonly woodDecals: DecalSet;
  private readonly sparks: BurstEmitter;
  private readonly dust: BurstEmitter;
  private readonly splinters: BurstEmitter;
  private readonly mist: BurstEmitter;
  private readonly spray: BurstEmitter;

  constructor(scene: Scene, textures: FxTextures, gfx: ResolvedGraphics) {
    // Each look has its own draw call, so the total budget is shared out and the sum never exceeds gfx.maxDecals.
    const metalCount = Math.ceil(gfx.maxDecals * 0.4);
    const concreteCount = Math.ceil(gfx.maxDecals * 0.4);
    const woodCount = Math.max(1, gfx.maxDecals - metalCount - concreteCount);
    this.metalDecals = new DecalSet(scene, 'metal', textures.holeMetal, metalCount);
    this.concreteDecals = new DecalSet(scene, 'concrete', textures.holeConcrete, concreteCount);
    this.woodDecals = new DecalSet(scene, 'wood', textures.holeWood, woodCount);

    const scale = gfx.particleScale;
    this.sparks = new BurstEmitter(scene, {
      name: 'iv.impact.sparks', capacity: 90, texture: textures.spark, additive: true,
      life: [0.12, 0.34], size: [0.012, 0.03], speed: [3, 9], gravity: 9,
      color: new Color4(3.2, 2, 0.9, 1), color2: new Color4(2.4, 1.2, 0.45, 1), colorDead: new Color4(0.8, 0.15, 0, 0),
      stretched: true,
    }, scale);
    this.dust = new BurstEmitter(scene, {
      name: 'iv.impact.dust', capacity: 60, texture: textures.smoke, additive: false,
      life: [0.5, 1.1], size: [0.2, 0.4], speed: [0.5, 1.8], gravity: -0.15,
      color: new Color4(0.42, 0.4, 0.37, 0.4), colorDead: new Color4(0.42, 0.4, 0.37, 0),
      sizeOverLife: [0.12, 0.6], slowdown: 0.15, spin: 0.8,
    }, scale);
    this.splinters = new BurstEmitter(scene, {
      name: 'iv.impact.splinters', capacity: 50, texture: textures.shard, additive: false,
      life: [0.3, 0.65], size: [0.018, 0.05], speed: [2, 5.5], gravity: 9.8,
      color: new Color4(0.62, 0.48, 0.3, 1), colorDead: new Color4(0.4, 0.3, 0.2, 0.2),
      spin: 12,
    }, scale);
    this.mist = new BurstEmitter(scene, {
      name: 'iv.impact.mist', capacity: 36, texture: textures.soft, additive: false,
      life: [0.16, 0.34], size: [0.1, 0.2], speed: [0.3, 1.1], gravity: 0.6,
      color: new Color4(0.2, 0.025, 0.02, 0.42), colorDead: new Color4(0.14, 0.015, 0.012, 0),
      sizeOverLife: [0.07, 0.3], slowdown: 0.2,
    }, scale);
    this.spray = new BurstEmitter(scene, {
      name: 'iv.impact.spray', capacity: 40, texture: textures.soft, additive: false,
      life: [0.3, 0.6], size: [0.04, 0.09], speed: [1.5, 4], gravity: 9.8,
      color: new Color4(0.55, 0.62, 0.66, 0.55), colorDead: new Color4(0.55, 0.62, 0.66, 0),
    }, scale);
  }

  impact(point: Vec3, normal: Vec3, surface: SurfaceType): void {
    const { x, y, z } = point;
    const nx = normal.x;
    const ny = normal.y;
    const nz = normal.z;
    switch (surface) {
      case 'metal':
        this.metalDecals.place(point, normal, 0.1);
        this.sparks.emit(x, y, z, nx, ny, nz, 9, 0.8);
        break;
      case 'concrete':
      case 'asphalt':
      case 'gravel':
        this.concreteDecals.place(point, normal, 0.14);
        this.dust.emit(x, y, z, nx, ny, nz, 5, 0.6, 0.04);
        break;
      case 'wood':
        this.woodDecals.place(point, normal, 0.13);
        this.splinters.emit(x, y, z, nx, ny, nz, 7, 0.65);
        this.dust.emit(x, y, z, nx, ny, nz, 2, 0.5, 0.03);
        break;
      case 'flesh':
        this.mist.emit(x, y, z, nx, ny, nz, 5, 0.55, 0.05);
        break;
      case 'water':
        this.spray.emit(x, y, z, 0, 1, 0, 8, 0.28);
        break;
    }
  }

  update(): void {
    this.metalDecals.flush();
    this.concreteDecals.flush();
    this.woodDecals.flush();
  }

  dispose(): void {
    this.metalDecals.dispose();
    this.concreteDecals.dispose();
    this.woodDecals.dispose();
    this.sparks.dispose();
    this.dust.dispose();
    this.splinters.dispose();
    this.mist.dispose();
    this.spray.dispose();
  }
}
