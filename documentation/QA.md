# QA and test report: version 0.1

Tested build: GitHub Pages deployment of commit `666e629` (`https://mekroket.github.io/operation-iron-veil/`).
Test browser: Chromium 152 in the Claude desktop app's built-in browser pane, Windows 11, Intel integrated graphics, WebGL2.

## How verification works

Nothing is installed on the owner's computer. Every push runs `.github/workflows/build-and-deploy.yml`:
`npm ci`, `npm run typecheck`, `npm run test`, `npm run build`, then deploys to GitHub Pages.
The deployed build is then driven in a real browser through `?debug=1`, which installs `window.__ironveil` (`src/app/debugApi.ts`).
The test API sends real DOM keyboard and mouse events to the game's own listeners, so input, weapons and AI run their normal code paths.

## What each level of evidence means

| Label | Meaning |
| --- | --- |
| Automated | Passes in CI on every push |
| Scripted | Exercised on the deployed build in a real browser, driven by script |
| Not verified | Not exercised; see the reason |

No human has played this build. "Scripted" does not establish how the game feels.

## Results

| Area | Evidence | Result |
| --- | --- | --- |
| TypeScript strict type check | Automated | Pass |
| Unit tests | Automated | 231 tests in 10 files pass |
| Production build | Automated | Pass |
| Main menu renders with live 3D port | Scripted, real click | Pass |
| Campaign and Start Mission buttons | Scripted, real click | Pass |
| Settings, Credits, Pause, Death, Mission Complete screens | Scripted | Pass |
| Graphics presets change live: Low, Medium, High, Ultra | Scripted | Pass |
| WASD, sprint, crouch, jump, mouse look | Scripted | Pass |
| Collision: 16 walls walked into at 60 fps | Scripted | No leaks |
| 14 waist-high cover props cannot be climbed | Scripted | Pass |
| Steps climb at 30, 60, 120, 144 fps | Scripted | Pass |
| Three weapons: fire, ammo, reload, switch, ADS | Scripted | Pass |
| Bullets hit enemies, damage, kills | Scripted | Pass |
| Enemy detection, ALERT, COMBAT, firing, damage to player | Scripted | Pass |
| Doors, data terminal, transfer timer, blast, extraction | Scripted | Pass |
| Checkpoint save, death, restart from checkpoint | Scripted | Pass |
| Restart mission, quit to menu, Exit | Scripted | Pass |
| Full mission, start to results screen | Scripted, see below | Pass |
| No console errors during any of the above | Scripted | Pass |
| Audio signal reaches the output | Scripted | Pass: peak 0.15 ambience, 0.90 rifle, 0.29 footsteps, 0.31 reload, 0.77 explosion |
| Pointer lock | Not verified | The built-in pane refuses it with `WrongDocumentError`. The refusal path works: the game shows "Click to resume" |
| Fullscreen | Not verified | Refused in the pane. The refusal path works: the game keeps running in the window |
| Real frame rate | Not verified | The pane was hidden, which throttles frames. Frame cost was measured instead |
| Audio quality | Not verified | Signal levels were measured; nothing has been heard |
| StackBlitz preview | Not verified | The pane has no `SharedArrayBuffer` and its WebSocket fails, so the import never finishes |
| Mouse feel, difficulty, mission length | Not verified | Needs a human player |

## Full mission run

`documentation/qa-playthrough-bot.js` plays the whole mission using the real input path: no teleporting, no invulnerability, no enemy kills by script.
It walks the navigation graph, aims with mouse events, fires, reloads, opens doors, uses the terminal and boards the boat.

| Measure | Value |
| --- | --- |
| Result | Mission complete, grade S |
| Enemies defeated | 35 of 35 |
| Stuck events | 0 |
| Deaths | 0 |
| Damage taken | 98, partly recovered by regeneration |
| Shots fired, hits | 342, 184 |
| Enemy shots, hits | 157, 14 |
| Simulated time | 194 s |

The bot aims perfectly and never takes cover or plays stealthily, so 194 s is a lower bound and not the expected mission length.
Whether a person takes the targeted 10 to 15 minutes is not verified.

## Frame cost

Measured by forcing the GPU to finish each frame (`readPixels`), on Intel integrated graphics at 1280x960 in the container yard. CPU and GPU work overlap in normal play, so the frame time is closer to the larger number than to the sum.

| Preset | CPU ms | GPU ms | Draw calls |
| --- | --- | --- | --- |
| Low | 19.6 | 2.8 | 490 |
| Medium | 18.1 | 4.2 | 500 |
| High | 15.3 | 6.6 | 501 |
| Ultra | 26.9 | 12.9 | 972 |

Differences between Low, Medium and High CPU figures are measurement noise, since draw counts match.

## Bugs found by testing the running build

All of these passed the type check, unit tests and build, and appeared only in the browser.

| Bug | Cause | Fix |
| --- | --- | --- |
| Physics did not start in the production build | Babylon 9 tree-shaking removed a bare side-effect import | `src/engine/bjs.ts` registers components explicitly |
| Errors every frame after Start Mission | `Ray` side effect missing | Registered, and the call removed |
| Steps could not be climbed at 60 fps and above: the player could not leave the first jetty | Babylon's step-up sweep depends on travel per frame | Permissive slope limit lets the capsule roll over edges below about 0.3 m |
| The view stayed tilted after moving and turning | Changing `rotation.z` makes Babylon bake pitch and yaw into `upVector` | Lean is now applied through `upVector` directly |
| Draw calls were double the expected count | SSAO redraws the scene into a geometry buffer | SSAO moved to Ultra; prop cells enlarged |
| Letterbox stayed on over the results screen | Not cleared at mission end | Cleared |
| Enemies and the gun ignored level lights | Lights are restricted per mesh | Assigned from the lights around the player |

## Repeating this test

Open `https://mekroket.github.io/operation-iron-veil/?debug=1`, wait for the menu, then paste `documentation/qa-playthrough-bot.js` into the browser console. It reports progress on `window.__R`.
