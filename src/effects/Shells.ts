import { MeshBuilder, PBRMaterial } from '../engine/bjs';
import type { Scene } from '../engine/bjs';
import type { Vec3 } from '../core/types';
import { ThinPool } from './fxPools';

const CAPACITY = 30;
const LIFE = 1.5;
const FADE_TIME = 0.3;
const GRAVITY = 9.81;
/** From the muzzle back towards the ejection port. */
const BACK_OFFSET = 0.45;
/** There is no physics query here: the floor is estimated from standing eye height, which is close enough for a brief prop. */
const EYE_TO_FLOOR = 1.6;
const BOUNCE = 0.35;

interface Shell {
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
  floor: number;
}

/** Brass cases ejected to the right of the weapon. Ballistic, one draw call, pool of 30. Fading is a quick shrink, since they are opaque. */
export class Shells {
  private readonly pool: ThinPool;
  private readonly material: PBRMaterial;
  private readonly shells: Shell[] = [];
  private next = 0;

  constructor(scene: Scene) {
    const material = new PBRMaterial('iv.shell', scene);
    material.albedoColor.set(0.72, 0.52, 0.2);
    material.metallic = 0.92;
    material.roughness = 0.34;
    this.material = material;
    const mesh = MeshBuilder.CreateCylinder('iv.shell', { height: 0.024, diameter: 0.009, tessellation: 6 }, scene);
    mesh.material = material;
    this.pool = new ThinPool(mesh, CAPACITY);
    for (let i = 0; i < CAPACITY; i++) {
      this.shells.push({ age: LIFE, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, yawRate: 0, pitchRate: 0, floor: 0 });
    }
  }

  fired(origin: Vec3, muzzle: Vec3, direction: Vec3): void {
    const shell = this.shells[this.next];
    this.next = (this.next + 1) % CAPACITY;

    // Right = up x forward in Babylon's left-handed world.
    const inverse = 1 / Math.max(1e-4, Math.hypot(direction.x, direction.z));
    const rightX = direction.z * inverse;
    const rightZ = -direction.x * inverse;
    const out = 1.5 + Math.random() * 0.8;
    const up = 1.6 + Math.random() * 0.9;
    const back = 0.3 + Math.random() * 0.4;

    shell.age = 0;
    shell.x = muzzle.x - direction.x * BACK_OFFSET;
    shell.y = muzzle.y - direction.y * BACK_OFFSET;
    shell.z = muzzle.z - direction.z * BACK_OFFSET;
    shell.vx = rightX * out - direction.x * back;
    shell.vy = up;
    shell.vz = rightZ * out - direction.z * back;
    shell.yaw = Math.random() * Math.PI * 2;
    shell.pitch = Math.random() * Math.PI * 2;
    shell.yawRate = 8 + Math.random() * 14;
    shell.pitchRate = 12 + Math.random() * 18;
    shell.floor = origin.y - EYE_TO_FLOOR;
  }

  update(dt: number): void {
    for (let i = 0; i < CAPACITY; i++) {
      const s = this.shells[i];
      if (s.age >= LIFE) continue;
      s.age += dt;
      if (s.age >= LIFE) {
        this.pool.hide(i);
        continue;
      }
      s.vy -= GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.yaw += s.yawRate * dt;
      s.pitch += s.pitchRate * dt;
      if (s.y < s.floor) {
        s.y = s.floor;
        s.vy = Math.abs(s.vy) * BOUNCE;
        s.vx *= 0.5;
        s.vz *= 0.5;
        s.yawRate *= 0.5;
        s.pitchRate *= 0.5;
      }
      const scale = Math.min(1, (LIFE - s.age) / FADE_TIME);
      this.pool.writeTumble(i, s.yaw, s.pitch, scale, s.x, s.y, s.z);
    }
    this.pool.flush();
  }

  dispose(): void {
    this.pool.dispose();
    this.material.dispose();
  }
}
