# Game Design Document

OPERATION: IRON VEIL is a single-player browser FPS. Version 0.1 contains one mission, SILENT BREAKWATER. Everything in it is fictional: characters, organisations, places and weapons.

Sources: `src/missions/canon.ts`, `src/missions/silentBreakwaterScript.ts`, `src/missions/MissionStateMachine.ts`, `src/levels/silentBreakwater/`.

## Player fantasy

You are one operator, alone on foot, inside a port an armed contractor has held for nine days. You arrive believing this is an arms investigation. By the end you are holding proof of something far worse, and the person on the radio tells you not to share it with anyone.

## Design pillars

- **Quiet first, loud later.** Enemies notice gradually through an awareness meter. Crouching is silent, walking carries 4 m, sprinting 14 m, gunfire 45 m. The script then forces the fight open, so stealth buys position and ammunition and does not replace combat.
- **Grounded gunplay.** Hitscan weapons with falloff, a shot-by-shot recoil pattern, hit zones and a crosshair that shows the true spread. No stamina meter.
- **The world tells the story.** Welded vents, cots on pallets, a coat on a chair. Radio confirms what the player has already walked past.
- **Runs in a tab.** No install. Every model, texture and sound is generated at load by code.

## Story canon

| Item | Canon |
|---|---|
| Mission | 01, SILENT BREAKWATER, id `silent-breakwater` |
| Location | Port Kessary, Sundrik Coast |
| Time | 04:42 local, overcast |
| Operator | Sgt. Mara "Wren" Calloway, Task Unit Halcyon |
| Handler | Overwatch (Lt. Cmdr. Idris Vane) |
| Opposition | Black Meridian, a private military contractor holding the port |
| Studio line | A browser-native campaign |

**Setup (`MISSION_01.summary`).** Black Meridian seized Port Kessary nine days ago. Ships dock and leave lighter, and nobody on the coast will say why. A source inside the harbour authority died getting one word out: VEIL.

**Tasking.** Land on the south breakwater and enter on foot. Pass the security checkpoint and cross the container yard. Enter the main warehouse and reach the harbour office annex. Copy the Veil manifest from the data terminal. Reach the east quay for extraction.

**Rules of engagement.** Stay quiet for as long as you can. Once they know you are there, the whole port will come looking.

**What the player learns, in order (`RADIO_BEATS`).**

1. Inside the fence, the working theory is arms: ships come in heavy and leave light.
2. In the yard, Wren spots vents cut into container roofs with fresh welds. Overwatch still reads this as munitions.
3. In the warehouse, cots on pallets and water drums, more than forty guards need.
4. In the annex, the source's floor, a coat left on a chair.
5. During the 45 second copy, the manifest arrives: names, ages and home districts, six thousand and change across eleven ships, with no customs record. "It was never arms."
6. The payment ledger shows Black Meridian billing one client: the Sundrik Interior Ministry, the government that asked for Task Unit Halcyon.
7. A detonation at the warehouse wall cuts off the way back and kills the door locks, so the quay door opens.
8. Aboard the boat, Wren starts uploading to Task Unit. Vane orders the upload cancelled, with no log entry and nothing to the boat crew. "Nobody but me, Wren. You put it in my hand." The mission ends on that line.

**Environmental beats in level data.** The sandbag line faces west, at the town, not at the sea. Block B south of the yard is one dirty-white container type stacked four rows deep, the Veil boxes, and the same white box sits cut open in the annex storage rooms. A hand-inspection queue and an abandoned desk stand at the warehouse platform. The east quay is laid out for a ship that has not arrived.

## Mission structure by stage

Stages run in the fixed order in `STAGE_IDS`. Progress only moves forward. A trigger names the earliest stage the player must be in, so a missed trigger is healed by the next one. `objective` and `extract` are gated: they can be entered by a trigger but left only by their own signal.

The HUD shows the stage as a step counter out of 11.

| # | Stage | Objective text | Marker target | Advances on | Enemy groups woken |
|---|---|---|---|---|---|
| 1 | `briefing` | Stand by for insertion | none | 3 s timer | none |
| 2 | `insertion` | Move along the south breakwater | `enter_port` | 12 s timer, or `enter_port` | none |
| 3 | `infiltrate` | Reach the port | `enter_port` | `enter_port` | `checkpoint` on `enter_port` |
| 4 | `checkpoint` | Get past the security checkpoint | `checkpoint_passed` | `checkpoint_passed` | `yard_a` on `checkpoint_near` |
| 5 | `yard` | Cross the container yard | `warehouse_entry` | `warehouse_entry` | `yard_b` on `checkpoint_passed`, `warehouse` on `yard_mid` |
| 6 | `warehouse` | Fight through the main warehouse | `annex_entry` | `annex_entry` | `warehouse_reinforce` on `warehouse_entry`, alerted on `warehouse_mid`, which also wakes `annex` |
| 7 | `annex` | Find the harbour office | `server_room` | `server_room` | none new |
| 8 | `objective` | Copy the Veil manifest, then Hold out until the transfer completes | terminal | Hold E 3 s, then 45 s transfer | Terminal start wakes `quay` and alerts `warehouse_reinforce`, `warehouse`, `annex`, re-alerted every 12 s while they have survivors |
| 9 | `exfil` | Fight along the east quay | extraction | `extraction_near` or the extraction zone | `quay_reinforce` on `quay_entry`, alerted on `quay_mid` |
| 10 | `extract` | Board the boat | extraction | Hold E 1.5 s inside the zone | none |
| 11 | `complete` | Mission complete | none | Closing radio ends, or 30 s timeout | none |

The insertion cinematic (14 s) runs while stages 1 and 2 tick, and radio captions stay on screen during it. Boarding plays a 10 s extraction cinematic over the closing radio. Both can be skipped with Space, Enter or the skip button.

## Scoring

`computeScore` in `MissionStateMachine.ts` gives 0 to 100 points.

| Part | Max | Rule |
|---|---|---|
| Survival | 30 | Minus 10 per death, floor 0 |
| Accuracy | 30 | Hits / shots, full marks at 50% |
| Time | 25 | Full at 720 s or faster, linear to 0 at 1800 s |
| Precision | 15 | Headshot kills / all kills, full marks at 40% |

Grades: S from 85, A from 70, B from 50, otherwise C. The stats freeze when the player boards. The results screen shows time, enemies defeated out of 35, headshots, accuracy, deaths and checkpoints. Best grade and completion persist in `localStorage`.

## Failure and retry

Death plays a fall, then after 2.2 s the KIA screen offers Restart Checkpoint, Restart Mission or Main Menu. Each attempt builds a new `GameSession`, so no state leaks. Dying increments the death count in the stored checkpoint, so retrying cannot erase it. See `LEVEL_DESIGN.md` for checkpoints.

## Out of scope in v0.1

Stamina (excluded by design, see `UIManager`), multiplayer, key rebinding, gamepad or touch input, recorded voice (radio is captions over synthesised squelch, static and babble), weapon pickups, fall damage, other missions.
