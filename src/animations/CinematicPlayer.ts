/** Plays a level's camera keys on the game camera. The maths lives in cameraPath.ts. */
import { Vector3 } from '../engine/bjs';
import type { FreeCamera } from '../engine/bjs';
import type { CameraKey } from '../levels/types';
import { pathDuration, sampleCameraPath } from './cameraPath';

export interface CinematicOptions {
  loop?: boolean;
  /** Called once when a non-looping shot ends. stop() does not call it. */
  onDone?: () => void;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

export class CinematicPlayer {
  private keys: readonly CameraKey[] = [];
  private options: CinematicOptions = {};
  private time = 0;
  private duration = 0;
  private active = false;
  private savedFov = 0;
  private readonly lookAt = new Vector3();

  constructor(private readonly camera: FreeCamera) {}

  get playing(): boolean {
    return this.active;
  }

  /** Starts from the first key, replacing whatever was playing. An empty list finishes at once. */
  play(keys: readonly CameraKey[], opts: CinematicOptions = {}): void {
    if (!this.active) this.savedFov = this.camera.fov;
    this.keys = keys;
    this.options = opts;
    this.time = 0;
    this.duration = pathDuration(keys, opts.loop ?? false);
    this.active = true;
    this.apply();
    if (keys.length === 0 || (this.duration <= 0 && !opts.loop)) this.finish();
  }

  update(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    this.apply();
    if (!this.options.loop && this.time >= this.duration) this.finish();
  }

  /** Ends the shot early and gives the FOV back. Does not call onDone. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.camera.fov = this.savedFov;
  }

  private apply(): void {
    const sample = sampleCameraPath(this.keys, this.time, this.options.loop ?? false);
    if (!sample) return;
    this.camera.position.set(sample.position.x, sample.position.y, sample.position.z);
    this.lookAt.set(sample.target.x, sample.target.y, sample.target.z);
    this.camera.setTarget(this.lookAt);
    this.camera.fov = sample.fov * DEGREES_TO_RADIANS;
  }

  private finish(): void {
    const { onDone } = this.options;
    this.stop();
    onDone?.();
  }
}
