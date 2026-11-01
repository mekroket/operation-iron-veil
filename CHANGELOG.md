# Changelog

## 0.1.0

First playable build of OPERATION: IRON VEIL, mission 01, SILENT BREAKWATER.

### Added

- Babylon.js 9 and Havok foundation with strict TypeScript, Vite and a GitHub Actions pipeline that type checks, tests, builds and deploys to GitHub Pages.
- Capsule first-person controller: walk, sprint, crouch, jump, mouse look, recoil, view bob.
- Three fictional weapons: VR-7 WARDEN, SX-4 HORNET, PX-2 MARSHAL, with procedural models, ADS, recoil, reloads and hit zones.
- One enemy archetype with seven-state AI: patrol, perception, combat with cover, search, damage reactions and death.
- Port Kessary level with 9 zones, 35 enemies, 150 navigation nodes, 9 doors, 16 pickups and 4 checkpoints.
- Procedural PBR materials, props, sky, sea, sun shadows, fog, bloom, tone mapping and VFX.
- Full HTML interface: main menu, campaign briefing, settings, credits, pause, death, results, HUD.
- Web Audio soundscape synthesised in the browser, with no audio files.
- State-driven mission with original story, radio dialogue, intro and extraction cinematics, and browser saves.
- Low, Medium, High and Ultra graphics presets with adaptive resolution.
- 231 unit tests and a browser playthrough bot for QA.

See `documentation/QA.md` for what has and has not been verified, and `KNOWN_ISSUES.md` for open items.
