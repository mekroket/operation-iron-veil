import type { App } from './App';

/**
 * Test harness for verifying the real browser build. Installed only with ?debug=1, so normal players never
 * get it. It drives the game through its real input listeners and systems rather than around them.
 */
export function installDebugApi(app: App): void {
  if (new URLSearchParams(window.location.search).get('debug') !== '1') return;

  const errors: string[] = [];
  window.addEventListener('error', (event) => errors.push(String(event.message)));
  window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

  const api = {
    errors,
    /** Keeps the mission running with no pointer lock, for scripted runs. */
    ignoreLock(value = true): void {
      app.ignoreLock = value;
    },
    snapshot() {
      const world = app.gameWorld;
      const session = app.session;
      const targets = session?.enemies.getHitTargets() ?? [];
      return {
        state: app.state,
        phase: session?.phase ?? null,
        stage: session?.mission.stageId ?? null,
        objective: session?.mission.objectiveTarget ?? null,
        player: session && {
          position: { ...session.player.position },
          health: session.player.health,
          grounded: session.player.grounded,
          crouching: session.player.crouching,
          sprinting: session.player.sprinting,
        },
        weapon: session?.weapons.getSaveState() ?? null,
        ads: session?.weapons.isAds ?? null,
        enemiesActive: targets.length,
        enemiesAlive: targets.filter((t) => t.alive).length,
        defeated: session?.enemies.getDefeatedIds().length ?? 0,
        fps: world?.graphics.fps ?? 0,
        scale: world?.engine.getHardwareScalingLevel() ?? 0,
        activeMeshes: world?.scene.getActiveMeshes().length ?? 0,
        totalMeshes: world?.scene.meshes.length ?? 0,
        lights: world?.scene.lights.length ?? 0,
        backend: world?.backend ?? null,
        fullscreen: document.fullscreenElement !== null,
        pointerLocked: document.pointerLockElement !== null,
        errors: errors.slice(-10),
      };
    },
    /** Draw calls in one rendered frame. */
    async drawCallsPerFrame(): Promise<number> {
      const engine = app.gameWorld?.engine;
      if (!engine) return 0;
      await new Promise((resolve) => engine.scenes[0].onAfterRenderObservable.addOnce(resolve));
      const before = engine._drawCalls.current;
      await new Promise((resolve) => engine.scenes[0].onAfterRenderObservable.addOnce(resolve));
      return engine._drawCalls.current - before;
    },
    /** Steps the simulation without rendering, for hidden tabs where animation frames are throttled. */
    tick(frames = 1, dt = 1 / 30): void {
      for (let i = 0; i < frames; i++) app.step(dt, false);
    },
    key(code: string, down: boolean): void {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    },
    mouse(button: number, down: boolean): void {
      window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true }));
    },
    look(dx: number, dy: number): void {
      window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
    },
    teleport(x: number, y: number, z: number, yaw = 0, health?: number): void {
      const player = app.session?.player;
      player?.restore({ x, y, z }, yaw, health ?? player.health);
    },
    /** Applies lethal damage to active enemies, through the same path bullets use. */
    killEnemies(): number {
      const targets = app.session?.enemies.getHitTargets() ?? [];
      let killed = 0;
      for (const target of targets) {
        if (!target.alive) continue;
        target.applyDamage(10000, 'torso', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
        killed++;
      }
      return killed;
    },
    app,
  };
  (window as unknown as { __ironveil: typeof api }).__ironveil = api;
}
