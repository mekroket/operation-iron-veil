/**
 * Zones 1 to 3, walking order: the south breakwater, the port entrance and the security checkpoint.
 *
 * Story beat: the sandbag line sits behind the boom gates and looks west, at the town. Black Meridian dug in against
 * the people of Port Kessary, not against an attacker from the sea, which is why the waterline flank is so thin.
 */
import {
  EAST,
  JETTY_DECK,
  NORTH,
  WEST,
  box,
  fence,
  light,
  paint,
  prop,
  row,
  sodium,
  stack,
  stairsZ,
  trim,
} from './build';
import type { BoxSolid, LightDef, PropPlacement } from '../types';

export const APPROACH_SOLIDS: BoxSolid[] = [
  // Steps from the breakwater deck up to the quay: three steps, flush with the quay at z = -36.
  ...stairsZ(-112, -106, -37.5, 1, 3, JETTY_DECK, 'concreteDark'),
  // Two low stone courses across the deck: stepping practice.
  box(-112, -72.3, -106, -71.7, JETTY_DECK, JETTY_DECK + 0.28, 'quayStone'),
  box(-112, -48.3, -106, -47.7, JETTY_DECK, JETTY_DECK + 0.28, 'quayStone'),
  // Fallen pipe gantry: crouch under on the west side, or walk around it to the east of x = -108.4.
  box(-112, -60.2, -108.4, -59.8, JETTY_DECK + 1.25, JETTY_DECK + 1.55, 'steelRust'),
  box(-111.9, -60.1, -111.7, -59.9, JETTY_DECK, JETTY_DECK + 1.25, 'steelRust'),
  box(-108.7, -60.1, -108.5, -59.9, JETTY_DECK, JETTY_DECK + 1.25, 'steelRust'),
  paint(-112, -38.1, -106, -37.9, 'hazardStripe', JETTY_DECK),

  // Gate piers, and the sign gantry over the main gate.
  box(-90.4, -12, -89.6, -11, 0, 3.6, 'concreteDark', true, true, true),
  box(-90.4, 1, -89.6, 2, 0, 3.6, 'concreteDark', true, true, true),
  box(-90.4, 22, -89.6, 24, 0, 3.6, 'concreteDark', true, true, true),
  trim(-90.2, -11, -89.8, 1, 6, 6.8, 'steelYellow'),
  trim(-90.15, -11.8, -89.85, -11.2, 3.6, 6, 'steelDark'),
  trim(-90.15, 1.2, -89.85, 1.8, 3.6, 6, 'steelDark'),
  // Short fence stub closing the corner between the perimeter fence and the south fence line.
  box(-90, -24.06, -88, -23.94, 0, 3, 'steelDark'),
  // Boom gate painted stop bars and the kerbed booth island.
  paint(-82.3, -11, -81.7, 1, 'hazardStripe'),
  box(-82.5, -16.5, -75.5, -11.5, 0, 0.1, 'concreteDark', false),
];

export const APPROACH_PROPS: PropPlacement[] = [
  // Breakwater. The RHIB that brought the player in, tied up alongside.
  prop('rhib', -113.6, -84, NORTH, undefined, -2.5),
  ...row('mooringCleat', -111.6, -88, -111.6, -64, 3, NORTH, undefined, JETTY_DECK),
  ...row('mooringCleat', -106.4, -80, -106.4, -44, 4, NORTH, undefined, JETTY_DECK),
  ...row('tyreStack', -111.5, -80, -111.5, -66, 2, NORTH, undefined, JETTY_DECK),
  prop('crate', -111, -54, 0.2, 0, JETTY_DECK),
  prop('barrel', -110, -52.5, NORTH, 1, JETTY_DECK),
  prop('barrel', -111.3, -52.2, NORTH, 1, JETTY_DECK),
  prop('lampPost', -111.6, -42, NORTH, undefined, JETTY_DECK),
  prop('warningSign', -110.5, -62, NORTH, undefined, JETTY_DECK),

  // Top of the stairs: first look at the fence.
  prop('mooringCleat', -113, -34.6, NORTH),
  prop('tyreStack', -104, -35, NORTH),
  prop('tyreStack', -103.1, -35, NORTH),
  prop('palletStack', -114, -28, 0.3),
  prop('pallet', -112.5, -26, 0.1),
  prop('crate', -113.5, -24.5, 0.4, 1),

  // Service road: two trucks stuck in line for a gate nobody is working any more.
  prop('truck', -99, -8, EAST),
  prop('crate', -100.4, -8, 0.1, 0, 1.6),
  prop('crate', -99, -8, -0.1, 0, 1.6),
  prop('crate', -101.8, -8, 0, 0, 1.6),
  prop('truck', -111, -8, EAST),
  prop('crateLarge', -112, -8, 0, undefined, 1.6),
  ...row('bollard', -94, -13, -94, 3, 3),
  prop('lampPost', -104, -20, NORTH),
  prop('jerseyBarrier', -101, 3.5, NORTH),

  // North side of the apron: a storage row against the town wall.
  ...stack(-104, 19, EAST, 2, 2),
  ...stack(-104, 16.3, EAST, 1, 0),
  prop('palletStack', -95, 10, 0.2),
  prop('palletStack', -93.5, 10.3, 0),
  prop('lampPost', -94, 17, NORTH),

  // Perimeter fence, the two gaps: the main gate at z -11..1 and the hole at z -32..-28 behind the generator.
  ...fence(-90, -36, -90, -32),
  ...fence(-90, -28, -90, -12),
  ...fence(-90, 2, -90, 22),
  prop('generator', -93, -30, EAST),
  prop('cableSpool', -95.5, -32.5, 0.5),
  prop('warningSign', -90.3, -26, WEST),

  // South fence of the checkpoint, between it and the waterline path. Gap at x -72..-68.
  ...fence(-88, -24, -72, -24),
  ...fence(-68, -24, -64, -24),

  // Waterline path: fender tyres, a dumped pallet stack and barrels for the flanker to use.
  ...row('tyreStack', -88, -35.3, -66, -35.3, 4),
  prop('palletStack', -80, -27, 0.4),
  prop('crate', -74.5, -33, 0.2, 1),
  prop('barrel', -82, -33.5, NORTH, 0),
  prop('barrel', -81.2, -34, NORTH, 1),

  // Checkpoint: two lowered booms and the booth, nobody at the desk.
  prop('boomGate', -82, -8, EAST),
  prop('boomGate', -82, -2, EAST),
  prop('guardBooth', -80, -14, NORTH),
  prop('desk', -76, -18, NORTH),
  prop('cableSpool', -73, -19.5, 0.2),
  prop('barrel', -74, -14, NORTH, 2),
  prop('warningSign', -83, -12, WEST),

  // Jersey chicane, with the gap on the road centre.
  prop('jerseyBarrier', -86, -8.5, EAST),
  prop('jerseyBarrier', -86, -1.5, EAST),
  prop('jerseyBarrier', -76, -5, EAST),

  // The sandbag line: bags to the town, open side to the port.
  prop('sandbags', -72, -9, EAST),
  prop('sandbags', -72, -1, EAST),
  prop('sandbags', -74, 6, EAST),
  prop('sandbags', -74, 8.4, EAST),
  prop('sandbags', -70.5, -17, EAST),

  // North of the road: flood generator, a parked flatbed, an inspection container.
  prop('generator', -84, 9, NORTH),
  ...stack(-82, 16, EAST, 2, 1),
  prop('truck', -68, 13, NORTH),
  prop('crate', -68, 11, 0.2, 0, 1.6),
  prop('palletStack', -78, 9.5, 0.2),
];

export const APPROACH_LIGHTS: LightDef[] = [
  sodium(-111.6, -42, JETTY_DECK),
  light('warning', -110, JETTY_DECK + 2.2, -60, 9, 0.7),
  sodium(-104, -20),
  sodium(-94, 17),
  // Floodlights on the booth roof and over the generator.
  light('work', -80, 4.6, -12.6, 22, 1.2),
  light('work', -84, 5, 10, 20, 1.0),
];
