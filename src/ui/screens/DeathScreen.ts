import { h, navButton, stagger } from '../dom';
import { Screen } from '../Screen';

export interface DeathActions {
  onRestartCheckpoint(): void;
  onRestartMission(): void;
  onMainMenu(): void;
}

export class DeathScreen extends Screen {
  constructor(actions: DeathActions) {
    super('iv-screen--death');
    const column = h('div', 'iv-menu-column');
    const nav = h('nav', 'iv-menu-list iv-menu-list--compact iv-stagger');
    nav.setAttribute('aria-label', 'Death menu');
    nav.append(
      navButton(this.disposer, 'iv-menu-item', 'RESTART CHECKPOINT', actions.onRestartCheckpoint),
      navButton(this.disposer, 'iv-menu-item', 'RESTART MISSION', actions.onRestartMission),
      navButton(this.disposer, 'iv-menu-item', 'MAIN MENU', actions.onMainMenu),
    );
    stagger(nav);
    column.append(h('p', 'iv-status-line iv-status-line--danger', 'OPERATOR DOWN'), h('h2', 'iv-display iv-display--kia', 'KIA'), nav);
    this.element.append(column);
  }
}
