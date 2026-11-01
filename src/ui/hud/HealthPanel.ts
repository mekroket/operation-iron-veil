import type { EventBus } from '../../core/events';
import { clamp } from '../../core/math';
import { Disposer, h, setText } from '../dom';

const SEGMENTS = 10;
const LOW_HEALTH_FRACTION = 0.3;

/**
 * Bottom-left bar plus the full-screen damage feedback.
 * 'player:damaged' only carries a world position, so damage shows as an edge vignette rather than a directional arc.
 */
export class HealthPanel {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-health');
  private readonly value = h('span', 'iv-health__value');
  private readonly fills: HTMLElement[] = [];
  private readonly damageVignette = h('div', 'iv-vignette iv-vignette--damage');
  private readonly lowVignette = h('div', 'iv-vignette iv-vignette--low');
  private flash: Animation | null = null;
  private maxHealth = 100;

  constructor(parent: HTMLElement, bus: EventBus) {
    const bar = h('div', 'iv-health__bar');
    for (let index = 0; index < SEGMENTS; index++) {
      const segment = h('div', 'iv-health__segment');
      const fill = h('i', 'iv-health__fill');
      segment.append(fill);
      bar.append(segment);
      this.fills.push(fill);
    }
    const readout = h('div', 'iv-health__readout');
    readout.append(h('span', 'iv-health__label', 'HEALTH'), this.value);
    this.root.append(readout, bar);
    this.damageVignette.setAttribute('aria-hidden', 'true');
    this.lowVignette.setAttribute('aria-hidden', 'true');
    parent.append(this.lowVignette, this.damageVignette, this.root);
    this.render(this.maxHealth, this.maxHealth);

    this.disposer.add(
      bus.on('player:damaged', ({ amount, health, maxHealth }) => {
        this.render(health, maxHealth);
        this.pulseDamage(amount / Math.max(1, maxHealth));
      }),
    );
    this.disposer.add(bus.on('player:healed', ({ health, maxHealth }) => this.render(health, maxHealth)));
  }

  /** Back to full. A restore to anything lower must follow up with 'player:healed'. */
  reset(): void {
    this.flash?.cancel();
    this.flash = null;
    this.render(this.maxHealth, this.maxHealth);
  }

  dispose(): void {
    this.flash?.cancel();
    this.disposer.dispose();
    this.root.remove();
    this.damageVignette.remove();
    this.lowVignette.remove();
  }

  private render(health: number, maxHealth: number): void {
    this.maxHealth = Math.max(1, maxHealth);
    const fraction = clamp(health / this.maxHealth, 0, 1);
    const filled = fraction * SEGMENTS;
    this.fills.forEach((fill, index) => {
      fill.style.transform = `scaleX(${clamp(filled - index, 0, 1).toFixed(3)})`;
    });
    setText(this.value, String(Math.ceil(Math.max(0, health))));
    const low = fraction <= LOW_HEALTH_FRACTION;
    this.root.classList.toggle('is-low', low);
    this.lowVignette.classList.toggle('is-active', low && fraction > 0);
  }

  private pulseDamage(severity: number): void {
    const peak = clamp(0.35 + severity * 2.5, 0.35, 1);
    this.flash?.cancel();
    this.flash = this.damageVignette.animate([{ opacity: peak }, { opacity: 0 }], { duration: 620, easing: 'ease-out' });
  }
}
