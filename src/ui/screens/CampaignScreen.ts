import { MISSION_01 } from '../../missions/canon';
import { MISSION_LABEL, hintLine, keyList, screenHeader } from '../components';
import { h, navButton } from '../dom';
import { Screen } from '../Screen';
import type { CampaignStatus } from '../UIManager';

export interface CampaignActions {
  onStart(fromCheckpoint: boolean): void;
  onBack(): void;
}

export class CampaignScreen extends Screen {
  private readonly scroller = h('div', 'iv-scroll iv-campaign__body');
  private readonly continueButton: HTMLButtonElement | null;
  private readonly startButton: HTMLButtonElement;

  constructor(status: CampaignStatus, private readonly actions: CampaignActions) {
    super('iv-screen--sub iv-campaign');

    const header = screenHeader('CAMPAIGN', MISSION_LABEL);
    header.append(this.buildStatus(status));

    const brief = h('article', 'iv-brief iv-rise');
    brief.append(this.buildFacts(), h('p', 'iv-brief__summary', MISSION_01.summary));
    const tasking = h('ol', 'iv-brief__tasking');
    for (const task of MISSION_01.tasking) tasking.append(h('li', '', task));
    brief.append(h('h3', 'iv-section-label', 'TASKING'), tasking);
    brief.append(h('h3', 'iv-section-label', 'RULES OF ENGAGEMENT'), h('p', 'iv-brief__rules', MISSION_01.rules));

    const controls = h('aside', 'iv-campaign__controls iv-rise');
    controls.append(h('h3', 'iv-section-label', 'CONTROLS'), keyList());
    this.scroller.append(brief, controls);

    this.startButton = navButton(this.disposer, 'iv-primary', 'START MISSION', () => actions.onStart(false));
    this.continueButton = status.hasCheckpoint
      ? navButton(this.disposer, 'iv-secondary', 'CONTINUE FROM CHECKPOINT', () => actions.onStart(true))
      : null;

    const launch = h('div', 'iv-campaign__launch');
    launch.dataset.navRow = '';
    launch.append(this.startButton);
    if (this.continueButton) launch.append(this.continueButton);

    const footer = h('footer', 'iv-footer');
    footer.append(
      navButton(this.disposer, 'iv-ghost', 'BACK', actions.onBack),
      hintLine([['Esc', 'Back'], ['PgUp', 'Scroll brief']]),
    );
    this.element.append(header, this.scroller, launch, footer);
  }

  override focusInitial(): void {
    (this.continueButton ?? this.startButton).focus();
  }

  override back(): void {
    this.actions.onBack();
  }

  protected override scrollArea(): HTMLElement {
    return this.scroller;
  }

  private buildStatus(status: CampaignStatus): HTMLElement {
    const box = h('div', 'iv-campaign__status');
    if (status.completed) box.append(h('span', 'iv-tag iv-tag--accent', 'COMPLETED'));
    if (status.bestGrade) box.append(h('span', 'iv-tag', `BEST GRADE ${status.bestGrade}`));
    if (status.hasCheckpoint) box.append(h('span', 'iv-tag', 'CHECKPOINT AVAILABLE'));
    return box;
  }

  private buildFacts(): HTMLElement {
    const facts = h('dl', 'iv-facts');
    const rows: readonly (readonly [string, string])[] = [
      ['LOCATION', MISSION_01.location],
      ['TIME', MISSION_01.time],
      ['OPERATOR', MISSION_01.operator],
      ['HANDLER', MISSION_01.handler],
      ['OPPOSITION', MISSION_01.enemy],
    ];
    for (const [label, value] of rows) {
      const row = h('div', 'iv-facts__row');
      row.append(h('dt', '', label), h('dd', '', value));
      facts.append(row);
    }
    return facts;
  }
}
