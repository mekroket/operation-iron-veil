import { describe, expect, it } from 'vitest';
import { createMovementState, PlayerHealth, stepMovement } from '../src/player/MovementModel';
import type { MovementInput } from '../src/player/MovementModel';
import { PLAYER_CONFIG as C } from '../src/player/playerConfig';

const base: MovementInput = {
  moveX: 0,
  moveZ: 0,
  sprintHeld: false,
  sprintBlocked: false,
  jumpPressed: false,
  yaw: 0,
  grounded: true,
  speedMultiplier: 1,
};

function run(input: Partial<MovementInput>, seconds: number, state = createMovementState()) {
  for (let t = 0; t < seconds; t += 1 / 60) stepMovement(state, { ...base, ...input }, 1 / 60);
  return state;
}

describe('movement model', () => {
  it('reaches walk speed going forward along +Z at yaw 0', () => {
    const s = run({ moveZ: 1 }, 1);
    expect(s.velZ).toBeCloseTo(C.walkSpeed, 3);
    expect(s.velX).toBeCloseTo(0, 5);
  });

  it('strafes right along +X at yaw 0', () => {
    const s = run({ moveX: 1 }, 1);
    expect(s.velX).toBeGreaterThan(0);
  });

  it('does not exceed top speed diagonally', () => {
    const s = run({ moveX: 1, moveZ: 1 }, 1);
    expect(Math.hypot(s.velX, s.velZ)).toBeLessThanOrEqual(C.walkSpeed + 1e-6);
  });

  it('sprints only forwards and not when blocked', () => {
    expect(run({ moveZ: 1, sprintHeld: true }, 1).velZ).toBeCloseTo(C.sprintSpeed, 3);
    expect(run({ moveZ: -1, sprintHeld: true }, 1).sprinting).toBe(false);
    expect(run({ moveZ: 1, sprintHeld: true, sprintBlocked: true }, 1).sprinting).toBe(false);
  });

  it('crouching limits speed and sprinting cancels crouch', () => {
    const crouched = createMovementState();
    crouched.crouching = true;
    expect(run({ moveZ: 1 }, 1, crouched).velZ).toBeCloseTo(C.crouchSpeed, 3);
    expect(run({ moveZ: 1, sprintHeld: true }, 0.1, crouched).crouching).toBe(false);
  });

  it('stops when input ends', () => {
    const s = run({ moveZ: 1 }, 1);
    run({}, 1, s);
    expect(s.velZ).toBe(0);
  });

  it('jumps once, respects coyote time and buffer', () => {
    const s = createMovementState();
    stepMovement(s, base, 1 / 60);
    expect(stepMovement(s, { ...base, jumpPressed: true }, 1 / 60)).toBe(C.jumpSpeed);
    expect(stepMovement(s, { ...base, grounded: false }, 1 / 60)).toBe(0);

    const late = createMovementState();
    stepMovement(late, base, 1 / 60);
    for (let i = 0; i < 3; i++) stepMovement(late, { ...base, grounded: false }, 1 / 60);
    expect(stepMovement(late, { ...base, grounded: false, jumpPressed: true }, 1 / 60)).toBe(C.jumpSpeed);

    const tooLate = createMovementState();
    stepMovement(tooLate, base, 1 / 60);
    for (let i = 0; i < 30; i++) stepMovement(tooLate, { ...base, grounded: false }, 1 / 60);
    expect(stepMovement(tooLate, { ...base, grounded: false, jumpPressed: true }, 1 / 60)).toBe(0);
  });

  it('cannot jump while crouched', () => {
    const s = createMovementState();
    s.crouching = true;
    stepMovement(s, base, 1 / 60);
    expect(stepMovement(s, { ...base, jumpPressed: true }, 1 / 60)).toBe(0);
  });
});

describe('player health', () => {
  it('takes damage, dies at zero and ignores further damage', () => {
    const h = new PlayerHealth();
    expect(h.takeDamage(30)).toBe(30);
    expect(h.health).toBe(70);
    expect(h.takeDamage(500)).toBe(70);
    expect(h.alive).toBe(false);
    expect(h.takeDamage(10)).toBe(0);
  });

  it('heal is capped and does not revive', () => {
    const h = new PlayerHealth();
    h.takeDamage(10);
    h.heal(50);
    expect(h.health).toBe(C.maxHealth);
    h.takeDamage(1000);
    h.heal(50);
    expect(h.alive).toBe(false);
  });

  it('regenerates only after the delay and only up to the segment top', () => {
    const h = new PlayerHealth();
    h.takeDamage(40); // 60 left, segment top is 75
    h.update(C.regenDelaySeconds - 0.5);
    expect(h.health).toBe(60);
    h.update(1);
    for (let i = 0; i < 600; i++) h.update(1 / 60);
    expect(h.health).toBe(75);
  });
});
