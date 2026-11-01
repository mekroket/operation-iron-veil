import type { FrameInput } from './contracts';
import { clamp } from './math';

/** Some Chrome and driver combinations report absurd single-frame deltas. Ignore those spikes. */
const MAX_POINTER_DELTA = 500;

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ControlLeft', 'Space', 'KeyR', 'KeyE',
  'Digit1', 'Digit2', 'Digit3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/**
 * Keyboard and mouse state, sampled once per frame. Listens on window so it keeps working in fullscreen;
 * everything is ignored until `enabled` is set, and all held state clears on blur so keys can't stick.
 */
export class Input {
  enabled = false;

  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private fireHeld = false;
  private firePressed = false;
  private adsHeld = false;
  private wheel = 0;
  private readonly controller = new AbortController();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const options = { signal: this.controller.signal };
    window.addEventListener('keydown', this.onKeyDown, options);
    window.addEventListener('keyup', this.onKeyUp, options);
    window.addEventListener('mousedown', this.onMouseDown, options);
    window.addEventListener('mouseup', this.onMouseUp, options);
    window.addEventListener('mousemove', this.onMouseMove, options);
    window.addEventListener('wheel', this.onWheel, { passive: true, signal: this.controller.signal });
    window.addEventListener('blur', this.clear, options);
    document.addEventListener('visibilitychange', this.clear, options);
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
  }

  /** Returns this frame's input and resets the one-frame values. */
  sample(): FrameInput {
    const key = (code: string): boolean => this.held.has(code);
    const hit = (code: string): boolean => this.pressed.has(code);
    const moveX = (key('KeyD') || key('ArrowRight') ? 1 : 0) - (key('KeyA') || key('ArrowLeft') ? 1 : 0);
    const moveZ = (key('KeyW') || key('ArrowUp') ? 1 : 0) - (key('KeyS') || key('ArrowDown') ? 1 : 0);
    const frame: FrameInput = {
      moveX,
      moveZ,
      lookX: this.lookX,
      lookY: this.lookY,
      fireHeld: this.fireHeld,
      firePressed: this.firePressed,
      adsHeld: this.adsHeld,
      reloadPressed: hit('KeyR'),
      sprintHeld: key('ShiftLeft') || key('ShiftRight'),
      crouchPressed: hit('KeyC') || hit('ControlLeft'),
      jumpPressed: hit('Space'),
      interactHeld: key('KeyE'),
      interactPressed: hit('KeyE'),
      slotPressed: hit('Digit1') ? 0 : hit('Digit2') ? 1 : hit('Digit3') ? 2 : null,
      slotCycle: Math.sign(this.wheel),
    };
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.firePressed = false;
    this.wheel = 0;
    return frame;
  }

  dispose(): void {
    this.controller.abort();
  }

  private readonly clear = (): void => {
    this.held.clear();
    this.pressed.clear();
    this.fireHeld = false;
    this.firePressed = false;
    this.adsHeld = false;
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) this.pressed.add(event.code);
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.enabled) return;
    if (event.button === 0) {
      this.fireHeld = true;
      this.firePressed = true;
    } else if (event.button === 2) {
      this.adsHeld = true;
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.fireHeld = false;
    else if (event.button === 2) this.adsHeld = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled) return;
    if (Math.abs(event.movementX) > MAX_POINTER_DELTA || Math.abs(event.movementY) > MAX_POINTER_DELTA) return;
    this.lookX += event.movementX;
    this.lookY += event.movementY;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    this.wheel = clamp(this.wheel + event.deltaY, -1, 1);
  };
}
