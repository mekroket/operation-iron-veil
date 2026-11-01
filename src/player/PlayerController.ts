import type { FrameInput, ICharacterBody, IPhysicsWorld, IPlayerControl } from '../core/contracts';
import type { EventBus } from '../core/events';
import { clamp, damp, lerp } from '../core/math';
import type { Vec3 } from '../core/types';
import type { FreeCamera } from '../engine/bjs';
import type { GameSettings } from '../settings/settings';
import { createMovementState, PlayerHealth, stepMovement } from './MovementModel';
import { PLAYER_CONFIG as C } from './playerConfig';

/** Capsule-based first-person controller: owns the camera transform while the player has control. */
export class PlayerController implements IPlayerControl {
  readonly velocity: Vec3 = { x: 0, y: 0, z: 0 };
  readonly eye: Vec3 = { x: 0, y: 0, z: 0 };
  readonly forward: Vec3 = { x: 0, y: 0, z: 1 };
  readonly maxHealth = C.maxHealth;

  private readonly body: ICharacterBody;
  private readonly move = createMovementState();
  private readonly vitals = new PlayerHealth();
  private yaw = 0;
  private pitch = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private recoilPitchTarget = 0;
  private recoilYawTarget = 0;
  private fovMultiplier = 1;
  private lookMultiplier = 1;
  private speedMultiplier = 1;
  private sprintBlocked = false;
  private eyeHeight: number = C.standEye;
  private currentFov = 0;
  private strideLeft = 0;
  private bobTime = 0;
  private bobAmount = 0;
  private roll = 0;
  private shake = 0;
  private landDip = 0;
  private wasGrounded = true;
  private fallSpeed = 0;
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    world: IPhysicsWorld,
    private readonly camera: FreeCamera,
    private readonly bus: EventBus,
    private readonly settings: () => GameSettings,
    start: { position: Vec3; yaw: number },
  ) {
    this.body = world.createCharacter(start.position, C.standHeight, C.radius);
    this.yaw = start.yaw;
    this.currentFov = this.targetFov();
    this.unsubscribe.push(
      bus.on('fx:explosion', ({ position, radius }) => {
        const d = Math.hypot(position.x - this.position.x, position.z - this.position.z);
        this.shake = Math.max(this.shake, clamp(1.2 - d / (radius * 6), 0, 1));
      }),
    );
    this.syncCamera(0);
  }

  get position(): Vec3 {
    return this.body.position;
  }
  get grounded(): boolean {
    return this.body.grounded;
  }
  get crouching(): boolean {
    return this.move.crouching;
  }
  get sprinting(): boolean {
    return this.move.sprinting;
  }
  get alive(): boolean {
    return this.vitals.alive;
  }
  get health(): number {
    return this.vitals.health;
  }
  get lookYaw(): number {
    return this.yaw;
  }

  /** Runs one frame of player simulation. Pass null while the player has no control: physics keeps running. */
  update(dt: number, input: FrameInput | null): void {
    if (this.alive && input) this.applyLook(input);
    if (input && input.crouchPressed && this.alive) this.toggleCrouch();

    const launch = stepMovement(
      this.move,
      {
        moveX: this.alive && input ? input.moveX : 0,
        moveZ: this.alive && input ? input.moveZ : 0,
        sprintHeld: input ? input.sprintHeld : false,
        sprintBlocked: this.sprintBlocked,
        jumpPressed: this.alive && input ? input.jumpPressed : false,
        yaw: this.yaw,
        grounded: this.body.grounded,
        speedMultiplier: this.speedMultiplier,
      },
      dt,
    );
    this.body.setHeight(this.move.crouching ? C.crouchHeight : C.standHeight);

    this.velocity.x = this.move.velX;
    this.velocity.z = this.move.velZ;
    this.body.move(dt, this.velocity, launch);
    this.velocity.y = this.body.verticalSpeed;

    if (launch > 0) this.bus.emit('player:jumped', {});
    this.detectLanding();
    this.updateFootsteps(dt);
    this.vitals.update(dt);
    this.syncCamera(dt);
  }

  takeDamage(amount: number, sourcePosition: Vec3 | null): void {
    const dealt = this.vitals.takeDamage(amount);
    if (dealt <= 0) return;
    this.shake = Math.max(this.shake, clamp(amount / 30, 0.15, 0.5));
    this.bus.emit('player:damaged', { amount: dealt, health: this.health, maxHealth: this.maxHealth, sourcePosition });
    if (!this.alive) this.bus.emit('player:died', {});
  }

  heal(amount: number): void {
    this.vitals.heal(amount);
    this.bus.emit('player:healed', { health: this.health, maxHealth: this.maxHealth });
  }

  /** Checkpoint restore and debug only. */
  restore(position: Vec3, yaw: number, health: number): void {
    this.body.teleport(position);
    this.body.setHeight(C.standHeight);
    this.move.crouching = false;
    this.move.velX = 0;
    this.move.velZ = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = this.recoilYaw = this.recoilPitchTarget = this.recoilYawTarget = 0;
    this.vitals.set(health);
    this.bus.emit('player:healed', { health: this.health, maxHealth: this.maxHealth });
    this.syncCamera(0);
  }

  addRecoil(pitch: number, yaw: number): void {
    this.recoilPitchTarget += pitch;
    this.recoilYawTarget += yaw;
  }
  setFovMultiplier(multiplier: number): void {
    this.fovMultiplier = multiplier;
  }
  setLookMultiplier(multiplier: number): void {
    this.lookMultiplier = multiplier;
  }
  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }
  setSprintBlocked(blocked: boolean): void {
    this.sprintBlocked = blocked;
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.body.dispose();
  }

  private applyLook(input: FrameInput): void {
    const { sensitivity, invertY } = this.settings().controls;
    const speed = C.baseLookSpeed * sensitivity * this.lookMultiplier;
    this.yaw += input.lookX * speed;
    this.pitch = clamp(this.pitch - input.lookY * speed * (invertY ? -1 : 1), -C.maxPitch, C.maxPitch);
  }

  private toggleCrouch(): void {
    if (this.move.crouching && !this.body.setHeight(C.standHeight)) return;
    this.move.crouching = !this.move.crouching;
  }

  private detectLanding(): void {
    const grounded = this.body.grounded;
    if (!grounded) this.fallSpeed = Math.max(this.fallSpeed, -this.body.verticalSpeed);
    if (grounded && !this.wasGrounded) {
      if (this.fallSpeed > 2) {
        this.landDip = clamp(this.fallSpeed / 60, 0.02, 0.14);
        this.bus.emit('player:landed', { impactSpeed: this.fallSpeed });
      }
      this.fallSpeed = 0;
    }
    this.wasGrounded = grounded;
  }

  private updateFootsteps(dt: number): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.body.grounded || speed < 0.4) return;
    this.strideLeft -= speed * dt;
    if (this.strideLeft > 0) return;
    const pace = this.move.crouching ? 'crouch' : this.move.sprinting ? 'sprint' : 'walk';
    this.strideLeft = pace === 'crouch' ? C.strideCrouch : pace === 'sprint' ? C.strideSprint : C.strideWalk;
    this.bus.emit('player:footstep', { position: { ...this.position }, surface: this.body.surface, pace });
  }

  private targetFov(): number {
    const degrees = this.settings().controls.fov * this.fovMultiplier * (this.move.sprinting ? C.sprintFovBoost : 1);
    return (degrees * Math.PI) / 180;
  }

  private syncCamera(dt: number): void {
    // Recoil snaps up quickly, then settles back while the player's own aim stays where it was.
    this.recoilPitch = damp(this.recoilPitch, this.recoilPitchTarget, C.recoilFollowRate, dt);
    this.recoilYaw = damp(this.recoilYaw, this.recoilYawTarget, C.recoilFollowRate, dt);
    this.recoilPitchTarget = damp(this.recoilPitchTarget, 0, C.recoilRecoverRate, dt);
    this.recoilYawTarget = damp(this.recoilYawTarget, 0, C.recoilRecoverRate, dt);

    const viewPitch = clamp(this.pitch + this.recoilPitch, -C.maxPitch, C.maxPitch);
    const viewYaw = this.yaw + this.recoilYaw;
    const cosPitch = Math.cos(viewPitch);
    this.forward.x = Math.sin(viewYaw) * cosPitch;
    this.forward.y = Math.sin(viewPitch);
    this.forward.z = Math.cos(viewYaw) * cosPitch;

    const targetEye = this.alive ? (this.move.crouching ? C.crouchEye : C.standEye) : 0.35;
    this.eyeHeight = damp(this.eyeHeight, targetEye, this.alive ? C.eyeChangeRate : 3, dt);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = this.body.grounded && speed > 0.5;
    this.bobAmount = damp(this.bobAmount, moving ? clamp(speed / C.sprintSpeed, 0.25, 1) : 0, 9, dt);
    this.bobTime += dt * lerp(5, 11, clamp(speed / C.sprintSpeed, 0, 1));
    const bobY = Math.sin(this.bobTime * 2) * 0.022 * this.bobAmount;
    const bobX = Math.cos(this.bobTime) * 0.012 * this.bobAmount;

    this.landDip = damp(this.landDip, 0, 7, dt);
    this.shake = damp(this.shake, 0, 6, dt);
    const shakeX = this.shake > 0.002 ? (Math.random() - 0.5) * this.shake * 0.05 : 0;
    const shakeY = this.shake > 0.002 ? (Math.random() - 0.5) * this.shake * 0.05 : 0;

    const p = this.body.position;
    this.eye.x = p.x;
    this.eye.y = p.y + this.eyeHeight;
    this.eye.z = p.z;

    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    this.camera.position.set(
      this.eye.x + (bobX + shakeX) * cosYaw,
      this.eye.y + bobY + shakeY - this.landDip,
      this.eye.z - (bobX + shakeX) * sinYaw,
    );

    // Lean slightly into strafes, and topple on death. This must not go through rotation.z: whenever that changes,
    // Babylon bakes the current pitch and yaw into upVector too, which leaves a permanent tilt once the view turns.
    const strafe = this.velocity.x * cosYaw - this.velocity.z * sinYaw;
    const targetRoll = this.alive ? clamp(strafe * 0.0028, -0.02, 0.02) : C.deathRoll;
    this.roll = damp(this.roll, targetRoll, this.alive ? 8 : 3, dt);
    this.camera.rotation.set(-viewPitch, viewYaw, 0);
    const sinRoll = Math.sin(this.roll);
    this.camera.upVector.set(cosYaw * sinRoll, Math.cos(this.roll), -sinYaw * sinRoll);

    this.currentFov = damp(this.currentFov, this.targetFov(), C.fovChangeRate, dt || 1);
    this.camera.fov = this.currentFov;
  }
}
