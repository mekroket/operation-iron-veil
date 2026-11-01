import { Color3, Engine, Material, ParticleSystem, PBRMaterial, Vector3 } from '../engine/bjs';
import type { BaseTexture, Color4, Mesh, Scene } from '../engine/bjs';

/** Unlit additive material. PBR because its unlit path does not clamp, so values above 1 reach the HDR bloom; StandardMaterial saturates. */
export function additiveMaterial(scene: Scene, name: string, texture: BaseTexture, r: number, g: number, b: number): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.unlit = true;
  material.albedoTexture = texture;
  material.albedoColor = new Color3(r, g, b);
  material.useAlphaFromAlbedoTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  material.alphaMode = Engine.ALPHA_ADD;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.fogEnabled = false;
  return material;
}

/**
 * A fixed number of thin instances in one draw call. Unused slots hold a zero matrix, which collapses to nothing, so the
 * instance count never changes and nothing is allocated after construction.
 */
export class ThinPool {
  readonly capacity: number;
  private readonly buffer: Float32Array;
  private dirty = false;

  constructor(
    readonly mesh: Mesh,
    capacity: number,
  ) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Float32Array(this.capacity * 16);
    for (let i = 0; i < this.capacity; i++) this.buffer[i * 16 + 15] = 1;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.doNotSyncBoundingInfo = true;
    mesh.thinInstanceSetBuffer('matrix', this.buffer, 16, false);
  }

  /** Writes a matrix from its three scaled axes and its translation, in Babylon's row layout. */
  write(
    index: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    px: number, py: number, pz: number,
  ): void {
    const m = this.buffer;
    const o = index * 16;
    m[o] = ax;
    m[o + 1] = ay;
    m[o + 2] = az;
    m[o + 4] = bx;
    m[o + 5] = by;
    m[o + 6] = bz;
    m[o + 8] = cx;
    m[o + 9] = cy;
    m[o + 10] = cz;
    m[o + 12] = px;
    m[o + 13] = py;
    m[o + 14] = pz;
    this.dirty = true;
  }

  /** Writes a tumbling object: rotation Y then X, uniform scale. */
  writeTumble(index: number, yaw: number, pitch: number, scale: number, x: number, y: number, z: number): void {
    const cy = Math.cos(yaw) * scale;
    const sy = Math.sin(yaw) * scale;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    this.write(index, cy, 0, -sy, sy * sp, cp * scale, cy * sp, sy * cp, -sp * scale, cy * cp, x, y, z);
  }

  hide(index: number): void {
    this.write(index, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  /** Uploads at most once per frame, and only when something changed. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.thinInstanceBufferUpdated('matrix');
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

export interface BurstConfig {
  name: string;
  capacity: number;
  texture: BaseTexture;
  additive: boolean;
  /** Seconds. */
  life: readonly [number, number];
  /** Metres. Ignored when sizeOverLife is set. */
  size: readonly [number, number];
  /** Metres per second. */
  speed: readonly [number, number];
  /** Metres per second squared, downwards. Negative rises. */
  gravity: number;
  color: Color4;
  color2?: Color4;
  colorDead: Color4;
  /** Absolute start and end size. */
  sizeOverLife?: readonly [number, number];
  /** Speed multiplier reached at the end of life. */
  slowdown?: number;
  /** Stretch along the velocity, for sparks. */
  stretched?: boolean;
  /** Radians per second. */
  spin?: number;
}

interface PendingBurst {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  spread: number;
  jitter: number;
  left: number;
}

const MAX_PENDING = 24;

/**
 * One always-running ParticleSystem serving any number of bursts at different places.
 * A system has a single emitter position, so start functions pull each new particle's position and direction from a
 * queue of pending bursts instead. Firing a rifle for a minute creates no meshes and no systems.
 */
export class BurstEmitter {
  private readonly system: ParticleSystem;
  private readonly pending: PendingBurst[] = [];
  private queued = 0;
  private cursor = 0;
  private lastParticle: unknown = null;

  constructor(
    scene: Scene,
    config: BurstConfig,
    private readonly scale: number,
  ) {
    for (let i = 0; i < MAX_PENDING; i++) this.pending.push({ x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, spread: 1, jitter: 0, left: 0 });

    const system = new ParticleSystem(config.name, Math.max(4, Math.ceil(config.capacity * scale)), scene);
    system.particleTexture = config.texture;
    system.emitter = Vector3.Zero();
    system.blendMode = config.additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    // Makes Babylon's particle clock run in seconds at the 60 fps reference of its animation ratio.
    system.updateSpeed = 1 / 60;
    system.emitRate = 0;
    system.manualEmitCount = 0;
    system.minLifeTime = config.life[0];
    system.maxLifeTime = config.life[1];
    system.minSize = config.size[0];
    system.maxSize = config.size[1];
    system.minEmitPower = config.speed[0];
    system.maxEmitPower = config.speed[1];
    system.gravity = new Vector3(0, -config.gravity, 0);
    system.color1 = config.color;
    system.color2 = config.color2 ?? config.color;
    system.colorDead = config.colorDead;
    if (config.sizeOverLife) {
      const [start, end] = config.sizeOverLife;
      system.addSizeGradient(0, start, start * 1.3);
      system.addSizeGradient(1, end, end * 1.3);
    }
    if (config.slowdown !== undefined) {
      system.addVelocityGradient(0, 1);
      system.addVelocityGradient(1, config.slowdown);
    }
    if (config.stretched) {
      system.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      system.minScaleX = 0.35;
      system.maxScaleX = 0.5;
      system.minScaleY = 1.5;
      system.maxScaleY = 3;
    }
    if (config.spin) {
      system.minAngularSpeed = -config.spin;
      system.maxAngularSpeed = config.spin;
      system.minInitialRotation = 0;
      system.maxInitialRotation = Math.PI * 2;
    }
    system.startPositionFunction = (_world, position, particle) => {
      const burst = this.burstFor(particle);
      const j = burst.jitter;
      position.set(burst.x + (Math.random() - 0.5) * j, burst.y + (Math.random() - 0.5) * j, burst.z + (Math.random() - 0.5) * j);
    };
    system.startDirectionFunction = (_world, direction, particle) => {
      const burst = this.burstFor(particle);
      const s = burst.spread * 2;
      direction.set(burst.nx + (Math.random() - 0.5) * s, burst.ny + (Math.random() - 0.5) * s, burst.nz + (Math.random() - 0.5) * s);
      direction.normalize();
    };
    system.start();
    this.system = system;
  }

  /**
   * Queues particles for the next animation step.
   * @param spread 0 is a straight jet along the normal, 1 roughly a hemisphere
   * @param jitter edge length of the cube the particles start in
   */
  emit(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, spread: number, jitter = 0): void {
    // A count of 0 means the system consumed everything queued before, or dropped what exceeded its capacity.
    if (this.system.manualEmitCount <= 0) {
      this.queued = 0;
      this.cursor = 0;
    }
    if (this.queued >= MAX_PENDING) return;
    const scaled = Math.max(1, Math.round(count * this.scale));
    const burst = this.pending[this.queued++];
    burst.x = x;
    burst.y = y;
    burst.z = z;
    burst.nx = nx;
    burst.ny = ny;
    burst.nz = nz;
    burst.spread = spread;
    burst.jitter = jitter;
    burst.left = scaled;
    this.system.manualEmitCount = Math.max(0, this.system.manualEmitCount) + scaled;
  }

  /** Both start functions run per particle, so advance only on a new particle. That also works whichever runs first. */
  private burstFor(particle: unknown): PendingBurst {
    if (particle !== this.lastParticle) {
      this.lastParticle = particle;
      while (this.cursor < this.queued - 1 && this.pending[this.cursor].left <= 0) this.cursor++;
      this.pending[this.cursor].left--;
    }
    return this.pending[this.cursor];
  }

  dispose(): void {
    // false: the texture is shared with other effects.
    this.system.dispose(false);
  }
}
