import type { EventBus } from '../../core/events';
import { clamp } from '../../core/math';
import { Disposer, h } from '../dom';
import type { Viewport } from './Viewport';

/** Below this change in pixels the per-frame style write is skipped. */
const GAP_EPSILON = 0.2;

/** Four ticks whose gap shows the true shot spread on screen, plus a hit marker. */
export class Crosshair {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-crosshair');
  private readonly hitMarker = h('div', 'iv-hitmarker');
  private ads = false;
  private gap = -1;
  private flash: Animation | null = null;

  constructor(parent: HTMLElement, bus: EventBus, private readonly viewport: Viewport) {
    this.root.setAttribute('aria-hidden', 'true');
    for (const direction of ['up', 'right', 'down', 'left']) {
      this.root.append(h('i', `iv-crosshair__tick iv-crosshair__tick--${direction}`));
    }
    this.root.append(h('i', 'iv-crosshair__dot'));
    this.hitMarker.setAttribute('aria-hidden', 'true');
    for (const corner of ['a', 'b', 'c', 'd']) this.hitMarker.append(h('i', `iv-hitmarker__line iv-hitmarker__line--${corner}`));
    parent.append(this.root, this.hitMarker);

    this.disposer.add(bus.on('combat:enemyHit', ({ killed, zone }) => this.showHit(killed, zone === 'head')));
    this.disposer.add(bus.on('enemy:killed', ({ headshot }) => this.showHit(true, headshot)));
  }

  /** Called every frame. `spreadRadians` is the half-angle of the shot cone, `fovRadians` the vertical field of view. */
  update(spreadRadians: number, ads: boolean, fovRadians: number): void {
    if (ads !== this.ads) {
      this.ads = ads;
      this.root.classList.toggle('is-ads', ads);
    }
    if (ads || !Number.isFinite(spreadRadians) || !Number.isFinite(fovRadians) || fovRadians <= 0) return;
    const halfHeight = this.viewport.height * 0.5;
    const pixels = (Math.tan(Math.max(0, spreadRadians)) / Math.tan(fovRadians * 0.5)) * halfHeight;
    const gap = clamp(pixels, Math.max(3, halfHeight * 0.008), halfHeight * 0.45);
    if (Math.abs(gap - this.gap) < GAP_EPSILON) return;
    this.gap = gap;
    this.root.style.setProperty('--gap', `${gap.toFixed(1)}px`);
  }

  dispose(): void {
    this.flash?.cancel();
    this.disposer.dispose();
    this.root.remove();
    this.hitMarker.remove();
  }

  private showHit(kill: boolean, head: boolean): void {
    this.hitMarker.classList.toggle('is-kill', kill);
    this.hitMarker.classList.toggle('is-head', head);
    const from = kill ? 1.3 : 1;
    const to = kill ? 1.6 : 1.2;
    this.flash?.cancel();
    // Hit feedback is information rather than decoration, so it also plays with reduced motion.
    this.flash = this.hitMarker.animate(
      [
        { opacity: 1, transform: `scale(${from})` },
        { opacity: kill ? 0.9 : 0.7, transform: `scale(${(from + to) / 2})`, offset: 0.5 },
        { opacity: 0, transform: `scale(${to})` },
      ],
      { duration: kill ? 360 : 170, easing: 'ease-out' },
    );
  }
}
