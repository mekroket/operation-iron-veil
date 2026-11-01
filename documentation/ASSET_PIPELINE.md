# Asset Pipeline

## Today: everything is procedural

The repo contains no binary art or audio. Nothing is fetched at runtime except the bundled Havok WASM and fonts.

| Asset | How it is made | Where |
|---|---|---|
| PBR textures | CPU generators producing albedo, normal and ORM | `src/levels/render/tex*.ts`, `noise.ts`, `proceduralTextures.ts` |
| Decals | Canvas atlas with invented brand marks | `src/levels/render/decalAtlas.ts` |
| Level geometry | Box solids merged by material and cell | `src/levels/silentBreakwater/`, `GeometryBatcher.ts` |
| Props | Code builders, 28 kinds in `PROP_CATALOG` | `src/levels/render/props/` |
| Sky, sea, environment | Analytic functions | `src/scene/skyPaint.ts`, `seaSurface.ts` |
| Guns and arms | Pure geometry batches | `src/weapons/gunModels.ts`, `gunArms.ts`, `gunGeometry.ts` |
| Enemies | Instanced primitives, IK from code | `src/enemies/EnemyRigAssets.ts`, `EnemyRig.ts` |
| Animation | Code-driven poses and camera keys | `ViewModelAnimator.ts`, `rigPoses.ts`, `src/animations/` |
| VFX | Procedural textures and pooled thin instances | `src/effects/` |
| Audio | Synthesised with Web Audio, pre-rendered offline at load | `src/audio/` |
| Fonts | `@fontsource` packages, SIL OFL | `src/ui/styles/index.ts` |

**GLB status.** `src/engine/` has no GLB loader yet, and `bjs.ts` does not export `SceneLoader` or any loading function. `@babylonjs/loaders` 9.33.1 is already a dependency, ready for it, and is not imported anywhere.

## Later: concept to GLB, with no desktop software

The owner's computer stays clean: no Blender, no local Node. Every step below happens in a browser or in GitHub Actions. The tools named are candidates. Check that each still exists, and read its current terms, before relying on it.

| Step | Output | Browser-only option |
|---|---|---|
| 1. Concept | Reference images | Prompts in `HIGGSFIELD_ASSET_PROMPTS.md` |
| 2. Mesh | Source GLB | A hosted image-to-3D service, or a CC0 library such as Poly Haven, Quaternius or Kenney |
| 3. Rig, for characters | Skinned GLB | A web auto-rigger such as Mixamo. Check the licence for your use |
| 4. Inspect | Visual check | Babylon.js Sandbox |
| 5. Validate | Spec report | Khronos glTF Validator, web version |
| 6. Optimise | Smaller GLB | gltf.report in a browser, or glTF-Transform as a CI step or in StackBlitz |
| 7. License record | Entry in the asset register | See below |
| 8. Commit | `public/assets/...` | GitHub web upload or github.dev. No `public/` folder exists yet |
| 9. Integrate | Loader code | Below |
| 10. Verify | Deployed build | Push, GitHub Actions, then the deployed URL with `?debug=1` |

**A generated image is not a 3D asset.** Never texture a plane or billboard with a generated picture and present it as geometry. See the warning in `HIGGSFIELD_ASSET_PROMPTS.md`.

### Integration work needed

1. **Loader in `bjs.ts`.** Export the loading function and register the glTF loader there. Do not assume a bare `import '@babylonjs/loaders/glTF'` survives: that is the same production-only tree-shaking trap described in `ARCHITECTURE.md`. Prefer an explicit named registration if the package provides one, and verify on the deployed build, not the dev server.
2. **Paths.** `vite.config.ts` uses `base: './'`, so build URLs from `import.meta.env.BASE_URL`. Absolute `/assets/...` paths would break on the GitHub Pages sub-path.
3. **Loading progress.** Fit asset loads into the `onProgress` fractions in `GameWorld.create`.
4. **Handedness.** The glTF loader wraps content in a root node that converts right-handed to left-handed. Bake or account for this before feeding meshes to thin instances, whose matrices are written directly in level space.

### Replacing a prop

`PropInstancer` builds one source mesh per surface per variant, then thin-instances it per 56 m cell. A GLB prop should keep that shape:

- Split it into one mesh per material.
- Keep the origin at base centre, in metres, Y up, facing +Z.
- Stay inside the prop's `size` in `PROP_CATALOG`. Collision comes from the catalog, not from the mesh.
- Use `MaterialLibrary` surfaces where possible, so draw calls and shaders stay shared.
- Register casters only for surfaces outside `NON_CASTING`.

### Replacing a character

Hit capsules read points from the rig through `EnemyRig.readHitPoints`, and gameplay depends on `readMuzzle`, `setTransform`, `triggerFlinch` and `triggerDeath`. A skinned GLB must keep that interface. Note that `EnemyManager` relies on instancing source meshes for its draw-call budget, and skinned characters will not batch the same way, so measure before committing.

### Proposed budgets

These are starting targets, not measurements. Confirm them with `__ironveil.drawCallsPerFrame()` on the deployed build.

| Asset | Triangles | Textures |
|---|---|---|
| Small prop | Under 2k | Shared library, or one 512 set |
| Large prop or vehicle | Under 10k | One 1024 set |
| Contractor | Under 15k | One 1024 set |
| First-person weapon | Under 20k | One 1024 set |

Keep the whole download small enough for a browser game, and use KTX2 or similar only after checking that the loader registration includes the transcoder files.

## License checks

Before an asset is committed, record in a register (proposed: `public/assets/LICENSES.md`):

- Source URL, author, and date retrieved
- Licence name and a link to its text
- Whether attribution is required. If so, add it to `CREDITS` in `src/missions/canon.ts`
- For generated assets: the service, the plan, and that its terms permit commercial or public use on that plan

Reject an asset when:

- The licence is unclear, non-commercial while the use could be commercial, or "editorial only".
- It depicts a real firearm model, maker mark, brand, flag, insignia, or a real person's likeness.
- It is a ripped game asset, whatever a marketplace page claims.

Keep the fiction clean: all three weapons and every organisation are invented, and the credits screen states that.

## CORS checks

Prefer serving every asset from the same origin, under `public/assets/`, so CORS does not arise. If an asset must come from another host:

- The host must send `Access-Control-Allow-Origin`, or WebGL refuses the texture upload.
- Confirm in the deployed build's console and network panel, since dev server origins differ from `mekroket.github.io`.
- Check range and cache headers, and that the host permits hotlinking.
- Mirror the file into the repo if the host is not under your control. A third-party URL can vanish and break the game.
- StackBlitz previews have another origin again, so test there separately.
