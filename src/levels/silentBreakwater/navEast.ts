/**
 * Nav graph, east half: service alley, warehouse, annex, east quay and pier.
 * The stair link pb-pt runs from the foot of the first step to the top of the last, parallel to the nosing line.
 */
import { EAST, NORTH, PLATFORM_TOP, SOUTH, WEST, coverNode, node } from './build';
import type { NavNode } from '../types';

export const NAV_ALLEY: NavNode[] = [
  node('al0', 0, 17, []),
  node('al2', 14, 12, ['al3', 'wb0']),
  node('al3', 22, 17.8, ['al4']),
  node('al4', 31, 18.5, ['al5']),
  node('al5', 40, 17, ['al6']),
  node('al6', 49, 16.5, ['al7']),
  node('al7', 58, 15, ['al8', 'cv_al2']),
  node('al8', 65.25, 12.5, ['n2']),
  coverNode('cv_al2', 53.2, 13.5, WEST, []),
];

export const NAV_WAREHOUSE: NavNode[] = [
  // Receiving bay.
  node('w1', 4, -5, ['w2']),
  node('w2', 9, -5, ['w3', 'cv_wh1']),
  node('w3', 15, -4.5, ['wc1', 'wb0', 'cv_wh2']),
  node('wb0', 15, 5, ['wa3']),
  coverNode('cv_wh1', 8.4, -2.4, WEST, []),
  coverNode('cv_wh2', 13.7, -7, WEST, []),

  // Central aisle.
  node('wc1', 20, -5, ['wc2']),
  node('wc2', 27, -5, ['wc3', 'cv_wh3']),
  node('wc3', 31, -5, ['wc4', 'wa3', 'ws3']),
  node('wc4', 38, -6, ['wc5', 'cv_wh5']),
  node('wc5', 45, -5, ['pb', 'wc8', 'ws5', 'cv_wh6']),
  node('wc8', 51, -1, ['wc7', 'wa5']),
  node('wc7', 57.5, 0, ['c0', 'cv_wh9']),
  coverNode('cv_wh3', 23.4, -1, WEST, []),
  coverNode('cv_wh5', 40.6, -3, WEST, []),
  coverNode('cv_wh6', 45, -9, WEST, []),
  coverNode('cv_wh9', 55, -11.5, WEST, []),

  // Rack aisles: north pair and the south aisle, joined by the cross aisle at x = 31.
  node('wa3', 31, 5, ['wa4']),
  node('wa4', 39, 5, ['wa5']),
  node('wa5', 47, 5, []),
  node('ws3', 31, -14.4, ['ws4']),
  node('ws4', 39, -14.4, ['ws5']),
  node('ws5', 46.5, -14.4, []),

  // Stairs and the inspection platform.
  node('pb', 51.5, -9.6, ['pt']),
  node('pt', 51.5, -13.6, ['p1'], PLATFORM_TOP),
  node('p1', 51.5, -17, ['p2'], PLATFORM_TOP),
  coverNode('p2', 55.4, -16.6, NORTH, [], PLATFORM_TOP),
];

export const NAV_ANNEX: NavNode[] = [
  // Main corridor.
  node('c0', 61.5, 0, ['c1b']),
  node('c1b', 65.25, 0, ['c2', 'n1', 'of1']),
  node('c2', 72, 0, ['sv1', 'sr1', 'sc1']),
  // Side corridor to the alley door, and storage A.
  node('n1', 65.25, 5.5, ['n2', 'sa1x']),
  node('n2', 65.25, 8.4, []),
  node('sa1x', 62.4, 5.5, []),
  // Storage B.
  node('sr1', 72, 3.2, ['sr2']),
  coverNode('sr2', 70.2, 5.6, EAST, []),
  // Harbour office and storage C, joined at z = -6.
  node('of1', 65.25, -3.2, ['of2']),
  coverNode('of2', 64, -6, NORTH, ['sc2']),
  node('sc1', 72, -3.2, ['sc2']),
  coverNode('sc2', 71.5, -6, NORTH, []),
  // Server room.
  node('sv1', 77.6, 0, ['sv2', 'sv4']),
  coverNode('sv2', 77.6, -6.5, NORTH, ['sv3']),
  node('sv3', 80, -7, []),
  node('sv4', 77.6, 6.5, ['sv5', 'sv7']),
  node('sv5', 82.8, 7, ['q0']),
  coverNode('sv7', 79.8, 4.6, SOUTH, []),
];

export const NAV_QUAY: NavNode[] = [
  // North quay.
  node('q0', 85.5, 7, ['q3', 'q5a']),
  node('q3', 89.4, 11, ['q2', 'q4', 'cv_q2']),
  node('q2', 95, 8, ['q5', 'cv_q1b']),
  node('q4', 93.5, 19, ['qg']),
  node('qg', 97, 25, []),
  node('q5', 100.5, -2, ['q6', 'q9']),
  node('q5a', 85.05, -2, ['q6', 'q7a']),
  node('q6', 92, 0.5, ['cv_q4', 'q2']),
  coverNode('cv_q1b', 92.6, 5, WEST, []),
  coverNode('cv_q2', 89.4, 14, EAST, []),
  coverNode('cv_q4', 95, -1.8, NORTH, []),

  // Crossing to the south quay: round the truck's west end, or its east end.
  node('q7a', 85.05, -9, ['q7']),
  node('q7', 86.5, -14, ['q10', 'q14']),
  node('q9', 104.6, -6, ['q9b']),
  node('q9b', 104.6, -14, ['q15', 'q8']),
  node('q8', 96, -14.5, ['cv_q5']),
  coverNode('cv_q5', 93.4, -17, WEST, []),

  // Apron under the blast wall.
  node('q10', 78, -13.5, ['q12', 'q13', 'cv_q7']),
  node('q12', 68, -27, ['q13']),
  node('q13', 74.5, -28, ['q10']),
  coverNode('cv_q7', 75.8, -16, WEST, []),

  // South quay and the pier.
  node('q14', 86.5, -24, ['q15', 'cv_q10']),
  node('q15', 100, -24, ['q16', 'cv_q11']),
  node('q16', 102, -34, ['r1']),
  coverNode('cv_q10', 90.4, -27.5, NORTH, []),
  coverNode('cv_q11', 101.6, -27, NORTH, []),
  node('r1', 102, -42, ['r2']),
  node('r2', 102, -52, ['r3']),
  node('r3', 102, -62, []),
];
