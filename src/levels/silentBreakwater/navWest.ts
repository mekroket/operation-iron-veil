/**
 * Nav graph, west half: breakwater, apron, waterline flank, checkpoint and container yard.
 * Links are listed once; the loader and the validator mirror them. Cover nodes face the way a defender looks: mostly
 * west, since the player comes from there.
 */
import { JETTY_DECK, WEST, coverNode, node } from './build';
import type { NavNode } from '../types';

export const NAV_APPROACH: NavNode[] = [
  // Breakwater. The line stays east of the crouch pipe, which ends at x = -108.4.
  node('j0', -107.5, -86, ['j1'], JETTY_DECK),
  node('j1', -107.5, -76, ['j2'], JETTY_DECK),
  node('j2', -107.5, -66, ['j3'], JETTY_DECK),
  node('j3', -107.5, -56, ['j4'], JETTY_DECK),
  node('j4', -107.5, -46, ['j5'], JETTY_DECK),
  node('j5', -107.5, -37.5, ['j6'], JETTY_DECK),
  node('j6', -107.5, -36, ['a1']),

  // Apron.
  node('a1', -107, -28, ['a2', 'a5']),
  node('a2', -107, -18, ['a4']),
  node('a4', -98, -14, ['a7']),
  node('a5', -92, -27, ['a6']),
  node('a6', -91.3, -30, ['f1']),
  node('a7', -92.5, -8, ['a8', 'ck1']),
  node('a8', -92.5, -2, ['ck1']),

  // Waterline flank.
  node('f1', -87, -30, ['f2']),
  node('f2', -78, -30, ['f3']),
  node('f3', -70, -30, ['st0', 'f5']),
  node('f5', -69.8, -21, ['ck8', 'cv_ck5']),

  // Checkpoint.
  node('ck1', -84, -5, ['ck2', 'ck11']),
  node('ck2', -79.5, -8.5, ['ck4', 'ck7']),
  node('ck4', -74, -8, ['ck6']),
  node('ck6', -70, -5, ['cv_ck1', 'cv_ck2', 'st2', 'ck12']),
  node('ck7', -77, -13, ['ck8']),
  node('ck8', -68, -13, ['cv_ck1', 'cv_ck5', 'st1']),
  node('ck11', -78, 5, ['ck12']),
  node('ck12', -71, 3, ['cv_ck7', 'st3']),
  coverNode('cv_ck1', -70.4, -9, WEST, []),
  coverNode('cv_ck2', -70.4, -1, WEST, []),
  coverNode('cv_ck5', -69.2, -17, WEST, []),
  coverNode('cv_ck7', -72.6, 6.5, WEST, []),

  // Strip between the checkpoint and the first container block.
  node('st0', -61.5, -26, ['st1', 'sl0']),
  node('st1', -62.5, -14, ['st2']),
  node('st2', -62.5, -5, ['st3', 'cl0']),
  node('st3', -62.5, 5, ['st4']),
  node('st4', -62.5, 16, ['nl1']),
];

export const NAV_YARD: NavNode[] = [
  // Central lane.
  node('cl0', -56, -5, ['cl1']),
  node('cl1', -49, -3.5, ['cl2', 'cv_ya1']),
  node('cl2', -44.7, -5, ['cl3', 'na1', 'sa1', 'cv_ya2']),
  node('cl3', -36, -0.9, ['cl4']),
  node('cl4', -26, -5, ['cl5', 'nb1', 'sb1']),
  node('cl5', -17, -5, ['cl6', 'cv_yb1']),
  node('cl6', -9, -5, ['cl7', 'fc1', 'fc2']),
  node('cl7', -3, -5, ['w1']),
  coverNode('cv_ya1', -51.8, -7.6, WEST, []),
  coverNode('cv_ya2', -46.3, -1.2, WEST, []),
  coverNode('cv_yb1', -18.8, -2.5, WEST, []),

  // Cross alleys, either side of the crane's inner legs.
  node('na1', -44.7, 5.6, ['nl1']),
  node('nb1', -26.9, 5.6, ['nl3']),
  node('sa1', -46, -16, ['sl1']),
  node('sb1', -25.3, -16, ['sl3']),

  // North lane.
  node('nl1', -47, 17, ['nl2']),
  node('nl2', -37, 17.5, ['nl3', 'cv_ya5']),
  node('nl3', -26, 17, ['nl4']),
  node('nl4', -16, 17, ['nl5']),
  node('nl5', -7, 16, ['al0', 'fc1']),
  coverNode('cv_ya5', -39.6, 14.6, WEST, []),

  // South lane.
  node('sl0', -56, -28, ['sl1']),
  node('sl1', -46, -28, ['sl2']),
  node('sl2', -36, -30, ['sl3', 'cv_ya7']),
  node('sl3', -26, -28, ['sl4']),
  node('sl4', -14, -27, ['fc3']),
  coverNode('cv_ya7', -40.4, -31.5, WEST, []),

  // Forecourt in front of the warehouse.
  node('fc1', -9.3, 8, []),
  node('fc2', -9, -14, ['fc3', 'cv_yb3']),
  node('fc3', -9.5, -24, ['cv_yb6']),
  coverNode('cv_yb3', -7.2, -14, WEST, []),
  coverNode('cv_yb6', -10.8, -29, WEST, []),
];
