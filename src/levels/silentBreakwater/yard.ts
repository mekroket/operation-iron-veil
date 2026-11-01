/**
 * Zone 4: the container yard. Two bands of stacks split it into three lanes running east: north, central and
 * south (waterside). Each band has three blocks, leaving two cross alleys at x -47.5..-42 and x -29.8..-24. The
 * crane stands on the south quay with its inner legs in those alleys.
 *
 * Rows in a block are 2.7m apart, so the 0.26m cracks between containers are too narrow for the 0.7m capsule.
 *
 * Story beat: block B south is the same dirty-white container, stacked four rows deep. Everything else in the yard is
 * mixed. Those are the Veil boxes.
 */
import { EAST, NORTH, kerb, light, paint, prop, row, shortStack, sodium, stack } from './build';
import type { BoxSolid, LightDef, PropPlacement } from '../types';

const BLOCK_A = -53.6;
const BLOCK_B = -35.9;
const BLOCK_C = -17.9;
const CRANE_X = -35.75;
const CRANE_Z = -24;

export const YARD_SOLIDS: BoxSolid[] = [
  // Lane markings.
  paint(-60, -5.1, -2, -4.9, 'concretePainted'),
  paint(-60, 11.4, -2, 11.6, 'concretePainted'),
  paint(-60, -21.6, -2, -21.4, 'concretePainted'),
  // Crane rails along the quay, either side of the legs.
  paint(-64, -35.1, 0, -34.9, 'steelDark'),
  paint(-64, -13.1, -60, -12.9, 'steelDark'),
  // Hazard boxes around the crane legs that stand in the open.
  paint(-45.4, -14.2, -43.1, -11.8, 'hazardStripe'),
  paint(-28.4, -14.2, -26.1, -11.8, 'hazardStripe'),
  // Loading apron kerb in front of the warehouse.
  kerb(-1, -24, 0, -9.5),
  kerb(-1, -0.5, 0, 10),
];

export const YARD_PROPS: PropPlacement[] = [
  // North band, block A, B, C. z rows 1.6, 4.3, 7.0, 9.7.
  ...stack(BLOCK_A, 1.6, EAST, 2, 0),
  ...stack(BLOCK_A, 4.3, EAST, 3, 1),
  ...stack(BLOCK_A, 7.0, EAST, 3, 0),
  ...stack(BLOCK_A, 9.7, EAST, 2, 2),
  ...stack(BLOCK_B, 1.6, EAST, 1, 2),
  ...stack(BLOCK_B, 4.3, EAST, 2, 3),
  ...stack(BLOCK_B, 7.0, EAST, 3, 1),
  ...stack(BLOCK_B, 9.7, EAST, 2, 0),
  ...stack(BLOCK_C, 1.6, EAST, 2, 1),
  ...stack(BLOCK_C, 4.3, EAST, 3, 0),
  ...stack(BLOCK_C, 7.0, EAST, 2, 2),
  ...stack(BLOCK_C, 9.7, EAST, 1, 1),

  // South band. z rows -11.6, -14.3, -17, -19.7. Block B is the identical white set.
  ...stack(BLOCK_A, -11.6, EAST, 2, 2),
  ...stack(BLOCK_A, -14.3, EAST, 3, 1),
  ...stack(BLOCK_A, -17.0, EAST, 2, 0),
  ...stack(BLOCK_A, -19.7, EAST, 1, 3),
  ...stack(BLOCK_B, -11.6, EAST, 3, 3),
  ...stack(BLOCK_B, -14.3, EAST, 3, 3),
  ...stack(BLOCK_B, -17.0, EAST, 3, 3),
  ...stack(BLOCK_B, -19.7, EAST, 2, 3),
  ...stack(BLOCK_C, -11.6, EAST, 1, 0),
  ...stack(BLOCK_C, -14.3, EAST, 2, 1),
  ...stack(BLOCK_C, -17.0, EAST, 3, 0),
  ...stack(BLOCK_C, -19.7, EAST, 2, 2),

  prop('craneGantry', CRANE_X, CRANE_Z, NORTH),

  // Central lane. The long sightline from the checkpoint to the roller door is broken three times.
  prop('jerseyBarrier', -53, -7.6, EAST),
  prop('crate', -49, -1.2, 0.2, 0),
  prop('crate', -47.7, -1.2, 0, 1),
  prop('crate', -48.4, -1.2, 0.1, 0, 1.1),
  ...shortStack(-36, -5.8, NORTH, 1, 1),
  prop('forklift', -32, -8, EAST),
  prop('pallet', -29.8, -7.9, EAST),
  prop('crate', -29.8, -7.9, 0, 1, 0.15),
  prop('sandbags', -20, -2.5, EAST),
  prop('sandbags', -14.5, -8.6, EAST),
  prop('barrel', -13, -2, NORTH, 1),
  prop('barrel', -12.3, -1.5, NORTH, 2),

  // North lane.
  prop('forklift', -52, 20.8, 0.1),
  ...row('palletStack', -41, 13.5, -41, 15.7, 3, NORTH),
  prop('crateLarge', -39, 20, 0.3),
  prop('crate', -36.8, 21.4, 0.1, 1),
  ...shortStack(-30, 21.6, EAST, 2, 3),
  prop('jerseyBarrier', -22, 14, NORTH),
  prop('generator', -13, 21, NORTH),
  prop('cableSpool', -9.5, 20.6, 0.3),
  prop('sandbags', -58.5, 14, EAST),

  // South lane, the waterside: a truck under the crane, pipes and a short stack near the warehouse.
  prop('truck', -37, -26, EAST),
  ...row('crate', -38.8, -26, -36.2, -26, 3, 0, 1, 1.6),
  prop('pipeBundle', -51, -26, EAST),
  prop('crate', -43, -31.5, 0.2, 0),
  prop('crate', -41.8, -31.5, 0, 0),
  ...shortStack(-20, -31, EAST, 2, 0),
  prop('jerseyBarrier', -12, -29, EAST),
  prop('palletStack', -27.5, -25, 0.2),
  ...row('tyreStack', -60, -35.3, -8, -35.3, 5),
  ...row('mooringCleat', -55, -35.4, -5, -35.4, 4),

  // Forecourt: the flatbed still half-loaded, the forklift stopped with its forks towards it.
  prop('truck', -5, -16, NORTH),
  prop('crate', -5, -17.6, 0.1, 0, 1.6),
  prop('crate', -5.2, -19.1, -0.1, 0, 1.6),
  prop('crate', -4.8, -16, 0, 0, 1.6),
  prop('forklift', -5, -23, NORTH),
  prop('crate', -7.6, -22.4, 0.3, 0),
  prop('crate', -7.4, -21.1, 0, 0),
  prop('palletStack', -2.4, -23.5, 0),
  prop('warningSign', -0.4, -24, EAST),
  prop('crateLarge', -7, 4, 0.2),
  prop('jerseyBarrier', -3.6, 3.6, EAST),

  // Lamp posts: at block corners, on lane edges.
  prop('lampPost', -56, 11.6, NORTH),
  prop('lampPost', -28, 11.6, NORTH),
  prop('lampPost', -48, -21.6, NORTH),
  prop('lampPost', -22, -21.6, NORTH),
  prop('lampPost', -3, 12, NORTH),
];

export const YARD_LIGHTS: LightDef[] = [
  sodium(-56, 11.6),
  sodium(-28, 11.6),
  sodium(-48, -21.6),
  sodium(-22, -21.6),
  sodium(-3, 12),
  // Amber beacon on the crane leg at the central lane's halfway mark.
  light('warning', -44.2, 3.5, -13, 12, 0.8),
];
