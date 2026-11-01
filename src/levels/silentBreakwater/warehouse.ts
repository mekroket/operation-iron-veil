/**
 * Zone 5: the main warehouse, x 0..60, z -22..10, 11m to the roof. Roller door on the west face at z -9.5..-0.5, the
 * personnel door on the north wall at x = 14, the annex door on the east wall at z = 0.
 *
 * Plan: open receiving bay to x = 16, then racking in two blocks, x 17..29 and x 33..45, on both sides of a 14m wide
 * central aisle. A cross aisle runs at x 29..33. The inspection platform fills the south-east corner, overlooking
 * everything, and is reached by the stairs on its north face.
 *
 * Story beat: a pallet of crates sits at the foot of the platform with a desk above it. Someone was checking what came
 * off each ship by hand, and left in a hurry.
 */
import { EAST, NORTH, PLATFORM_TOP, box, gap, light, paint, prop, row, shortStack, sodium, stairsZ, trim, wall } from './build';
import type { BoxSolid, LightDef, PropPlacement } from '../types';

const CEILING = 11;

export const WAREHOUSE_SOLIDS: BoxSolid[] = [
  // Shell. Walls are 0.4m thick, centred on the footprint lines; corners overlap so no crack opens.
  ...wall(0, -22.2, 0, 10.2, CEILING, 'corrugatedGrey', 0.4, [gap(-5, 9, 6)]),
  ...wall(0, 10, 60, 10, CEILING, 'corrugatedGrey', 0.4, [gap(14, 1.6, 2.4)]),
  ...wall(0, -22, 60, -22, CEILING, 'corrugatedGrey', 0.4),
  ...wall(60, -22.2, 60, 10.2, CEILING, 'corrugatedGrey', 0.4, [gap(0, 1.6, 2.4)]),
  box(-0.2, -22.2, 60.2, 10.2, CEILING, CEILING + 0.3, 'corrugatedGrey', true, true, true),

  // Roller door, rolled most of the way up, and its frame.
  trim(-0.3, -9.5, 0.3, -0.5, 5.2, 6, 'corrugatedRust'),
  trim(-0.35, -9.9, 0.35, -9.5, 0, 6.2, 'steelYellow'),
  trim(-0.35, -0.5, 0.35, -0.1, 0, 6.2, 'steelYellow'),
  paint(0.3, -9.5, 2, -0.5, 'hazardStripe'),

  // Loading dock edge along the inside of the south wall, and a raised curb in the receiving bay.
  trim(0.2, -21.8, 16, -21.3, 0, 0.3, 'steelDark'),

  // Inspection platform: a solid block, so nothing can walk under it.
  box(48, -21.8, 59.8, -13.6, 0, PLATFORM_TOP, 'steelDark', true, true, true),
  ...stairsZ(50, 53, -9.6, -1, 8, 0, 'steelYellow'),
  // Handrails on top of the platform, leaving the head of the stairs free.
  box(48, -13.65, 50, -13.55, PLATFORM_TOP, PLATFORM_TOP + 1, 'steelYellow'),
  box(53, -13.65, 59.8, -13.55, PLATFORM_TOP, PLATFORM_TOP + 1, 'steelYellow'),
  box(47.95, -21.8, 48.05, -13.6, PLATFORM_TOP, PLATFORM_TOP + 1, 'steelYellow'),
  paint(50, -9.4, 53, -9, 'hazardStripe'),

  // Floor markings: the pedestrian walk down the central aisle, and rack aisle ends.
  paint(4, -8.6, 57, -8.4, 'steelYellow'),
  paint(4, 1.4, 57, 1.6, 'steelYellow'),
  paint(29, -11.8, 29.2, 2.4, 'steelYellow'),
  paint(32.8, -11.8, 33, 2.4, 'steelYellow'),

  // Service pipes along the walls and a cable tray over the central aisle. No collision.
  trim(0.2, 9.5, 59.8, 9.7, 7, 7.25, 'steelRust'),
  trim(0.2, 9.5, 59.8, 9.7, 7.5, 7.75, 'steelDark'),
  trim(0.2, -21.7, 59.8, -21.5, 7, 7.25, 'steelRust'),
  trim(58, -4.2, 2, -3.8, 8.5, 8.6, 'steelDark'),
];

export const WAREHOUSE_PROPS: PropPlacement[] = [
  // Racking, 8 bays per row. North rows z 7 and 3, south rows z -12.4 and -16.4.
  ...row('shelfRack', 18.5, 7, 27.5, 7, 4),
  ...row('shelfRack', 34.5, 7, 43.5, 7, 4),
  ...row('shelfRack', 18.5, 3, 27.5, 3, 4),
  ...row('shelfRack', 34.5, 3, 43.5, 3, 4),
  ...row('shelfRack', 18.5, -12.4, 27.5, -12.4, 4),
  ...row('shelfRack', 34.5, -12.4, 43.5, -12.4, 4),
  ...row('shelfRack', 18.5, -16.4, 27.5, -16.4, 4),
  ...row('shelfRack', 34.5, -16.4, 43.5, -16.4, 4),

  // Receiving bay: a truck reversed in, open with crates half moved, and low cover both sides of the roller door.
  prop('truck', 6, -17, EAST),
  prop('crate', 5, -17, 0.1, 0, 1.6),
  prop('crate', 3.6, -17, -0.1, 0, 1.6),
  ...row('pallet', 10, -11, 13, -11, 2, 0),
  prop('crate', 10, -11, 0.1, 0, 0.15),
  prop('crate', 13, -11, 0, 0, 0.15),
  prop('forklift', 7.5, -12, 0.2),
  prop('crate', 6, -2.5, 0.2, 1),
  prop('crate', 7.3, -2.2, 0, 0),
  prop('crate', 6.6, -2.4, 0.1, 1, 1.1),
  prop('palletStack', 11, -7, 0.1),
  prop('palletStack', 12.2, -7.2, 0),
  prop('crateLarge', 10, 4, 0.2),
  prop('crate', 4, 7.5, 0.3, 0),
  prop('barrel', 2, 7, NORTH, 0),
  prop('barrel', 2.9, 8, NORTH, 0),

  // Central aisle: islands of cover, offset so no line runs clean down the aisle.
  prop('crateLarge', 20, -1, 0.1),
  prop('crate', 21.6, -1.4, 0, 1),
  prop('palletStack', 25.5, -9, 0.2),
  prop('palletStack', 26.8, -9.2, 0),
  prop('forklift', 24, 1, EAST),
  prop('crate', 37, -3, 0.1, 0),
  prop('crate', 38.3, -3, 0, 0),
  prop('crate', 37.6, -3, 0.1, 1, 1.1),
  prop('crateLarge', 43, -9, 0.3),
  prop('palletStack', 47.5, -1, 0.1),
  prop('pipeBundle', 53, -4, EAST),

  // Platform foot: the inspection queue. On top: the inspector's desk, and crates for cover.
  ...row('pallet', 47.5, -11.4, 47.5, -8, 2),
  prop('crate', 47.5, -11.4, 0, 0, 0.15),
  prop('warningSign', 53.4, -9.4, EAST),
  prop('desk', 55.5, -19.5, NORTH, undefined, PLATFORM_TOP),
  prop('crate', 50, -19.8, 0.2, 0, PLATFORM_TOP),
  prop('crate', 55, -15, 0.1, 1, PLATFORM_TOP),
  prop('crate', 56.4, -15, 0, 1, PLATFORM_TOP),
  prop('barrel', 58.6, -20.6, NORTH, 2, PLATFORM_TOP),

  // Service alley along the north wall, x 0..84, z 10..24: the quiet way round, with a truck, pallets and a generator.
  prop('generator', 7, 21.5, NORTH),
  prop('palletStack', 18.6, 11.5, 0.2),
  prop('palletStack', 19.8, 11.7, 0),
  prop('truck', 30, 14.6, EAST),
  prop('crate', 28.4, 14.6, 0.1, 1, 1.6),
  ...shortStack(44, 21.6, EAST, 2, 0),
  prop('jerseyBarrier', 52, 13.5, EAST),
  prop('forklift', 56.5, 20.5, 0.2),
  prop('crate', 61.5, 21.4, 0.2, 0),
  prop('crate', 62.8, 21.4, 0, 0),
  prop('barrel', 72, 12, NORTH, 1),
  prop('barrel', 72.8, 11.6, NORTH, 1),
  prop('cableSpool', 79, 20, 0.2),
  prop('warningSign', 14.9, 10.3, NORTH),
  prop('lampPost', 22, 22.8, NORTH),
  prop('lampPost', 66, 22.8, NORTH),
];

export const WAREHOUSE_LIGHTS: LightDef[] = [
  light('fluorescent', 8, 9.5, 2, 20, 1.0, true),
  light('fluorescent', 8, 9.5, -14, 20, 0.9, true, true),
  light('fluorescent', 28, 9.5, 2, 20, 1.0, true),
  light('fluorescent', 28, 9.5, -14, 20, 0.8, true),
  light('fluorescent', 42, 9.5, 2, 20, 0.7, true, true),
  light('warning', 52, 3.2, -11.5, 10, 0.7),
  // Service alley.
  sodium(22, 22.8),
  sodium(66, 22.8),
];
