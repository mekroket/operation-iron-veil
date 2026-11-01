import { Disposer, h } from './dom';
import { firstNavTarget, handleNavKey } from './menuNav';

/** Base for every full-screen menu. Subclasses build their DOM after super() and clean up through `disposer`. */
export abstract class Screen {
  readonly element: HTMLElement;
  protected readonly disposer = new Disposer();

  constructor(className: string) {
    this.element = h('section', `iv-screen ${className}`);
  }

  /** Esc while this screen is on top. Root screens ignore it. */
  back(): void {
    // Default: nothing to go back to.
  }

  focusInitial(): void {
    firstNavTarget(this.element)?.focus();
  }

  /** The area PageUp and PageDown scroll, when the screen has long content. */
  protected scrollArea(): HTMLElement | null {
    return null;
  }

  /** Returns true when focus moved. */
  handleKey(event: KeyboardEvent): boolean {
    if (event.key === 'Escape') {
      this.back();
      return false;
    }
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      const area = this.scrollArea();
      if (area) {
        event.preventDefault();
        area.scrollBy({ top: (event.key === 'PageDown' ? 1 : -1) * area.clientHeight * 0.8 });
      }
      return false;
    }
    return handleNavKey(this.element, event);
  }

  dispose(): void {
    this.disposer.dispose();
    this.element.remove();
  }
}
