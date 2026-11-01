/** Pure horizontal movement: turns input into velocity. Collision and gravity live in the character body. */
import { approach } from '../core/math';
import { PLAYER_CONFIG as C } from './playerConfig';

export interface MovementState {
  velX: number;
  velZ: number;
  crouching: boolean;
  sprinting: boolean;
  coyote: number;
  jumpBuffer: number;
}

export interface MovementInput {
  moveX: number;
  moveZ: number;
  sprintHeld: boolean;
  sprintBlocked: boolean;
  jumpPressed: boolean;
  yaw: number;
  grounded: boolean;
  speedMultiplier: number;
}

export const createMovementState = (): MovementState => ({
  velX: 0,
  velZ: 0,
  crouching: false,
  sprinting: false,
  coyote: 0,
  jumpBuffer: 0,
});

/** Advances state by dt. Returns the launch speed if a jump should start this frame, else 0. */
export function stepMovement(state: MovementState, input: MovementInput, dt: number): number {
  const length = Math.hypot(input.moveX, input.moveZ);
  const nx = length > 1 ? input.moveX / length : input.moveX;
  const nz = length > 1 ? input.moveZ / length : input.moveZ;

  // Sprinting is forward-only and cancels crouch.
  state.sprinting = input.sprintHeld && !input.sprintBlocked && nz > 0.1 && input.grounded;
  if (state.sprinting) state.crouching = false;

  const top = state.crouching ? C.crouchSpeed : state.sprinting ? C.sprintSpeed : C.walkSpeed;
  const forwardSpeed = nz * top * (nz < 0 ? C.backwardFactor : 1);
  const strafeSpeed = nx * (state.sprinting ? C.walkSpeed : top) * C.strafeFactor;

  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const targetX = (forwardSpeed * sin + strafeSpeed * cos) * input.speedMultiplier;
  const targetZ = (forwardSpeed * cos - strafeSpeed * sin) * input.speedMultiplier;

  const moving = length > 0.01;
  const rate = input.grounded ? (moving ? C.groundAcceleration : C.groundDeceleration) : C.airAcceleration;
  state.velX = approach(state.velX, targetX, rate * dt);
  state.velZ = approach(state.velZ, targetZ, rate * dt);

  state.coyote = input.grounded ? C.coyoteSeconds : Math.max(0, state.coyote - dt);
  state.jumpBuffer = input.jumpPressed ? C.jumpBufferSeconds : Math.max(0, state.jumpBuffer - dt);
  if (state.jumpBuffer > 0 && state.coyote > 0 && !state.crouching) {
    state.jumpBuffer = 0;
    state.coyote = 0;
    return C.jumpSpeed;
  }
  return 0;
}

/** Health with delayed partial regeneration. Pure. */
export class PlayerHealth {
  health: number = C.maxHealth;
  private sinceDamage = Number.POSITIVE_INFINITY;

  get alive(): boolean {
    return this.health > 0;
  }

  takeDamage(amount: number): number {
    if (!this.alive || amount <= 0) return 0;
    const dealt = Math.min(this.health, amount);
    this.health -= dealt;
    this.sinceDamage = 0;
    return dealt;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.health = Math.min(C.maxHealth, this.health + amount);
  }

  set(value: number): void {
    this.health = Math.min(C.maxHealth, Math.max(0, value));
    this.sinceDamage = Number.POSITIVE_INFINITY;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.sinceDamage += dt;
    if (this.sinceDamage < C.regenDelaySeconds) return;
    const cap = Math.min(C.maxHealth, Math.ceil(this.health / C.regenSegment) * C.regenSegment);
    if (this.health < cap) this.health = Math.min(cap, this.health + C.regenPerSecond * dt);
  }
}
