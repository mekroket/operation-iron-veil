/** Code-driven first-person animation. Every pose is computed from scalars each frame and allocates nothing. */
import type { IPlayerView } from '../core/contracts';
import { approach, clamp, damp, lerp, saturate } from '../core/math';
import type { WeaponConfig } from './weaponConfigs';
import type { WeaponViewModel } from './WeaponViewModel';

const smooth = (t: number): number => {
  const x = saturate(t);
  return x * x * (3 - 2 * x);
};
const between = (t: number, from: number, to: number): number => smooth((t - from) / (to - from));

/** A critically damped spring, for kicks that snap out and settle without ringing. */
class Spring {
  x = 0;
  private v = 0;
  /** Peak displacement of a critically damped spring is v0 / (omega * e). */
  private static readonly OMEGA = 16;
  private static readonly PEAK_TO_VELOCITY = Spring.OMEGA * Math.E;

  /** Kicks the spring so it peaks near `amount`. */
  impulse(amount: number): void {
    this.v += amount * Spring.PEAK_TO_VELOCITY;
  }
  step(dt: number): void {
    const omega = Spring.OMEGA;
    this.v += (-omega * omega * this.x - 2 * omega * this.v) * dt;
    this.x += this.v * dt;
  }
  reset(): void {
    this.x = 0;
    this.v = 0;
  }
}

/** Reload timeline, as fractions of the reload's duration. */
const R = {
  grabEnd: 0.14,
  pullEnd: 0.3,
  stowEnd: 0.4,
  fetchEnd: 0.5,
  seatEnd: 0.72,
  boltCloseStart: 0.78,
  boltCloseEnd: 0.84,
  handBackEnd: 0.9,
} as const;

/** Far-off hand position while fetching a fresh magazine. */
const HAND_AWAY = { x: -0.07, y: -0.3, z: -0.16 } as const;

export class ViewModelAnimator {
  private model: WeaponViewModel | null = null;
  private config: WeaponConfig | null = null;

  private time = 0;
  private bobPhase = 0;
  private moveWeight = 0;
  private sprintWeight = 0;
  private lagX = 0;
  private lagY = 0;
  private airLift = 0;
  private wasGrounded = true;

  private readonly kickBack = new Spring();
  private readonly kickPitch = new Spring();
  private readonly kickRoll = new Spring();
  private readonly landDip = new Spring();

  private boltCycle = 1;

  /** 0 fully lowered, 1 fully raised. */
  private raised = 1;
  private raiseTarget = 1;
  private raiseRate = 1;

  private reloading = false;
  private reloadT = 0;
  private reloadRate = 1;
  private reloadEmpty = false;
  private reloadWeight = 0;
  private seatedThisReload = false;
  private boltClosedThisReload = false;

  constructor(private readonly player: IPlayerView) {}

  /** Switches to this gun. `raise` plays the raise from fully lowered; otherwise it appears ready at once. */
  setWeapon(model: WeaponViewModel, raise: boolean): void {
    this.model = model;
    this.config = model.config;
    this.reloading = false;
    this.reloadWeight = 0;
    this.boltCycle = 1;
    this.kickBack.reset();
    this.kickPitch.reset();
    this.kickRoll.reset();
    this.resetParts(model);
    this.raiseTarget = 1;
    this.raiseRate = 1 / Math.max(model.config.equipSeconds, 0.01);
    this.raised = raise ? 0 : 1;
  }

  onFire(): void {
    const c = this.config;
    if (!c) return;
    this.kickBack.impulse(c.view.kickBack);
    this.kickPitch.impulse(c.view.kickPitch);
    this.kickRoll.impulse((Math.random() * 2 - 1) * c.view.kickRollRandom);
    this.boltCycle = 0;
  }

  /** The trigger clicks on nothing. */
  onDry(): void {
    this.kickPitch.impulse(-0.006);
    this.kickBack.impulse(-0.002);
  }

  onReloadStart(duration: number, empty: boolean): void {
    this.reloading = true;
    this.reloadT = 0;
    this.reloadRate = 1 / Math.max(duration, 0.01);
    this.reloadEmpty = empty;
    this.seatedThisReload = false;
    this.boltClosedThisReload = false;
  }

  /** The reload finished or was cancelled. */
  onReloadEnd(): void {
    this.reloading = false;
  }

  onHolster(seconds: number): void {
    this.raiseTarget = 0;
    this.raiseRate = 1 / Math.max(seconds, 0.01);
  }

  onRaise(seconds: number): void {
    this.raiseTarget = 1;
    this.raiseRate = 1 / Math.max(seconds, 0.01);
  }

  /**
   * @param lookX Pointer movement this frame.
   * @param lookY Pointer movement this frame.
   * @param ads 0 at the hip, 1 fully aimed.
   * @param magEmpty The chamber is dry, so the bolt or slide stays locked back.
   */
  update(dt: number, lookX: number, lookY: number, ads: number, magEmpty: boolean): void {
    const model = this.model;
    const config = this.config;
    if (!model || !config) return;
    const step = Math.min(dt, 1 / 30);
    const v = config.view;
    const aim = smooth(ads);
    const steady = 1 - aim * 0.86;

    this.time += dt;
    this.updateMotionState(dt, step, lookX, lookY, v.swayScale);
    this.raised = approach(this.raised, this.raiseTarget, this.raiseRate * dt);
    this.updateReloadClock(dt);

    const bobX = Math.sin(this.bobPhase) * lerp(0.0055, 0.015, this.sprintWeight) * this.moveWeight;
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * lerp(0.0048, 0.012, this.sprintWeight) * this.moveWeight;
    const breath = Math.sin(this.time * 1.4);
    const drift = Math.sin(this.time * 0.73);

    const sprint = this.sprintWeight * (1 - aim) * (this.reloading ? 0.4 : 1);
    const lower = 1 - smooth(this.raised);
    const reload = this.reloadWeight;
    const kickScale = lerp(1, 0.42, aim);

    model.root.position.set(
      lerp(v.hipOffset.x, v.adsOffset.x, aim) +
        v.sprintOffset.x * sprint +
        (bobX + this.lagX * 0.3) * steady +
        drift * 0.0009 * steady -
        0.026 * reload,
      lerp(v.hipOffset.y, v.adsOffset.y, aim) +
        v.sprintOffset.y * sprint +
        bobY * steady +
        (this.lagY * 0.22 + this.airLift + this.landDip.x) * steady +
        breath * 0.0015 * steady -
        lower * 0.26 -
        0.018 * reload,
      lerp(v.hipOffset.z, v.adsOffset.z, aim) +
        v.sprintOffset.z * sprint -
        this.kickBack.x * kickScale -
        lower * 0.06 -
        0.02 * reload,
    );
    model.root.rotation.set(
      v.sprintRotation.x * sprint +
        lower * 0.85 -
        this.kickPitch.x * kickScale +
        this.lagY * steady +
        Math.sin(this.time * 1.4 + 0.6) * 0.0024 * steady +
        Math.abs(Math.cos(this.bobPhase)) * 0.006 * this.moveWeight * steady -
        0.17 * reload,
      v.sprintRotation.y * sprint + this.lagX * steady + drift * 0.002 * steady + bobX * 0.5 * steady,
      v.sprintRotation.z * sprint +
        lower * 0.24 +
        this.kickRoll.x * kickScale +
        (this.lagX * 0.6 + bobX * 0.9) * steady +
        v.reloadRoll * reload,
    );

    this.applyBolt(model, magEmpty, config.view.boltCycleSeconds, dt);
    this.applyReloadParts(model);
  }

  private updateMotionState(dt: number, step: number, lookX: number, lookY: number, swayScale: number): void {
    const velocity = this.player.velocity;
    const speed = Math.hypot(velocity.x, velocity.z);
    const grounded = this.player.grounded;
    this.moveWeight = damp(this.moveWeight, grounded ? saturate(speed / 4.4) : 0, 10, dt);
    this.sprintWeight = damp(this.sprintWeight, this.player.sprinting ? 1 : 0, 11, dt);
    this.bobPhase += dt * lerp(5.8, 9.6, saturate(speed / 7));

    // Pointer deltas are per frame: convert to per second so sway does not depend on frame rate.
    const invDt = 1 / Math.max(dt, 1 / 240);
    const swayX = clamp(-lookX * invDt * 0.000022 * swayScale, -0.075, 0.075);
    const swayY = clamp(-lookY * invDt * 0.000022 * swayScale, -0.05, 0.05);
    this.lagX = damp(this.lagX, swayX, 11, dt);
    this.lagY = damp(this.lagY, swayY, 11, dt);

    this.airLift = damp(this.airLift, clamp(-velocity.y * 0.0024, -0.012, 0.018), 8, dt);
    if (grounded && !this.wasGrounded) this.landDip.impulse(-0.016);
    this.wasGrounded = grounded;

    this.kickBack.step(step);
    this.kickPitch.step(step);
    this.kickRoll.step(step);
    this.landDip.step(step);
  }

  private updateReloadClock(dt: number): void {
    if (!this.reloading) {
      this.reloadWeight = damp(this.reloadWeight, 0, 12, dt);
      return;
    }
    this.reloadWeight = damp(this.reloadWeight, 1, 12, dt);
    this.reloadT = saturate(this.reloadT + this.reloadRate * dt);
    if (!this.seatedThisReload && this.reloadT >= R.seatEnd) {
      this.seatedThisReload = true;
      // The magazine slams home and shoves the gun.
      this.kickPitch.impulse(-0.03);
      this.kickBack.impulse(-0.006);
    }
    if (this.reloadEmpty && !this.boltClosedThisReload && this.reloadT >= R.boltCloseEnd) {
      this.boltClosedThisReload = true;
      this.kickBack.impulse(0.005);
      this.kickPitch.impulse(0.01);
    }
  }

  private applyBolt(model: WeaponViewModel, magEmpty: boolean, cycleSeconds: number, dt: number): void {
    this.boltCycle = saturate(this.boltCycle + dt / Math.max(cycleSeconds, 0.001));
    const c = this.boltCycle;
    let open = c < 0.35 ? c / 0.35 : 1 - smooth((c - 0.35) / 0.65);
    if (magEmpty && c >= 0.35) open = 1;
    if (this.reloading && this.reloadEmpty) {
      // Locked back until the fresh magazine is in, then released.
      open = 1 - between(this.reloadT, R.boltCloseStart, R.boltCloseEnd);
    }
    model.bolt.position.z = -open * model.config.view.boltTravel;
  }

  /** Moves the magazine and the left hand through the reload timeline. */
  private applyReloadParts(model: WeaponViewModel): void {
    const mag = model.magazine;
    const hand = model.leftArm;
    if (!this.reloading && this.reloadWeight < 0.01) {
      this.resetParts(model);
      return;
    }

    const t = this.reloading ? this.reloadT : 1;
    let onMag = 0;
    let withMag = 0;
    let away = 0;
    if (t < R.grabEnd) {
      onMag = smooth(t / R.grabEnd);
    } else if (t < R.pullEnd) {
      onMag = 1;
      withMag = between(t, R.grabEnd, R.pullEnd);
    } else if (t < R.stowEnd) {
      const s = between(t, R.pullEnd, R.stowEnd);
      onMag = 1 - s;
      withMag = 1 - s;
      away = s;
    } else if (t < R.fetchEnd) {
      const s = between(t, R.stowEnd, R.fetchEnd);
      onMag = s;
      withMag = s;
      away = 1 - s;
    } else if (t < R.seatEnd) {
      onMag = 1;
      withMag = 1 - between(t, R.fetchEnd, R.seatEnd);
    } else if (t < R.handBackEnd) {
      onMag = 1 - between(t, R.seatEnd, R.handBackEnd);
    }

    const weight = saturate(this.reloadWeight * 1.4);
    const toMag = model.leftHandToMag;
    const out = model.magOut;
    hand.position.set(
      (toMag.x * onMag + out.x * withMag + HAND_AWAY.x * away) * weight,
      (toMag.y * onMag + out.y * withMag + HAND_AWAY.y * away) * weight,
      (toMag.z * onMag + out.z * withMag + HAND_AWAY.z * away) * weight,
    );

    if (!this.reloading) {
      this.resetMagazine(model);
      return;
    }
    if (t < R.grabEnd) {
      this.resetMagazine(model);
    } else if (t < R.pullEnd) {
      const s = between(t, R.grabEnd, R.pullEnd);
      mag.isVisible = true;
      mag.position.set(out.x * s, out.y * s, out.z * s);
      mag.rotation.x = 0;
    } else if (t < R.stowEnd) {
      // Dropped: it falls away and tumbles until it leaves the shot.
      const s = (t - R.pullEnd) / (R.stowEnd - R.pullEnd);
      mag.isVisible = true;
      mag.position.set(out.x, out.y - s * s * 0.42, out.z);
      mag.rotation.x = s * 0.9;
    } else if (t < R.fetchEnd) {
      mag.isVisible = false;
    } else if (t < R.seatEnd) {
      const s = 1 - between(t, R.fetchEnd, R.seatEnd);
      mag.isVisible = true;
      mag.position.set(out.x * s, out.y * s, out.z * s);
      mag.rotation.x = s * 0.22;
    } else {
      this.resetMagazine(model);
    }
  }

  private resetMagazine(model: WeaponViewModel): void {
    model.magazine.isVisible = true;
    model.magazine.position.setAll(0);
    model.magazine.rotation.x = 0;
  }

  private resetParts(model: WeaponViewModel): void {
    this.resetMagazine(model);
    model.leftArm.position.setAll(0);
  }
}
