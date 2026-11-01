# Enemy AI

One archetype exists: the Black Meridian contractor. The decision code in `src/ai/` is pure. `Enemy` glues it to physics, rig and events through `BrainDeps`, and tests supply fakes. All tuning is in `src/enemies/enemyConfig.ts`.

## States and transitions

`EnemyStateName`: IDLE, PATROL, SUSPICIOUS, ALERT, COMBAT, SEARCH, DEFEATED. An enemy starts in PATROL when it has a patrol loop, otherwise IDLE.

| From | To | Condition |
|---|---|---|
| IDLE | ALERT | Awareness reaches 1 |
| IDLE | SUSPICIOUS | Noise heard, or awareness at least 0.35 |
| IDLE | PATROL | Has a loop and 1.5 s elapsed |
| PATROL | ALERT or SUSPICIOUS | Same escalation as IDLE |
| PATROL | IDLE | A guard with no loop has walked back to its post |
| SUSPICIOUS | ALERT | Awareness reaches 1 |
| SUSPICIOUS | PATROL | Linger finished and awareness below 0.35. Forgets everything |
| ALERT | COMBAT | Reaction timer ends: 0.35 to 0.6 s, or 0.12 s when shot |
| COMBAT | SEARCH | No sight of the target for 6 s |
| SEARCH | ALERT | Awareness reaches 1 |
| SEARCH | PATROL | Search nodes exhausted, or 35 s elapsed. Forgets everything |
| Any | DEFEATED | Killed. Terminal |

Outside events:

| Call | Effect |
|---|---|
| `onDamaged` | Flinch and full awareness of the shooter. Calm states go to ALERT with quick reaction. In COMBAT, time on target drops 40% and the burst ends |
| `notifyAllyAlert` | Full awareness, silent ALERT with no callout or re-broadcast |
| `forceCombat` | Full awareness, straight to COMBAT. Used by the mission script |

**What each state does.**

- **IDLE:** stands at home and scans left and right.
- **PATROL:** walks the nav loop, pausing 1.5 to 4 s at each node.
- **SUSPICIOUS:** raises the weapon, calls out, stops 0.8 s, walks to the point, lingers 2 to 3.5 s. New noise or sighting moves the point.
- **ALERT:** faces the last known position. Unless the alert was passed on, it calls `contact` and alerts allies.
- **COMBAT:** see below.
- **SEARCH:** walks to the last known position, then visits 1 to 2 nodes within 14 m. Keeps awareness up to 0.6, so a fresh sighting escalates fast.

## Perception

`Perception.ts`. Awareness is a 0 to 1 meter.

Visibility per sighting is `distanceFactor * fovFactor`, zero outside range or cone. `distanceFactor = max((1 - d/range)^1.3, 0.06)`. `fovFactor` falls to 0.35 at the cone edge. Within 1.8 m the target is sensed at 0.6 regardless of facing, still needing line of sight.

Awareness rises at `2.2 * visibility * modeMultiplier` per second while seen. After 0.8 s unseen it falls at 0.3 per second. Sightings update the last known position from awareness 0.15.

| Mode | Used in | Cone | Range | Fill multiplier |
|---|---|---|---|---|
| calm | IDLE, PATROL, SUSPICIOUS | 110° | 35 m | 1 |
| searching | SEARCH | 110° | 35 m | 2.5 |
| engaged | ALERT, COMBAT | 220° | 49 m | 4 |

Target stance scales range: crouching 0.6 times, sprinting 1.1 times.

Line of sight is cast every 0.2 s per enemy, chest first and then head, with phases spread across enemies by the golden ratio. The mid and far LOD widen this interval.

| Noise | Radius | Awareness set to |
|---|---|---|
| Walk | 4 m | at least 0.45 |
| Sprint | 14 m | at least 0.45 |
| Gunfire | 45 m | 1 |
| Crouched steps | none | |

Hearing tests distance only, so walls do not block it.

## Combat

`brainStateCombat.ts`.

**Positioning.** Reposition every 5 to 9 s, with a minimum gap of 1.5 s, or sooner when the target is under 5 m away, the enemy is flanked by more than 1.75 rad, or it has no cover and the target is beyond the band. It looks for a free cover node within 30 m, inside the 8 to 28 m distance band from the target, with line of sight (at most 6 checks). Cover nodes are claimed, one enemy each. With no cover it closes or backs off, and strafes at 1.5 m/s, flipping every 1.5 to 3 s.

**Firing.** A burst starts when the target is seen, yaw is within 0.25 rad, the enemy is not flinching, and fewer than 4 enemies are bursting at once. Firing on the move needs 0.6 s on target. Each shot re-tests line of sight from both eye and muzzle, chest then head, and a blocked shot ends the burst.

**Enemy shots are not rays.** Each shot rolls `computeHitChance`. A hit applies damage directly. A miss picks a point 0.5 to 1.3 m off target and traces through it, so impacts land in the world.

**Cover behaviour.** Crouches at cover between bursts and stands 0.35 s before the next one. Reloads early at 8 rounds or fewer while holding cover.

## Accuracy

`accuracy.ts`:

```
chance  = lerp(0.45, 0.10, (distance - 5) / 30)
chance *= lerp(1, 0.5, min(targetSpeed / 6, 1))
chance *= 0.8 if target crouching
chance *= lerp(0.3, 1, min(timeOnTarget / 1.6, 1))
chance *= 0.55 if shooter moving
clamp to 0.03 .. 0.6
```

## Tuning reference

| Group | Values |
|---|---|
| Health | 100 |
| Body | Height 1.8, radius 0.35, eye 1.65, crouch eye 1.15 |
| Hitbox radii | Head 0.135, torso 0.24, legs 0.2 |
| Speeds, m/s | Patrol 1.5, investigate 1.9, search 2.6, combat run 4.2, strafe 1.5 |
| Turn, rad/s | Calm 3.5, combat 6.5 |
| Idle | Look every 2 to 5 s, arc 0.9, 1.5 s before patrol |
| Patrol | Pause 1.5 to 4 s, arrive radius 0.6 |
| Suspicious | Threshold 0.35, stop 0.8 s, linger 2 to 3.5 s |
| Alert | Reaction 0.35 to 0.6 s, shot 0.12 s, ally radius 22 m, short range 8 m |
| Combat | Band 8 to 28 m, too close 5 m, reposition 5 to 9 s, gap 1.5 s, flank 1.75 rad, lost-sight 6 s, cover search 30 m, strafe flip 1.5 to 3 s, lead 0.15 s, aim tolerance 0.25 rad, move-fire delay 0.6 s, miss radius 0.5 to 1.3 m |
| Burst | 3 to 5 shots, 0.1 s apart, cooldown 1.2 to 2.4 s, peek lead 0.35 s, magazine 30, reload 2.6 s, low mag 8, damage 7, max simultaneous 4 |
| Accuracy | Near 5 m 0.45, far 35 m 0.1, moving target 0.5 at 6 m/s, crouch 0.8, first shot 0.3 settling over 1.6 s, shooter moving 0.55, clamp 0.03 to 0.6 |
| Search | 1 to 2 nodes within 14 m, linger 1.2 to 2.4 s, max 35 s, start awareness 0.6 |
| Flinch | 0.35 s, aim penalty 0.4 |
| LOD | Mid beyond 30 m: think 0.1 s, anim 0.05 s, LOS 0.3 s. Far beyond 70 m: think 0.3 s, anim 0.1 s, LOS 0.6 s |
| Separation | Enemy radius 0.9, player radius 0.9, push 2.5 m/s |

## Squad behaviour

`EnemyManager` implements `EnemySquad` and `IEnemyDirector`.

- **Ally alerts:** a caller reaches allies within 22 m, either within 8 m or with line of sight between them.
- **Noise:** shared through `weapon:fired` and `player:footstep`.
- **Far LOD** applies only to enemies not in ALERT or COMBAT.
- **Groups** spawn through `activateGroup`, idempotently and skipping defeated ids.
- **Doors:** `NavFollower` prefers routes avoiding closed doors, then falls back to opening them. Locked doors stay shut for the AI too.

## Rig

`EnemyRig` is a `TransformNode` hierarchy of instanced primitives, with legs and arms solved by two-bone IK in `rigMath.ts`. It covers walk, aim, crouch, reload, flinch and a 0.75 s death fall. Corpses stay in the world without colliders.
