import { CREDITS, GAME_TITLE } from '../../missions/canon';
import { hintLine, screenHeader } from '../components';
import { h, navButton, stagger } from '../dom';
import { Screen } from '../Screen';

export class CreditsScreen extends Screen {
  private readonly scroller = h('div', 'iv-scroll iv-credits__body');

  constructor(private readonly onBack: () => void) {
    super('iv-screen--sub iv-credits');
    const list = h('dl', 'iv-credits__list iv-stagger');
    for (const credit of CREDITS) {
      const row = h('div', 'iv-credits__row');
      row.append(h('dt', '', credit.role), h('dd', '', credit.name));
      list.append(row);
    }
    stagger(list);
    this.scroller.append(
      list,
      h(
        'p',
        'iv-credits__notice iv-rise',
        `${GAME_TITLE} is an original work of fiction. Its characters, organisations and places are invented, and any resemblance to real people, companies or events is coincidental.`,
      ),
    );
    const footer = h('footer', 'iv-footer');
    footer.append(navButton(this.disposer, 'iv-ghost', 'BACK', onBack), hintLine([['Esc', 'Back']]));
    this.element.append(screenHeader(GAME_TITLE, 'CREDITS'), this.scroller, footer);
  }

  override back(): void {
    this.onBack();
  }

  protected override scrollArea(): HTMLElement {
    return this.scroller;
  }
}
