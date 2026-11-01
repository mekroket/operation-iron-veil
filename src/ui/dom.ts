/** Small DOM helpers for the overlay. Text always goes through textContent, never innerHTML. */

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Writes only when different, so per-event updates do not dirty the DOM needlessly. */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Gives each child its index so CSS can stagger the entry animation. */
export function stagger(parent: HTMLElement): void {
  Array.from(parent.children).forEach((child, index) => {
    (child as HTMLElement).style.setProperty('--i', String(index));
  });
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Owns listeners, timers and subscriptions so that nothing outlives its owner. */
export class Disposer {
  private readonly cleanups = new Set<() => void>();

  add(cleanup: () => void): void {
    this.cleanups.add(cleanup);
  }

  listen<K extends keyof WindowEventMap>(target: Window, type: K, handler: (event: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, handler: (event: DocumentEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, handler: (event: never) => void, options?: AddEventListenerOptions): void {
    const listener = handler as unknown as EventListener;
    target.addEventListener(type, listener, options);
    this.cleanups.add(() => target.removeEventListener(type, listener, options));
  }

  /** Returns a cancel function. A timer that fired or was cancelled leaves no trace. */
  timeout(callback: () => void, milliseconds: number): () => void {
    const cancel = (): void => {
      window.clearTimeout(id);
      this.cleanups.delete(cancel);
    };
    const id = window.setTimeout(() => {
      this.cleanups.delete(cancel);
      callback();
    }, milliseconds);
    this.cleanups.add(cancel);
    return cancel;
  }

  /** Returns a cancel function. */
  interval(callback: () => void, milliseconds: number): () => void {
    const id = window.setInterval(callback, milliseconds);
    const cancel = (): void => {
      window.clearInterval(id);
      this.cleanups.delete(cancel);
    };
    this.cleanups.add(cancel);
    return cancel;
  }

  dispose(): void {
    for (const cleanup of [...this.cleanups]) cleanup();
    this.cleanups.clear();
  }
}

/** A real button that takes part in arrow-key navigation. */
export function navButton(disposer: Disposer, className: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = h('button', className, label);
  button.type = 'button';
  button.dataset.nav = '';
  disposer.listen(button, 'click', () => onClick());
  return button;
}
