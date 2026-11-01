import { titleLockup } from '../components';
import { h, navButton } from '../dom';
import { Screen } from '../Screen';

export class FatalErrorScreen extends Screen {
  constructor(title: string, detail: string) {
    super('iv-screen--solid iv-message iv-message--error');
    this.element.setAttribute('role', 'alert');
    const column = h('div', 'iv-message__column iv-rise');
    const actions = h('div', 'iv-message__actions');
    actions.append(navButton(this.disposer, 'iv-secondary', 'RELOAD PAGE', () => window.location.reload()));
    column.append(
      titleLockup('small'),
      h('h2', 'iv-message__title', title),
      h('p', 'iv-message__detail iv-message__detail--mono', detail),
      actions,
    );
    this.element.append(column);
  }
}
