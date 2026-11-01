# Weapon System

All three weapons are fictional. All tuning is data in `src/weapons/weaponConfigs.ts`. Angles are radians, distances metres, times seconds.

The player carries all three from the start, beginning on the WARDEN. There are no weapon pickups.

## Core numbers

| Parameter | VR-7 WARDEN | SX-4 HORNET | PX-2 MARSHAL |
|---|---|---|---|
| Slot and key | 1 | 2 | 3 |
| Internal id | `assaultRifle` | `smg` | `handgun` |
| Fire mode | auto | auto | semi |
| RPM | 680 | 960 | 420 |
| Damage | 30 | 18 | 36 |
| Head multiplier | 2.2 | 1.7 | 2.6 |
| Limb multiplier | 0.75 | 0.8 | 0.8 |
| Range | 180 | 85 | 110 |
| Falloff start | 40 | 11 | 26 |
| Falloff end | 110 | 34 | 65 |
| Falloff minimum | 0.6 | 0.34 | 0.55 |
| Magazine | 30 | 36 | 13 |
| Start reserve | 120 | 144 | 52 |
| Max reserve | 210 | 288 | 91 |
| Reload, empty | 2.75 | 2.3 | 1.95 |
| Reload, tactical | 2.05 | 1.75 | 1.5 |
| Equip | 0.55 | 0.38 | 0.28 |
| Holster | 0.28 | 0.2 | 0.16 |
| Sprint recovery | 0.2 | 0.12 | 0.08 |
| ADS time | 0.24 | 0.17 | 0.15 |
| ADS FOV multiplier | 0.72 | 0.82 | 0.84 |
| Move speed multiplier | 0.95 | 1 | 1.04 |
| ADS move multiplier | 0.62 | 0.74 | 0.78 |

## Spread

| Parameter | WARDEN | HORNET | MARSHAL |
|---|---|---|---|
| Hip spread | 0.024 | 0.03 | 0.015 |
| ADS spread | 0.0016 | 0.0058 | 0.0007 |
| Move penalty | 0.022 | 0.012 | 0.014 |
| Airborne penalty | 0.05 | 0.03 | 0.035 |
| Crouch multiplier | 0.8 | 0.85 | 0.78 |

`computeSpread` in `RecoilModel.ts`, where `t` is aim progress:

```
spread = lerp(hip, ads, t)
       + (move * moveFactor + air) * lerp(1, 0.25, t)
       + bloom * lerp(1, 0.4, t)
crouched: spread * crouchMultiplier
```

`moveFactor` is horizontal speed / 6, clamped to 1. The crosshair gap draws this exact value, projected to pixels.

## Recoil

| Parameter | WARDEN | HORNET | MARSHAL |
|---|---|---|---|
| Pitch per shot | 0.0115 | 0.0058 | 0.03 |
| Yaw per shot | 0.0045 | 0.0048 | 0.004 |
| Pattern length, shots | 9 | 6 | 3 |
| Tail yaw sway | 0.9 | 1.3 | 0.8 |
| Random pitch | 0.0012 | 0.0014 | 0.003 |
| Random yaw | 0.0014 | 0.0022 | 0.0035 |
| ADS multiplier | 0.62 | 0.72 | 0.7 |
| Recovery delay | 0.14 | 0.09 | 0.2 |
| Pattern recovery, steps/s | 22 | 34 | 10 |
| Bloom per shot | 0.0028 | 0.0021 | 0.0065 |
| Bloom max | 0.038 | 0.05 | 0.03 |
| Bloom recovery, per s | 0.05 | 0.075 | 0.045 |

Patterns, as (pitch, yaw) multipliers:

- **WARDEN:** (1.3, 0.2) (1.1, 0.45) (1, 0.8) (0.95, 1) (0.9, 0.5) (0.85, -0.4) (0.8, -0.9) (0.8, -0.5) (0.75, 0.3)
- **HORNET:** (1.15, -0.3) (1.05, 0.65) (0.95, -0.8) (0.9, 0.9) (0.85, -0.7) (0.85, 0.5)
- **MARSHAL:** (1, 0.5) (1.1, -0.5) (1.15, 0.4)

The last step holds once the pattern runs out, and a sine sway scaled by `tailYawSway` is added to yaw. `RecoilModel` never sends a counter-kick. The view settles back inside `PlayerController`, so the player's own aim stays where it was, and only pattern position and bloom recover in the model.

## Hit resolution

`src/combat/`. Bullets are instant rays from the player's eye along a direction jittered inside the spread cone. The muzzle is only used for visuals.

- `resolveHitscan` returns the nearest of the world and a living target's capsules. A wall at exactly the same distance stops the bullet.
- `computeDamage = damage * zoneMultiplier * falloff`. Falloff is 1 up to the start, linear to the minimum at the end.
- Enemy hit volumes: head sphere radius 0.135, torso capsule radius 0.24 from spine to chest, limb capsule radius 0.2 from pelvis to ankle. Arms have no capsule of their own.

### Shots to kill a 100 HP contractor, inside falloff start

Derived from the table above.

| Zone | WARDEN | HORNET | MARSHAL |
|---|---|---|---|
| Head | 2 (66) | 4 (30.6) | 2 (93.6) |
| Torso | 4 (30) | 6 (18) | 3 (36) |
| Limb | 5 (22.5) | 7 (14.4) | 4 (28.8) |

Body damage past falloff end: WARDEN 18, HORNET 6.12, MARSHAL 19.8.

## Behaviour rules

- **Fire rate** carries overshoot between frames, so low frame rates keep the true rate. A single frame fires at most 3 shots.
- **Semi-auto buffer:** a trigger pull within 0.09 s before the gun is ready still fires.
- **Sprint:** no firing while sprinting or during sprint recovery.
- **Reload:** ammunition moves only on completion, so cancelling loses nothing. Rounds left in the magazine are kept. Pressing fire on empty starts a reload, or plays a dry click when no reserve is left.
- **Switching:** holster time, then equip time. Switching cancels a reload. Selecting the current weapon during a holster raises it again.
- **ADS:** blocked during reload, switching and equip. Aiming blocks sprint and applies FOV, look sensitivity and speed multipliers along an eased curve.
- **Disabled:** `setEnabled(false)` during cinematics hides the view model and resets all player modifiers.
- **Ammo crates:** +40% of max reserve per weapon, rounded up: WARDEN 84, HORNET 116, MARSHAL 37.

## View model

Guns and arms are procedural geometry (`gunModels.ts`, `gunArms.ts`, `gunGeometry.ts`), drawn in rendering group 1 with depth cleared, so the gun never clips into walls. `ViewModelAnimator` computes every pose from scalars each frame: bob, sway, spring kicks, bolt cycle, reload timeline, sprint pose and ADS. Per-weapon offsets are in the `view` block of each config. `adsOffset.y` must equal `-sightHeight`, so the sight line crosses screen centre.

To add a weapon: extend `WeaponId` and `WEAPON_SLOTS` in `core/types.ts`, then add a config, a builder in `gunModels.ts` and an entry in `GUN_MIX` plus sounds in `src/audio/`.
