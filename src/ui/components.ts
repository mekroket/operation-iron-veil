/** Pieces shared by several screens. */
import { GAME_TITLE, MISSION_01 } from '../missions/canon';
import { h } from './dom';

/** Bindings as implemented in src/core/Input.ts. These keys are not rebindable. */
export const KEY_BINDINGS: readonly { action: string; keys: readonly string[] }[] = [
  { action: 'Move', keys: ['W', 'A', 'S', 'D'] },
  { action: 'Look', keys: ['Mouse'] },
  { action: 'Fire', keys: ['LMB'] },
  { action: 'Aim down sights', keys: ['RMB'] },
  { action: 'Reload', keys: ['R'] },
  { action: 'Sprint', keys: ['Shift'] },
  { action: 'Crouch', keys: ['C', 'Ctrl'] },
  { action: 'Jump', keys: ['Space'] },
  { action: 'Interact', keys: ['E'] },
  { action: 'Weapons', keys: ['1', '2', '3', 'Wheel'] },
  { action: 'Pause', keys: ['Esc'] },
];

export const MISSION_LABEL = `MISSION ${MISSION_01.number} — ${MISSION_01.title}`;

/** "OPERATION" as a tracked kicker over "IRON VEIL" as the display line. */
export function titleLockup(size: 'large' | 'small' = 'large'): HTMLElement {
  const [kicker, main] = GAME_TITLE.split(': ');
  const lockup = h('h1', `iv-lockup iv-lockup--${size}`);
  lockup.setAttribute('aria-label', GAME_TITLE);
  lockup.append(h('span', 'iv-lockup__kicker', kicker), h('span', 'iv-lockup__main', main));
  return lockup;
}

export function keyList(): HTMLElement {
  const list = h('dl', 'iv-keys');
  for (const binding of KEY_BINDINGS) {
    const row = h('div', 'iv-keys__row');
    const keys = h('dd', 'iv-keys__caps');
    for (const key of binding.keys) keys.append(h('kbd', 'iv-keycap', key));
    row.append(h('dt', 'iv-keys__action', binding.action), keys);
    list.append(row);
  }
  return list;
}

/** Heading block used at the top of every sub-screen. */
export function screenHeader(eyebrow: string, title: string): HTMLElement {
  const header = h('header', 'iv-header');
  header.append(h('p', 'iv-header__eyebrow', eyebrow), h('h2', 'iv-header__title', title));
  return header;
}

/** "ESC  BACK" style legend. */
export function hintLine(items: readonly (readonly [string, string])[]): HTMLElement {
  const line = h('p', 'iv-hints');
  for (const [key, label] of items) {
    const item = h('span', 'iv-hints__item');
    item.append(h('kbd', 'iv-keycap iv-keycap--small', key), h('span', '', label));
    line.append(item);
  }
  return line;
}
