# OPERATION: IRON VEIL

Single-player browser FPS. Babylon.js 9.33.1, Havok WASM, TypeScript 5.9, Vite 7, Vitest 3. Everything in the game is procedural and fictional.

Deployed build: https://mekroket.github.io/operation-iron-veil/

## Browser-only rule

Never install or run anything on the owner's computer. No local `npm install`, no `node_modules`, no `npm`, `npx`, `node`, `tsc`, `vite` or `vitest`, and no desktop content tools. Editing files and using git is fine. Code runs only in GitHub Actions, in StackBlitz, or in a browser.

## Verification loop

There is no local verification. A change is checked like this:

1. **Push** to `main`, when asked to commit and push.
2. **GitHub Actions**: `.github/workflows/build-and-deploy.yml` runs `npm ci`, `npm run typecheck`, `npm run test` and `npm run build`, then deploys `dist` to GitHub Pages. Check the run with `gh run list` and `gh run view`.
3. **Deployed URL**: open https://mekroket.github.io/operation-iron-veil/?debug=1 and exercise the change.

Never say something works without output from step 2 or 3. If it has not been verified, say so. Results go in `documentation/QA.md`, defects in `KNOWN_ISSUES.md`, and releases in `CHANGELOG.md`.

### Debug API

`?debug=1` installs `window.__ironveil`, from `src/app/debugApi.ts`. It drives the game through the real input listeners and systems.

| Call | Purpose |
|---|---|
| `snapshot()` | State, phase, stage, objective, player, weapon, enemy counts, fps, scale, meshes, lights, backend, recent errors |
| `errors` | Captured window errors and unhandled rejections |
| `ignoreLock(value = true)` | Keep the mission running with no pointer lock |
| `drawCallsPerFrame()` | Async. Draw calls in one rendered frame |
| `tick(frames = 1, dt = 1/30)` | Step the simulation without rendering, for hidden tabs |
| `key(code, down)`, `mouse(button, down)`, `look(dx, dy)` | Dispatch real input events |
| `teleport(x, y, z, yaw = 0, health?)` | Move the player |
| `killEnemies()` | Lethal damage to active enemies, through the same path as bullets |
| `app` | The `App` instance |

## The bjs.ts rule

Import Babylon only through `src/engine/bjs.ts`.

Babylon 9 tree-shaking can drop bare side-effect imports **in production only**: `.pure` modules and the `sideEffects` allow-list mean a bare `import '.../component'` may work on the dev server and vanish from the bundle. So `bjs.ts` imports each `Register...` function by name and calls it.

To add a Babylon feature: export it from `bjs.ts`, call its named registration there, and verify on the deployed URL, because a dev pass proves nothing. Known exceptions and why they exist are listed in `documentation/ARCHITECTURE.md`.

## TypeScript

`tsconfig.json` has `strict`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `isolatedModules` and `verbatimModuleSyntax`. Unused code fails CI. Use `import type` for type-only imports, and `override` on overriding members. Tests are type-checked too.

## Conventions

- **Pure modules** stay free of Babylon and the DOM, so Vitest can run them in Node: `core` (except `Input`), `settings`, `save`, `combat`, `ai`, `missions`, `interaction`, level data, and the config files.
- **Tuning is data.** Numbers live in `playerConfig.ts`, `weaponConfigs.ts`, `enemyConfig.ts`, `settings.ts` and level data.
- **Cross-system messages** use `EventBus` (`src/core/events.ts`). Audio, VFX and HUD respond only to events.
- **Interfaces** live in `src/core/contracts.ts`. Changing a signature is a Technical Director decision.
- **Session systems** dispose everything they create. Restarting builds a new `GameSession`.
- **Gesture-gated browser APIs** (fullscreen, pointer lock, audio) must be called synchronously inside the click.
- **Fiction only.** No real firearms, brands, insignia, flags or people.
- When code changes a documented number, update the matching file in `documentation/`.

## Folder map

| Path | Contents |
|---|---|
| `src/app/` | `App`, `GameWorld`, `GameSession`, `BrowserSession`, `debugApi` |
| `src/engine/bjs.ts` | Babylon gateway |
| `src/core/` | Contracts, events, types, math, input |
| `src/player/`, `src/physics/` | Movement, health, Havok capsule |
| `src/weapons/`, `src/combat/` | Weapon data and logic, view model, hitscan |
| `src/ai/`, `src/enemies/` | Brain, perception, nav, contractors, rig |
| `src/interaction/` | Interaction, doors, pickups |
| `src/levels/` | Data model, prop catalog, validator |
| `src/levels/silentBreakwater/` | Mission 01 level data |
| `src/levels/render/` | Materials, textures, batching, props, lights |
| `src/scene/` | Renderer, sky, sea, shadows, post, adaptive resolution |
| `src/effects/` | Pooled VFX |
| `src/animations/` | Camera paths |
| `src/missions/` | Canon, script, state machine, director |
| `src/audio/` | Synthesised audio |
| `src/ui/` | Screens, HUD, design tokens |
| `src/settings/`, `src/save/` | Presets, checkpoints |
| `tests/` | Vitest suites |
| `documentation/` | Design and technical docs |
| `.claude/agents/` | Specialist subagents, one per discipline |
| `.github/workflows/` | CI and deploy |

## Start here

`documentation/ARCHITECTURE.md` for structure and frame order, `documentation/GDD.md` for design, `TASKS.md` for open work, `documentation/ROADMAP.md` for phases.
