import type { EventBus } from '../../core/events';
import { Disposer, h } from '../dom';

const CHECKPOINT_SECONDS = 2.6;
const PICKUP_SECONDS = 3;
const MAX_PICKUPS = 4;

/** Brief confirmations: "CHECKPOINT REACHED" and the pickup line feed. */
export class HudFeed {
  private readonly disposer = new Disposer();
  private readonly checkpoint = h('p', 'iv-checkpoint', 'CHECKPOINT REACHED');
  private readonly pickups = h('ul', 'iv-pickups');
  private cancelCheckpoint: (() => void) | null = null;

  constructor(parent: HTMLElement, bus: EventBus) {
    this.checkpoint.setAttribute('role', 'status');
    parent.append(this.checkpoint, this.pickups);

    this.disposer.add(
      bus.on('mission:checkpoint', () => {
        this.cancelCheckpoint?.();
        this.checkpoint.classList.add('is-visible');
        this.cancelCheckpoint = this.disposer.timeout(() => this.checkpoint.classList.remove('is-visible'), CHECKPOINT_SECONDS * 1000);
      }),
    );
    this.disposer.add(bus.on('pickup:collected', ({ kind, label }) => this.addPickup(kind, label)));
  }

  clear(): void {
    this.cancelCheckpoint?.();
    this.cancelCheckpoint = null;
    this.checkpoint.classList.remove('is-visible');
    this.pickups.replaceChildren();
  }

  dispose(): void {
    this.disposer.dispose();
    this.checkpoint.remove();
    this.pickups.remove();
  }

  private addPickup(kind: 'ammo' | 'medkit', label: string): void {
    const item = h('li', `iv-pickup iv-pickup--${kind}`);
    item.append(h('span', 'iv-pickup__mark', '+'), h('span', '', label));
    this.pickups.append(item);
    while (this.pickups.childElementCount > MAX_PICKUPS) this.pickups.firstElementChild?.remove();
    this.disposer.timeout(() => item.remove(), PICKUP_SECONDS * 1000);
  }
}
