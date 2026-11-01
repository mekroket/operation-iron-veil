import type { MissionStats } from '../../core/types';
import { MISSION_LABEL } from '../components';
import { h, navButton, stagger } from '../dom';
import { Screen } from '../Screen';

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export class MissionCompleteScreen extends Screen {
  constructor(stats: MissionStats, onContinue: () => void) {
    super('iv-screen--dim iv-complete');
    const column = h('div', 'iv-complete__column');

    const header = h('header', 'iv-complete__header iv-rise');
    const heading = h('div');
    heading.append(h('p', 'iv-status-line', MISSION_LABEL), h('h2', 'iv-display', 'MISSION COMPLETE'));
    const grade = h('div', 'iv-grade');
    grade.append(h('span', 'iv-grade__label', 'GRADE'), h('span', 'iv-grade__value', stats.grade));
    header.append(heading, grade);

    const rows: readonly (readonly [string, string])[] = [
      ['TIME', formatTime(stats.elapsedSeconds)],
      ['ENEMIES', `${stats.enemiesDefeated} / ${stats.enemiesTotal}`],
      ['HEADSHOTS', String(stats.headshots)],
      ['ACCURACY', `${Math.round(stats.accuracy * 100)}%  (${stats.shotsHit} / ${stats.shotsFired})`],
      ['DEATHS', String(stats.deaths)],
      ['CHECKPOINTS', String(stats.checkpointsReached)],
    ];
    const table = h('table', 'iv-stats');
    const body = h('tbody', 'iv-stagger');
    for (const [label, value] of rows) {
      const row = h('tr');
      const name = h('th', '', label);
      name.scope = 'row';
      row.append(name, h('td', '', value));
      body.append(row);
    }
    stagger(body);
    table.append(body);

    const actions = h('div', 'iv-complete__actions');
    actions.append(navButton(this.disposer, 'iv-primary', 'CONTINUE', onContinue));
    column.append(header, table, actions);
    this.element.append(column);
  }
}
