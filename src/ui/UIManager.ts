/** The whole HTML overlay. Screens never talk to the game directly: everything goes through UICallbacks. */
import './styles/index';
import type { EventBus } from '../core/events';
import type { MissionStats } from '../core/types';
import type { SettingsStore } from '../settings/settings';
import { Disposer, h } from './dom';
import { FpsCounter } from './hud/FpsCounter';
import { Hud } from './hud/Hud';
import { Letterbox, Notice, ResumePrompt } from './overlays';
import { ScreenStack } from './ScreenStack';
import { CampaignScreen } from './screens/CampaignScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { DeathScreen } from './screens/DeathScreen';
import { ExitScreen } from './screens/ExitScreen';
import { FatalErrorScreen } from './screens/FatalErrorScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { MainMenuScreen } from './screens/MainMenuScreen';
import { MissionCompleteScreen } from './screens/MissionCompleteScreen';
import { PauseScreen } from './screens/PauseScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export interface UICallbacks {
  /** Called synchronously inside the click gesture so fullscreen and pointer lock are allowed. */
  onStartMission(fromCheckpoint: boolean): void;
  onResume(): void;
  onRestartCheckpoint(): void;
  onRestartMission(): void;
  onQuitToMenu(): void;
  onContinueFromComplete(): void;
  onExitGame(): void;
  onSkipCinematic(): void;
}

export interface CampaignStatus {
  hasCheckpoint: boolean;
  completed: boolean;
  bestGrade: string | null;
}

const DEFAULT_NOTICE_SECONDS = 6;

export class UIManager {
  /** Stamina is intentionally not part of this HUD. */
  setStamina?: never;

  private readonly disposer = new Disposer();
  private readonly container = h('div', 'iv-ui');
  private readonly stack: ScreenStack;
  private readonly hud: Hud;
  private readonly fps: FpsCounter;
  private readonly letterbox: Letterbox;
  private readonly loading: LoadingScreen;
  private readonly resumePrompt: ResumePrompt;
  private readonly notice: Notice;
  private status: CampaignStatus = { hasCheckpoint: false, completed: false, bestGrade: null };
  private hudRequested = false;
  private cinematicActive = false;
  private pauseActive = false;
  private lastHovered: Element | null = null;

  constructor(root: HTMLElement, private readonly bus: EventBus, private readonly settings: SettingsStore, private readonly callbacks: UICallbacks) {
    // Order is stacking order: HUD, then letterbox, menus, prompts, loading, notices.
    this.hud = new Hud(this.container, bus);
    this.letterbox = new Letterbox(
      this.container,
      () => callbacks.onSkipCinematic(),
      () => this.stack.empty && !this.loading.visible && !this.resumePrompt.visible,
    );
    const menuLayer = h('div', 'iv-menu-layer');
    this.container.append(menuLayer);
    this.stack = new ScreenStack(menuLayer);
    this.resumePrompt = new ResumePrompt(this.container, () => callbacks.onResume());
    this.loading = new LoadingScreen(this.container);
    this.fps = new FpsCounter(this.container, settings);
    this.notice = new Notice(this.container);
    root.append(this.container);

    this.disposer.listen(document, 'keydown', (event) => this.onKeyDown(event));
    // Capture phase, so the sound still plays when the click handler tears the screen down.
    this.disposer.listen(this.container, 'click', (event) => this.onClickSound(event), { capture: true });
    this.disposer.listen(this.container, 'change', (event) => this.onChangeSound(event));
    this.disposer.listen(this.container, 'pointerover', (event) => this.onHoverSound(event));
  }

  setLoading(fraction: number, label: string): void {
    this.loading.update(fraction, label);
    this.refreshHud();
  }

  showMainMenu(status: CampaignStatus): void {
    this.status = status;
    this.loading.hide();
    this.resumePrompt.set(false);
    this.closeScreens();
    this.hudRequested = false;
    this.cinematicActive = false;
    this.letterbox.set(false, false);
    this.hud.resetRun();
    this.stack.push(
      new MainMenuScreen(status, {
        onCampaign: () => this.pushCampaign(),
        onSettings: () => this.pushSettings(),
        onCredits: () => this.stack.push(new CreditsScreen(() => this.stack.pop())),
        onExit: () => this.callbacks.onExitGame(),
      }),
    );
    this.refreshHud();
  }

  showHud(visible: boolean): void {
    this.hudRequested = visible;
    if (visible) this.loading.hide();
    this.refreshHud();
  }

  showPause(): void {
    if (this.pauseActive) return;
    this.loading.hide();
    this.resumePrompt.set(false);
    this.closeScreens();
    this.pauseActive = true;
    this.stack.push(
      new PauseScreen({
        onResume: () => this.leaveScreens(() => this.callbacks.onResume()),
        onRestartCheckpoint: () => this.restartCheckpoint(),
        onRestartMission: () => this.restartMission(),
        onSettings: () => this.pushSettings(),
        onMainMenu: () => this.quitToMenu(),
      }),
    );
    this.refreshHud();
  }

  hidePause(): void {
    if (!this.pauseActive) return;
    this.closeScreens();
    this.refreshHud();
  }

  showDeath(): void {
    this.loading.hide();
    this.resumePrompt.set(false);
    this.closeScreens();
    this.stack.push(
      new DeathScreen({
        onRestartCheckpoint: () => this.restartCheckpoint(),
        onRestartMission: () => this.restartMission(),
        onMainMenu: () => this.quitToMenu(),
      }),
    );
    this.refreshHud();
  }

  showMissionComplete(stats: MissionStats): void {
    this.loading.hide();
    this.resumePrompt.set(false);
    this.closeScreens();
    this.stack.push(
      new MissionCompleteScreen(stats, () => {
        this.hudRequested = false;
        this.hud.resetRun();
        this.leaveScreens(() => this.callbacks.onContinueFromComplete());
      }),
    );
    this.refreshHud();
  }

  showResumePrompt(visible: boolean): void {
    this.resumePrompt.set(visible);
  }

  showNotice(message: string, seconds: number = DEFAULT_NOTICE_SECONDS): void {
    this.notice.show(message, seconds);
  }

  showFatalError(title: string, detail: string): void {
    this.loading.hide();
    this.resumePrompt.set(false);
    this.closeScreens();
    this.stack.push(new FatalErrorScreen(title, detail));
    this.refreshHud();
  }

  showExitScreen(): void {
    this.loading.hide();
    this.resumePrompt.set(false);
    this.closeScreens();
    this.stack.push(new ExitScreen(() => this.quitToMenu()));
    this.refreshHud();
  }

  setCinematic(active: boolean, skippable: boolean = false): void {
    this.cinematicActive = active;
    if (active) this.loading.hide();
    this.letterbox.set(active, skippable);
    this.refreshHud();
  }

  setFps(fps: number | null): void {
    this.fps.set(fps);
  }

  setCrosshair(spreadRadians: number, ads: boolean, fovRadians: number): void {
    this.hud.setCrosshair(spreadRadians, ads, fovRadians);
  }

  setObjectiveMarker(marker: { x: number; y: number; distance: number; onScreen: boolean } | null): void {
    this.hud.setObjectiveMarker(marker);
  }

  dispose(): void {
    this.disposer.dispose();
    this.closeScreens();
    this.hud.dispose();
    this.letterbox.dispose();
    this.resumePrompt.dispose();
    this.loading.dispose();
    this.fps.dispose();
    this.notice.dispose();
    this.container.remove();
  }

  private pushCampaign(): void {
    this.stack.push(
      new CampaignScreen(this.status, {
        onStart: (fromCheckpoint) => {
          this.hud.resetRun();
          this.leaveScreens(() => this.callbacks.onStartMission(fromCheckpoint));
        },
        onBack: () => this.stack.pop(),
      }),
    );
  }

  private pushSettings(): void {
    this.stack.push(new SettingsScreen(this.settings, () => this.stack.pop()));
  }

  private restartCheckpoint(): void {
    // The objective stays: a restore re-announces its stage and may not change it.
    this.hud.resetAttempt();
    this.leaveScreens(() => this.callbacks.onRestartCheckpoint());
  }

  private restartMission(): void {
    this.hud.resetRun();
    this.leaveScreens(() => this.callbacks.onRestartMission());
  }

  private quitToMenu(): void {
    this.hudRequested = false;
    this.hud.resetRun();
    this.leaveScreens(() => this.callbacks.onQuitToMenu());
    // Never strand the player on a bare canvas if the game has nothing to show yet.
    if (this.stack.empty && !this.loading.visible) this.showMainMenu(this.status);
  }

  /** Runs a game callback synchronously, inside the user's gesture, with the menus already gone. */
  private leaveScreens(callback: () => void): void {
    this.closeScreens();
    callback();
    this.refreshHud();
  }

  private closeScreens(): void {
    this.stack.clear();
    this.pauseActive = false;
    this.lastHovered = null;
  }

  private refreshHud(): void {
    if (!this.stack.empty || this.loading.visible) this.hud.setMode('hidden');
    else if (this.cinematicActive) this.hud.setMode('cinematic');
    else this.hud.setMode(this.hudRequested ? 'play' : 'hidden');
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (this.loading.visible || this.resumePrompt.visible) return;
    const top = this.stack.top;
    if (!top) return;
    // A held key must not fall through to whatever button the next screen focuses.
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      return;
    }
    if (top.handleKey(event)) this.bus.emit('ui:hover', {});
  }

  private onClickSound(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('button')) this.bus.emit('ui:click', {});
  }

  /** Sliders report on release, or on each step from the keyboard. */
  private onChangeSound(event: Event): void {
    if (event.target instanceof HTMLInputElement && event.target.type === 'range') this.bus.emit('ui:click', {});
  }

  private onHoverSound(event: PointerEvent): void {
    const control = event.target instanceof Element ? event.target.closest('button:not(:disabled), input[type="range"]') : null;
    if (control !== this.lastHovered) {
      this.lastHovered = control;
      if (control) this.bus.emit('ui:hover', {});
    }
  }
}
