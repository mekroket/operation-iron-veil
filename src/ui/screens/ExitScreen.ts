import { titleLockup } from '../components';
import { h, navButton } from '../dom';
import { Screen } from '../Screen';

export class ExitScreen extends Screen {
  constructor(onReturn: () => void) {
    super('iv-screen--solid iv-message');
    const column = h('div', 'iv-message__column iv-rise');
    const actions = h('div', 'iv-message__actions');
    actions.append(navButton(this.disposer, 'iv-secondary', 'RETURN TO MENU', onReturn));
    column.append(
      titleLockup('small'),
      h('h2', 'iv-message__title', 'SESSION ENDED'),
      h('p', 'iv-message__detail', 'It is safe to close this tab.'),
      actions,
    );
    this.element.append(column);
  }
}
