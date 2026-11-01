# Performance

This file describes design and data. Measured numbers belong in `documentation/QA.md`, taken from the deployed build, not from memory.

Sources: `src/settings/settings.ts`, `src/scene/GraphicsManager.ts`, `adaptiveResolution.ts`, `src/levels/render/`.

## Quality presets

`PRESET_VALUES` stores four values per preset. `resolveGraphics` derives the rest. Default is High with adaptive resolution on. WebGL2 is the baseline.

| Setting | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Resolution scale | 0.75 | 0.9 | 1 | 1 |
| Shadow quality | off | medium | high | high |
| Texture quality | low | medium | high | high |
| Post quality | off | medium | high | high |
| Shadow map size | 0 | 2048 | 4096 | 4096 |
| Shadow distance, m | 60 | 60 | 90 | 90 |
| Texture size | 256 | 512 | 1024 | 1024 |
| Bloom | off | on | on | on |
| FXAA | off | on | on | on |
| Grain | off | off | on | on |
| MSAA samples | 1 | 1 | 4 | 4 |
| SSAO | off | off | off | on |
| Max lights per material | 3 | 4 | 6 | 8 |
| Particle scale | 0.35 | 0.75 | 1 | 1.5 |
| Max decals | 24 | 60 | 120 | 200 |
| Anisotropy | 1 | 4 | 8 | 16 |
| 1080p render cap | yes | yes | yes | no |

High and Ultra store identical values. Ultra is recognised by the preset name, so it applies only when `preset === 'ultra'`. Two lights per material go to the sun and sky, leaving 1, 2, 4 or 6 for level fixtures.

### When a change applies

| Applies | What |
|---|---|
| Live | Resolution scale, render cap, bloom, FXAA, grain, MSAA, SSAO, shadow map size and distance, sea light count |
| At next mission start | Particle scale, decal budget, enemy material light count |
| At next page load | Texture size, anisotropy, level material light count, light rig slots |

The settings screen only flags texture quality as applying on next load. See `TASKS.md`.

## Render resolution

`GraphicsManager.applyScale`:

```
ratio = min(devicePixelRatio, 1.5, pixelCapRatio)
hardwareScalingLevel = 1 / (scale * ratio)
pixelCapRatio = sqrt(1920 * 1080 / canvasCssArea)
```

- **1080p cap:** presets other than Ultra stop at about 1920x1080 worth of pixels, so a large or high-DPI screen does not halve the frame rate. On a 4K window at DPR 1 that gives a ratio of 0.5.
- **Ultra:** `pixelCapRatio` is infinite, but `MAX_DEVICE_RATIO` of 1.5 still applies, so Ultra is not strictly native on a DPR 2 display.
- The cap is recomputed on resize and fullscreen changes.

## Adaptive resolution

`AdaptiveResolution` is pure logic. It decides a scale from frame times and never touches the engine.

| Rule | Value |
|---|---|
| Sampling | 0.25 s buckets, 8 kept. Public FPS is the 2 s rolling average |
| Drop | Newest 1 s averages under 48 FPS: scale times 0.9 |
| Floor | 60% of the requested scale |
| Raise | 2 s average at least 58 FPS held for the raise wait: scale times 1.05 |
| Raise wait | Starts at 6 s. A drop within 12 s of a raise doubles it, up to 96 s. 60 s stable at the raised scale resets it |
| Settle | 2 s discarded after any change, since those frames include reallocated targets |
| Ignored | Hidden tabs, and frames over 0.5 s or non-positive |

It measures the engine's real frame time, because the game's `dt` may be clamped. Changing the requested scale or the toggle resets learned state. FPS is still measured when the feature is off.

## SSAO is reserved for Ultra

SSAO redraws the whole scene into a geometry buffer, which doubles draw calls. It therefore only runs on Ultra with high post quality, and when `SSAO2RenderingPipeline.IsSupported`.

It uses a geometry buffer, not the prepass, since the prepass would turn the main render into an MRT that every material has to support. Parameters: `ssaoRatio` 0.5, 8 samples, radius 1.3, strength 0.95, base 0.08, max Z 130, expensive blur with 8 bilateral samples. Toggling it rebuilds both pipelines, because chain order is attach order and SSAO must stay ahead of tone mapping. MSAA moves to whichever pass receives the scene.

## Instancing and batching

Draw calls are the main budget. Each technique trades a little memory for fewer calls while keeping per-area light lists.

| Content | Strategy | Key |
|---|---|---|
| Level solids | Merged into one mesh per material, spatial cell and casts-shadow flag. Large solids are cut along the grid. World matrices frozen | `GeometryBatcher`, 32 m cells |
| Props | One source per kind, variant and surface. Thin instances per cell | `PropInstancer`, 56 m cells, wider because each prop kind is a draw call per cell and props are the bulk of the count |
| Silhouettes | Thin-instanced boxes | `SceneEnvironment` |
| Light flares, haze, pools | Thin instances, one call per kind | `LightFx` |
| Enemies | `InstancedMesh` of one hidden source per rig part, so any number batch into a handful of calls | `EnemyRigAssets` |
| Guns | Vertex tints, one material per class, shared by all three guns | `ViewModelMaterials` |
| Effects | Created up front and pooled. Decals are a ring buffer that recycles the oldest | `EffectsManager`, `fxPools.ts` |

Spatial cells exist because a single mesh has a single light list. A level-wide mesh would make every light in the level compete for the same slots.

Lit materials stay unfrozen, because batched meshes receive different light sets through `includedOnlyMeshes` and a frozen material can skip the per-mesh light bind. Self-lit materials can freeze.

## Other costs held down

| Area | Technique |
|---|---|
| Shadows | Render-once map. Redrawn when the camera moves 8% of shadow distance, snapped to texels, and a few times after casters change |
| Dynamic lights | Restricted by `includedOnlyMeshes`. Moving meshes re-pick every 0.5 s |
| AI | LOD: think, animation and line-of-sight intervals widen beyond 30 m and 70 m. Line-of-sight rays staggered by golden-ratio phase |
| Perception | Geometry first, raycast only inside the cone. Most sightings cost one ray |
| Interaction | Candidates sorted first, sight check stops at the first visible one |
| Environment reflections | CPU-built cube with synchronous irradiance, no reflection probe pass |
| Load | Textures and sound banks generate in slices, yielding so the bar advances. The noise bank is dropped afterwards |
| Picking | `skipPointerMovePicking` on, meshes not pickable |
| HUD | Per-frame style writes skip changes below a small epsilon |
| Weapons | Allocation-free pose maths and reused result objects on hot paths |

## How to measure

Open the deployed build with `?debug=1`:

```js
__ironveil.snapshot();             // fps, scale, activeMeshes, totalMeshes, lights, backend
await __ironveil.drawCallsPerFrame();
```

Measure at each zone, on each preset, with the FPS counter on. Hidden tabs throttle animation frames, so keep the tab visible. Record hardware and browser with every number.
