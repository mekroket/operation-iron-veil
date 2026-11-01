import { Color4, ParticleSystem, Vector3 } from '../engine/bjs';
import type { BaseTexture, Scene } from '../engine/bjs';
import type { ResolvedGraphics } from '../settings/settings';
import type { FxTextures } from './fxTextures';

interface DriftConfig {
  name: string;
  capacity: number;
  texture: BaseTexture;
  additive: boolean;
  life: readonly [number, number];
  size: readonly [number, number];
  boxMin: Vector3;
  boxMax: Vector3;
  color: Color4;
}

function createDrift(scene: Scene, emitter: Vector3, config: DriftConfig, scale: number): ParticleSystem {
  const capacity = Math.max(4, Math.ceil(config.capacity * scale));
  const system = new ParticleSystem(config.name, capacity, scene);
  system.particleTexture = config.texture;
  system.emitter = emitter;
  system.blendMode = config.additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
  system.updateSpeed = 1 / 60;
  system.minLifeTime = config.life[0];
  system.maxLifeTime = config.life[1];
  system.minSize = config.size[0];
  system.maxSize = config.size[1];
  system.minEmitBox = config.boxMin;
  system.maxEmitBox = config.boxMax;
  // Sea wind from the south-east, with a little lift.
  system.direction1 = new Vector3(-0.7, -0.05, 0.25);
  system.direction2 = new Vector3(-0.25, 0.14, 0.7);
  system.minEmitPower = 0.25;
  system.maxEmitPower = 0.8;
  system.gravity = Vector3.Zero();
  system.color1 = config.color;
  system.color2 = config.color;
  system.colorDead = new Color4(config.color.r, config.color.g, config.color.b, 0);
  // Fade in and out: a particle that pops into view right beside the camera is very noticeable.
  system.addColorGradient(0, new Color4(config.color.r, config.color.g, config.color.b, 0));
  system.addColorGradient(0.25, config.color);
  system.addColorGradient(0.75, config.color);
  system.addColorGradient(1, new Color4(config.color.r, config.color.g, config.color.b, 0));
  system.minAngularSpeed = -0.15;
  system.maxAngularSpeed = 0.15;
  system.minInitialRotation = 0;
  system.maxInitialRotation = Math.PI * 2;
  system.emitRate = capacity / ((config.life[0] + config.life[1]) / 2);
  system.start();
  return system;
}

/** Drifting dust motes and low sea mist around the camera. Particles live in world space, so they stay put as the player walks through them. */
export class AmbientParticles {
  private readonly emitter = Vector3.Zero();
  private readonly dust: ParticleSystem;
  private readonly mist: ParticleSystem;

  constructor(scene: Scene, textures: FxTextures, gfx: ResolvedGraphics) {
    const scale = gfx.particleScale;
    this.dust = createDrift(scene, this.emitter, {
      name: 'iv.ambient.dust', capacity: 110, texture: textures.spark, additive: true,
      life: [5, 10], size: [0.012, 0.035],
      boxMin: new Vector3(-14, -2, -14), boxMax: new Vector3(14, 5, 14),
      color: new Color4(0.6, 0.66, 0.78, 0.2),
    }, scale);
    // Large soft sprites overdraw heavily, so the count stays small.
    this.mist = createDrift(scene, this.emitter, {
      name: 'iv.ambient.mist', capacity: 14, texture: textures.smoke, additive: false,
      life: [9, 16], size: [7, 14],
      boxMin: new Vector3(-34, -3, -34), boxMax: new Vector3(34, 1, 34),
      color: new Color4(0.3, 0.36, 0.43, 0.055),
    }, scale);
  }

  update(cameraPosition: Vector3): void {
    this.emitter.copyFrom(cameraPosition);
  }

  dispose(): void {
    this.dust.dispose(false);
    this.mist.dispose(false);
  }
}
