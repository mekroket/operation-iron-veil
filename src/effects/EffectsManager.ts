import type { Scene, Vector3 } from '../engine/bjs';
import type { EventBus } from '../core/events';
import type { ResolvedGraphics } from '../settings/settings';
import { AmbientParticles } from './AmbientParticles';
import { EnemyMuzzle } from './EnemyMuzzle';
import { Explosion } from './Explosion';
import { FxTextures } from './fxTextures';
import { ImpactEffects } from './ImpactEffects';
import { Shells } from './Shells';
import { Tracers } from './Tracers';

/** Turns gameplay events into visuals. Everything is created here up front and pooled, so firing allocates no meshes. */
export class EffectsManager {
  private readonly textures: FxTextures;
  private readonly impacts: ImpactEffects;
  private readonly tracers: Tracers;
  private readonly muzzle: EnemyMuzzle;
  private readonly shells: Shells;
  private readonly explosion: Explosion;
  private readonly ambient: AmbientParticles;
  private readonly subscriptions: (() => void)[];

  constructor(scene: Scene, bus: EventBus, gfx: ResolvedGraphics) {
    this.textures = new FxTextures(scene);
    this.impacts = new ImpactEffects(scene, this.textures, gfx);
    this.tracers = new Tracers(scene, this.textures);
    this.muzzle = new EnemyMuzzle(scene, this.textures);
    this.shells = new Shells(scene);
    this.explosion = new Explosion(scene, this.textures, gfx);
    this.ambient = new AmbientParticles(scene, this.textures, gfx);

    this.subscriptions = [
      bus.on('combat:impact', ({ point, normal, surface }) => this.impacts.impact(point, normal, surface)),
      bus.on('weapon:fired', ({ origin, direction, muzzle }) => {
        this.tracers.playerFired(muzzle, direction);
        this.shells.fired(origin, muzzle, direction);
      }),
      bus.on('enemy:fired', ({ muzzle, target }) => {
        this.tracers.enemyFired(muzzle, target);
        this.muzzle.fired(muzzle);
      }),
      bus.on('fx:explosion', ({ position, radius }) => this.explosion.explode(position, radius)),
    ];
  }

  update(dt: number, cameraPosition: Vector3): void {
    this.impacts.update();
    this.tracers.update(dt, cameraPosition);
    this.muzzle.update(dt);
    this.shells.update(dt);
    this.explosion.update(dt);
    this.ambient.update(cameraPosition);
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.length = 0;
    this.impacts.dispose();
    this.tracers.dispose();
    this.muzzle.dispose();
    this.shells.dispose();
    this.explosion.dispose();
    this.ambient.dispose();
    this.textures.dispose();
  }
}
