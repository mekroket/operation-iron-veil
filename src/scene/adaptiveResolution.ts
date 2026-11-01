/** Dynamic resolution controller. Pure logic: it decides a scale from frame times and never touches the engine. */

const BUCKET_SECONDS = 0.25;
/** Eight buckets: the public fps is a two second rolling average. */
const BUCKETS = 8;
/** The drop decision only looks at the newest second, so it reacts quickly. */
const DROP_BUCKETS = 4;
const DROP_FPS = 48;
const RAISE_FPS = 58;
const DROP_FACTOR = 0.9;
const RAISE_FACTOR = 1.05;
const FLOOR_FRACTION = 0.6;
const SETTLE_SECONDS = 2;
const RAISE_HOLD_MIN = 6;
const RAISE_HOLD_MAX = 96;
/** A drop this soon after a raise means the raise failed, and the wait before the next one doubles. */
const FAILED_RAISE_WINDOW = 12;
/** This long at a raised scale without a drop means the scene got cheaper, so the wait resets. */
const STABLE_RESET_SECONDS = 60;

export class AdaptiveResolution {
  private base: number;
  private enabled: boolean;
  private scale: number;
  private currentFps = 60;
  private readonly bucketFps = new Float32Array(BUCKETS);
  private bucketIndex = 0;
  private bucketsFilled = 0;
  private bucketTime = 0;
  private bucketFrames = 0;
  private settle = SETTLE_SECONDS;
  private goodTime = 0;
  private raiseHold = RAISE_HOLD_MIN;
  /** Seconds since the last raise, or -1 when none is being watched. */
  private sinceRaise = -1;

  constructor(base: number, enabled: boolean) {
    this.base = base;
    this.enabled = enabled;
    this.scale = base;
  }

  get fps(): number {
    return this.currentFps;
  }

  get current(): number {
    return this.scale;
  }

  /** New settings: returns to the requested scale and forgets learned state. */
  configure(base: number, enabled: boolean): void {
    if (base !== this.base || enabled !== this.enabled) {
      this.base = base;
      this.enabled = enabled;
      this.scale = base;
      this.raiseHold = RAISE_HOLD_MIN;
      this.sinceRaise = -1;
      this.restart();
    }
  }

  /**
   * Call once per frame.
   * @param frameSeconds real time of the last frame
   * @param hidden document.hidden: browsers throttle hidden tabs, so those frames say nothing about the GPU
   * @returns the new scale when it changed, otherwise null
   */
  update(frameSeconds: number, hidden: boolean): number | null {
    if (hidden || frameSeconds <= 0 || frameSeconds > 0.5) {
      this.restart();
      return null;
    }

    this.bucketTime += frameSeconds;
    this.bucketFrames++;
    if (this.bucketTime < BUCKET_SECONDS) return null;
    const elapsed = this.bucketTime;
    const bucket = this.bucketFrames / elapsed;
    this.bucketTime = 0;
    this.bucketFrames = 0;
    this.bucketFps[this.bucketIndex] = bucket;
    this.bucketIndex = (this.bucketIndex + 1) % BUCKETS;
    this.bucketsFilled = Math.min(BUCKETS, this.bucketsFilled + 1);
    this.currentFps = this.average(this.bucketsFilled);

    if (this.settle > 0) {
      // Frames rendered around a resolution change include reallocated targets: discard them, along with their fps buckets.
      this.settle -= elapsed;
      if (this.settle <= 0) this.bucketsFilled = 0;
      return null;
    }
    if (!this.enabled) return null;

    if (this.sinceRaise >= 0) {
      this.sinceRaise += elapsed;
      if (this.sinceRaise > STABLE_RESET_SECONDS) {
        this.raiseHold = RAISE_HOLD_MIN;
        this.sinceRaise = -1;
      }
    }

    if (this.bucketsFilled >= DROP_BUCKETS && this.average(DROP_BUCKETS) < DROP_FPS) {
      const next = Math.max(this.base * FLOOR_FRACTION, this.scale * DROP_FACTOR);
      this.goodTime = 0;
      if (next >= this.scale) return null;
      if (this.sinceRaise >= 0 && this.sinceRaise < FAILED_RAISE_WINDOW) {
        this.raiseHold = Math.min(RAISE_HOLD_MAX, this.raiseHold * 2);
      }
      this.sinceRaise = -1;
      return this.apply(next);
    }

    if (this.scale < this.base && this.bucketsFilled >= BUCKETS && this.average(BUCKETS) >= RAISE_FPS) {
      this.goodTime += elapsed;
      if (this.goodTime >= this.raiseHold) {
        this.sinceRaise = 0;
        return this.apply(Math.min(this.base, this.scale * RAISE_FACTOR));
      }
    } else {
      this.goodTime = 0;
    }
    return null;
  }

  private average(count: number): number {
    let sum = 0;
    for (let i = 1; i <= count; i++) sum += this.bucketFps[(this.bucketIndex - i + BUCKETS) % BUCKETS];
    return count > 0 ? sum / count : this.currentFps;
  }

  private apply(next: number): number {
    this.scale = next;
    this.restart();
    return next;
  }

  private restart(): void {
    this.settle = SETTLE_SECONDS;
    this.goodTime = 0;
    this.bucketTime = 0;
    this.bucketFrames = 0;
    this.bucketsFilled = 0;
  }
}
