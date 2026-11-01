import { clamp } from '../../core/math';
import { MISSION_01 } from '../../missions/canon';
import { titleLockup } from '../components';
import { Disposer, h, setText } from '../dom';

const TIP_SECONDS = 6;
const TIPS: readonly string[] = [
  MISSION_01.rules,
  'Aiming down sights tightens your spread. Hold the right mouse button before you commit to a shot.',
  'Headshots end a fight faster than anything else you are carrying.',
  'Keys 1, 2 and 3 switch weapons. So does the mouse wheel.',
  'Watch your reserve. Ammunition and medkits are out there if you take the time to look.',
  'Checkpoints save your progress. Pick one up again from the Campaign screen.',
  'Break line of sight before you reload.',
];

/** Boot and mission loading. Opaque, because the scene behind it is not ready to be seen. */
export class LoadingScreen {
  readonly element = h('section', 'iv-loading');
  private readonly disposer = new Disposer();
  private readonly bar = h('div', 'iv-loading__fill');
  private readonly track = h('div', 'iv-loading__track');
  private readonly label = h('p', 'iv-loading__label');
  private readonly percent = h('p', 'iv-loading__percent', '0%');
  private readonly tip = h('p', 'iv-loading__tip');
  private stopTips: (() => void) | null = null;
  private tipIndex = Math.floor(Math.random() * TIPS.length);

  constructor(parent: HTMLElement) {
    this.element.hidden = true;
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.track.append(this.bar);

    const status = h('div', 'iv-loading__status');
    status.append(this.label, this.percent);
    const tipBlock = h('div', 'iv-loading__tip-block');
    tipBlock.append(h('h3', 'iv-section-label', 'FIELD NOTE'), this.tip);
    const column = h('div', 'iv-loading__column');
    column.append(titleLockup('large'), status, this.track, tipBlock);
    this.element.append(column);
    parent.append(this.element);
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  update(fraction: number, label: string): void {
    const value = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0;
    const percent = Math.round(value * 100);
    this.bar.style.transform = `scaleX(${value.toFixed(4)})`;
    this.track.setAttribute('aria-valuenow', String(percent));
    setText(this.percent, `${percent}%`);
    setText(this.label, label);
    if (!this.visible) {
      this.element.hidden = false;
      this.showTip();
      this.stopTips = this.disposer.interval(() => this.showTip(), TIP_SECONDS * 1000);
    }
  }

  hide(): void {
    this.element.hidden = true;
    this.stopTips?.();
    this.stopTips = null;
  }

  dispose(): void {
    this.disposer.dispose();
    this.element.remove();
  }

  private showTip(): void {
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
    setText(this.tip, TIPS[this.tipIndex] ?? '');
  }
}
