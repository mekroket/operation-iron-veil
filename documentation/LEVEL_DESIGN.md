# Level Design: Silent Breakwater

Port Kessary is a linear site running west to east with parallel routes through each zone. It is pure data in `src/levels/silentBreakwater/`, consumed by gameplay, tests and rendering alike.

**World convention.** Metres, Y up, left-handed. North is +Z, East is +X, ground is y = 0. Yaw 0 faces +Z and positive yaw turns towards +X. Bounds are x -118..110, y -5..45, z -94..28. Sea level is -2.5.

## Zones

| # | Zone | Footprint | Notes | File |
|---|---|---|---|---|
| 1 | South breakwater | x -112..-106, z -92..-36, deck y -0.84 | Player starts at (-109, -0.84, -86) facing north. RHIB alongside. Low stone courses at z -72 and -48 teach stepping. A fallen pipe gantry at z -60 can be crouched under on the west or walked around east of x -108.4. Three steps up to the quay | `approach.ts` |
| 2 | Port entrance, west apron | x -116..-90 | Service road z -11..1, abandoned truck queue. Perimeter fence at x = -90 | `approach.ts` |
| 3 | Security checkpoint | x -90..-64 | Boom gates at x -82, booth, jersey chicane, sandbag line at about x -72 that faces the town | `approach.ts` |
| 4 | Container yard | x -64..0 | Lanes: north z 11..24, central z -10..0, south z -36..-21. Stack blocks at x -53.6, -35.9, -17.9. Cross alleys at x -47.5..-42 and -29.8..-24. Crane at (-35.75, -24). Forecourt before the warehouse | `yard.ts` |
| 5 | Main warehouse | x 0..60, z -22..10, roof 11 m | Roller door on the west face, z -9.5..-0.5. Racking blocks x 17..29 and 33..45, cross aisle x 29..33. Inspection platform in the south-east corner, top 2.24 m, stairs on its north face. Service alley outside, z 10..24 | `warehouse.ts` |
| 6 | Harbour office annex | x 60..84, z -10..10, ceiling 3 m | Main corridor along z = 0, side corridor along x = 65.25. Storage A, B, C and the harbour office | `annex.ts` |
| 7 | Server room | x 76.3..83.85, full annex depth | Terminal at (80, 0, -9.2). Two rows of racks. East door at z = 7 is the only way onto the quay | `annex.ts` |
| 8 | East quay | x 84..108, z -36..26 | Fight south from the door. North gate gap at x 97 in the perimeter wall. Apron and blast wall south of the annex, x 60..84, z -36..-10 | `quay.ts` |
| 9 | Extraction pier | x 98..106, z -72..-36 | RHIB at (107.6, -63). Extraction zone x 98..106, z -69..-59 | `quay.ts` |

## Routes

- **Checkpoint.** Main gate through the booms at z -11..1, or the fence hole at z -32..-28 behind the generator, then the thin waterline flank south of z = -24, rejoining through the south fence gap at x -72..-68.
- **Yard.** North, central or south lane, with two cross alleys. The central lane's long sightline is broken by barriers, crates, a short stack, a forklift and sandbags.
- **Warehouse.** Through the roller door and the central aisle, or round the service alley. The alley connects to the warehouse by the side door at x = 14, and to the annex by the service door at (65.25, 10).
- **Annex to quay.** One choke: main corridor, `door_server`, server room, then `door_quay`.

The strip between the warehouse and the south quay edge is walled at both ends by short walls and three-high container barricades at x 1.5 and 58.7. So the only ways east are the warehouse or the alley, and the only way onto the east quay is the server room.

## Encounter groups

35 contractors, 18 of them on patrol loops. Groups are woken one zone early and stand out of sight, so the player never watches them appear. `activateGroup` is idempotent, so overlap in `GROUP_ACTIONS` is harmless.

| Group | Count | Patrols | Location | Activated by | Alerted by |
|---|---|---|---|---|---|
| `checkpoint` | 5 | 2 | Sandbag line, booth, road | `enter_port` | |
| `yard_a` | 5 | 3 | Yard, west half | `checkpoint_near` | |
| `yard_b` | 4 | 2 | Yard, east half | `checkpoint_passed` | |
| `warehouse` | 6 | 3 | Aisles and platform top | `yard_mid` | Terminal start |
| `warehouse_reinforce` | 3 | 1 | Annex side | `warehouse_entry` | `warehouse_mid`, terminal start |
| `annex` | 5 | 3 | Corridors and server room | `warehouse_mid` | Terminal start |
| `quay` | 4 | 3 | Outside the quay door | Terminal start | |
| `quay_reinforce` | 3 | 1 | North gate, apron | `quay_entry` | `quay_mid` |

While the transfer runs, `warehouse_reinforce`, `warehouse` and `annex` are told the player's position again every 12 s if they have survivors.

## Triggers

Boxes from x and z corners, y -2..8. They are slices across the whole site, so no alternative route passes around one, and the warehouse pair also spans the service alley. Touching a zone implies the player passed all earlier ones in `TRIGGER_ORDER`: skipped zones wake their enemies silently and do not save.

| Trigger | x | z | Stage floor | Checkpoint |
|---|---|---|---|---|
| `enter_port` | -112..-106 | -38..-35 | `checkpoint` | |
| `checkpoint_near` | -96..-93 | -36..24 | `checkpoint` | |
| `checkpoint_passed` | -66..-63 | -36..24 | `yard` | `cp_checkpoint` |
| `yard_entry` | -61..-58 | -36..24 | `yard` | |
| `yard_mid` | -34..-30 | -36..24 | `yard` | |
| `warehouse_entry` | 0.5..4 | -22..24 | `warehouse` | `cp_warehouse` |
| `warehouse_mid` | 30..34 | -22..24 | `warehouse` | |
| `annex_entry` | 60.2..66.6 | -1.3..9.9 | `annex` | `cp_annex` |
| `server_room` | 76.3..83.85 | -9.85..9.85 | `objective` | |
| `quay_entry` | 84.3..87.5 | -10..24 | `exfil` | `cp_quay` |
| `quay_mid` | 84..108 | -12..-8 | `exfil` | |
| `extraction_near` | 98..106 | -42..-38 | `extract` | |
| `extraction` (zone) | 98..106 | -69..-59, y -1..4 | `extract` | |

Zones beyond the objective stay unfired until it is done, so they still count when the player returns.

## Checkpoints

All face east. A checkpoint stores stage, health, weapons, defeated enemies, collected pickups, open doors, fired triggers and stats.

| Id | Position |
|---|---|
| `cp_checkpoint` | (-64.5, 0, -9) |
| `cp_warehouse` | (2.5, 0, -5) |
| `cp_annex` | (62.5, 0, 0) |
| `cp_quay` | (85.8, 0, 7) |

Rules: saved health is never below 50%, to avoid a death loop. No checkpoint is saved during the transfer, because restoring one would lose its radio beats. On restore, fired ids re-apply silently, so enemy groups wake but are not re-alerted and radio does not replay.

## Doors

Personnel doors are 1.6 x 2.4 m and slide along their wall. They block movement, bullets and vision while closed. All start closed except `door_office`.

| Id | Label | Position (x, z) |
|---|---|---|
| `door_side` | Service door | 14, 10 |
| `door_annex_west` | Annex | 60, 0 |
| `door_annex_north` | Annex service door | 65.25, 10 |
| `door_storage_a` | Storage A | 63.85, 5.5 |
| `door_storage_b` | Storage B | 72, 1.4 |
| `door_office` | Harbour office, starts open | 65.25, -1.4 |
| `door_storage_c` | Storage C | 72, -1.4 |
| `door_server` | Server room | 76.15, 0 |
| `door_quay` | East quay, locked until the blast | 84, 7 |

`findEastExitDoor` locates the locked door by matching ids and labels against `east exit`, then `quay`. Renaming `door_quay` needs care.

## Pickups

16 in total: 9 ammunition and 7 medkits, placed at the start, around each zone transition, and around the objective.

| Area | Ammunition | Medkit |
|---|---|---|
| Before checkpoint | `ammo_apron` | `med_apron` |
| After checkpoint | `ammo_booth` | `med_strip` |
| Yard, forecourt | `ammo_lane`, `ammo_forecourt` | `med_forecourt` |
| Warehouse | `ammo_bay`, `ammo_aisle` | `med_mid`, `med_platform` |
| Annex, server room | `ammo_storage`, `ammo_server` | `med_office` |
| Quay | `ammo_quay` | `med_quay` |

## Scripted set piece

Hold E 3 s on the terminal to start the 45 s transfer. On completion `MissionWorld.detonate` shows blast damage at (60.4, 2.5, -16), emits `fx:explosion` with radius 9, then unlocks and opens `door_quay`. The blast does no gameplay damage; it only shakes the view.

## Cinematics

Camera keys in `cinematics.ts`. Menu: a 60 s loop orbiting the yard with the crane in frame. Intro: 14 s from the sea up the breakwater, ending exactly at the player's eye. Extraction: 10 s from the pier to the boat, pulling away with the port behind.

## Authoring rules

- Use the helpers in `build.ts` (`wall`, `gap`, `stairsZ`, `stack`, `fence`, `trigger`, `door`) so openings and stairs are computed from corners, not typed by hand.
- Stairs: 0.28 m rise, 0.5 m run, since the player climbs about 0.3 m. Container interval is 2.59 m. Rows sit 2.7 m apart, so the 0.26 m cracks stay too narrow for the 0.7 m capsule.
- Non-colliding detail uses `trim`, `paint` and `kerb`, so kerbs never snag the capsule.
- Ground slabs must not overlap, because their top faces would z-fight.
- Mark large walls and roofs `castShadow` deliberately.
- New script-critical triggers go in `REQUIRED_TRIGGERS` (`levelGeometry.ts`), `TRIGGER_FLOORS` and `TRIGGER_ORDER`.
- `validateLevel` in `levelGeometry.ts` and `tests/level.test.ts` check the level and that no required trigger can be bypassed on the nav graph.
- Nav nodes are in `navWest.ts` and `navEast.ts`. Cover nodes use `coverNode` with a `coverYaw`. Door links must be listed in the door's `navLinks`.
