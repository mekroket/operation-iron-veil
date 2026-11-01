/**
 * Mission-facing data for Port Kessary: triggers, enemies, pickups, doors, checkpoints.
 *
 * Trigger boxes are slices across the whole site, so no alternative route can pass around one. The warehouse pair also
 * spans the service alley, since the alley reaches the annex without entering the warehouse.
 */
import { EAST, NORTH, PLATFORM_TOP, SOUTH, WEST, checkpoint, door, enemy, pickup, trigger } from './build';
import type { CheckpointDef, DoorDef, EnemySpawn, PickupDef, TriggerZone } from '../types';

export const TRIGGERS: TriggerZone[] = [
  trigger('enter_port', -112, -38, -106, -35),
  trigger('checkpoint_near', -96, -36, -93, 24),
  trigger('checkpoint_passed', -66, -36, -63, 24),
  trigger('yard_entry', -61, -36, -58, 24),
  trigger('yard_mid', -34, -36, -30, 24),
  trigger('warehouse_entry', 0.5, -22, 4, 24),
  trigger('warehouse_mid', 30, -22, 34, 24),
  trigger('annex_entry', 60.2, -1.3, 66.6, 9.9),
  trigger('server_room', 76.3, -9.85, 83.85, 9.85),
  trigger('quay_entry', 84.3, -10, 87.5, 24),
  trigger('quay_mid', 84, -12, 108, -8),
  trigger('extraction_near', 98, -42, 106, -38),
];

export const ENEMIES: EnemySpawn[] = [
  // Checkpoint: 5, two walking the road and the north side. Three more sit on the line.
  enemy('ck_1', 'checkpoint', -70.4, -9, WEST),
  enemy('ck_2', 'checkpoint', -70.4, -1, WEST),
  enemy('ck_3', 'checkpoint', -77.6, -15, WEST),
  enemy('ck_4', 'checkpoint', -79.5, -8.5, EAST, ['ck2', 'ck4', 'ck6', 'ck4']),
  enemy('ck_5', 'checkpoint', -78, 5, EAST, ['ck11', 'ck12', 'cv_ck7', 'ck12']),

  // Yard, west half: 5.
  enemy('ya_1', 'yard_a', -49, -3.5, EAST, ['cl1', 'cl2', 'cl3', 'cl2']),
  enemy('ya_2', 'yard_a', -47, 17, EAST, ['nl1', 'nl2']),
  enemy('ya_3', 'yard_a', -46, -27, EAST, ['sl1', 'sl2', 'sl1', 'sl0']),
  enemy('ya_4', 'yard_a', -51.8, -7.6, WEST),
  enemy('ya_5', 'yard_a', -39.6, 14.6, WEST),

  // Yard, east half: 4.
  enemy('yb_1', 'yard_b', -17, -5, WEST, ['cl5', 'cl4', 'cl5', 'cl6']),
  enemy('yb_2', 'yard_b', -7.2, -14, WEST),
  enemy('yb_3', 'yard_b', -16, 17, WEST, ['nl4', 'nl3', 'nl4', 'nl5']),
  enemy('yb_4', 'yard_b', -10.8, -29, WEST),

  // Warehouse: 6 inside on arrival. Three walk the aisles.
  enemy('wh_1', 'warehouse', 13.7, -7, WEST),
  enemy('wh_2', 'warehouse', 23.4, -1, WEST),
  enemy('wh_3', 'warehouse', 27, -5, WEST, ['wc2', 'wc3', 'wc4', 'wc3']),
  enemy('wh_4', 'warehouse', 39, 5, WEST, ['wa4', 'wa3']),
  enemy('wh_5', 'warehouse', 39, -14.4, WEST, ['ws4', 'ws3', 'wc3', 'ws3']),
  enemy('wh_6', 'warehouse', 55.4, -16.6, NORTH, [], PLATFORM_TOP),

  // Warehouse reinforcements: come in from the annex side once the alarm is up.
  enemy('wr_1', 'warehouse_reinforce', 57.5, 0, WEST),
  enemy('wr_2', 'warehouse_reinforce', 55, -11.5, WEST),
  enemy('wr_3', 'warehouse_reinforce', 47, 5, WEST, ['wa5', 'wa4', 'wa3', 'wa4']),

  // Annex: 5, two working the corridors.
  enemy('an_1', 'annex', 68, 0, WEST, ['c1b', 'c2']),
  enemy('an_2', 'annex', 65.25, 7, SOUTH, ['n1', 'c1b', 'n1', 'n2']),
  enemy('an_3', 'annex', 70.2, 5.6, SOUTH),
  enemy('an_4', 'annex', 64, -6, NORTH),
  enemy('an_5', 'annex', 79.8, 4.6, SOUTH, ['sv7', 'sv4', 'sv1', 'sv2', 'sv1', 'sv4']),

  // Quay: 4 waiting outside the door.
  enemy('qu_1', 'quay', 92.6, 5, WEST),
  enemy('qu_2', 'quay', 89.4, 14, WEST, ['q3', 'q4', 'q3', 'q2']),
  enemy('qu_3', 'quay', 96, -14.5, NORTH, ['q8', 'q9b', 'q15', 'q9b']),
  enemy('qu_4', 'quay', 95, -1.8, NORTH, ['cv_q4', 'q6', 'q5', 'q6']),

  // Quay reinforcements: through the north gate and up from the apron under the blast wall.
  enemy('qr_1', 'quay_reinforce', 97, 25, SOUTH, ['qg', 'q4', 'q3', 'q4']),
  enemy('qr_2', 'quay_reinforce', 68, -27, EAST),
  enemy('qr_3', 'quay_reinforce', 74.5, -28, EAST),
];

/** Item heights: a crate top is 1.1, on a pallet 1.25, a desk 0.78, a palletStack 1.0. */
export const PICKUPS: PickupDef[] = [
  // Before the checkpoint.
  pickup('ammo_apron', 'ammo', -113.5, -24.5, 1.1),
  pickup('med_apron', 'medkit', -114, -28, 1.0),
  // After the checkpoint, before the yard.
  pickup('ammo_booth', 'ammo', -76, -18, 0.78),
  pickup('med_strip', 'medkit', -67.5, -18.5),
  // Mid yard and after it.
  pickup('ammo_lane', 'ammo', -48.4, -1.2, 2.2),
  pickup('ammo_forecourt', 'ammo', -7.6, -22.4, 1.1),
  pickup('med_forecourt', 'medkit', -2.4, -23.5, 1.0),
  // Warehouse: at the door, and past the middle.
  pickup('ammo_bay', 'ammo', 6.6, -2.4, 2.2),
  pickup('med_mid', 'medkit', 31, 8.7),
  pickup('ammo_aisle', 'ammo', 47.5, -1, 1.0),
  pickup('med_platform', 'medkit', 55.5, -19.5, PLATFORM_TOP + 0.78),
  // Annex, around the objective.
  pickup('ammo_storage', 'ammo', 62.85, 9.2, 0.78),
  pickup('med_office', 'medkit', 62, -8.8, 0.78),
  pickup('ammo_server', 'ammo', 82.8, -8.8, 0.78),
  // Outside, for the last fight.
  pickup('med_quay', 'medkit', 86.5, 10),
  pickup('ammo_quay', 'ammo', 100, -18, 1.0),
];

export const DOORS: DoorDef[] = [
  door('door_side', 14, 10, true, 'Service door', [['al2', 'wb0']]),
  door('door_annex_west', 60, 0, false, 'Annex', [['wc7', 'c0']]),
  door('door_annex_north', 65.25, 10, true, 'Annex service door', [['al8', 'n2']]),
  door('door_storage_a', 63.85, 5.5, false, 'Storage A', [['n1', 'sa1x']], 'corrugatedWhite'),
  door('door_storage_b', 72, 1.4, true, 'Storage B', [['c2', 'sr1']], 'corrugatedWhite'),
  door('door_office', 65.25, -1.4, true, 'Harbour office', [['c1b', 'of1']], 'corrugatedWhite', true),
  door('door_storage_c', 72, -1.4, true, 'Storage C', [['c2', 'sc1']], 'corrugatedWhite'),
  door('door_server', 76.15, 0, false, 'Server room', [['c2', 'sv1']]),
  door('door_quay', 84, 7, false, 'East quay', [['sv5', 'q0']]),
];

export const CHECKPOINTS: CheckpointDef[] = [
  checkpoint('cp_checkpoint', -64.5, -9, EAST, 'checkpoint_passed'),
  checkpoint('cp_warehouse', 2.5, -5, EAST, 'warehouse_entry'),
  checkpoint('cp_annex', 62.5, 0, EAST, 'annex_entry'),
  checkpoint('cp_quay', 85.8, 7, EAST, 'quay_entry'),
];
