/**
 * Zones 8 and 9: the east quay and the extraction pier. The player steps out of the server room's east door at z = 7
 * and fights south, past the pipe bundles and trucks, to the pier running south from z = -36.
 *
 * Story beat: the quay is laid out for a ship that has not arrived. Pipe bundles are staged by the bollards, cable is
 * spooled out, and a truck stands ready at the head of the pier.
 */
import { EAST, NORTH, SOUTH, box, light, paint, prop, row, shortStack, sodium, wall } from './build';
import type { BoxSolid, LightDef, PropPlacement } from '../types';

export const QUAY_SOLIDS: BoxSolid[] = [
  // Bars the strip between the warehouse and the south quay edge at its east end.
  ...wall(58.7, -36, 58.7, -34, 3, 'steelRust', 0.3),
  // Bars it at the west end, against the forecourt.
  ...wall(1.5, -36, 1.5, -34, 3, 'steelRust', 0.3),

  // Pier deck: planks down the centre and hazard lines at both edges.
  box(100.5, -72, 103.5, -36, 0, 0.01, 'woodPlank', false),
  paint(98.2, -72, 98.4, -36),
  paint(105.6, -72, 105.8, -36),
  // Pipe racks along the annex east wall, no collision.
  box(84.15, -10, 84.35, 6, 2.2, 2.4, 'steelRust', false),
  box(84.15, -10, 84.35, 6, 2.7, 2.9, 'steelDark', false),
  // Marks the blast charge on the warehouse's exposed east wall.
  paint(60.2, -20, 62, -12),
];

export const QUAY_PROPS: PropPlacement[] = [
  // The two container barricades closing the south strip. Three high, nobody is climbing that.
  prop('container', 1.5, -28, NORTH, 1),
  prop('container', 1.5, -28, NORTH, 1, 2.59),
  prop('container', 1.5, -28, NORTH, 1, 5.18),
  prop('container', 58.7, -28, NORTH, 0),
  prop('container', 58.7, -28, NORTH, 0, 2.59),
  prop('container', 58.7, -28, NORTH, 0, 5.18),

  // North quay, right outside the door.
  prop('pipeBundle', 91, 5, NORTH),
  prop('generator', 88, 14, EAST),
  prop('cableSpool', 93.5, 13.5, 0.3),
  prop('cableSpool', 95.2, 13, 0.1),
  prop('truck', 99, 12, NORTH),
  prop('crate', 99, 10.5, 0.1, 0, 1.6),
  prop('crate', 99, 9.1, 0, 0, 1.6),
  prop('pipeBundle', 103.6, 2, NORTH),
  prop('sandbags', 97, 21, NORTH),
  prop('jerseyBarrier', 91.5, 21.5, NORTH),
  prop('jerseyBarrier', 102.5, 21.5, NORTH),

  // Middle of the quay: the crossing between the door and the pier.
  prop('generator', 95, -3, NORTH),
  prop('crate', 92.5, -3, 0.2, 1),
  ...shortStack(89, -6, EAST, 1, 2),
  prop('truck', 99, -10, EAST),
  prop('crate', 97.6, -10, 0, 0, 1.6),
  prop('cableSpool', 107, -4, 0.2),

  // South quay.
  prop('pipeBundle', 90, -17, EAST),
  prop('cableSpool', 100, -18, 0.4),
  prop('cableSpool', 98.4, -18.6, 0.1),
  prop('forklift', 94.5, -26, EAST),
  prop('palletStack', 92, -26.4, 0),
  prop('crateLarge', 103.5, -27, 0.2),
  prop('jerseyBarrier', 87, -29.5, NORTH),
  ...row('mooringCleat', 84, -35.3, 96, -35.3, 3),

  // Apron south of the annex: pipes and a short stack. Blast wall to the west.
  prop('pipeBundle', 72, -16, EAST),
  prop('generator', 65.5, -27, NORTH),
  ...shortStack(78, -28, NORTH, 2, 3),
  prop('crate', 69.5, -30.5, 0.2, 0),
  prop('barrel', 63, -13, NORTH, 2),
  prop('barrel', 63.8, -12.2, NORTH, 2),
  prop('warningSign', 60.3, -14, EAST),

  // Pier and the boat.
  ...row('mooringCleat', 105.5, -40, 105.5, -68, 4),
  ...row('tyreStack', 98.5, -44, 98.5, -68, 3),
  prop('rhib', 107.6, -63, SOUTH, undefined, -2.5),
  prop('bollard', 100, -36.6),
  prop('bollard', 104, -36.6),

  // Lamps.
  prop('lampPost', 87, 20, NORTH),
  prop('lampPost', 106.8, -12, NORTH),
  prop('lampPost', 74, -21, NORTH),
  prop('lampPost', 99, -50, NORTH),
];

export const QUAY_LIGHTS: LightDef[] = [
  sodium(87, 20),
  sodium(106.8, -12),
  sodium(74, -21),
  sodium(99, -50),
  light('warning', 62, 3, -14, 10, 0.9),
  light('warning', 104.5, 2.4, -68, 10, 0.9),
];
