/** Ties the pure weapon logic to input, the player, hit detection, events and the view model. */
import type {
  FrameInput,
  GameContext,
  IHitTargetProvider,
  IWeaponDirector,
  WeaponSaveState,
} from '../core/contracts';
import { approach, lerp, saturate } from '../core/math';
import type { AbstractMesh } from '../engine/bjs';
import type { Vec3 } from '../core/types';
import { spreadDirection } from '../combat/hitscan';
import type { WorldRaycast } from '../combat/hitscan';
import { resolveShot } from '../combat/resolveShot';
import { MuzzleFlash } from './MuzzleFlash';
import { computeSpread, RecoilModel } from './RecoilModel';
import { ViewModelAnimator } from './ViewModelAnimator';
import { WeaponInventory } from './WeaponInventory';
import type { WeaponState } from './WeaponState';
import { ViewModelMaterials, WeaponViewModel } from './WeaponViewModel';

/** Stops a very long frame from dumping a whole magazine at once. */
const MAX_SHOTS_PER_FRAME = 3;
/** A semi-automatic trigger pull this soon before the weapon is ready still fires. */
const SEMI_BUFFER_SECONDS = 0.09;
/** Speed at which moving costs the full spread penalty. */
const SPREAD_FULL_SPEED = 6;

const easeAds = (t: number): number => t * t * (3 - 2 * t);

export class WeaponSystem implements IWeaponDirector {
  private readonly ctx: GameContext;
  private readonly targets: IHitTargetProvider;
  private readonly inventory = new WeaponInventory();
  private readonly materials: ViewModelMaterials;
  private readonly models: readonly WeaponViewModel[];
  private readonly flash: MuzzleFlash;
  private readonly animator: ViewModelAnimator;
  private readonly recoil: RecoilModel;
  private readonly worldRaycast: WorldRaycast;

  private enabled = true;
  private disposed = false;
  private adsActive = false;
  private adsProgress = 0;
  private spread = 0;
  private sprintLock = 0;
  private semiBuffer = 0;
  private hudDirty = true;

  constructor(ctx: GameContext, targets: IHitTargetProvider) {
    this.ctx = ctx;
    this.targets = targets;
    this.worldRaycast = (from, to) => ctx.world.raycast(from, to);
    this.materials = new ViewModelMaterials(ctx.scene);
    this.models = this.inventory.slots.map(
      (weapon) => new WeaponViewModel(ctx.scene, ctx.camera, weapon.config, this.materials),
    );
    this.flash = new MuzzleFlash(ctx.scene);
    this.animator = new ViewModelAnimator(ctx.player);
    this.recoil = new RecoilModel(this.inventory.active.config.recoil);
    this.spread = this.inventory.active.config.hipSpread;
    this.presentActiveWeapon(true);
    this.emitHud();
    // Sent again on the first update, for a HUD that subscribes after this constructor.
    this.hudDirty = true;
  }

  /** Half-angle of the shot cone right now, radians. For the crosshair. */
  /** Every view model mesh, for the level's light assignment. */
  get lightReceivers(): AbstractMesh[] {
    return this.models.flatMap((model) => model.meshes);
  }

  get currentSpread(): number {
    return this.spread;
  }

  get isAds(): boolean {
    return this.adsActive;
  }

  update(dt: number, input: FrameInput): void {
    if (this.disposed) return;
    this.flash.update();
    if (!this.enabled) return;

    const canAct = this.ctx.player.alive;
    if (canAct) this.handleSwitchInput(input);

    const tick = this.inventory.update(dt);
    if (tick.reloadCompleted) this.finishReload();
    if (tick.swapped) this.onWeaponSwapped();

    const weapon = this.inventory.active;
    this.updateAds(dt, input, canAct, weapon);
    this.updateSprintLock(dt, weapon);
    if (canAct) {
      if (input.reloadPressed) this.beginReload(weapon);
      this.handleFire(dt, input, weapon);
    }

    this.recoil.update(dt);
    this.updateSpread(weapon);
    this.animator.update(dt, input.lookX, input.lookY, this.adsProgress, weapon.mag === 0);

    if (this.hudDirty) this.emitHud();
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.presentActiveWeapon(true);
      this.hudDirty = true;
      return;
    }
    this.cancelActiveReload();
    this.clearAds();
    this.resetPlayerModifiers();
    this.flash.hide();
    for (const model of this.models) model.setVisible(false);
    // update() stops while disabled, so a cancelled reload has to reach the HUD now.
    if (this.hudDirty) this.emitHud();
  }

  addReserveAmmo(fraction: number): boolean {
    const added = this.inventory.addReserveFraction(fraction);
    if (added) this.emitHud();
    return added;
  }

  canTakeAmmo(): boolean {
    return this.inventory.canTakeAmmo();
  }

  getSaveState(): WeaponSaveState {
    return this.inventory.getSaveState();
  }

  restoreSaveState(state: WeaponSaveState): void {
    if (this.disposed) return;
    const previous = this.inventory.active.config.id;
    this.cancelActiveReload();
    this.clearAds();
    this.inventory.restore(state);
    this.recoil.setConfig(this.inventory.active.config.recoil);
    this.sprintLock = 0;
    this.semiBuffer = 0;
    if (this.enabled) {
      this.presentActiveWeapon(false);
    } else {
      this.flash.attach(this.activeModel().muzzle, this.inventory.active.config.view.flashScale);
      this.animator.setWeapon(this.activeModel(), false);
    }
    const current = this.inventory.active.config.id;
    if (current !== previous) this.ctx.bus.emit('weapon:switched', { weaponId: current });
    this.emitHud();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resetPlayerModifiers();
    this.flash.dispose();
    for (const model of this.models) model.dispose();
    this.materials.dispose();
  }

  private activeModel(): WeaponViewModel {
    return this.models[this.inventory.activeIndex];
  }

  /** Shows only the active gun and hands it to the flash and the animator. */
  private presentActiveWeapon(raise: boolean): void {
    const active = this.activeModel();
    for (const model of this.models) model.setVisible(model === active);
    this.flash.attach(active.muzzle, active.config.view.flashScale);
    this.animator.setWeapon(active, raise);
  }

  private handleSwitchInput(input: FrameInput): void {
    const before = this.inventory.active;
    const wasReloading = before.reloading;
    let changed = false;
    if (input.slotPressed !== null) changed = this.inventory.switchToSlot(input.slotPressed);
    else if (input.slotCycle !== 0) changed = this.inventory.cycle(input.slotCycle);
    if (!changed) return;

    if (wasReloading && !before.reloading) this.announceReloadStopped(before);
    if (this.inventory.switching) this.animator.onHolster(before.config.holsterSeconds);
    else this.animator.onRaise(before.config.holsterSeconds);
  }

  private onWeaponSwapped(): void {
    const weapon = this.inventory.active;
    this.recoil.setConfig(weapon.config.recoil);
    this.semiBuffer = 0;
    this.presentActiveWeapon(true);
    this.ctx.bus.emit('weapon:switched', { weaponId: weapon.config.id });
    this.hudDirty = true;
  }

  private updateAds(dt: number, input: FrameInput, canAct: boolean, weapon: WeaponState): void {
    const config = weapon.config;
    const wanted =
      canAct && input.adsHeld && !weapon.reloading && !this.inventory.switching && weapon.phase !== 'equipping';
    if (wanted !== this.adsActive) {
      this.adsActive = wanted;
      this.ctx.bus.emit('weapon:ads', { active: wanted });
    }
    this.adsProgress = approach(this.adsProgress, wanted ? 1 : 0, dt / Math.max(config.adsSeconds, 0.01));

    const player = this.ctx.player;
    const aim = easeAds(this.adsProgress);
    player.setSprintBlocked(wanted);
    player.setFovMultiplier(lerp(1, config.adsFovMultiplier, aim));
    player.setLookMultiplier(lerp(1, this.ctx.settings().controls.adsSensitivity, aim));
    player.setSpeedMultiplier(config.moveSpeedMultiplier * lerp(1, config.adsMoveMultiplier, aim));
  }

  private updateSprintLock(dt: number, weapon: WeaponState): void {
    if (this.ctx.player.sprinting) this.sprintLock = weapon.config.sprintRecoverSeconds;
    else this.sprintLock = Math.max(0, this.sprintLock - dt);
  }

  private updateSpread(weapon: WeaponState): void {
    const player = this.ctx.player;
    const velocity = player.velocity;
    const moveFactor = saturate(Math.hypot(velocity.x, velocity.z) / SPREAD_FULL_SPEED);
    this.spread = computeSpread(
      weapon.config,
      easeAds(this.adsProgress),
      moveFactor,
      !player.grounded,
      player.crouching,
      this.recoil.bloom,
    );
  }

  private beginReload(weapon: WeaponState): boolean {
    if (!weapon.startReload()) return false;
    const duration = weapon.reloadDuration;
    const empty = weapon.reloadIsEmpty;
    this.ctx.bus.emit('weapon:reloadStart', { weaponId: weapon.config.id, duration, empty });
    this.animator.onReloadStart(duration, empty);
    this.hudDirty = true;
    return true;
  }

  private finishReload(): void {
    this.announceReloadStopped(this.inventory.active);
  }

  /** Ends the reload everywhere else. Sent for cancels too, so reloadStart and reloadEnd always pair up. */
  private announceReloadStopped(weapon: WeaponState): void {
    this.ctx.bus.emit('weapon:reloadEnd', { weaponId: weapon.config.id });
    this.animator.onReloadEnd();
    this.hudDirty = true;
  }

  private cancelActiveReload(): void {
    const weapon = this.inventory.active;
    if (weapon.cancelReload()) this.announceReloadStopped(weapon);
  }

  private handleFire(dt: number, input: FrameInput, weapon: WeaponState): void {
    const semi = weapon.config.fireMode === 'semi';
    this.semiBuffer = input.firePressed ? SEMI_BUFFER_SECONDS : Math.max(0, this.semiBuffer - dt);

    if (this.ctx.player.sprinting || this.sprintLock > 0) return;

    const ready = weapon.phase === 'idle' || weapon.phase === 'cooldown';
    if (input.firePressed && weapon.mag === 0 && ready) {
      if (!this.beginReload(weapon)) {
        this.ctx.bus.emit('weapon:dry', { weaponId: weapon.config.id });
        this.animator.onDry();
      }
      return;
    }

    if (semi) {
      if (this.semiBuffer > 0 && weapon.tryFire() === 'fired') {
        this.semiBuffer = 0;
        this.fireShot(weapon);
      }
      return;
    }

    if (!input.fireHeld) return;
    for (let shots = 0; shots < MAX_SHOTS_PER_FRAME && weapon.tryFire() === 'fired'; shots++) {
      this.fireShot(weapon);
    }
  }

  private fireShot(weapon: WeaponState): void {
    const { player, bus } = this.ctx;
    const config = weapon.config;
    const weaponId = config.id;
    const origin: Vec3 = { x: player.eye.x, y: player.eye.y, z: player.eye.z };
    const direction = spreadDirection(player.forward, this.spread, Math.random(), Math.random());

    const muzzleWorld = this.activeModel().muzzleWorld();
    this.flash.fire(muzzleWorld);
    this.animator.onFire();
    bus.emit('weapon:fired', {
      weaponId,
      origin,
      direction,
      muzzle: { x: muzzleWorld.x, y: muzzleWorld.y, z: muzzleWorld.z },
    });

    const kick = this.recoil.shoot(easeAds(this.adsProgress), Math.random);
    player.addRecoil(kick.pitch, kick.yaw);

    resolveShot(bus, config, origin, direction, this.worldRaycast, this.targets);
    this.hudDirty = true;
  }

  /** Leaves aim instantly. Used when the gun is taken away. */
  private clearAds(): void {
    this.adsProgress = 0;
    if (!this.adsActive) return;
    this.adsActive = false;
    this.ctx.bus.emit('weapon:ads', { active: false });
  }

  private resetPlayerModifiers(): void {
    const player = this.ctx.player;
    player.setSprintBlocked(false);
    player.setFovMultiplier(1);
    player.setLookMultiplier(1);
    player.setSpeedMultiplier(1);
  }

  private emitHud(): void {
    this.hudDirty = false;
    const weapon = this.inventory.active;
    const config = weapon.config;
    this.ctx.bus.emit('weapon:hud', {
      weaponId: config.id,
      displayName: config.displayName,
      mag: weapon.mag,
      magSize: config.magSize,
      reserve: weapon.reserve,
      reloading: weapon.reloading,
      fireMode: config.fireMode.toUpperCase(),
      slots: this.inventory.slots.map((slot) => ({
        weaponId: slot.config.id,
        displayName: slot.config.displayName,
        active: slot === weapon,
      })),
    });
  }
}
