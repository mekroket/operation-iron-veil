import type { EventBus } from '../../core/events';
import { h } from '../dom';
import { AmmoPanel } from './AmmoPanel';
import { Crosshair } from './Crosshair';
import { HealthPanel } from './HealthPanel';
import { HudFeed } from './HudFeed';
import { InteractionPrompt } from './InteractionPrompt';
import { ObjectiveMarker, type ObjectiveMarkerState } from './ObjectiveMarker';
import { ObjectivePanel } from './ObjectivePanel';
import { RadioSubtitles } from './RadioSubtitles';
import { Viewport } from './Viewport';

/** `cinematic` keeps only the radio captions on screen. */
export type HudMode = 'hidden' | 'play' | 'cinematic';

/**
 * The in-game overlay. Driven by bus events plus the two per-frame setters, with no references to game objects.
 * It keeps listening while hidden, so state set during loading or a cinematic is already right when it appears.
 * Hidden uses visibility rather than display so that running CSS animations are not restarted on return.
 */
export class Hud {
  private readonly root = h('div', 'iv-hud');
  private readonly viewport = new Viewport();
  private readonly crosshair: Crosshair;
  private readonly ammo: AmmoPanel;
  private readonly health: HealthPanel;
  private readonly objective: ObjectivePanel;
  private readonly marker: ObjectiveMarker;
  private readonly prompt: InteractionPrompt;
  private readonly radio: RadioSubtitles;
  private readonly feed: HudFeed;
  private mode: HudMode = 'hidden';

  constructor(parent: HTMLElement, bus: EventBus) {
    this.root.dataset.mode = this.mode;
    this.health = new HealthPanel(this.root, bus);
    this.marker = new ObjectiveMarker(this.root, this.viewport);
    this.crosshair = new Crosshair(this.root, bus, this.viewport);
    this.objective = new ObjectivePanel(this.root, bus);
    this.prompt = new InteractionPrompt(this.root, bus);
    this.radio = new RadioSubtitles(this.root, bus);
    this.feed = new HudFeed(this.root, bus);
    this.ammo = new AmmoPanel(this.root, bus);
    parent.append(this.root);
  }

  setMode(mode: HudMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.radio.setPaused(mode === 'hidden');
    this.objective.setHudVisible(mode === 'play');
  }

  setCrosshair(spreadRadians: number, ads: boolean, fovRadians: number): void {
    this.crosshair.update(spreadRadians, ads, fovRadians);
  }

  setObjectiveMarker(state: ObjectiveMarkerState | null): void {
    this.marker.update(state);
  }

  /** Clears what belongs to the attempt being abandoned. Call before the game restarts or restores. */
  resetAttempt(): void {
    this.health.reset();
    this.prompt.clear();
    this.radio.clear();
    this.feed.clear();
    this.marker.update(null);
  }

  /** As resetAttempt, and also drops the objective: the next run announces its own from the top. */
  resetRun(): void {
    this.resetAttempt();
    this.objective.clear();
  }

  dispose(): void {
    this.crosshair.dispose();
    this.ammo.dispose();
    this.health.dispose();
    this.objective.dispose();
    this.marker.dispose();
    this.prompt.dispose();
    this.radio.dispose();
    this.feed.dispose();
    this.viewport.dispose();
    this.root.remove();
  }
}
