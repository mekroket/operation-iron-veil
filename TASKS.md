# Tasks

Open tasks only. Each comes from the code as it stands or from the v0.2 list in `documentation/ROADMAP.md`.

## Verification

- [ ] Reconcile the phase titles in `documentation/ROADMAP.md` with the owner's brief. (game-director)
- [ ] Human playtest of the full mission on the deployed build, and record findings. (qa-engineer)
- [ ] Measure FPS and draw calls per zone and per preset on named hardware, and record them in `documentation/QA.md`. (performance-engineer)
- [ ] After any Babylon upgrade, re-verify raycasts on the deployed build, because `bjs.ts` keeps a bare `Culling/ray` import. (technical-director)
- [ ] Validate the opt-in `?webgpu=1` path, or remove it. (graphics-engineer)

## Tuning

- [ ] Tune weapons, AI, movement, pickup placement and grade thresholds from playtests. All current numbers come from design intent. (game-director with owners)
- [ ] Review whether arm hits should count as limb hits. The limb capsule runs from pelvis to ankle only. (weapon-systems-programmer)

## UX

- [ ] Make the health bar show the regen cap. The bar has 10 segments of 10 HP, while regen stops at 25 HP steps. (game-ui-ux-designer)
- [ ] Add a directional damage indicator. `player:damaged` carries `sourcePosition`, but `HealthPanel` uses only an edge vignette. (game-ui-ux-designer)
- [ ] Tell players which graphics changes wait for a reload. Only texture quality says so, yet level light count and anisotropy are also fixed at page load, and particle and decal budgets at mission start. (game-ui-ux-designer)
- [ ] Key rebinding: `KEY_BINDINGS` is fixed. (game-ui-ux-designer)

## Code cleanup

- [ ] Remove `CascadedShadowGenerator` and `ReflectionProbe` from `bjs.ts`, or use them. Nothing else references them. (technical-director)
- [ ] Use `enemy:stateChanged` or remove it. It has no subscribers. (technical-director)
- [ ] Canon check: the container mark HALCYON LINE in `decalAtlas.ts` shares a name with Task Unit Halcyon. Make it deliberate or rename it. (narrative-designer)

## v0.2

- [ ] Add a GLB loader through `bjs.ts`, with its registration verified on the deployed build. (technical-director)
- [ ] Create the asset licence register and `public/assets/`. (environment-artist)
- [ ] Replace the highest-value procedural props with real GLB assets. (environment-artist)
- [ ] Replace contractors and first-person arms with real GLB assets, keeping the `EnemyRig` interface. (character-artist, animation-engineer)
- [ ] Generate Higgsfield art and use it in flat 2D places: main menu, mission briefing, loading screens. (game-ui-ux-designer)
- [ ] Approve Sgt. Calloway's proposed appearance in `documentation/HIGGSFIELD_ASSET_PROMPTS.md`. (game-director)
- [ ] Add more enemy archetypes, only after playtests validate the first. (enemy-ai-engineer)
