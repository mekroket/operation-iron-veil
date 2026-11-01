/** Small always-mounted layers: letterbox, resume prompt and notices. */
import { Disposer, h, setText } from './dom';

export class Letterbox {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-letterbox');
  private readonly skip = h('button', 'iv-letterbox__skip');
  private active = false;
  private skippable = false;
  private skipUsed = false;

  /** `canSkip` lets the owner veto the key while a menu is on top. */
  constructor(parent: HTMLElement, private readonly onSkip: () => void, private readonly canSkip: () => boolean) {
    this.skip.type = 'button';
    this.skip.tabIndex = -1;
    this.skip.append(h('kbd', 'iv-keycap iv-keycap--small', 'Space'), h('span', '', 'SKIP'));
    this.skip.hidden = true;
    this.root.append(h('i', 'iv-letterbox__bar iv-letterbox__bar--top'), h('i', 'iv-letterbox__bar iv-letterbox__bar--bottom'), this.skip);
    parent.append(this.root);

    this.disposer.listen(this.skip, 'click', () => this.trigger());
    this.disposer.listen(document, 'keydown', (event) => {
      if (!this.active || !this.skippable || this.skipUsed || event.repeat) return;
      if ((event.code !== 'Space' && event.code !== 'Enter') || !this.canSkip()) return;
      event.preventDefault();
      this.trigger();
    });
  }

  set(active: boolean, skippable: boolean): void {
    if (active && !this.active) this.skipUsed = false;
    this.active = active;
    this.skippable = skippable;
    this.root.classList.toggle('is-active', active);
    this.skip.hidden = !active || !skippable || this.skipUsed;
  }

  dispose(): void {
    this.disposer.dispose();
    this.root.remove();
  }

  private trigger(): void {
    this.skipUsed = true;
    this.skip.hidden = true;
    this.onSkip();
  }
}

/** Full-viewport button, for when the browser needs one more click before it will lock the pointer again. */
export class ResumePrompt {
  private readonly disposer = new Disposer();
  private readonly button = h('button', 'iv-resume');

  constructor(parent: HTMLElement, onResume: () => void) {
    this.button.type = 'button';
    this.button.hidden = true;
    this.button.append(h('span', 'iv-resume__label', 'CLICK TO RESUME'));
    parent.append(this.button);
    this.disposer.listen(this.button, 'click', () => onResume());
  }

  get visible(): boolean {
    return !this.button.hidden;
  }

  set(visible: boolean): void {
    if (visible === this.visible) return;
    this.button.hidden = !visible;
    if (visible) this.button.focus();
  }

  dispose(): void {
    this.disposer.dispose();
    this.button.remove();
  }
}

/** Non-blocking message, such as fullscreen denied. A new notice replaces the current one. */
export class Notice {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-notice');
  private cancel: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root.setAttribute('role', 'status');
    parent.append(this.root);
  }

  show(message: string, seconds: number): void {
    this.cancel?.();
    setText(this.root, message);
    this.root.classList.add('is-visible');
    this.cancel = this.disposer.timeout(() => {
      this.root.classList.remove('is-visible');
    }, Math.max(0.5, seconds) * 1000);
  }

  dispose(): void {
    this.disposer.dispose();
    this.root.remove();
  }
}
