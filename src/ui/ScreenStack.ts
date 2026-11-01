import type { Screen } from './Screen';

/** Menu navigation history. Lower screens stay alive but hidden, so going back restores focus exactly. */
export class ScreenStack {
  private readonly screens: Screen[] = [];
  private readonly savedFocus = new WeakMap<Screen, HTMLElement>();

  constructor(private readonly layer: HTMLElement) {
    this.layer.hidden = true;
  }

  get top(): Screen | null {
    return this.screens[this.screens.length - 1] ?? null;
  }

  get empty(): boolean {
    return this.screens.length === 0;
  }

  push(screen: Screen): void {
    const below = this.top;
    if (below) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && below.element.contains(focused)) this.savedFocus.set(below, focused);
      below.element.hidden = true;
    }
    this.screens.push(screen);
    this.layer.append(screen.element);
    this.layer.hidden = false;
    screen.focusInitial();
  }

  /** Goes back one screen. The root screen stays. */
  pop(): void {
    if (this.screens.length < 2) return;
    this.screens.pop()?.dispose();
    const revealed = this.top;
    if (!revealed) return;
    revealed.element.hidden = false;
    const focus = this.savedFocus.get(revealed);
    if (focus && revealed.element.contains(focus)) focus.focus();
    else revealed.focusInitial();
  }

  clear(): void {
    for (const screen of this.screens) screen.dispose();
    this.screens.length = 0;
    this.layer.hidden = true;
  }
}
