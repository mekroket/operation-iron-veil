export interface BrowserSessionEvents {
  /** Pointer lock was acquired. */
  onLocked(): void;
  /** Pointer lock was lost for any reason (Esc, alt-tab, API exit). */
  onUnlocked(): void;
  /** The browser refused pointer lock. A further click is needed. */
  onLockError(): void;
  /** The browser refused fullscreen. The game continues in the window. */
  onFullscreenError(): void;
}

/**
 * Fullscreen and pointer lock, which browsers only allow from a real user gesture.
 * Never requests anything on page load.
 */
export class BrowserSession {
  private readonly controller = new AbortController();
  private wantFullscreen = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: BrowserSessionEvents,
  ) {
    const options = { signal: this.controller.signal };
    document.addEventListener('pointerlockchange', this.onPointerLockChange, options);
    document.addEventListener('pointerlockerror', () => this.events.onLockError(), options);
    document.addEventListener('fullscreenerror', () => this.events.onFullscreenError(), options);
    document.addEventListener('fullscreenchange', this.onFullscreenChange, options);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  get fullscreen(): boolean {
    return document.fullscreenElement !== null;
  }

  /** Must be called synchronously from a click. Pointer lock goes first, because fullscreen consumes the gesture. */
  enter(fullscreen: boolean): void {
    this.wantFullscreen = fullscreen;
    this.requestLock();
    if (fullscreen && !this.fullscreen) this.requestFullscreen();
  }

  requestLock(): void {
    if (this.locked) return;
    this.canvas.focus();
    try {
      // Prefer raw mouse input. Not every platform supports it, so fall back on rejection.
      const request = this.canvas.requestPointerLock({ unadjustedMovement: true }) as unknown as Promise<void> | undefined;
      request?.catch?.((rawError: unknown) => {
        console.warn('[input] Raw pointer lock refused, trying standard lock.', rawError);
        try {
          const fallback = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
          fallback?.catch?.((error: unknown) => {
            console.warn('[input] Pointer lock refused.', error);
            this.events.onLockError();
          });
        } catch (error) {
          console.warn('[input] Pointer lock refused.', error);
          this.events.onLockError();
        }
      });
    } catch (error) {
      console.warn('[input] Pointer lock refused.', error);
      this.events.onLockError();
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  exitFullscreen(): void {
    this.wantFullscreen = false;
    if (this.fullscreen) void document.exitFullscreen().catch(() => undefined);
  }

  dispose(): void {
    this.controller.abort();
  }

  private requestFullscreen(): void {
    const root = document.documentElement;
    if (!document.fullscreenEnabled || !root.requestFullscreen) {
      this.events.onFullscreenError();
      return;
    }
    root.requestFullscreen({ navigationUI: 'hide' }).catch((error: unknown) => {
      console.warn('[display] Fullscreen refused.', error);
      this.events.onFullscreenError();
    });
  }

  private readonly onPointerLockChange = (): void => {
    if (this.locked) this.events.onLocked();
    else this.events.onUnlocked();
  };

  private readonly onFullscreenChange = (): void => {
    // Some browsers drop a lock that was taken just before the fullscreen transition.
    if (this.fullscreen && this.wantFullscreen && !this.locked) this.requestLock();
  };
}
