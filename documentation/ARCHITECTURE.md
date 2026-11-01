# Architecture

TypeScript 5.9, Vite 7, Babylon.js 9.33.1, Havok WASM 1.3.14, Vitest 3. A static site with no backend. Persistence is `localStorage`, with an in-memory fallback when storage is blocked.

## Module map

| Folder | Purpose | Babylon or DOM? |
|---|---|---|
| `src/main.ts` | Finds `#game-canvas` and `#ui-root`, boots `App` | DOM |
| `src/app/` | `App`, `GameWorld`, `GameSession`, `BrowserSession` (pointer lock, fullscreen), `debugApi`, `screenProjection` | Yes |
| `src/engine/bjs.ts` | The single Babylon gateway | Yes |
| `src/core/` | `contracts`, `events`, `types`, `math`, `Input` | Only `Input` touches the DOM |
| `src/settings/`, `src/save/` | Settings schema and presets, versioned checkpoints | Pure, storage injected |
| `src/physics/` | `PhysicsWorld` and `CharacterBody` over Havok | Yes |
| `src/player/` | `playerConfig`, `MovementModel`, `PlayerController` | Controller only |
| `src/weapons/` | Configs, state, inventory, recoil, procedural guns, view model, animator | Pure logic plus view classes |
| `src/combat/` | `hitscan`, `resolveShot` | Pure |
| `src/ai/` | State machine, perception, accuracy, nav graph and follower, brain states | Pure |
| `src/enemies/` | `enemyConfig`, `Enemy`, `EnemyManager`, rig and rig assets | Config and `rigMath` pure |
| `src/interaction/` | `InteractionSystem`, `DoorSystem`, `PickupSystem` | Pure, visuals and blockers injected |
| `src/levels/` | Level data model, `propCatalog`, `levelGeometry` validator | Pure |
| `src/levels/silentBreakwater/` | Mission 01 as data: solids, props, lights, nav, triggers, spawns | Pure |
| `src/levels/render/` | Materials, procedural textures, batching, instancing, lights, mission visuals | Yes |
| `src/scene/` | Renderer bootstrap, sky, sea, sun shadows, post-processing, adaptive resolution | Mostly yes, `adaptiveResolution` and `skyPaint` pure |
| `src/effects/` | Pooled impacts, tracers, shells, explosion, ambient particles | Yes |
| `src/animations/` | `cameraPath` (pure), `CinematicPlayer` | Player only |
| `src/missions/` | Canon, script data, state machine, director, world hands, cues, radio queue, stats | Pure, Babylon-free |
| `src/audio/` | Web Audio engine, synthesised sound banks, ambience, event-to-sound director | Web Audio |
| `src/ui/` | HTML overlay: screens, HUD, CSS tokens | DOM |
| `tests/` | Vitest suites for the pure modules, run in Node | No |

Pure modules are what make `tests/` possible without a browser. Keep Babylon and DOM out of them.

## The App, GameWorld, GameSession split

**`App`** is the top-level state machine (`boot`, `menu`, `mission`, `paused`, `awaitingLock`, `dead`, `complete`, `fatal`). It owns the render loop, `EventBus`, stores, audio, input and `UIManager`. It lives for the whole page. It clamps frame time to 50 ms. It logs frame errors and shows the fatal screen after 30 consecutive failures.

**`GameWorld`** is everything that survives between attempts: engine, scene, camera, physics, static level, lighting, `SceneEnvironment` and `GraphicsManager`. It is built once at boot, and the main menu renders this same world behind the UI. Door blockers are cached here so sessions reuse them.

**`GameSession`** is one attempt at the mission: player, weapons, enemies, interaction, doors, pickups, mission director, effects and cinematic. Restarting always disposes it and builds a new one, so no state can leak. Its phases are `intro`, `playing`, `extracting` and `ended`.

Boot order in `App.boot`: `GameWorld.create` (renderer, physics, sky and sea, level render, post-processing, shader compile), `audio.prepare`, `installDebugApi`, main menu, render loop.

Browsers only allow fullscreen, pointer lock and audio from a user gesture. `App.startMission` therefore runs synchronously inside the click, and UI screens call it through `UICallbacks` without an async gap. Screens never talk to the game directly.

## Frame update order

`App.step(dt, render)`:

1. By state. `menu`: menu camera and audio listener. `mission`: `session.update(dt, input.sample())`. `dead`: `session.update(dt, null)` plus the death timer. Otherwise input is sampled and discarded.
2. `world.update(dt)`: `visuals.update` (lights, LEDs, doors, pickups, objective screen, blast), then `environment.update` (sea, sun), then `graphics.update` (adaptive resolution).
3. `director.update(dt)` for ambience and heartbeat.
4. `ui.setFps`, then `scene.render()` unless `render` is false.

`GameSession.update(dt, input)`, in this exact order:

1. Return when the phase is `ended`. Compute `controllable` as `phase === 'playing'` and the player alive.
2. If a cinematic is playing, `cinematic.update`. Otherwise, unless extracting, `player.update(dt, controllable ? input : null)`.
3. If controllable with input, `weapons.update` then `interaction.update`. Otherwise `interaction.reset`.
4. `enemies.update(dt)`
5. `mission.update(dt)`
6. `effects.update(dt, cameraPosition)`
7. `updateAudio`: listener pose, plus an upward ray every 0.25 s that detects a roof within 16 m and crossfades interior ambience.
8. `updateHud`: crosshair, then the projected objective marker.

## EventBus

`src/core/events.ts` is typed through the `GameEvents` map. `on` returns its unsubscribe function. Listeners are iterated over a copy, so unsubscribing during an emit is safe. Audio, VFX and HUD are driven by these events and hold no references to gameplay objects.

| Events | Emitted by | Consumed by |
|---|---|---|
| `weapon:fired` | `WeaponSystem` | `EnemyManager` (gunfire noise), `EffectsManager`, `AudioDirector`, `MissionStatsTracker` |
| `weapon:hud`, `weapon:reloadStart`, `weapon:reloadEnd` | `WeaponSystem` | `AmmoPanel`; reload also `AudioDirector` |
| `weapon:dry`, `weapon:switched`, `weapon:ads` | `WeaponSystem` | `AudioDirector` |
| `combat:enemyHit` | `resolveShot` | `Crosshair`, `AudioDirector`, `MissionStatsTracker` |
| `combat:impact` | `resolveShot`, `Enemy` on misses | `EffectsManager`, `AudioDirector` |
| `enemy:fired` | `Enemy` | `EffectsManager`, `AudioDirector` |
| `enemy:killed` | `Enemy` | `Crosshair`, `MissionStatsTracker` |
| `enemy:callout` | `Enemy` | `AudioDirector` |
| `enemy:stateChanged` | `EnemyBrain` through `Enemy` | No subscribers yet |
| `player:damaged`, `player:healed` | `PlayerController` | `HealthPanel`, `AudioDirector` |
| `player:died` | `PlayerController` | `MissionDirector`, `GameSession`, `AudioDirector` |
| `player:footstep` | `PlayerController` | `EnemyManager` (walk and sprint noise; crouch is silent), `AudioDirector` |
| `player:jumped`, `player:landed` | `PlayerController` | `AudioDirector` |
| `interaction:prompt` | `InteractionSystem` | `InteractionPrompt` |
| `pickup:collected` | `PickupSystem` | `HudFeed`, `AudioDirector` |
| `door:moved` | `DoorSystem` | `AudioDirector` |
| `mission:objective` | `MissionDirector` | `ObjectivePanel`, `AudioDirector` |
| `mission:radio` | `RadioQueue` | `RadioSubtitles`, `AudioDirector` |
| `mission:checkpoint` | `MissionDirector` | `HudFeed`, `AudioDirector` |
| `mission:complete`, `mission:failed` | `MissionDirector` | `AudioDirector` |
| `fx:explosion` | `MissionWorld.detonate` | `EffectsManager`, `PlayerController` (screen shake), `AudioDirector` |
| `ui:hover`, `ui:click` | `UIManager` | `AudioDirector` |

The App learns about completion and death through `SessionHooks`, not the bus. `GameSession` subscribes to `player:died` and calls `hooks.onDied`.

Per-frame values that would be wasteful as events (crosshair spread, objective marker position, FPS) use direct `UIManager` setters instead.

## The bjs.ts rule

Import Babylon classes only from `src/engine/bjs.ts`.

**Why.** Babylon 9 ships tree-shakeable `.pure` modules and a `sideEffects` allow-list in its `package.json`. A bare `import '.../someComponent'` can work in the dev server and silently vanish from the production bundle, so the failure appears only on the deployed build. `bjs.ts` therefore imports each registration function by name and calls it: joined physics engine, Physics V2, base texture polynomial, thin instances, particle system, post-process pipeline manager, geometry buffer renderer and depth renderer.

**When adding a Babylon feature:** export the class from `bjs.ts`, find the feature's named `Register...` function, call it there, and verify on the deployed URL. A pass on the dev server proves nothing here.

**Known exceptions in the code today:**

- `bjs.ts` itself keeps one bare import, `@babylonjs/core/Culling/ray`, added in commit `6c401ee`. Treat it as a risk: re-verify raycasts on the deployed build after any Babylon upgrade.
- `src/scene/rendererBootstrap.ts` dynamically imports `WebGPUEngine`, to keep WebGPU code out of the main chunk. It only runs with `?webgpu=1`.
- `src/physics/PhysicsWorld.ts` imports `@babylonjs/havok` directly. That is a separate package, not Babylon core, and its `.wasm` is resolved with Vite's `?url`.

## Contracts

`src/core/contracts.ts` holds the interfaces between systems. Owners implement them and consumers depend only on them. Changing a signature is a Technical Director decision.

| Contract | Implemented by | Used by |
|---|---|---|
| `IPhysicsWorld`, `ICharacterBody`, `IDoorBlocker` | `src/physics/` | Player, enemies, weapons, doors |
| `IPlayerView`, `IPlayerControl` | `PlayerController` | Weapons, AI, missions |
| `FrameInput` | `core/Input` | Player, weapons, interaction |
| `HitTarget`, `HitCapsule`, `IHitTargetProvider` | `Enemy`, `EnemyManager` | `combat/` |
| `GameContext` | Built by `GameSession` | Weapons, enemies, missions |
| `ISystem` | Lifecycle shape for per-session systems | |
| `IWeaponDirector`, `WeaponSaveState` | `WeaponSystem` | Mission layer, pickups, saves |
| `IEnemyDirector` | `EnemyManager` | Mission layer |
| `INavDoors` | `DoorSystem` | AI |
| `ILevelVisuals` | `LevelRenderer` | Mission layer, doors, pickups |

## Persistence

| Key | Content | Module |
|---|---|---|
| `ironveil.settings.v1` | Settings, sanitised on read | `settings.ts` |
| `ironveil.checkpoint` | Latest `MissionCheckpoint` | `SaveStore` |
| `ironveil.campaign` | Completed flag, best grade | `SaveStore` |

Every read validates the whole shape, and anything unreadable is discarded instead of thrown.

## Build and URL flags

`vite.config.ts` uses `base: './'` so the static build works on any host, and excludes Havok from dependency pre-bundling because its WASM is located relative to the module.

| Flag | Effect |
|---|---|
| `?debug=1` | Installs `window.__ironveil` (`src/app/debugApi.ts`) |
| `?webgpu=1` | Tries WebGPU, falls back to WebGL2 on any failure. WebGL2 is the baseline |
