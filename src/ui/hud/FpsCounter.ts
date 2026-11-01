import type { SettingsStore } from '../../settings/settings';
import { h, setText } from '../dom';

/** Shows only when the game supplies a value and the player has the counter switched on. */
export class FpsCounter {
  private readonly root = h('div', 'iv-fps');
  private readonly unsubscribe: () => void;
  private fps: number | null = null;
  private enabled: boolean;

  constructor(parent: HTMLElement, settings: SettingsStore) {
    this.enabled = settings.get().graphics.showFps;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
    this.unsubscribe = settings.subscribe((next) => {
      this.enabled = next.graphics.showFps;
      this.refresh();
    });
  }

  set(fps: number | null): void {
    this.fps = fps;
    this.refresh();
  }

  dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private refresh(): void {
    const show = this.enabled && this.fps !== null;
    if (this.root.hidden === show) this.root.hidden = !show;
    if (show) setText(this.root, `${Math.round(this.fps ?? 0)} FPS`);
  }
}
