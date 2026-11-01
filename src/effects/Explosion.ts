import { Color4, MeshBuilder, PBRMaterial, PointLight, Vector3 } from '../engine/bjs';
import type { Mesh, Scene } from '../engine/bjs';
import type { Vec3 } from '../core/types';
import type { ResolvedGraphics } from '../settings/settings';
import { prepareEffectLight } from './EnemyMuzzle';
import { additiveMaterial, BurstEmitter, ThinPool } from './fxPools';
import type { FxTextures } from './fxTextures';

const DEBRIS_COUNT = 28;
const DEBRIS_PER_BLAST = 14;
const DEBRIS_LIFE = 2.6;
const COLUMN_SECONDS = 8;
const COLUMN_INTERVAL = 0.14;
const LIGHT_LIFE = 0.45;
const LIGHT_INTENSITY = 1500;
const RING_LIFE = 0.55;
const SLOTS = 2;

interface Debris {
  age: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  yawRate: number;
  pitchRate: number;
  scale: number;
  floor: number;
}

/** One blast's lingering parts. Two can overlap; a third reuses the oldest. */
interface Blast {
  column: number;
  columnTick: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  ring: Mesh;
  ringAge: number;
}

/** Fireball, lingering smoke column, sparks, debris, a brief strong light and a ground shockwave ring. All pooled. */
export class Explosion {
  private readonly fire: BurstEmitter;
  private readonly smoke: BurstEmitter;
  private readonly sparks: BurstEmitter;
  private readonly debrisPool: ThinPool;
  private readonly debrisMaterial: PBRMaterial;
  private readonly debris: Debris[] = [];
  private readonly blasts: Blast[] = [];
  private readonly ringMaterial: PBRMaterial;
  private readonly light: PointLight;
  private lightAge = LIGHT_LIFE;
  private nextDebris = 0;
  private nextBlast = 0;

  constructor(scene: Scene, textures: FxTextures, gfx: ResolvedGraphics) {
    const scale = gfx.particleScale;
    this.fire = new BurstEmitter(scene, {
      name: 'iv.blast.fire', capacity: 70, texture: textures.smoke, additive: true,
      life: [0.3, 0.75], size: [1, 2], speed: [3, 12], gravity: -2.5,
      color: new Color4(5, 2.6, 0.9, 0.9), color2: new Color4(3.4, 1.3, 0.35, 0.85), colorDead: new Color4(0.5, 0.08, 0.01, 0),
      sizeOverLife: [1.1, 4.2], slowdown: 0.1, spin: 1.5,
    }, scale);
    this.smoke = new BurstEmitter(scene, {
      name: 'iv.blast.smoke', capacity: 170, texture: textures.smoke, additive: false,
      life: [3.5, 6.5], size: [2, 4], speed: [1.2, 3], gravity: -0.5,
      color: new Color4(0.13, 0.13, 0.145, 0.55), color2: new Color4(0.2, 0.2, 0.215, 0.45), colorDead: new Color4(0.27, 0.28, 0.31, 0),
      sizeOverLife: [1.8, 9], slowdown: 0.45, spin: 0.25,
    }, scale);
    this.sparks = new BurstEmitter(scene, {
      name: 'iv.blast.sparks', capacity: 120, texture: textures.spark, additive: true,
      life: [0.5, 1.5], size: [0.03, 0.07], speed: [7, 24], gravity: 9.81,
      color: new Color4(4, 2.4, 1, 1), colorDead: new Color4(1, 0.15, 0, 0),
      stretched: true,
    }, scale);

    const debrisMaterial = new PBRMaterial('iv.debris', scene);
    debrisMaterial.albedoColor.set(0.09, 0.085, 0.08);
    debrisMaterial.metallic = 0.25;
    debrisMaterial.roughness = 0.85;
    this.debrisMaterial = debrisMaterial;
    const debrisMesh = MeshBuilder.CreateBox('iv.debris', { size: 1 }, scene);
    debrisMesh.material = debrisMaterial;
    this.debrisPool = new ThinPool(debrisMesh, DEBRIS_COUNT);
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      this.debris.push({ age: DEBRIS_LIFE, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0, scale: 0, floor: 0 });
    }

    this.ringMaterial = additiveMaterial(scene, 'iv.shockwave', textures.ring, 2.6, 2.2, 1.8);
    for (let i = 0; i < SLOTS; i++) {
      const ring = MeshBuilder.CreatePlane(`iv.shockwave.${i}`, { size: 1 }, scene);
      ring.material = this.ringMaterial;
      ring.rotation.x = Math.PI / 2;
      ring.isPickable = false;
      ring.setEnabled(false);
      this.blasts.push({ column: 0, columnTick: 0, x: 0, y: 0, z: 0, radius: 0, ring, ringAge: RING_LIFE });
    }

    this.light = new PointLight('iv.blast', Vector3.Zero(), scene);
    this.light.diffuse.set(1, 0.62, 0.3);
    this.light.specular.set(1, 0.62, 0.3);
    prepareEffectLight(this.light, 70);
  }

  explode(position: Vec3, radius: number): void {
    const { x, y, z } = position;
    this.fire.emit(x, y + 0.5, z, 0, 1, 0, 42, 0.8, radius * 0.25);
    this.smoke.emit(x, y + 0.5, z, 0, 1, 0, 16, 0.5, radius * 0.3);
    this.sparks.emit(x, y + 0.4, z, 0, 1, 0, 70, 0.75, 0.4);
    for (let i = 0; i < DEBRIS_PER_BLAST; i++) this.launchDebris(x, y, z, radius);

    this.light.position.set(x, y + 1.5, z);
    this.light.intensity = LIGHT_INTENSITY;
    this.lightAge = 0;

    const blast = this.blasts[this.nextBlast];
    this.nextBlast = (this.nextBlast + 1) % SLOTS;
    blast.x = x;
    blast.y = y;
    blast.z = z;
    blast.radius = radius;
    blast.column = COLUMN_SECONDS;
    blast.columnTick = COLUMN_INTERVAL;
    blast.ringAge = 0;
    blast.ring.position.set(x, y + 0.12, z);
    blast.ring.scaling.set(0.01, 0.01, 0.01);
    blast.ring.visibility = 1;
    blast.ring.setEnabled(true);
  }

  update(dt: number): void {
    for (const blast of this.blasts) this.updateBlast(blast, dt);
    this.updateDebris(dt);
    if (this.lightAge < LIGHT_LIFE) {
      this.lightAge += dt;
      const t = Math.min(1, this.lightAge / LIGHT_LIFE);
      this.light.intensity = LIGHT_INTENSITY * (1 - t) * (1 - t);
    }
  }

  dispose(): void {
    this.fire.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
    this.debrisPool.dispose();
    this.debrisMaterial.dispose();
    for (const blast of this.blasts) blast.ring.dispose();
    this.ringMaterial.dispose();
    this.light.dispose();
  }

  private updateBlast(blast: Blast, dt: number): void {
    if (blast.ringAge < RING_LIFE) {
      blast.ringAge += dt;
      const t = Math.min(1, blast.ringAge / RING_LIFE);
      // Fast start, then coasting: a pressure front, not a growing disc.
      const size = blast.radius * 3.2 * (1 - (1 - t) * (1 - t));
      blast.ring.scaling.set(size, size, size);
      blast.ring.visibility = 1 - t;
      if (t >= 1) blast.ring.setEnabled(false);
    }
    if (blast.column > 0) {
      blast.column -= dt;
      blast.columnTick -= dt;
      if (blast.columnTick <= 0) {
        blast.columnTick += COLUMN_INTERVAL;
        this.smoke.emit(blast.x, blast.y + 0.6, blast.z, 0.05, 1, 0.02, 1, 0.16, blast.radius * 0.35);
      }
    }
  }

  private launchDebris(x: number, y: number, z: number, radius: number): void {
    const d = this.debris[this.nextDebris];
    this.nextDebris = (this.nextDebris + 1) % DEBRIS_COUNT;
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 12;
    d.age = 0;
    d.x = x + Math.cos(angle) * radius * 0.2;
    d.y = y + 0.4;
    d.z = z + Math.sin(angle) * radius * 0.2;
    d.vx = Math.cos(angle) * speed;
    d.vy = 5 + Math.random() * 13;
    d.vz = Math.sin(angle) * speed;
    d.yaw = Math.random() * Math.PI * 2;
    d.pitch = Math.random() * Math.PI * 2;
    d.yawRate = (Math.random() - 0.5) * 16;
    d.pitchRate = (Math.random() - 0.5) * 16;
    d.scale = 0.08 + Math.random() * 0.24;
    d.floor = y + d.scale * 0.5;
  }

  private updateDebris(dt: number): void {
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const d = this.debris[i];
      if (d.age >= DEBRIS_LIFE) continue;
      d.age += dt;
      if (d.age >= DEBRIS_LIFE) {
        this.debrisPool.hide(i);
        continue;
      }
      d.vy -= 9.81 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.yaw += d.yawRate * dt;
      d.pitch += d.pitchRate * dt;
      if (d.y < d.floor) {
        d.y = d.floor;
        d.vy = Math.abs(d.vy) * 0.25;
        d.vx *= 0.45;
        d.vz *= 0.45;
        d.yawRate *= 0.4;
        d.pitchRate *= 0.4;
      }
      const shrink = Math.min(1, (DEBRIS_LIFE - d.age) / 0.4);
      this.debrisPool.writeTumble(i, d.yaw, d.pitch, d.scale * shrink, d.x, d.y, d.z);
    }
    this.debrisPool.flush();
  }
}
