import type { ICharacterBody } from '../core/contracts';
import type { SurfaceType, Vec3 } from '../core/types';
import { CharacterSupportedState, PhysicsCharacterController, Vector3 } from '../engine/bjs';
import type { Scene } from '../engine/bjs';

const GRAVITY = -18;
const GROUND_STICK_SPEED = -1;
const MAX_FALL_SPEED = -40;
const MIN_STEP = 1 / 240;
const SURFACE_SAMPLE_SECONDS = 0.25;
const STEP_EDGE_SLOPE_COSINE = 0.1;

export interface CharacterWorldQueries {
  surfaceBelow(feet: Vec3): SurfaceType | null;
  /** True when a capsule of this radius can grow up to `top` above `feet`. */
  hasHeadroom(feet: Vec3, top: number, radius: number): boolean;
}

/** A Havok character capsule. `position` is the feet, reused between frames: copy it to keep it. */
export class CharacterBody implements ICharacterBody {
  readonly position: Vec3;
  grounded = false;
  verticalSpeed = 0;
  surface: SurfaceType = 'concrete';

  private readonly controller: PhysicsCharacterController;
  private readonly velocity = new Vector3();
  private readonly gravity = new Vector3(0, GRAVITY, 0);
  private readonly down = new Vector3(0, -1, 0);
  private height: number;
  private surfaceTimer = 0;

  constructor(
    scene: Scene,
    private readonly queries: CharacterWorldQueries,
    feet: Vec3,
    height: number,
    private readonly radius: number,
  ) {
    this.height = height;
    this.position = { ...feet };
    const center = new Vector3(feet.x, feet.y + height / 2 + 0.03, feet.z);
    this.controller = new PhysicsCharacterController(center, { capsuleHeight: height, capsuleRadius: radius }, scene);
    this.controller.keepDistance = 0.02;
    this.controller.keepContactTolerance = 0.05;
    this.controller.maxCharacterSpeedForSolver = 45;
    // Babylon's step-up sweep only succeeds when one frame's travel is long enough for the rounded capsule bottom to
    // land flat, so it fails at 60 fps and above. The level has no slopes, only boxes, so a permissive slope limit
    // lets the capsule roll up any edge below about 0.3 m at every frame rate, while vertical walls still block.
    this.controller.maxStepHeight = 0;
    this.controller.maxSlopeCosine = STEP_EDGE_SLOPE_COSINE;
    this.syncPosition();
  }

  move(dt: number, velocity: Vec3, jumpSpeed = 0): void {
    const step = Math.max(dt, MIN_STEP);
    const support = this.controller.checkSupport(step, this.down);
    const wasGrounded = this.grounded;
    this.grounded = support.supportedState === CharacterSupportedState.SUPPORTED;

    if (this.grounded && !(wasGrounded === false && this.verticalSpeed > 0)) {
      this.verticalSpeed = jumpSpeed > 0 ? jumpSpeed : GROUND_STICK_SPEED;
      if (jumpSpeed > 0) this.grounded = false;
    } else {
      this.verticalSpeed = Math.max(this.verticalSpeed + GRAVITY * step, MAX_FALL_SPEED);
    }

    this.velocity.set(velocity.x, this.verticalSpeed, velocity.z);
    this.controller.setVelocity(this.velocity);
    this.controller.integrate(step, support, this.gravity);

    const actual = this.controller.getVelocity();
    // A ceiling or the ground stopped us: don't keep accumulating speed the solver has already removed.
    if (this.verticalSpeed > 0 && actual.y <= 0) this.verticalSpeed = 0;

    this.syncPosition();

    this.surfaceTimer -= step;
    if (this.grounded && this.surfaceTimer <= 0) {
      this.surfaceTimer = SURFACE_SAMPLE_SECONDS;
      this.surface = this.queries.surfaceBelow(this.position) ?? this.surface;
    }
  }

  teleport(feet: Vec3): void {
    this.controller.setPosition(new Vector3(feet.x, feet.y + this.height / 2 + 0.03, feet.z));
    this.controller.setVelocity(Vector3.Zero());
    this.verticalSpeed = 0;
    this.grounded = false;
    this.syncPosition();
  }

  setHeight(height: number): boolean {
    if (height === this.height) return true;
    if (height > this.height && !this.queries.hasHeadroom(this.position, height + 0.05, this.radius)) return false;
    const feetY = this.position.y;
    this.controller.setShapeOptions({ capsuleHeight: height, capsuleRadius: this.radius }, false);
    this.controller.footOffset = height / 2;
    this.height = height;
    const center = this.controller.getPosition();
    this.controller.setPosition(new Vector3(center.x, feetY + height / 2 + 0.02, center.z));
    this.syncPosition();
    return true;
  }

  dispose(): void {
    this.controller.dispose();
  }

  private syncPosition(): void {
    const center = this.controller.getPosition();
    this.position.x = center.x;
    this.position.y = center.y - this.height / 2;
    this.position.z = center.z;
  }
}
