/**
 * Chooses what the player is trying to use and drives hold progress. Pure: no Babylon.
 * The game calls update() once per frame with the sampled FrameInput.
 */
import type { EventBus } from '../core/events';
import { distance, dot, saturate, scale, sub } from '../core/math';
import type { Vec3 } from '../core/types';

/** True when nothing solid lies between the two points. Normally IPhysicsWorld.lineOfSight. */
export type CanSee = (from: Vec3, to: Vec3) => boolean;

export interface Interactable {
  id: string;
  position: Vec3;
  /** Reach in metres, measured from the player's eye. */
  radius: number;
  prompt: string | (() => string);
  /** 0 fires on the press. Anything else needs the key held this long. */
  holdSeconds: number;
  isEnabled(): boolean;
  onComplete(): void;
  /** Largest angle between the view and the target. Defaults to DEFAULT_FACING_DEGREES. 180 ignores facing. */
  facingDegrees?: number;
  /**
   * The sight line stops this far short of the target, so an object that is itself solid
   * (a closed door, a terminal) does not hide itself. Defaults to DEFAULT_LOS_MARGIN.
   */
  losMargin?: number;
  /** False skips the sight check. For zone-based interactions. Defaults to true. */
  requiresLineOfSight?: boolean;
}

export const DEFAULT_FACING_DEGREES = 45;
export const DEFAULT_LOS_MARGIN = 0.3;

interface Candidate {
  item: Interactable;
  score: number;
}

export class InteractionSystem {
  private readonly items = new Map<string, Interactable>();
  private target: Interactable | null = null;
  private holdTime = 0;
  /** After a completion the key must be released before another hold can begin. */
  private awaitingRelease = false;
  private lastText: string | null = null;
  private lastProgress = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly canSee: CanSee,
  ) {}

  /** Returns the function that removes it again. Registering an id twice replaces the earlier one. */
  register(item: Interactable): () => void {
    this.items.set(item.id, item);
    return () => this.unregister(item.id);
  }

  unregister(id: string): void {
    this.items.delete(id);
    if (this.target?.id === id) {
      this.target = null;
      this.holdTime = 0;
    }
  }

  get currentId(): string | null {
    return this.target?.id ?? null;
  }

  /** Forgets the current target and hides the prompt. Call when input stops, such as in a cinematic. */
  reset(): void {
    this.target = null;
    this.holdTime = 0;
    this.publish(null, 0);
  }

  update(dt: number, playerEye: Vec3, playerForward: Vec3, interactHeld: boolean, interactPressed: boolean): void {
    if (this.awaitingRelease && !interactHeld) this.awaitingRelease = false;

    const best = this.chooseTarget(playerEye, playerForward);
    if (best !== this.target) {
      this.target = best;
      this.holdTime = 0;
    }
    if (!best) {
      this.publish(null, 0);
      return;
    }

    let completed = false;
    if (best.holdSeconds <= 0) {
      completed = interactPressed;
    } else if (interactHeld && !this.awaitingRelease) {
      this.holdTime += dt;
      completed = this.holdTime >= best.holdSeconds;
    } else {
      this.holdTime = 0;
    }

    if (completed) {
      this.holdTime = 0;
      this.awaitingRelease = true;
      best.onComplete();
      this.publish(best.isEnabled() ? this.promptOf(best) : null, 0);
      return;
    }
    this.publish(this.promptOf(best), best.holdSeconds > 0 ? saturate(this.holdTime / best.holdSeconds) : 0);
  }

  private chooseTarget(eye: Vec3, forward: Vec3): Interactable | null {
    const candidates: Candidate[] = [];
    for (const item of this.items.values()) {
      if (!item.isEnabled()) continue;
      const gap = distance(eye, item.position);
      if (gap > item.radius) continue;
      const limit = item.facingDegrees ?? DEFAULT_FACING_DEGREES;
      const angle = gap < 1e-6 ? 0 : angleDegrees(forward, scale(sub(item.position, eye), 1 / gap));
      if (angle > limit) continue;
      // Equal weight for how close it is and how squarely it is faced, each as a fraction of its limit.
      const radiusShare = item.radius > 0 ? gap / item.radius : 0;
      const facingShare = limit > 0 ? angle / limit : 0;
      candidates.push({ item, score: radiusShare + facingShare });
    }
    candidates.sort((a, b) => a.score - b.score);
    // Sight checks are raycasts, so stop at the first visible one.
    for (const { item } of candidates) {
      if (this.isVisible(eye, item)) return item;
    }
    return null;
  }

  private isVisible(eye: Vec3, item: Interactable): boolean {
    if (item.requiresLineOfSight === false) return true;
    const gap = distance(eye, item.position);
    const margin = item.losMargin ?? DEFAULT_LOS_MARGIN;
    if (gap <= margin) return true;
    const keep = (gap - margin) / gap;
    const delta = sub(item.position, eye);
    return this.canSee(eye, { x: eye.x + delta.x * keep, y: eye.y + delta.y * keep, z: eye.z + delta.z * keep });
  }

  private promptOf(item: Interactable): string {
    return typeof item.prompt === 'function' ? item.prompt() : item.prompt;
  }

  private publish(text: string | null, holdProgress: number): void {
    if (text === this.lastText && holdProgress === this.lastProgress) return;
    this.lastText = text;
    this.lastProgress = holdProgress;
    this.bus.emit('interaction:prompt', { text, holdProgress });
  }
}

function angleDegrees(a: Vec3, b: Vec3): number {
  return (Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) * 180) / Math.PI;
}
