/** Settings rows. Each writes straight to the store and re-reads from it, so presets and reset stay in step. */
import type { GameSettings, SettingsStore } from '../../settings/settings';
import { h, setText, type Disposer } from '../dom';

export interface SettingRow {
  readonly element: HTMLElement;
  sync(settings: GameSettings): void;
}

interface RowContext {
  disposer: Disposer;
  store: SettingsStore;
}

export function makeRowContext(disposer: Disposer, store: SettingsStore): RowContext {
  return { disposer, store };
}

function rowShell(label: string, hint?: string): { row: HTMLElement; control: HTMLElement } {
  const row = h('div', 'iv-row');
  const text = h('div', 'iv-row__text');
  text.append(h('span', 'iv-row__label', label));
  if (hint) text.append(h('span', 'iv-row__hint', hint));
  const control = h('div', 'iv-row__control');
  row.append(text, control);
  return { row, control };
}

export function sliderRow(
  { disposer, store }: RowContext,
  options: {
    label: string;
    min: number;
    max: number;
    step: number;
    format(value: number): string;
    read(settings: GameSettings): number;
    write(draft: GameSettings, value: number): void;
  },
): SettingRow {
  const { row, control } = rowShell(options.label);
  const input = h('input', 'iv-slider');
  input.type = 'range';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.dataset.nav = '';
  input.setAttribute('aria-label', options.label);
  const readout = h('output', 'iv-row__value');
  control.append(input, readout);

  const paint = (value: number): void => {
    const fill = ((value - options.min) / (options.max - options.min)) * 100;
    input.style.setProperty('--fill', `${fill.toFixed(2)}%`);
    setText(readout, options.format(value));
  };
  disposer.listen(input, 'input', () => {
    const value = Number(input.value);
    store.update((draft) => options.write(draft, value));
  });

  return {
    element: row,
    sync(settings) {
      const value = options.read(settings);
      // The browser may snap to the step, so a slider mid-drag is only rewritten when it really differs.
      if (Math.abs(Number(input.value) - value) > 1e-6) input.value = String(value);
      paint(Number(input.value));
    },
  };
}

export function segmentRow<T extends string>(
  { disposer, store }: RowContext,
  options: {
    label: string;
    hint?: string;
    choices: readonly { value: T; label: string }[];
    /** May return something outside `choices` (the "custom" preset): then nothing is selected. */
    read(settings: GameSettings): string;
    write(draft: GameSettings, value: T): void;
  },
): SettingRow {
  const { row, control } = rowShell(options.label, options.hint);
  const group = h('div', 'iv-segment');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', options.label);
  group.dataset.navRow = '';
  const buttons = options.choices.map((choice) => {
    const button = h('button', 'iv-segment__option', choice.label);
    button.type = 'button';
    button.dataset.nav = '';
    button.setAttribute('role', 'radio');
    disposer.listen(button, 'click', () => {
      store.update((draft) => options.write(draft, choice.value));
    });
    group.append(button);
    return { button, value: choice.value as string };
  });
  control.append(group);

  return {
    element: row,
    sync(settings) {
      const current = options.read(settings);
      for (const { button, value } of buttons) button.setAttribute('aria-checked', String(value === current));
    },
  };
}

export function toggleRow(
  { disposer, store }: RowContext,
  options: {
    label: string;
    hint?: string;
    read(settings: GameSettings): boolean;
    write(draft: GameSettings, value: boolean): void;
  },
): SettingRow {
  const { row, control } = rowShell(options.label, options.hint);
  const button = h('button', 'iv-toggle');
  button.type = 'button';
  button.dataset.nav = '';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', options.label);
  const track = h('span', 'iv-toggle__track');
  track.append(h('span', 'iv-toggle__thumb'));
  const state = h('span', 'iv-toggle__state');
  button.append(track, state);
  disposer.listen(button, 'click', () => {
    store.update((draft) => options.write(draft, !options.read(draft)));
  });
  control.append(button);

  return {
    element: row,
    sync(settings) {
      const on = options.read(settings);
      button.setAttribute('aria-checked', String(on));
      setText(state, on ? 'ON' : 'OFF');
    },
  };
}

/** A real fullscreen switch, with browser refusals reported in place rather than swallowed. */
export function fullscreenRow(disposer: Disposer): SettingRow {
  const { row, control } = rowShell('Fullscreen', 'Applies immediately. Esc also leaves fullscreen.');
  const button = h('button', 'iv-secondary iv-secondary--compact');
  button.type = 'button';
  button.dataset.nav = '';
  const message = h('p', 'iv-row__error');
  message.setAttribute('role', 'status');
  control.classList.add('iv-row__control--stacked');
  control.append(button, message);

  const paint = (): void => {
    setText(button, document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN');
  };
  const toggle = async (): Promise<void> => {
    setText(message, '');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setText(message, 'The browser refused fullscreen. Use F11 or your browser menu instead.');
    }
  };
  disposer.listen(button, 'click', () => void toggle());
  disposer.listen(document, 'fullscreenchange', paint);

  if (!document.fullscreenEnabled) {
    button.disabled = true;
    setText(message, 'Fullscreen is not available in this browser or embed.');
  }
  paint();
  return {
    element: row,
    sync() {
      paint();
    },
  };
}
