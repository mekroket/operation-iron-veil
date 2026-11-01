/** Maps game events to sound. The only link between gameplay and audio; silently does nothing while audio is unavailable. */
import type { EventBus, GameEventName, GameEvents } from '../core/events';
import { add, clamp, distance, dot, lerp, saturate, scale, sub } from '../core/math';
import type { Vec3, WeaponId } from '../core/types';
import { AmbienceLayer } from './AmbienceLayer';
import type { AudioEngine } from './AudioEngine';
import { Heartbeat, ReloadSequence } from './playerSequences';
import { RadioChannel } from './RadioChannel';

const jitter = (center: number, amount: number): number => center * (1 + (Math.random() * 2 - 1) * amount);

const GUN_MIX: Readonly<Record<WeaponId, { crack: number; thump: number; lowpass: number; send: number }>> = {
  assaultRifle: { crack: 0.85, thump: 0.62, lowpass: 15000, send: 0.3 },
  smg: { crack: 0.66, thump: 0.36, lowpass: 16000, send: 0.2 },
  handgun: { crack: 0.74, thump: 0.42, lowpass: 12000, send: 0.24 },
};

const PACE_MIX = {
  crouch: { gain: 0.15, lowpass: 1900, rate: 0.96 },
  walk: { gain: 0.4, lowpass: 7500, rate: 1 },
  sprint: { gain: 0.72, lowpass: 17000, rate: 1.05 },
} as const;

const NEAR_MISS_METRES = 3.5;
const SPEED_OF_SOUND = 343;

export class AudioDirector {
  private readonly ambience: AmbienceLayer;
  private readonly radio: RadioChannel;
  private readonly reload: ReloadSequence;
  private readonly heart: Heartbeat;
  private readonly unsubscribers: (() => void)[] = [];
  private readonly listener: Vec3 = { x: 0, y: 0, z: 0 };
  private disposed = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly bus: EventBus,
  ) {
    this.ambience = new AmbienceLayer(engine);
    this.radio = new RadioChannel(engine);
    this.reload = new ReloadSequence(engine);
    this.heart = new Heartbeat(engine);
    this.bindWeapons();
    this.bindCombat();
    this.bindPlayer();
    this.bindWorld();
  }

  setListener(position: Vec3, forward: Vec3): void {
    if (this.disposed) return;
    this.listener.x = position.x;
    this.listener.y = position.y;
    this.listener.z = position.z;
    try {
      this.engine.setListenerPose(position, forward);
    } catch {
      // Listener placement is best effort.
    }
  }

  setAmbience(mode: 'menu' | 'mission' | 'none'): void {
    if (!this.disposed) this.ambience.setMode(mode);
  }

  /** 0 = outdoors, 1 = inside a building: crossfades ambience and reverb. */
  setInterior(amount: number): void {
    if (this.disposed) return;
    this.engine.setInterior(amount);
    this.ambience.setInterior(amount);
  }

  update(dt: number): void {
    if (this.disposed) return;
    try {
      this.ambience.update(dt);
      this.heart.update();
    } catch {
      // Audio must never interrupt the frame.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.reload.stop(true);
    this.heart.stop();
    this.radio.cut();
    this.ambience.dispose();
  }

  private listen<K extends GameEventName>(name: K, handler: (payload: GameEvents[K]) => void): void {
    this.unsubscribers.push(
      this.bus.on(name, (payload) => {
        try {
          handler(payload);
        } catch {
          // A sound failing must not stop the other listeners of this event.
        }
      }),
    );
  }

  private bindWeapons(): void {
    const engine = this.engine;
    this.listen('weapon:fired', (e) => {
      this.reload.stop(false);
      const mix = GUN_MIX[e.weaponId];
      const key = `gun.${e.weaponId}`;
      engine.play(`${key}.crack`, {
        gain: jitter(mix.crack, 0.06),
        rate: jitter(1, 0.035),
        lowpass: jitter(mix.lowpass, 0.14),
        send: mix.send,
        priority: 2,
        keyLimit: 5,
      });
      engine.play(`${key}.thump`, { gain: jitter(mix.thump, 0.08), rate: jitter(1, 0.05), priority: 2, keyLimit: 3 });
    });
    this.listen('weapon:dry', () => {
      engine.play('wpn.dry', { gain: 0.55, rate: jitter(1, 0.03), priority: 2, minGap: 0.05 });
    });
    this.listen('weapon:reloadStart', (e) => this.reload.start(e.duration, e.empty, e.weaponId));
    this.listen('weapon:reloadEnd', () => this.reload.stop(false));
    this.listen('weapon:switched', () => {
      this.reload.stop(true);
      engine.play('wpn.switch', { gain: 0.5, rate: jitter(1, 0.04), send: 0.03, priority: 2, keyLimit: 2 });
    });
    this.listen('weapon:ads', (e) => {
      engine.play('wpn.ads', { gain: e.active ? 0.3 : 0.2, rate: jitter(e.active ? 1.06 : 0.94, 0.04), minGap: 0.06 });
    });
  }

  private bindCombat(): void {
    const engine = this.engine;
    this.listen('combat:impact', (e) => {
      if (distance(e.point, this.listener) > 110) return;
      engine.play(`impact.${e.surface}`, {
        position: e.point,
        refDistance: 4,
        gain: jitter(0.6, 0.12),
        rate: jitter(1, 0.07),
        send: 0.08,
        keyLimit: 4,
        minGap: 0.012,
      });
    });
    this.listen('combat:enemyHit', (e) => {
      engine.play('body.hit', { position: e.point, refDistance: 5, gain: jitter(0.5, 0.15), rate: jitter(1, 0.08), keyLimit: 3, minGap: 0.02 });
      const tick = e.killed ? 'hit.kill' : e.zone === 'head' ? 'hit.head' : 'hit.tick';
      engine.play(tick, { gain: e.killed ? 0.32 : 0.2, priority: 3, keyLimit: 2 });
    });
    this.listen('enemy:fired', (e) => this.playEnemyShot(e));
    this.listen('enemy:callout', (e) => {
      const away = distance(e.position, this.listener);
      engine.play(`callout.${e.kind}`, {
        bus: 'voice',
        position: e.position,
        refDistance: 6,
        hrtf: away < 50,
        gain: jitter(0.62, 0.08),
        rate: jitter(1, 0.05),
        lowpass: clamp(9000 * Math.exp(-away / 45), 900, 9000),
        send: 0.1,
        keyLimit: 3,
      });
    });
  }

  private playEnemyShot(e: GameEvents['enemy:fired']): void {
    const away = distance(e.muzzle, this.listener);
    this.engine.play('enemy.shot', {
      position: e.muzzle,
      refDistance: 9,
      rolloff: 0.9,
      hrtf: away < 60,
      gain: 0.9,
      rate: jitter(1, 0.04),
      lowpass: clamp(16000 * Math.exp(-away / 40), 650, 16000),
      send: 0.26 / (1 + away / 60),
      when: Math.min(0.28, away / SPEED_OF_SOUND),
      keyLimit: 8,
    });

    // The crack arrives ahead of the report: it comes from the round, not the muzzle.
    const path = sub(e.target, e.muzzle);
    const pathLengthSq = dot(path, path);
    const along = pathLengthSq > 1e-6 ? saturate(dot(sub(this.listener, e.muzzle), path) / pathLengthSq) : 0;
    const nearest = add(e.muzzle, scale(path, along));
    const miss = distance(nearest, this.listener);
    if (e.hitPlayer || miss < NEAR_MISS_METRES) {
      this.engine.play('bullet.crack', {
        position: nearest,
        refDistance: 3,
        gain: e.hitPlayer ? 0.75 : lerp(0.75, 0.32, saturate(miss / NEAR_MISS_METRES)),
        rate: jitter(1, 0.08),
        priority: 2,
        keyLimit: 3,
        minGap: 0.025,
      });
    }
  }

  private bindPlayer(): void {
    const engine = this.engine;
    this.listen('player:damaged', (e) => {
      const severity = saturate((e.amount / Math.max(1, e.maxHealth)) * 3);
      engine.play('player.thud', { gain: lerp(0.5, 1, severity), rate: jitter(1, 0.06), priority: 3, keyLimit: 2, minGap: 0.05 });
      engine.play('player.breath', { bus: 'voice', gain: lerp(0.26, 0.48, severity), rate: jitter(1, 0.06), priority: 2, keyLimit: 1, minGap: 1.4 });
      this.heart.setHealth(e.health, e.maxHealth);
    });
    this.listen('player:healed', (e) => {
      engine.play('medic.rustle', { gain: 0.5, rate: jitter(1, 0.04), priority: 2 });
      this.heart.setHealth(e.health, e.maxHealth);
    });
    this.listen('player:died', () => {
      this.reload.stop(true);
      this.heart.setHealth(0, 1);
    });
    this.listen('player:footstep', (e) => {
      const pace = PACE_MIX[e.pace];
      const surface = e.surface === 'flesh' ? 'concrete' : e.surface;
      engine.play(`step.${surface}`, {
        gain: jitter(pace.gain, 0.12),
        rate: jitter(pace.rate, 0.05),
        lowpass: pace.lowpass,
        send: e.pace === 'crouch' ? 0 : 0.03,
        keyLimit: 3,
      });
    });
    this.listen('player:jumped', () => {
      engine.play('player.jump', { gain: 0.34, rate: jitter(1, 0.05), minGap: 0.1 });
    });
    this.listen('player:landed', (e) => {
      const force = saturate((e.impactSpeed - 1.5) / 9);
      engine.play('player.land', {
        gain: lerp(0.22, 1, force),
        rate: lerp(1.1, 0.9, force),
        lowpass: lerp(2400, 15000, force),
        send: force * 0.06,
        priority: 2,
        minGap: 0.08,
      });
    });
    this.listen('pickup:collected', (e) => {
      if (e.kind === 'ammo') engine.play('pickup.ammo', { gain: 0.5, rate: jitter(1, 0.04), priority: 2 });
      else engine.play('pickup.medkit', { gain: 0.5, priority: 2 });
    });
  }

  private bindWorld(): void {
    const engine = this.engine;
    this.listen('door:moved', (e) => {
      engine.play('door.roller', { position: e.position, refDistance: 7, gain: 0.7, rate: e.opening ? 1 : 0.93, send: 0.18, keyLimit: 3 });
    });
    this.listen('mission:radio', (e) => this.radio.play(e.duration));
    this.listen('mission:objective', () => {
      engine.play('tone.objective', { bus: 'ui', gain: 0.42, priority: 3, minGap: 0.2 });
    });
    this.listen('mission:checkpoint', () => {
      engine.play('tone.checkpoint', { bus: 'ui', gain: 0.26, priority: 3, minGap: 0.2 });
    });
    this.listen('mission:complete', () => {
      engine.play('tone.complete', { bus: 'ui', gain: 0.6, priority: 3 });
    });
    this.listen('mission:failed', () => {
      engine.play('tone.failed', { bus: 'ui', gain: 0.55, priority: 3 });
    });
    this.listen('fx:explosion', (e) => {
      const away = distance(e.position, this.listener);
      const delay = Math.min(0.3, away / SPEED_OF_SOUND);
      const refDistance = Math.max(12, (Number.isFinite(e.radius) ? e.radius : 6) * 2);
      const shared = { position: e.position, refDistance, rolloff: 0.8, lowpass: clamp(17000 * Math.exp(-away / 70), 500, 17000), priority: 3 };
      engine.play('fx.boom', { ...shared, gain: 1, rate: jitter(1, 0.06), send: 0.45, when: delay, keyLimit: 3 });
      engine.play('fx.debris', { ...shared, gain: 0.55, rate: jitter(1, 0.08), send: 0.12, when: delay + 0.16, keyLimit: 3 });
      engine.duckAmbience(0.16, 1, 1.5);
    });
    this.listen('ui:hover', () => {
      engine.play('ui.hover', { bus: 'ui', gain: 0.1, priority: 3, keyLimit: 2, minGap: 0.03 });
    });
    this.listen('ui:click', () => {
      engine.play('ui.click', { bus: 'ui', gain: 0.22, priority: 3, keyLimit: 2, minGap: 0.03 });
    });
  }
}
