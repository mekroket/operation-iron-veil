import { clamp } from '../../core/math';
import { h, setText } from '../dom';
import type { Viewport } from './Viewport';

export interface ObjectiveMarkerState {
  x: number;
  y: number;
  distance: number;
  onScreen: boolean;
}

/** Below this change in pixels the per-frame style write is skipped. */
const MOVE_EPSILON = 0.5;

/** World objective marker. Off screen it rides the screen edge with an arrow pointing outward. */
export class ObjectiveMarker {
  private readonly root = h('div', 'iv-marker');
  private readonly arrow = h('i', 'iv-marker__arrow');
  private readonly distance = h('span', 'iv-marker__distance');
  private visible = false;
  private onScreen = true;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastAngle = Number.NaN;
  private lastMetres = -1;

  constructor(parent: HTMLElement, private readonly viewport: Viewport) {
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    const body = h('div', 'iv-marker__body');
    body.append(this.arrow, h('i', 'iv-marker__diamond'), this.distance);
    this.root.append(body);
    parent.append(this.root);
  }

  update(state: ObjectiveMarkerState | null): void {
    if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y)) {
      if (this.visible) {
        this.visible = false;
        this.root.hidden = true;
      }
      return;
    }
    if (!this.visible) {
      this.visible = true;
      this.root.hidden = false;
    }
    if (state.onScreen !== this.onScreen) {
      this.onScreen = state.onScreen;
      this.root.classList.toggle('is-offscreen', !state.onScreen);
    }

    const { width, height } = this.viewport;
    const marginX = Math.max(56, width * 0.05);
    const marginY = Math.max(56, height * 0.09);
    let x = state.x;
    let y = state.y;

    if (!state.onScreen) {
      // Slide along the line from the centre, which also handles projections from behind the camera.
      const centreX = width * 0.5;
      const centreY = height * 0.5;
      const dx = x - centreX;
      const dy = y - centreY === 0 && dx === 0 ? 1 : y - centreY;
      const scale = Math.min(
        dx === 0 ? Number.POSITIVE_INFINITY : (centreX - marginX) / Math.abs(dx),
        dy === 0 ? Number.POSITIVE_INFINITY : (centreY - marginY) / Math.abs(dy),
      );
      x = centreX + dx * scale;
      y = centreY + dy * scale;
      const angle = Math.atan2(dy, dx);
      if (Math.abs(angle - this.lastAngle) > 0.01 || Number.isNaN(this.lastAngle)) {
        this.lastAngle = angle;
        this.arrow.style.transform = `rotate(${angle.toFixed(3)}rad)`;
      }
    }

    x = clamp(x, marginX, width - marginX);
    y = clamp(y, marginY, height - marginY);
    if (Number.isNaN(this.lastX) || Math.abs(x - this.lastX) > MOVE_EPSILON || Math.abs(y - this.lastY) > MOVE_EPSILON) {
      this.lastX = x;
      this.lastY = y;
      this.root.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    const metres = Math.max(0, Math.round(state.distance));
    if (metres !== this.lastMetres) {
      this.lastMetres = metres;
      setText(this.distance, `${metres} M`);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
