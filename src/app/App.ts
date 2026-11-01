import { CinematicPlayer } from '../animations/CinematicPlayer';
import { AudioDirector } from '../audio/AudioDirector';
import { AudioEngine } from '../audio/AudioEngine';
import { Input } from '../core/Input';
import { EventBus } from '../core/events';
import type { MissionStats } from '../core/types';
import { SaveStore } from '../save/SaveStore';
import { getBrowserStorage, SettingsStore } from '../settings/settings';
import { UIManager } from '../ui/UIManager';
import type { CampaignStatus } from '../ui/UIManager';
import { BrowserSession } from './BrowserSession';
import { installDebugApi } from './debugApi';
import { GameSession } from './GameSession';
import { GameWorld } from './GameWorld';

export type AppState = 'boot' | 'menu' | 'mission' | 'paused' | 'awaitingLock' | 'dead' | 'complete' | 'fatal';

const MAX_FRAME_SECONDS = 0.05;
const DEATH_SCREEN_DELAY = 2.2;
const MAX_CONSECUTIVE_FRAME_ERRORS = 30;

/** Top-level state machine: owns the render loop and moves between menu, mission, pause and results. */
export class App {
  state: AppState = 'boot';
  session: GameSession | null = null;
  /** Automated tests only. Keeps the mission running without pointer lock. */
  ignoreLock = false;

  readonly bus = new EventBus();
  readonly settings: SettingsStore;
  readonly save: SaveStore;
  readonly ui: UIManager;

  private readonly audio: AudioEngine;
  private readonly director: AudioDirector;
  private readonly input: Input;
  private readonly browser: BrowserSession;
  private world: GameWorld | null = null;
  private menuCamera: CinematicPlayer | null = null;
  private deathTimer = 0;
  private frameErrors = 0;
  private fullscreenNoticeShown = false;

  constructor(private readonly canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const storage = getBrowserStorage();
    this.settings = new SettingsStore(storage);
    this.save = new SaveStore(storage);
    this.audio = new AudioEngine(this.settings);
    this.director = new AudioDirector(this.audio, this.bus);
    this.input = new Input(canvas);
    this.ui = new UIManager(uiRoot, this.bus, this.settings, {
      onStartMission: (fromCheckpoint) => this.startMission(fromCheckpoint),
      onResume: () => this.resume(),
      onRestartCheckpoint: () => this.restart(true),
      onRestartMission: () => this.restart(false),
      onQuitToMenu: () => this.quitToMenu(),
      onContinueFromComplete: () => this.quitToMenu(),
      onExitGame: () => this.exitGame(),
      onSkipCinematic: () => this.session?.skipCinematic(),
    });
    this.browser = new BrowserSession(canvas, {
      onLocked: () => this.onLocked(),
      onUnlocked: () => this.onUnlocked(),
      onLockError: () => this.onLockError(),
      onFullscreenError: () => this.onFullscreenError(),
    });
    window.addEventListener('resize', this.onResize);
    document.addEventListener('fullscreenchange', this.onResize);
    // Mid-game unlock can't always be detected (alt-tab during the transition), so hiding pauses too.
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get gameWorld(): GameWorld | null {
    return this.world;
  }

  async boot(): Promise<void> {
    try {
      this.ui.setLoading(0, 'Initialising');
      const world = await GameWorld.create(this.canvas, this.settings, (f, label) => this.ui.setLoading(f * 0.94, label));
      this.world = world;
      this.ui.setLoading(0.95, 'Synthesising audio');
      await this.audio.prepare((f) => this.ui.setLoading(0.95 + f * 0.05, 'Synthesising audio'));
      this.menuCamera = new CinematicPlayer(world.camera);
      installDebugApi(this);
      this.enterMenu();
      world.engine.runRenderLoop(this.frame);
    } catch (error) {
      this.fail('Could not start the game', error);
    }
  }

  /** One frame. `render` is false only when automated tests step the simulation. */
  step(dt: number, render = true): void {
    const world = this.world;
    if (!world) return;
    if (this.state === 'menu') {
      this.menuCamera?.update(dt);
      this.director.setListener(world.camera.position, { x: 0, y: 0, z: 1 });
    } else if (this.state === 'mission') {
      this.session?.update(dt, this.input.sample());
    } else if (this.state === 'dead') {
      this.session?.update(dt, null);
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this.ui.showDeath();
      }
    } else {
      // Paused: drop input gathered while the menu was open.
      this.input.sample();
    }
    world.update(dt);
    this.director.update(dt);
    this.ui.setFps(world.graphics.fps);
    if (render) world.scene.render();
  }

  private readonly frame = (): void => {
    const world = this.world;
    if (!world) return;
    try {
      this.step(Math.min(world.engine.getDeltaTime() / 1000, MAX_FRAME_SECONDS));
      this.frameErrors = 0;
    } catch (error) {
      console.error(error);
      if (++this.frameErrors >= MAX_CONSECUTIVE_FRAME_ERRORS) {
        world.engine.stopRenderLoop(this.frame);
        this.fail('The game hit an unexpected error', error);
      }
    }
  };

  private enterMenu(): void {
    const world = this.world;
    if (!world) return;
    this.state = 'menu';
    this.input.enabled = false;
    this.director.setAmbience('menu');
    this.audio.setPaused(false);
    this.menuCamera?.play(world.level.cinematics.menu, { loop: true });
    this.ui.showMainMenu(this.campaignStatus());
  }

  private campaignStatus(): CampaignStatus {
    const campaign = this.save.getCampaign();
    return {
      hasCheckpoint: this.save.loadCheckpoint() !== null,
      completed: campaign.completed,
      bestGrade: campaign.bestGrade,
    };
  }

  /** Runs inside the click gesture: this is the only moment fullscreen, lock and audio are allowed. */
  private startMission(fromCheckpoint: boolean): void {
    this.audio.unlock();
    this.browser.enter(this.settings.get().display.fullscreenOnStart);
    this.launch(fromCheckpoint);
  }

  private restart(fromCheckpoint: boolean): void {
    this.audio.unlock();
    this.browser.enter(this.settings.get().display.fullscreenOnStart);
    this.launch(fromCheckpoint);
  }

  private launch(fromCheckpoint: boolean): void {
    const world = this.world;
    if (!world) return;
    this.menuCamera?.stop();
    this.session?.dispose();
    this.session = null;
    this.audio.setPaused(false);
    this.director.setAmbience('mission');
    const checkpoint = fromCheckpoint ? this.save.loadCheckpoint() : null;
    if (!fromCheckpoint) this.save.clearCheckpoint();
    const session = new GameSession(world, this.bus, this.settings, this.save, this.director, this.ui, {
      onComplete: (stats) => this.onMissionComplete(stats),
      onDied: () => this.onPlayerDied(),
    });
    this.session = session;
    session.start(checkpoint);
    this.state = 'mission';
    this.input.enabled = true;
    world.scene.render();
  }

  private resume(): void {
    this.audio.unlock();
    if (this.state !== 'paused' && this.state !== 'awaitingLock') return;
    if (this.ignoreLock || this.browser.locked) {
      this.continueMission();
      return;
    }
    // The mission restarts only when the browser confirms the lock, via onLocked.
    this.state = 'awaitingLock';
    this.ui.hidePause();
    this.browser.enter(this.settings.get().display.fullscreenOnStart);
  }

  private continueMission(): void {
    this.state = 'mission';
    this.input.enabled = true;
    this.input.sample();
    this.audio.setPaused(false);
    this.ui.hidePause();
    this.ui.showResumePrompt(false);
  }

  private pause(): void {
    if (this.state !== 'mission') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.audio.setPaused(true);
    this.ui.showPause();
  }

  private onLocked(): void {
    if (this.state === 'awaitingLock') this.continueMission();
    else if (this.state === 'mission') this.ui.showResumePrompt(false);
  }

  private onUnlocked(): void {
    if (this.state === 'mission' && !this.ignoreLock) this.pause();
  }

  /** Browsers refuse a re-lock for about a second after Esc. Ask for one more click rather than failing. */
  private onLockError(): void {
    if (this.ignoreLock) return;
    if (this.state === 'mission') {
      this.state = 'awaitingLock';
      this.input.enabled = false;
      this.ui.showResumePrompt(true);
    } else if (this.state === 'awaitingLock') {
      this.ui.showResumePrompt(true);
    }
  }

  private onFullscreenError(): void {
    if (this.fullscreenNoticeShown) return;
    this.fullscreenNoticeShown = true;
    this.ui.showNotice('Fullscreen was blocked by the browser. The game keeps running in this window; press F11 for fullscreen.');
  }

  private readonly onVisibility = (): void => {
    if (document.hidden && !this.ignoreLock) this.pause();
  };

  private readonly onResize = (): void => {
    this.world?.engine.resize();
    this.world?.graphics.onResize();
  };

  private onPlayerDied(): void {
    this.state = 'dead';
    this.deathTimer = DEATH_SCREEN_DELAY;
    this.input.enabled = false;
    this.browser.releaseLock();
  }

  private onMissionComplete(stats: MissionStats): void {
    this.state = 'complete';
    this.input.enabled = false;
    this.browser.releaseLock();
    this.ui.showHud(false);
    this.ui.showMissionComplete(stats);
  }

  private quitToMenu(): void {
    this.session?.dispose();
    this.session = null;
    this.browser.releaseLock();
    this.ui.showHud(false);
    this.enterMenu();
  }

  private exitGame(): void {
    this.browser.exitFullscreen();
    this.director.setAmbience('none');
    this.menuCamera?.stop();
    this.ui.showExitScreen();
    // Browsers only honour this for tabs a script opened, so the exit screen remains as the fallback.
    window.close();
  }

  private fail(title: string, error: unknown): void {
    this.state = 'fatal';
    console.error(error);
    this.input.enabled = false;
    this.browser.releaseLock();
    this.ui.showFatalError(title, error instanceof Error ? error.message : String(error));
  }
}
