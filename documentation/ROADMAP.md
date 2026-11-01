# Roadmap

**What the states mean.** "In code" means the system exists in `src/` and is wired into the game. It says nothing about how well it plays. Verification status lives in `documentation/QA.md` and `KNOWN_ISSUES.md`.

## Phases 0 to 11

These are the phases from the owner's brief.

| Phase | Scope | State | Evidence and gaps |
|---|---|---|---|
| 0 | Environment and repository audit | Done | GitHub, cloud CI and WebGL2 checked. The session itself ran on the owner's PC, so nothing was installed there and the build runs in GitHub Actions |
| 1 | Game design and architecture | Done | `documentation/GDD.md`, `documentation/ARCHITECTURE.md`, `src/core/contracts.ts`, `.claude/agents/` |
| 2 | Playable first-person controller | In code, tuning pending | `src/player/`, `src/physics/`. No human tuning pass yet |
| 3 | Weapon and combat systems | In code, tuning pending | `src/weapons/`, `src/combat/`. Three fictional weapons with data-driven tuning |
| 4 | Enemy AI | In code, tuning pending | `src/ai/`, `src/enemies/`. Seven states, one archetype |
| 5 | Greybox industrial port | Done | `src/levels/silentBreakwater/`. Nine zones, 35 enemies, 4 checkpoints |
| 6 | Detailed environment and visual assets | In code, procedural only | `src/scene/`, `src/levels/render/`. No GLB, no authored textures |
| 7 | HUD, menus and UI | In code, no generated art | `src/ui/`. Menus show the live port, with no key art |
| 8 | Audio, effects and animations | In code, synthesised only | `src/audio/`, `src/effects/`, `src/enemies/EnemyRig*.ts`, `src/weapons/ViewModelAnimator.ts`. No recorded voice, no skinned characters |
| 9 | Mission progression and cinematics | In code | `src/missions/`, `src/animations/`, `src/save/`. One mission, in-engine cinematics |
| 10 | Performance optimisation and testing | Partly done | Presets, adaptive resolution and unit tests exist, and frame cost was measured. Real frame rate and a human playtest are pending |
| 11 | Publish the browser-playable game | Done on GitHub Pages | `https://mekroket.github.io/operation-iron-veil/`. Cloudflare Pages not set up |

The full integration landed in commit `c9e2e83`, and its message states it was not yet verified in a browser. Later commits record browser fixes, including `23d26c0`, `b0e48d1` and `cfff7ea`.

## v0.2

1. **Real GLB assets.** Add a loader through `bjs.ts`, then replace the highest-value procedural props first. Follow `ASSET_PIPELINE.md`. Keep procedural versions until a GLB beats them on the deployed build.
2. **Higgsfield art in menus.** Main menu key art, mission briefing art and loading screens, generated from `HIGGSFIELD_ASSET_PROMPTS.md`. These are flat 2D images, and belong in 2D places only.
3. **Human playtest tuning.** Every number in `weaponConfigs.ts`, `enemyConfig.ts`, `playerConfig.ts`, pickup placement and the grade thresholds was set from design intent. Tune them from real play sessions.
4. **More enemy archetypes, after validating the first.** Only add a second archetype once playtests show the contractor reads and fights well. `EnemyConfig` is data, so a variant can start as a second config.

Smaller open items are in `TASKS.md`.
