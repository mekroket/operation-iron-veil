import { STUDIO_LINE } from '../../missions/canon';
import { MISSION_LABEL, hintLine, titleLockup } from '../components';
import { h, navButton, stagger } from '../dom';
import { Screen } from '../Screen';
import type { CampaignStatus } from '../UIManager';

export interface MainMenuActions {
  onCampaign(): void;
  onSettings(): void;
  onCredits(): void;
  onExit(): void;
}

export class MainMenuScreen extends Screen {
  constructor(status: CampaignStatus, actions: MainMenuActions) {
    super('iv-screen--menu');
    const column = h('div', 'iv-menu-column');
    const nav = h('nav', 'iv-menu-list iv-stagger');
    nav.setAttribute('aria-label', 'Main menu');
    nav.append(
      navButton(this.disposer, 'iv-menu-item', 'CAMPAIGN', actions.onCampaign),
      navButton(this.disposer, 'iv-menu-item', 'SETTINGS', actions.onSettings),
      navButton(this.disposer, 'iv-menu-item', 'CREDITS', actions.onCredits),
      navButton(this.disposer, 'iv-menu-item', 'EXIT', actions.onExit),
    );
    stagger(nav);
    column.append(titleLockup('large'), h('p', 'iv-tagline', STUDIO_LINE), nav);

    const footer = h('footer', 'iv-menu-footer');
    const line = statusLine(status);
    if (line) footer.append(h('p', 'iv-status-line', line));
    footer.append(hintLine([['↑↓', 'Select'], ['Enter', 'Confirm']]));
    column.append(footer);
    this.element.append(column);
  }
}

function statusLine(status: CampaignStatus): string | null {
  const parts: string[] = [];
  if (status.completed) parts.push(`${MISSION_LABEL}: COMPLETE`);
  if (status.bestGrade) parts.push(`BEST GRADE ${status.bestGrade}`);
  if (status.hasCheckpoint) parts.push('CHECKPOINT SAVED');
  return parts.length > 0 ? parts.join(' / ') : null;
}
