/**
 * Zones 6 and 7: the harbour office annex, x 60..84, z -10..10, with 3m ceilings, and the server room in it.
 *
 *   Main corridor along z = 0, clear z -1.25..1.25, from the warehouse door at x = 60 to the server door at x = 76.15.
 *   Side corridor along x = 65.25, clear x 64..66.5, from the main corridor to the service alley door at z = 10.
 *   Storage A west of the side corridor, storage B east of it. South of the main corridor: the harbour office and
 *   storage C, joined by a doorless opening at z = -6.
 *   Server room x 76.3..83.85 over the full depth. Its east door at z = 7 is the only way onto the east quay.
 *
 * Story beat: both storage rooms hold the same white 20-foot box as yard block B, cut open and searched. The office
 * desks stand cleared. Hazard barrels are lined up to go.
 */
import { EAST, NORTH, box, gap, light, paint, prop, row, shortStack, trim, wall } from './build';
import type { BoxSolid, LightDef, PropPlacement } from '../types';

const OUTER = 4;
const INNER = 3;
const DOOR_W = 1.6;
const DOOR_H = 2.4;

export const ANNEX_SOLIDS: BoxSolid[] = [
  // Outer shell. The warehouse east wall is the annex's west wall.
  ...wall(60, 10, 84.15, 10, OUTER, 'corrugatedWhite', 0.3, [gap(65.25, DOOR_W, DOOR_H)]),
  ...wall(84, -10.15, 84, 10.15, OUTER, 'corrugatedWhite', 0.3, [gap(7, DOOR_W, DOOR_H)]),
  ...wall(60, -10, 84.15, -10, OUTER, 'corrugatedWhite', 0.3),
  // Closes the east end of the service alley against the town wall.
  ...wall(84, 10.15, 84, 24, OUTER, 'concretePainted', 0.4),
  // Ceiling and roof.
  box(60.2, -9.85, 83.85, 9.85, INNER, INNER + 0.1, 'plasterInterior', true, true, false),
  box(60, -10.15, 84.15, 10.15, INNER + 0.1, INNER + 0.4, 'corrugatedGrey', true, true, true),

  // Main corridor walls, with the side corridor mouth and the room doors.
  ...wall(60.2, 1.4, 76.15, 1.4, INNER, 'plasterInterior', 0.3, [gap(65.25, 2.5, INNER), gap(72, DOOR_W, DOOR_H)], false),
  ...wall(60.2, -1.4, 76.15, -1.4, INNER, 'plasterInterior', 0.3, [gap(65.25, DOOR_W, DOOR_H), gap(72, DOOR_W, DOOR_H)], false),
  // Side corridor walls.
  ...wall(63.85, 1.4, 63.85, 9.85, INNER, 'plasterInterior', 0.3, [gap(5.5, DOOR_W, DOOR_H)], false),
  ...wall(66.65, 1.4, 66.65, 9.85, INNER, 'plasterInterior', 0.3, [], false),
  // Wall between the office and storage C, with the doorless opening.
  ...wall(68.15, -9.85, 68.15, -1.4, INNER, 'plasterInterior', 0.3, [gap(-6, DOOR_W, DOOR_H)], false),
  // Server room wall.
  ...wall(76.15, -9.85, 76.15, 9.85, INNER, 'plasterInterior', 0.3, [gap(0, DOOR_W, DOOR_H)], false),

  // Floor marks, cable runs. No collision.
  paint(60.2, -0.15, 76, 0.15, 'floorRubber'),
  paint(76.3, -9.85, 76.6, 9.85, 'hazardStripe'),
  trim(60.2, -1.25, 76, -1.1, 2.6, 2.8, 'steelDark'),
  trim(64.05, 1.4, 64.2, 9.85, 2.6, 2.8, 'steelDark'),
  trim(83.6, -9.85, 83.85, 9.85, 2.4, 2.8, 'steelDark'),
];

export const ANNEX_PROPS: PropPlacement[] = [
  // Storage A: stacked crates, one desk, a pile set aside.
  ...row('crate', 61, 2.4, 61, 3.7, 2, NORTH, 0),
  ...row('crate', 61, 2.4, 61, 3.7, 2, NORTH, 0, 1.1),
  ...row('crate', 61, 7.6, 61, 8.9, 2, NORTH, 0),
  prop('desk', 62.85, 9.2, NORTH),

  // Storage B: the same white box, opened up, its contents moved into identical crates.
  ...shortStack(74.4, 5.8, NORTH, 1, 3),
  ...row('crate', 68, 3, 68, 8.2, 5, NORTH, 1),
  ...row('crate', 68, 3, 68, 8.2, 5, NORTH, 1, 1.1),
  prop('desk', 71, 9.2, NORTH),
  prop('crate', 71.2, 7.4, 0.2, 1),

  // Harbour office: desks cleared in a hurry, and the door to the back room left open.
  prop('desk', 62, -8.8, NORTH),
  prop('desk', 66, -8.8, NORTH),
  prop('desk', 61.6, -3.2, EAST),
  prop('palletStack', 67, -3.2, 0),
  prop('barrel', 60.9, -6.2, NORTH, 1),

  // Storage C: white box, hazard barrels lined up, a crate wall.
  ...shortStack(74.6, -5.8, NORTH, 1, 3),
  ...row('barrel', 69.2, -9, 72, -9, 4, NORTH, 2),
  ...row('crate', 69.2, -3, 69.2, -3, 1, NORTH, 1),
  prop('crate', 70.6, -3.1, 0.1, 0),

  // Server room: two rows of racks, north and south aisles clear, the terminal against the south wall.
  ...row('serverRack', 79.6, -4.5, 79.6, 3.2, 8),
  ...row('serverRack', 81.9, -4.5, 81.9, 3.2, 8),
  prop('dataTerminal', 80, -9.2, NORTH),
  prop('desk', 82.8, -8.8, NORTH),
  prop('crate', 77.4, 9, 0.1, 0),
  prop('warningSign', 76.45, 3, EAST),
];

export const ANNEX_LIGHTS: LightDef[] = [
  light('emergency', 68, 2.8, 0, 12, 0.8),
  light('fluorescent', 71, 2.85, 5.5, 8, 0.6, true, true),
  light('emergency', 80, 2.8, -7, 12, 1.0),
  light('emergency', 80, 2.8, 7, 10, 0.8),
];
