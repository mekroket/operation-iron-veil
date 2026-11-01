# UI and UX

The interface is an HTML and CSS overlay above the canvas, in `src/ui/`. `UIManager` owns it. Screens never call the game directly: everything goes through `UICallbacks`, called synchronously inside the click so that fullscreen, pointer lock and audio stay allowed. The HUD is driven by bus events plus two per-frame setters, with no references to game objects.

Stacking order: HUD, letterbox, menu layer, resume prompt, loading, FPS counter, notices.

## Screens

| Screen | File | Contents | Reached from |
|---|---|---|---|
| Loading | `LoadingScreen.ts` | Opaque. Title lockup, stage label, percent, bar, rotating FIELD NOTE tips every 6 s | Boot |
| Main menu | `MainMenuScreen.ts` | CAMPAIGN, SETTINGS, CREDITS, EXIT, tagline, status line. The live port shows through a left-side gradient | After boot, quit |
| Campaign | `CampaignScreen.ts` | Mission facts, summary, tasking, rules of engagement, key list, START MISSION, CONTINUE FROM CHECKPOINT when a save exists | CAMPAIGN |
| Settings | `SettingsScreen.ts`, `settingsTabs.ts`, `settingsWidgets.ts` | Tabs: Graphics, Audio, Controls, Display. Changes apply through `SettingsStore` | Menu, pause |
| Credits | `CreditsScreen.ts` | `CREDITS` from canon, fiction notice | CREDITS |
| Pause | `PauseScreen.ts` | RESUME, RESTART CHECKPOINT, RESTART MISSION, SETTINGS, MAIN MENU. Esc is deliberately inert here, because browsers refuse to re-lock from an Esc press | Lost lock, hidden tab |
| Death | `DeathScreen.ts` | OPERATOR DOWN, KIA, RESTART CHECKPOINT, RESTART MISSION, MAIN MENU | 2.2 s after death |
| Mission complete | `MissionCompleteScreen.ts` | Grade, time, enemies, headshots, accuracy, deaths, checkpoints, CONTINUE | After closing radio |
| Exit | `ExitScreen.ts` | SESSION ENDED, safe to close, RETURN TO MENU. Fallback, because browsers only honour `window.close` on script-opened tabs | EXIT |
| Fatal error | `FatalErrorScreen.ts` | Title, detail, RELOAD PAGE | Boot failure, 30 frame errors |

### Always-mounted layers (`overlays.ts`, `FpsCounter.ts`)

- **Letterbox:** cinematic bars with a skip button. Space or Enter also skips.
- **Resume prompt:** a full-viewport CLICK TO RESUME button for when the browser needs another click before it will re-lock.
- **Notice:** a non-blocking message, such as fullscreen being denied.
- **FPS counter:** top right, when enabled in settings.

### Settings

| Tab | Rows |
|---|---|
| Graphics | Quality preset (LOW, MEDIUM, HIGH, ULTRA, with a CUSTOM tag), resolution scale 50 to 100%, shadow quality, texture quality (applies on next load), post-processing, adaptive resolution, FPS counter |
| Audio | Master, effects, ambience, voice, interface |
| Controls | Mouse sensitivity 0.1 to 5, ADS sensitivity 0.1 to 2, FOV 55 to 100, invert Y, key reference |
| Display | Fullscreen on start, fullscreen toggle |

Editing a row re-detects the preset. High and Ultra share the same four stored values, so the preset already selected wins a tie.

## HUD

`Hud.ts` has modes `hidden`, `play` and `cinematic`, where cinematic keeps only radio captions. Hidden uses `visibility`, so running CSS animations do not restart. The overlay never takes pointer events.

| Element | File | Position | Behaviour |
|---|---|---|---|
| Objective panel | `ObjectivePanel.ts` | Top left | Step counter out of 11, text, OBJECTIVE UPDATED banner for 3.2 s. Banners raised during a cinematic wait until the HUD returns. A restore that re-announces the same stage is not treated as news |
| Objective marker | `ObjectiveMarker.ts` | World-projected | Diamond and distance in metres. Off screen it rides the edge with an outward arrow |
| Crosshair | `Crosshair.ts` | Centre | Four ticks and a dot, with a gap showing true spread. Hidden while aiming |
| Hit marker | `Crosshair.ts` | Centre | Distinct kill and headshot states. Plays under reduced motion too, because it is information |
| Health | `HealthPanel.ts` | Bottom left | HEALTH label, value, 10 segments, low state at 30% |
| Damage vignette | `HealthPanel.ts` | Full screen | Edge pulse scaled by damage, plus a persistent low-health vignette. Not directional, although the event carries a source position |
| Ammo | `AmmoPanel.ts` | Bottom right | Magazine / reserve, weapon, fire mode, reload bar, three slots with key numbers. States: RELOADING, EMPTY, OUT OF AMMO, LOW AMMO at 25% of a magazine or less |
| Interaction prompt | `InteractionPrompt.ts` | Centre, 64% down | E keycap, text, hold bar |
| Radio captions | `RadioSubtitles.ts` | Lower centre | Speaker and text, queued. Clock stops while paused so no line is lost. `aria-live` polite |
| Checkpoint notice | `HudFeed.ts` | Top centre, 15% down | CHECKPOINT REACHED for 2.6 s |
| Pickup feed | `HudFeed.ts` | Right, above ammo | + label, at most 4 lines, 3 s each |

Stamina is intentionally not part of this HUD.

## Input and navigation

Menus use arrow keys through `menuNav.ts`. Elements opt in with `data-nav`, and elements inside `data-nav-row` form a horizontal group. Enter is left to the browser, which turns it into a real click, so gesture-gated APIs keep working. Esc goes back on sub-screens. PageUp and PageDown scroll long content. A held Enter or Space does not fall through to the next screen.

Sounds are bus events: `ui:hover` on pointer or focus movement, `ui:click` on buttons and slider release.

## Design tokens

`src/ui/styles/tokens.css`, on `.iv-ui`. Everything scales from one unit: `--u: clamp(6.5px, 0.74vmin, 18px)`, designed to work from 1024x600 up to 4K.

### Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | `#050709` | Deepest background |
| `--panel` | `rgba(9, 11, 13, 0.84)` | Panels |
| `--panel-soft` | `rgba(9, 11, 13, 0.55)` | Soft panels |
| `--text` | `#e8e6de` | Primary text |
| `--text-dim` | `#aeb2b3` | Secondary text |
| `--steel` | `#80878c` | Tertiary |
| `--steel-dark` | `#4b5156` | Inactive |
| `--hairline` | `rgba(232, 230, 222, 0.16)` | Rules |
| `--hairline-strong` | `rgba(232, 230, 222, 0.34)` | Strong rules |
| `--wash` | `rgba(232, 230, 222, 0.055)` | Hover wash |
| `--accent` | `#c8a45e` | Brass accent |
| `--accent-bright` | `#dcbb78` | Brass highlight |
| `--accent-wash` | `rgba(200, 164, 94, 0.13)` | Accent background |
| `--danger` | `#c4503f` | Low health, empty |
| `--danger-deep` | `rgba(140, 26, 16, 0.62)` | Damage |

### Space and type

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--space-1` | 0.5u | | `--text-xs` | 1.5u |
| `--space-2` | 1u | | `--text-sm` | 1.75u |
| `--space-3` | 1.5u | | `--text-md` | 2.1u |
| `--space-4` | 2u | | `--text-lg` | 2.6u |
| `--space-5` | 3u | | `--text-xl` | 3.4u |
| `--space-6` | 4u | | `--text-display` | 8u |
| `--space-7` | 6u | | | |
| `--space-8` | 10u | | | |

### Other

| Token | Value |
|---|---|
| `--font-label` | Barlow Condensed, Arial Narrow, Segoe UI, sans-serif |
| `--font-mono` | Share Tech Mono, Consolas, monospace |
| `--tracking` / `--tracking-wide` | 0.14em / 0.26em |
| `--cut` | 1.2u, used by `--clip-corner` for the cut-corner panel shape |
| `--ease` | `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| `--fast` / `--medium` | 130 ms / 240 ms |

Fonts are bundled through `@fontsource`, both SIL OFL. Entry motion is a short fade and slide staggered through `--i`, and `prefers-reduced-motion` reduces all animation to effectively none.

## Principles

- The interface is brass on near-black. It should sit quietly against the blue-hour image, so saturated colour is reserved for danger.
- Menus leave the live port visible where they can.
- Text carries meaning. States are spelled out (EMPTY, LOW AMMO), not shown by colour alone.
- Add no new colour or size literal when a token exists.
