import type { EventBus, GameEvents } from '../../core/events';
import { Disposer, h, prefersReducedMotion, setText } from '../dom';

const SLOT_COUNT = 3;
const LOW_AMMO_FRACTION = 0.25;

/** Bottom-right block. Stays hidden until the first 'weapon:hud' event says there is a weapon to show. */
export class AmmoPanel {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-ammo');
  private readonly mag = h('span', 'iv-ammo__mag');
  private readonly reserve = h('span', 'iv-ammo__reserve');
  private readonly weapon = h('span', 'iv-ammo__weapon');
  private readonly mode = h('span', 'iv-ammo__mode');
  private readonly state = h('span', 'iv-ammo__state');
  private readonly reloadFill = h('i', 'iv-ammo__reload-fill');
  private readonly slots: { root: HTMLElement; name: HTMLElement }[] = [];
  private reloadAnimation: Animation | null = null;

  constructor(parent: HTMLElement, bus: EventBus) {
    this.root.hidden = true;

    const counts = h('div', 'iv-ammo__counts');
    counts.append(this.mag, h('span', 'iv-ammo__separator', '/'), this.reserve);

    const info = h('div', 'iv-ammo__info');
    info.append(this.weapon, this.mode);

    const reloadBar = h('div', 'iv-ammo__reload');
    reloadBar.append(this.reloadFill);

    const slotRow = h('div', 'iv-ammo__slots');
    for (let index = 0; index < SLOT_COUNT; index++) {
      const slot = h('div', 'iv-slot');
      const name = h('span', 'iv-slot__name');
      slot.append(h('span', 'iv-slot__key', String(index + 1)), name);
      slotRow.append(slot);
      this.slots.push({ root: slot, name });
    }

    this.root.append(this.state, counts, reloadBar, info, slotRow);
    parent.append(this.root);

    this.disposer.add(bus.on('weapon:hud', (payload) => this.render(payload)));
    this.disposer.add(bus.on('weapon:reloadStart', ({ duration }) => this.startReloadBar(duration)));
    this.disposer.add(bus.on('weapon:reloadEnd', () => this.stopReloadBar()));
  }

  dispose(): void {
    this.stopReloadBar();
    this.disposer.dispose();
    this.root.remove();
  }

  private render(payload: GameEvents['weapon:hud']): void {
    this.root.hidden = false;
    setText(this.mag, String(payload.mag));
    setText(this.reserve, String(payload.reserve));
    setText(this.weapon, payload.displayName);
    setText(this.mode, payload.fireMode);

    const empty = payload.mag === 0;
    const low = !empty && payload.mag <= Math.ceil(payload.magSize * LOW_AMMO_FRACTION);
    const noReserve = payload.reserve === 0;
    this.root.classList.toggle('is-low', low);
    this.root.classList.toggle('is-empty', empty);
    this.root.classList.toggle('is-no-reserve', noReserve);
    this.root.classList.toggle('is-reloading', payload.reloading);

    let state = '';
    if (payload.reloading) state = 'RELOADING';
    else if (empty) state = noReserve ? 'OUT OF AMMO' : 'EMPTY';
    else if (low) state = 'LOW AMMO';
    setText(this.state, state);

    if (!payload.reloading) this.stopReloadBar();

    this.slots.forEach((slot, index) => {
      const data = payload.slots[index];
      slot.root.classList.toggle('is-active', data?.active ?? false);
      slot.root.classList.toggle('is-vacant', data === undefined);
      setText(slot.name, data?.displayName ?? '');
    });
  }

  private startReloadBar(durationSeconds: number): void {
    this.stopReloadBar();
    if (prefersReducedMotion() || durationSeconds <= 0) return;
    this.reloadAnimation = this.reloadFill.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: durationSeconds * 1000, easing: 'linear', fill: 'forwards' },
    );
  }

  private stopReloadBar(): void {
    this.reloadAnimation?.cancel();
    this.reloadAnimation = null;
  }
}
