/**
 * Camera paths. `duration` is the seconds from the previous key to this one; the first key's value is ignored.
 * The intro ends exactly at the player's eye (start position + 1.65m), looking along the player's yaw.
 */
import { JETTY_DECK, camKey } from './build';
import type { CameraKey } from '../types';

const EYE_Y = JETTY_DECK + 1.65;

/** Slow orbit over the yard, the crane always in frame. 60s, ends where it began so it can loop. */
export const CINEMATIC_MENU: CameraKey[] = [
  camKey(-72, 18, -58, -36, 14, -16, 0, 50),
  camKey(-22, 16, -62, -36, 18, -20, 12, 50),
  camKey(12, 20, -32, -36, 20, -18, 12, 48),
  camKey(14, 26, 22, -36, 18, -14, 12, 50),
  camKey(-58, 30, 34, -36, 14, -14, 12, 52),
  camKey(-72, 18, -58, -36, 14, -16, 12, 50),
];

/** From the sea, run in low over the water, up the breakwater to the player's eye. 14s. */
export const CINEMATIC_INTRO: CameraKey[] = [
  camKey(-92, 2.5, -170, -107, 3, -60, 0, 42),
  camKey(-100, 1.6, -124, -108, 2, -60, 6, 46),
  camKey(-113.6, 0.2, -94, -109, 1.4, -70, 5, 50),
  camKey(-109, EYE_Y, -86, -109, EYE_Y, -76, 3, 60),
];

/** On the pier, on the boat, then pulling away with the port and crane behind. 10s. */
export const CINEMATIC_EXTRACTION: CameraKey[] = [
  camKey(101, 1.7, -58, 107.6, -1.6, -63, 0, 55),
  camKey(103, 1.4, -66, 107.6, -1.4, -63, 3, 55),
  camKey(112, 0.4, -74, 82, 6, -20, 3, 50),
  camKey(128, 5, -112, 40, 10, -6, 4, 46),
];
