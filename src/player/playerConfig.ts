/** Movement feel. All tuning lives here, in metres and seconds. */
export const PLAYER_CONFIG = {
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.15,
  standEye: 1.65,
  crouchEye: 1.02,
  eyeChangeRate: 12,

  walkSpeed: 4.4,
  sprintSpeed: 7.0,
  crouchSpeed: 2.2,
  backwardFactor: 0.8,
  strafeFactor: 0.92,
  groundAcceleration: 42,
  groundDeceleration: 36,
  airAcceleration: 7,

  jumpSpeed: 5.6,
  coyoteSeconds: 0.1,
  jumpBufferSeconds: 0.12,

  maxHealth: 100,
  /** Health only recovers up to the top of the current segment, so medkits stay valuable. */
  regenSegment: 25,
  regenDelaySeconds: 6,
  regenPerSecond: 7,

  baseLookSpeed: 0.0021,
  maxPitch: 1.48,

  strideWalk: 2.3,
  strideSprint: 3.1,
  strideCrouch: 1.7,

  recoilFollowRate: 32,
  recoilRecoverRate: 4.5,
  fovChangeRate: 11,
  sprintFovBoost: 1.05,
} as const;
