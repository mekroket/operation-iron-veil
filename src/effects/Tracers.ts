import { MeshBuilder } from '../engine/bjs';
import type { PBRMaterial, Scene, Vector3 } from '../engine/bjs';
import type { Vec3 } from '../core/types';
import { additiveMaterial, ThinPool } from './fxPools';
import type { FxTextures } from './fxTextures';

const CAPACITY = 40;
const ENEMY_SPEED = 240;
const PLAYER_SPEED = 380;
const STREAK_LENGTH = 7;
const STREAK_WIDTH = 0.035;
/** Every Nth player shot shows a tracer, as with a real tracer-loaded magazine. */
const PLAYER_INTERVAL = 3;
const PLAYER_RANGE = 130;
/** Player tracers begin ahead of the muzzle, so the streak does not cross the camera. */
const PLAYER_START_OFFSET = 1.5;

interface Tracer {
  active: boolean;
  sx: number;
  sy: number;
  sz: number;
  dx: number;
  dy: number;
  dz: number;
  travelled: number;
  range: number;
  speed: number;
}

/** Thin additive quads flying fast, turned around their long axis to face the camera. */
export class Tracers {
  private readonly pool: ThinPool;
  private readonly material: PBRMaterial;
  private readonly tracers: Tracer[] = [];
  private next = 0;
  private playerShots = 0;

  constructor(scene: Scene, textures: FxTextures) {
    this.material = additiveMaterial(scene, 'iv.tracer', textures.tracer, 5.5, 3.2, 1.3);
    const mesh = MeshBuilder.CreatePlane('iv.tracer', { size: 1 }, scene);
    mesh.material = this.material;
    this.pool = new ThinPool(mesh, CAPACITY);
    for (let i = 0; i < CAPACITY; i++) {
      this.tracers.push({ active: false, sx: 0, sy: 0, sz: 0, dx: 0, dy: 0, dz: 1, travelled: 0, range: 0, speed: 0 });
    }
  }

  enemyFired(muzzle: Vec3, target: Vec3): void {
    const dx = target.x - muzzle.x;
    const dy = target.y - muzzle.y;
    const dz = target.z - muzzle.z;
    const range = Math.hypot(dx, dy, dz);
    if (range < 0.5) return;
    this.launch(muzzle.x, muzzle.y, muzzle.z, dx / range, dy / range, dz / range, range, ENEMY_SPEED);
  }

  playerFired(muzzle: Vec3, direction: Vec3): void {
    this.playerShots = (this.playerShots + 1) % PLAYER_INTERVAL;
    if (this.playerShots !== 0) return;
    this.launch(
      muzzle.x + direction.x * PLAYER_START_OFFSET,
      muzzle.y + direction.y * PLAYER_START_OFFSET,
      muzzle.z + direction.z * PLAYER_START_OFFSET,
      direction.x, direction.y, direction.z, PLAYER_RANGE, PLAYER_SPEED,
    );
  }

  update(dt: number, camera: Vector3): void {
    for (let i = 0; i < CAPACITY; i++) {
      const t = this.tracers[i];
      if (!t.active) continue;
      t.travelled += t.speed * dt;
      // The head stops at the target while the tail catches up, so the streak never overshoots a wall.
      const head = Math.min(t.travelled, t.range);
      const tail = Math.max(0, t.travelled - STREAK_LENGTH);
      if (tail >= t.range) {
        t.active = false;
        this.pool.hide(i);
        continue;
      }
      const length = head - tail;
      const middle = (head + tail) / 2;
      const px = t.sx + t.dx * middle;
      const py = t.sy + t.dy * middle;
      const pz = t.sz + t.dz * middle;
      const vx = camera.x - px;
      const vy = camera.y - py;
      const vz = camera.z - pz;
      let wx = t.dy * vz - t.dz * vy;
      let wy = t.dz * vx - t.dx * vz;
      let wz = t.dx * vy - t.dy * vx;
      const inverse = STREAK_WIDTH / Math.max(1e-5, Math.hypot(wx, wy, wz));
      wx *= inverse;
      wy *= inverse;
      wz *= inverse;
      // Local Y runs along the flight, with the texture's bright end at the head.
      this.pool.write(i, wx, wy, wz, t.dx * length, t.dy * length, t.dz * length, 0, 0, 0, px, py, pz);
    }
    this.pool.flush();
  }

  dispose(): void {
    this.pool.dispose();
    this.material.dispose();
  }

  private launch(x: number, y: number, z: number, dx: number, dy: number, dz: number, range: number, speed: number): void {
    const t = this.tracers[this.next];
    this.next = (this.next + 1) % CAPACITY;
    t.active = true;
    t.sx = x;
    t.sy = y;
    t.sz = z;
    t.dx = dx;
    t.dy = dy;
    t.dz = dz;
    t.travelled = 0;
    t.range = range;
    t.speed = speed;
  }
}
