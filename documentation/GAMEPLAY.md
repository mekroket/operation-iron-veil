# Gameplay

Sources: `src/player/playerConfig.ts`, `MovementModel.ts`, `PlayerController.ts`, `src/core/Input.ts`, `src/physics/CharacterBody.ts`, `src/interaction/`.

## Controls

Keys are fixed and not rebindable.

| Action | Input | Notes |
|---|---|---|
| Move | W A S D or arrow keys | |
| Look | Mouse | Raw pointer lock preferred, standard lock as fallback. Single-frame spikes above 500 px are ignored |
| Fire | Left mouse | Hold for automatic weapons |
| Aim down sights | Right mouse, hold | |
| Reload | R | Pressing fire on an empty magazine also starts a reload |
| Sprint | Shift, hold | Forward only, grounded only |
| Crouch | C or Left Ctrl | Toggle. Standing up needs headroom |
| Jump | Space | Not while crouched |
| Interact | E | Press, or hold where a progress bar shows |
| Weapons | 1, 2, 3 or mouse wheel | 1 WARDEN, 2 HORNET, 3 MARSHAL |
| Pause | Esc | Releases pointer lock, which pauses the game |
| Skip cinematic | Space, Enter or the skip button | |

Losing pointer lock or hiding the tab pauses the game. Browsers refuse a re-lock for about a second after Esc, so RESUME needs a click and a full-screen CLICK TO RESUME prompt covers a refused lock. Menus accept arrow keys and Enter.

## Movement

All numbers are metres and seconds, from `PLAYER_CONFIG`.

| Parameter | Value |
|---|---|
| Capsule radius | 0.35 |
| Stand height / eye | 1.8 / 1.65 |
| Crouch height / eye | 1.15 / 1.02 |
| Eye change rate | 12 |
| Walk speed | 4.4 |
| Sprint speed | 7.0 |
| Crouch speed | 2.2 |
| Backward factor | 0.8 |
| Strafe factor | 0.92 (sprint strafes at walk speed times this) |
| Ground acceleration / deceleration | 42 / 36 |
| Air acceleration | 7 |
| Jump speed | 5.6 |
| Coyote time | 0.1 |
| Jump buffer | 0.12 |
| Base look speed | 0.0021 rad per pixel |
| Max pitch | 1.48 rad |
| Stride length walk / sprint / crouch | 2.3 / 3.1 / 1.7 |
| Recoil follow / recover rate | 32 / 4.5 |
| FOV change rate | 11 |
| Sprint FOV boost | 1.05 times |

From `CharacterBody.ts`: gravity 18 m/s², maximum fall speed 40 m/s, and a capsule that rolls up any edge below about 0.3 m. Level stairs use a 0.28 m rise. At these numbers a jump peaks at about 0.87 m (`v²/2g`). There is no fall damage.

Sprinting cancels crouch and is blocked while aiming. Default vertical FOV is 70 degrees, with a settings range of 55 to 100.

### Speed by weapon

Walk and sprint multiply by the weapon's `moveSpeedMultiplier`. Aiming multiplies that again by `adsMoveMultiplier`.

| Weapon | Walk | Sprint | Walk, fully aimed |
|---|---|---|---|
| VR-7 WARDEN | 4.18 | 6.65 | 2.59 |
| SX-4 HORNET | 4.40 | 7.00 | 3.26 |
| PX-2 MARSHAL | 4.58 | 7.28 | 3.57 |

### Noise

Every completed stride emits `player:footstep`. Enemies hear walking within 4 m and sprinting within 14 m. Crouched steps make no noise for the AI. Hearing is distance only, so walls do not block it. See `ENEMY_AI.md`.

## Health and regeneration

| Parameter | Value |
|---|---|
| Max health | 100 |
| Regen delay after damage | 6 s |
| Regen rate | 7 HP/s |
| Regen segment | 25 HP |
| Medkit | +50 HP, usable only below full health |

Health only recovers to the top of the current 25 HP segment, so medkits stay valuable. Health of 60 regenerates to 75. Health of exactly 50 does not regenerate at all.

The HUD bar has 10 segments of 10 HP each, so it does not line up with the 25 HP regen steps. This is an open task in `TASKS.md`.

Each contractor hit does 7 damage, so a full-health player goes down on the 15th hit. Damage shows as an edge vignette and a health-bar update. At 30% health or below, a persistent vignette and low-health state appear. Damage also adds a brief view shake.

## Interaction

`InteractionSystem` picks the best target by combined distance and facing, then checks line of sight. Default facing limit is 45 degrees.

| Target | Reach (from eye) | Facing | Hold | Prompt |
|---|---|---|---|---|
| Pickup | 2.2 m | 55° | Press | Take ammunition, Ammo full, Use medkit, Health full |
| Door | Half panel width + 1.8 m | 65° | Press | Open (label), or (label): locked |
| Data terminal | 2.6 m | 60° | 3 s | Copy manifest |
| Extraction | Zone half-diagonal + 3 m, must stand in zone | Any | 1.5 s | Board boat |

After a hold completes, the key must be released before another hold can begin. Useless pickups explain why and stay in place. One ammunition crate adds 40% of maximum reserve to every weapon.

Doors slide open and do not close again during play.

## Death

On death the view drops to 0.35 m and rolls. Input is disabled, pointer lock is released, and the KIA screen follows 2.2 s later.
