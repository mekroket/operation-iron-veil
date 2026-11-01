import { DEFAULT_SETTINGS, type GameSettings, type SettingsStore } from '../../settings/settings';
import { hintLine, screenHeader } from '../components';
import { h, navButton, setText } from '../dom';
import { Screen } from '../Screen';
import { audioTab, controlsTab, displayTab, graphicsTab, type SettingsTab } from './settingsTabs';

type TabId = 'graphics' | 'audio' | 'controls' | 'display';
const TAB_LABELS: readonly { id: TabId; label: string }[] = [
  { id: 'graphics', label: 'GRAPHICS' },
  { id: 'audio', label: 'AUDIO' },
  { id: 'controls', label: 'CONTROLS' },
  { id: 'display', label: 'DISPLAY' },
];

/** Reachable from the main menu and from pause. Every change goes straight through SettingsStore. */
export class SettingsScreen extends Screen {
  private readonly scroller = h('div', 'iv-scroll iv-settings__body');
  private readonly tabs: Record<TabId, SettingsTab>;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private readonly status = h('p', 'iv-settings__status');
  private cancelStatus: (() => void) | null = null;

  constructor(store: SettingsStore, private readonly onBack: () => void) {
    super('iv-screen--sub iv-settings');
    this.tabs = {
      graphics: graphicsTab(this.disposer, store),
      audio: audioTab(this.disposer, store),
      controls: controlsTab(this.disposer, store),
      display: displayTab(this.disposer, store),
    };

    const tabList = h('div', 'iv-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.dataset.navRow = '';
    for (const { id, label } of TAB_LABELS) {
      const button = navButton(this.disposer, 'iv-tab', label, () => this.selectTab(id));
      button.setAttribute('role', 'tab');
      this.tabButtons.set(id, button);
      tabList.append(button);
      this.scroller.append(this.tabs[id].element);
    }

    const footer = h('footer', 'iv-footer');
    const actions = h('div', 'iv-footer__actions');
    actions.dataset.navRow = '';
    actions.append(
      navButton(this.disposer, 'iv-ghost', 'BACK', onBack),
      navButton(this.disposer, 'iv-ghost', 'RESET TO DEFAULTS', () => {
        store.set(DEFAULT_SETTINGS);
        this.flashStatus('Defaults restored.');
      }),
    );
    footer.append(actions, this.status, hintLine([['Esc', 'Back'], ['←→', 'Adjust']]));
    this.element.append(screenHeader('OPTIONS', 'SETTINGS'), tabList, this.scroller, footer);

    this.syncAll(store.get());
    this.disposer.add(store.subscribe((settings) => this.syncAll(settings)));
    this.selectTab('graphics');
  }

  override back(): void {
    this.onBack();
  }

  protected override scrollArea(): HTMLElement {
    return this.scroller;
  }

  private selectTab(id: TabId): void {
    for (const { id: other } of TAB_LABELS) {
      const active = other === id;
      this.tabs[other].element.hidden = !active;
      this.tabButtons.get(other)?.setAttribute('aria-selected', String(active));
    }
    this.scroller.scrollTop = 0;
  }

  private syncAll(settings: GameSettings): void {
    for (const { id } of TAB_LABELS) {
      for (const row of this.tabs[id].rows) row.sync(settings);
    }
  }

  private flashStatus(message: string): void {
    this.cancelStatus?.();
    setText(this.status, message);
    this.cancelStatus = this.disposer.timeout(() => setText(this.status, ''), 2500);
  }
}
