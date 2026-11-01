import type { EventBus } from '../../core/events';
import { Disposer, h, prefersReducedMotion, setText } from '../dom';

const BANNER_SECONDS = 3.2;

/** Top-left objective text with its "OBJECTIVE UPDATED" banner. */
export class ObjectivePanel {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-objective');
  private readonly banner = h('p', 'iv-objective__banner', 'OBJECTIVE UPDATED');
  private readonly step = h('span', 'iv-objective__step');
  private readonly text = h('p', 'iv-objective__text');
  private currentKey: string | null = null;
  private hudVisible = false;
  private bannerPending = false;
  private cancelBanner: (() => void) | null = null;

  constructor(parent: HTMLElement, bus: EventBus) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    const line = h('div', 'iv-objective__line');
    line.append(this.step, this.text);
    this.root.append(this.banner, line);
    parent.append(this.root);

    this.disposer.add(
      bus.on('mission:objective', ({ stageId, text, index, total }) => {
        // A checkpoint restore re-announces the same stage. That is not news to the player.
        const key = `${stageId}|${text}`;
        if (key === this.currentKey) return;
        this.currentKey = key;
        this.root.hidden = false;
        // `index` is taken as zero-based.
        setText(this.step, `${String(Math.min(index + 1, total)).padStart(2, '0')}/${String(total).padStart(2, '0')}`);
        setText(this.text, text);
        if (this.hudVisible) this.playBanner();
        else this.bannerPending = true;
      }),
    );
  }

  /** Objectives that arrive during a cinematic get their banner when the HUD returns. */
  setHudVisible(visible: boolean): void {
    this.hudVisible = visible;
    if (visible && this.bannerPending) this.playBanner();
  }

  clear(): void {
    this.currentKey = null;
    this.bannerPending = false;
    this.cancelBanner?.();
    this.cancelBanner = null;
    this.banner.classList.remove('is-visible');
    this.root.hidden = true;
  }

  dispose(): void {
    this.disposer.dispose();
    this.root.remove();
  }

  private playBanner(): void {
    this.bannerPending = false;
    this.cancelBanner?.();
    this.banner.classList.add('is-visible');
    this.cancelBanner = this.disposer.timeout(() => this.banner.classList.remove('is-visible'), BANNER_SECONDS * 1000);
    if (!prefersReducedMotion()) {
      this.root.animate(
        [{ opacity: 0, transform: 'translateX(-24px)' }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 280, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
      );
    }
  }
}
