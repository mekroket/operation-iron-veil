/**
 * Port Kessary ground, perimeter and backdrop. The site plan, in world metres (north = +Z, east = +X):
 *
 *   x -116..-90   West apron: breakwater head, service road, the truck queue. Sea to the south.
 *   x  -90..-64   Security checkpoint behind the perimeter fence. Waterline flank south of z = -24.
 *   x  -64..0     Container yard. Lanes: north z 11..24, central z -10..0, south (waterside) z -36..-21.
 *   x    0..60    Main warehouse, z -22..10. Service alley runs along its north side, z 10..24.
 *   x   60..84    Harbour office annex, z -10..10. South of it the east quay apron.
 *   x   84..108   East quay. Pier runs south from it at x 98..106 to z = -72.
 *   x -112..-106  South breakwater, running south from the quay to z = -92.
 *
 * The strip between the warehouse and the south quay edge is walled off at both ends, so the only ways east are
 * through the warehouse or along the service alley, and the only way onto the east quay is through the server room.
 */
import { JETTY_DECK, blocker, box, gap, ground, kerb, paint, trim, wall } from './build';
import type { BoxSolid } from '../types';

const PAINTED = 'concretePainted';

export const TERRAIN_SOLIDS: BoxSolid[] = [
  // Ground slabs. They do not overlap, so their top faces never z-fight.
  ground(-116, -36, 0, -24, 'quayStone'),
  ground(-116, -24, -64, -11, 'concreteDark'),
  ground(-116, -11, 0, 1, 'asphalt'),
  ground(-116, 1, -64, 26, 'concreteDark'),
  ground(-64, -24, 0, -11, 'concrete'),
  ground(-64, 1, 0, 26, 'concrete'),
  ground(0, -22, 60, 10, 'concrete'),
  ground(0, -36, 60, -22, 'quayStone'),
  ground(60, -36, 84, -10, 'concreteDark'),
  ground(60, -10, 84, 10, 'floorTile'),
  ground(0, 10, 84, 26, 'asphalt'),
  ground(84, -36, 108, 26, 'concreteDark'),
  ground(-112, -92, -106, -36, 'quayStone', JETTY_DECK),
  ground(98, -72, 106, -36, 'concreteDark'),

  // Invisible blockers: south quay edge, broken only at the breakwater and the pier.
  blocker(-117, -37, -112, -36),
  blocker(-106, -37, 98, -36),
  blocker(106, -37, 109, -36),
  // Map perimeter.
  blocker(-117, -36, -116, 27),
  blocker(108, -36, 109, 27),
  blocker(-116, 26, 108, 27),
  // Breakwater sides and tip.
  blocker(-113, -93, -112, -36, JETTY_DECK),
  blocker(-106, -93, -105, -36, JETTY_DECK),
  blocker(-112, -93, -106, -92, JETTY_DECK),
  // Pier sides and tip.
  blocker(97, -73, 98, -36),
  blocker(106, -73, 107, -36),
  blocker(98, -73, 106, -72),

  // Perimeter wall facing the town and the hills. The gate at x = 97 is where quay reinforcements come from.
  ...wall(-116, 24, 84, 24, 4, PAINTED, 0.4),
  ...wall(84, 24, 108, 24, 4, PAINTED, 0.4, [gap(97, 8, 4)]),
  ...wall(-116, -36, -116, 24, 4, PAINTED, 0.4),

  // Road markings: edge lines of the service road and central lane.
  paint(-116, -11, 0, -10.85, PAINTED),
  paint(-116, 0.85, 0, 1, PAINTED),
  paint(-88, -5.1, -66, -4.9, PAINTED),
  // Stop line in front of the boom gates.
  paint(-85.2, -11, -84.8, 1, PAINTED),
  // Waterside safety line along the south quay.
  paint(-106, -34.4, 0, -34.2, 'hazardStripe'),
  paint(60, -34.4, 98, -34.2, 'hazardStripe'),
  // Quay coping stone: a visual lip along the water, against the blocker.
  trim(-106, -36, 0, -35.7, 0, 0.18, 'concreteDark'),
  trim(60, -36, 98, -35.7, 0, 0.18, 'concreteDark'),
  trim(106, -36, 108, -35.7, 0, 0.18, 'concreteDark'),
  trim(107.7, -35.7, 108, 26, 0, 0.18, 'concreteDark'),
  // Kerbs along the roadway through the checkpoint and at the yard's edge.
  kerb(-116, -11.3, -91, -11),
  kerb(-116, 1, -91, 1.3),
  kerb(-64, -11.3, -60, -11),
  kerb(-64, 1, -60, 1.3),

  // Backdrop beyond the perimeter: dark sheds and silos against the sky. No collision, nobody gets here.
  box(-104, 30, -80, 44, 0, 9, 'corrugatedRust', false, true, false),
  box(-70, 34, -36, 52, 0, 14, 'corrugatedGrey', false, true, false),
  box(-22, 30, 10, 46, 0, 11, 'corrugatedRust', false, true, false),
  box(22, 34, 34, 46, 0, 22, 'concreteDark', false, true, false),
  box(38, 34, 50, 46, 0, 22, 'concreteDark', false, true, false),
  box(62, 30, 104, 48, 0, 12, 'corrugatedGrey', false, true, false),
  box(-134, -24, -122, 22, 0, 8, 'corrugatedGrey', false, true, false),
];
