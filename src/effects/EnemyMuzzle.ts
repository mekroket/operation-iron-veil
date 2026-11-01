import { Light, MeshBuilder, PointLight, TransformNode, Vector3 } from '../engine/bjs';
import type { Mesh, PBRMaterial, Scene } from '../engine/bjs';
import type { Vec3 } from '../core/types';
import { additiveMaterial } from './fxPools';
import type { FxTextures } from './fxTextures';

const FLASH_COUNT = 6;
const FLASH_LIFE = 0.055;
const LIGHT_LIFE = 0.07;
const LIGHT_INTENSITY = 26;

interface Flash {
  mesh: Mesh;
  age: number;
}

interface PooledLight {
  light: PointLight;
  age: number;
}

/**
 * Prepares a pooled effect light. It stays enabled at intensity 0 for its whole life: enabling a light re-syncs every
 * mesh and changes shader defines, which is a visible compile hitch in the middle of a firefight. Sorting last means it
 * only takes a spare light slot, never one a lamp in the level needs.
 */
export function prepareEffectLight(light: PointLight, range: number): void {
  light.intensity = 0;
  light.range = range;
  light.shadowEnabled = false;
  light.renderPriority = -1;
  light.falloffType = Light.FALLOFF_PHYSICAL;
}

/** Brief additive flash at enemy muzzles, with a short-lived light from a pool of two. */
export class EnemyMuzzle {
  private readonly material: PBRMaterial;
  private readonly flashes: Flash[] = [];
  private readonly lights: PooledLight[] = [];
  private nextFlash = 0;
  private nextLight = 0;

  constructor(scene: Scene, textures: FxTextures) {
    this.material = additiveMaterial(scene, 'iv.enemyFlash', textures.flash, 6, 3.6, 1.5);
    for (let i = 0; i < FLASH_COUNT; i++) {
      const mesh = MeshBuilder.CreatePlane(`iv.enemyFlash.${i}`, { size: 1 }, scene);
      mesh.material = this.material;
      mesh.billboardMode = TransformNode.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.flashes.push({ mesh, age: FLASH_LIFE });
    }
    for (let i = 0; i < 2; i++) {
      const light = new PointLight(`iv.enemyFlash.${i}`, Vector3.Zero(), scene);
      light.diffuse.set(1, 0.68, 0.36);
      light.specular.set(1, 0.68, 0.36);
      prepareEffectLight(light, 14);
      this.lights.push({ light, age: LIGHT_LIFE });
    }
  }

  fired(muzzle: Vec3): void {
    const flash = this.flashes[this.nextFlash];
    this.nextFlash = (this.nextFlash + 1) % FLASH_COUNT;
    flash.age = 0;
    flash.mesh.position.set(muzzle.x, muzzle.y, muzzle.z);
    const size = 0.42 + Math.random() * 0.2;
    flash.mesh.scaling.set(size, size, size);
    flash.mesh.rotation.z = Math.random() * Math.PI * 2;
    flash.mesh.visibility = 1;
    flash.mesh.setEnabled(true);

    const pooled = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    pooled.age = 0;
    pooled.light.position.set(muzzle.x, muzzle.y, muzzle.z);
    pooled.light.intensity = LIGHT_INTENSITY;
  }

  update(dt: number): void {
    for (const flash of this.flashes) {
      if (flash.age >= FLASH_LIFE) continue;
      flash.age += dt;
      if (flash.age >= FLASH_LIFE) flash.mesh.setEnabled(false);
      else flash.mesh.visibility = 1 - flash.age / FLASH_LIFE;
    }
    for (const pooled of this.lights) {
      if (pooled.age >= LIGHT_LIFE) continue;
      pooled.age += dt;
      pooled.light.intensity = pooled.age >= LIGHT_LIFE ? 0 : LIGHT_INTENSITY * (1 - pooled.age / LIGHT_LIFE);
    }
  }

  dispose(): void {
    for (const flash of this.flashes) flash.mesh.dispose();
    for (const pooled of this.lights) pooled.light.dispose();
    this.material.dispose();
  }
}
