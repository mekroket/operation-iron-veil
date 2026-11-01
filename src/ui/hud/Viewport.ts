import { Disposer } from '../dom';

/** Cached window size, so per-frame HUD code never touches layout. */
export class Viewport {
  width = window.innerWidth;
  height = window.innerHeight;
  private readonly disposer = new Disposer();

  constructor() {
    this.disposer.listen(window, 'resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
    });
  }

  dispose(): void {
    this.disposer.dispose();
  }
}
