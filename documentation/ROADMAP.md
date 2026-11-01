# Roadmap

**Reconcile this list.** The owner's brief is not stored in this repo. The twelve phase titles below were reconstructed from the code and commit history, and need checking against the brief. The states are read from the code.

**What the states mean.** "In code" means the system exists in `src/` and is wired into the game. It says nothing about how well it plays. "Pending" means the code does not contain it. Verification status lives in `documentation/QA.md` and `KNOWN_ISSUES.md`, which the lead maintains.

## Phases 0 to 11

| Phase | Scope | State | Evidence and gaps |
|---|---|---|---|
| 0 | Project setup, rules, specialists, docs | In code | `package.json`, `tsconfig.json`, `.stackblitzrc`, `.claude/agents/`, `documentation/`, `CLAUDE.md` |
| 1 | Engine bootstrap and build pipeline | In code | `src/engine/bjs.ts`, `src/scene/rendererBootstrap.ts`, `.github/workflows/build-and-deploy.yml`. WebGPU is opt-in only |
| 2 | Player controller and physics | In code, tuning pending | `src/player/`, `src/physics/`. No human tuning pass yet |
| 3 | Weapons and combat | In code, tuning pending | `src/weapons/`, `src/combat/`. Three fictional weapons with data-driven tuning |
| 4 | Enemy AI | In code, tuning pending | `src/ai/`, `src/enemies/`. Seven states, one archetype |
| 5 | Level: Port Kessary | In code | `src/levels/silentBreakwater/`. Nine zones, 35 enemies, 12 trigger slices, 4 checkpoints |
| 6 | World rendering and art | In code, procedural only | `src/scene/`, `src/levels/render/`. No GLB, no authored textures |
| 7 | Characters and animation | In code, procedural only | `src/enemies/EnemyRig*.ts`, `src/weapons/ViewModelAnimator.ts`. No skinned characters, no player body |
| 8 | VFX and audio | In code, synthesised only | `src/effects/`, `src/audio/`. No recorded voice |
| 9 | UI and UX | In code, no generated art | `src/ui/`. Menus show the live port, with no key art |
| 10 | Mission, story and save | In code | `src/missions/`, `src/save/`. One mission |
| 11 | QA, performance and release | Partly in code | `tests/` has 10 Vitest files for pure modules. `src/app/debugApi.ts` is the browser test API. CI gates on typecheck, test and build. Presets and adaptive resolution exist. Human playtest and per-preset measurements are pending |

The full integration landed in commit `c9e2e83`, and its message states it was not yet verified in a browser. Later commits record browser fixes, including `23d26c0`, `b0e48d1` and `cfff7ea`.

## v0.2

1. **Real GLB assets.** Add a loader through `bjs.ts`, then replace the highest-value procedural props first. Follow `ASSET_PIPELINE.md`. Keep procedural versions until a GLB beats them on the deployed build.
2. **Higgsfield art in menus.** Main menu key art, mission briefing art and loading screens, generated from `HIGGSFIELD_ASSET_PROMPTS.md`. These are flat 2D images, and belong in 2D places only.
3. **Human playtest tuning.** Every number in `weaponConfigs.ts`, `enemyConfig.ts`, `playerConfig.ts`, pickup placement and the grade thresholds was set from design intent. Tune them from real play sessions.
4. **More enemy archetypes, after validating the first.** Only add a second archetype once playtests show the contractor reads and fights well. `EnemyConfig` is data, so a variant can start as a second config.

Smaller open items are in `TASKS.md`.
