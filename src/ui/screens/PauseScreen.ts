import { MISSION_LABEL, hintLine } from '../components';
import { h, navButton, stagger } from '../dom';
import { Screen } from '../Screen';

export interface PauseActions {
  onResume(): void;
  onRestartCheckpoint(): void;
  onRestartMission(): void;
  onSettings(): void;
  onMainMenu(): void;
}

/** Esc is deliberately inert here: browsers refuse to re-lock the pointer from an Esc press, so RESUME needs a click. */
export class PauseScreen extends Screen {
  constructor(actions: PauseActions) {
    super('iv-screen--dim');
    const column = h('div', 'iv-menu-column');
    const nav = h('nav', 'iv-menu-list iv-menu-list--compact iv-stagger');
    nav.setAttribute('aria-label', 'Pause menu');
    nav.append(
      navButton(this.disposer, 'iv-menu-item', 'RESUME', actions.onResume),
      navButton(this.disposer, 'iv-menu-item', 'RESTART CHECKPOINT', actions.onRestartCheckpoint),
      navButton(this.disposer, 'iv-menu-item', 'RESTART MISSION', actions.onRestartMission),
      navButton(this.disposer, 'iv-menu-item', 'SETTINGS', actions.onSettings),
      navButton(this.disposer, 'iv-menu-item', 'MAIN MENU', actions.onMainMenu),
    );
    stagger(nav);
    const footer = h('footer', 'iv-menu-footer');
    footer.append(hintLine([['↑↓', 'Select'], ['Enter', 'Confirm']]));
    column.append(h('p', 'iv-status-line', MISSION_LABEL), h('h2', 'iv-display', 'PAUSED'), nav, footer);
    this.element.append(column);
  }
}
