import type { EventBus } from '../../core/events';
import { clamp } from '../../core/math';
import { Disposer, h, setText } from '../dom';

/** Centre-lower "[E] Do thing" prompt with a hold-progress bar. */
export class InteractionPrompt {
  private readonly disposer = new Disposer();
  private readonly root = h('div', 'iv-prompt');
  private readonly text = h('span', 'iv-prompt__text');
  private readonly progress = h('div', 'iv-prompt__progress');
  private readonly fill = h('i', 'iv-prompt__fill');
  private lastProgress = -1;

  constructor(parent: HTMLElement, bus: EventBus) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    const line = h('div', 'iv-prompt__line');
    line.append(h('kbd', 'iv-keycap', 'E'), this.text);
    this.progress.append(this.fill);
    this.root.append(line, this.progress);
    parent.append(this.root);

    this.disposer.add(bus.on('interaction:prompt', ({ text, holdProgress }) => this.render(text, holdProgress)));
  }

  clear(): void {
    this.render(null, 0);
  }

  dispose(): void {
    this.disposer.dispose();
    this.root.remove();
  }

  private render(text: string | null, holdProgress: number): void {
    const visible = text !== null;
    if (this.root.hidden === visible) this.root.hidden = !visible;
    if (text === null) return;
    setText(this.text, text);
    const value = clamp(holdProgress, 0, 1);
    if (Math.abs(value - this.lastProgress) < 0.005) return;
    this.lastProgress = value;
    this.progress.classList.toggle('is-active', value > 0);
    this.fill.style.transform = `scaleX(${value.toFixed(3)})`;
  }
}
