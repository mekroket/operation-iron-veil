import { CinematicPlayer } from '../animations/CinematicPlayer';
import type { AudioDirector } from '../audio/AudioDirector';
import type { FrameInput, GameContext } from '../core/contracts';
import type { EventBus } from '../core/events';
import { damp } from '../core/math';
import type { MissionStats, Vec3 } from '../core/types';
import { EffectsManager } from '../effects/EffectsManager';
import { Vector3 } from '../engine/bjs';
import { EnemyManager } from '../enemies/EnemyManager';
import { DoorSystem } from '../interaction/DoorSystem';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { PickupSystem } from '../interaction/PickupSystem';
import { MissionDirector } from '../missions/MissionDirector';
import { PlayerController } from '../player/PlayerController';
import type { MissionCheckpoint, SaveStore } from '../save/SaveStore';
import type { SettingsStore } from '../settings/settings';
import { resolveGraphics } from '../settings/settings';
import type { UIManager } from '../ui/UIManager';
import { WeaponSystem } from '../weapons/WeaponSystem';
import type { GameWorld } from './GameWorld';
import { projectToScreen } from './screenProjection';

/** A target counts as visible when the first thing the ray hits is the target's own collider, this close to it. */
const INTERACT_LOS_TOLERANCE = 0.8;
const INTERIOR_SAMPLE_SECONDS = 0.25;
const INTERIOR_ROOF_DISTANCE = 16;

export type SessionPhase = 'intro' | 'playing' | 'extracting' | 'ended';

export interface SessionHooks {
  onComplete(stats: MissionStats): void;
  onDied(): void;
}

/** One attempt at the mission. Restarting always disposes this and builds a new one, so no state can leak. */
export class GameSession {
  readonly player: PlayerController;
  readonly weapons: WeaponSystem;
  readonly enemies: EnemyManager;
  readonly mission: MissionDirector;

  phase: SessionPhase = 'intro';

  private readonly interaction: InteractionSystem;
  private readonly doors: DoorSystem;
  private readonly pickups: PickupSystem;
  private readonly effects: EffectsManager;
  private readonly cinematic: CinematicPlayer;
  private readonly cleanups: (() => void)[] = [];
  private interiorTimer = 0;
  private interiorTarget = 0;
  private interior = 0;

  constructor(
    private readonly world: GameWorld,
    bus: EventBus,
    settings: SettingsStore,
    save: SaveStore,
    private readonly audio: AudioDirector,
    private readonly ui: UIManager,
    private readonly hooks: SessionHooks,
  ) {
    const { level, scene, camera, physics, visuals } = world;
    this.player = new PlayerController(physics, camera, bus, () => settings.get(), level.playerStart);
    const ctx: GameContext = { scene, camera, bus, world: physics, player: this.player, settings: () => settings.get() };

    this.interaction = new InteractionSystem(bus, (from, to) => this.canReach(from, to));
    this.doors = new DoorSystem({
      doors: level.doors,
      bus,
      visuals,
      interaction: this.interaction,
      createBlocker: (door) => world.doorBlocker(door),
    });
    this.enemies = new EnemyManager(ctx, level, this.doors);
    this.enemies.setShadowCasterHook((meshes) => world.environment.addShadowCasters([...meshes]));
    this.weapons = new WeaponSystem(ctx, this.enemies);
    this.pickups = new PickupSystem({
      pickups: level.pickups,
      bus,
      visuals,
      interaction: this.interaction,
      weapons: this.weapons,
      player: this.player,
    });
    this.mission = new MissionDirector({
      ctx,
      level,
      enemies: this.enemies,
      weapons: this.weapons,
      visuals,
      doors: this.doors,
      pickups: this.pickups,
      interaction: this.interaction,
      save,
    });
    this.effects = new EffectsManager(scene, bus, resolveGraphics(settings.get().graphics));
    this.cinematic = new CinematicPlayer(camera);

    this.mission.onBoarded = () => this.startExtraction();
    this.mission.onComplete = (stats) => this.finish(stats);
    this.cleanups.push(bus.on('player:died', () => this.hooks.onDied()));
  }

  /** Starts fresh with the insertion cinematic, or drops straight back in at a checkpoint. */
  start(checkpoint: MissionCheckpoint | null): void {
    this.mission.start(checkpoint);
    this.ui.showHud(true);
    if (checkpoint) {
      this.phase = 'playing';
      return;
    }
    this.phase = 'intro';
    this.weapons.setEnabled(false);
    this.enemies.setFrozen(true);
    this.ui.setCinematic(true, true);
    this.cinematic.play(this.world.level.cinematics.intro, { onDone: () => this.endIntro() });
  }

  skipCinematic(): void {
    if (this.phase === 'intro') {
      this.cinematic.stop();
      this.endIntro();
    } else if (this.phase === 'extracting') {
      this.cinematic.stop();
    }
  }

  update(dt: number, input: FrameInput | null): void {
    if (this.phase === 'ended') return;
    const controllable = this.phase === 'playing' && this.player.alive;

    if (this.cinematic.playing) {
      this.cinematic.update(dt);
    } else if (this.phase !== 'extracting') {
      this.player.update(dt, controllable ? input : null);
    }

    if (controllable && input) {
      this.weapons.update(dt, input);
      this.interaction.update(dt, this.player.eye, this.player.forward, input.interactHeld, input.interactPressed);
    } else {
      this.interaction.reset();
    }
    this.enemies.update(dt);
    this.mission.update(dt);
    this.effects.update(dt, this.world.camera.position);
    this.updateAudio(dt);
    this.updateHud();
  }

  dispose(): void {
    this.phase = 'ended';
    this.cinematic.stop();
    for (const cleanup of this.cleanups) cleanup();
    this.mission.dispose();
    this.pickups.dispose();
    this.weapons.dispose();
    this.enemies.dispose();
    this.doors.dispose();
    this.effects.dispose();
    this.player.dispose();
    this.ui.setObjectiveMarker(null);
    this.ui.setCinematic(false);
  }

  private endIntro(): void {
    if (this.phase !== 'intro') return;
    this.phase = 'playing';
    this.ui.setCinematic(false);
    this.enemies.setFrozen(false);
    this.weapons.setEnabled(true);
    this.player.update(0, null);
  }

  private startExtraction(): void {
    this.phase = 'extracting';
    this.ui.setCinematic(true, true);
    this.ui.setObjectiveMarker(null);
    this.cinematic.play(this.world.level.cinematics.extraction);
  }

  private finish(stats: MissionStats): void {
    this.cinematic.stop();
    this.hooks.onComplete(stats);
  }

  /** Interaction targets have colliders of their own, so hitting something right at the target still counts. */
  private canReach(from: Vec3, to: Vec3): boolean {
    const hit = this.world.physics.raycast(from, to);
    if (!hit) return true;
    const total = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    return total - hit.distance < INTERACT_LOS_TOLERANCE;
  }

  private updateAudio(dt: number): void {
    const camera = this.world.camera;
    this.audio.setListener(camera.position, camera.getDirection(Vector3.Forward()));
    this.interiorTimer -= dt;
    if (this.interiorTimer <= 0) {
      this.interiorTimer = INTERIOR_SAMPLE_SECONDS;
      const eye = this.player.eye;
      this.interiorTarget = this.world.physics.lineOfSight(eye, {
        x: eye.x,
        y: eye.y + INTERIOR_ROOF_DISTANCE,
        z: eye.z,
      })
        ? 0
        : 1;
    }
    this.interior = damp(this.interior, this.interiorTarget, 3, dt);
    this.audio.setInterior(this.interior);
  }

  private updateHud(): void {
    const camera = this.world.camera;
    this.ui.setCrosshair(this.weapons.currentSpread, this.weapons.isAds, camera.fov);
    const target = this.mission.objectiveTarget;
    if (!target || this.phase !== 'playing' || !this.player.alive) {
      this.ui.setObjectiveMarker(null);
      return;
    }
    const canvas = this.world.engine.getRenderingCanvas();
    const width = canvas?.clientWidth ?? window.innerWidth;
    const height = canvas?.clientHeight ?? window.innerHeight;
    const point = projectToScreen(target, camera.getTransformationMatrix().asArray(), width, height);
    const eye = this.player.eye;
    this.ui.setObjectiveMarker({
      ...point,
      distance: Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z),
    });
  }
}
