/**
 * SILENT BREAKWATER: Port Kessary, 04:42, overcast. Entirely fictional.
 *
 * Route, west to east: south breakwater, port entrance, security checkpoint (or the waterline flank), container yard,
 * main warehouse (or the service alley), annex, server room, east quay, extraction pier. See terrain.ts for the site plan.
 */
import { JETTY_DECK, NORTH, trigger } from './build';
import { APPROACH_LIGHTS, APPROACH_PROPS, APPROACH_SOLIDS } from './approach';
import { ANNEX_LIGHTS, ANNEX_PROPS, ANNEX_SOLIDS } from './annex';
import { CINEMATIC_EXTRACTION, CINEMATIC_INTRO, CINEMATIC_MENU } from './cinematics';
import { CHECKPOINTS, DOORS, ENEMIES, PICKUPS, TRIGGERS } from './gameplay';
import { NAV_ALLEY, NAV_ANNEX, NAV_QUAY, NAV_WAREHOUSE } from './navEast';
import { NAV_APPROACH, NAV_YARD } from './navWest';
import { QUAY_LIGHTS, QUAY_PROPS, QUAY_SOLIDS } from './quay';
import { TERRAIN_SOLIDS } from './terrain';
import { WAREHOUSE_LIGHTS, WAREHOUSE_PROPS, WAREHOUSE_SOLIDS } from './warehouse';
import { YARD_LIGHTS, YARD_PROPS, YARD_SOLIDS } from './yard';
import type { LevelDefinition } from '../types';

export const SILENT_BREAKWATER: LevelDefinition = {
  id: 'silent-breakwater',
  name: 'Port Kessary',
  bounds: { min: { x: -118, y: -5, z: -94 }, max: { x: 110, y: 45, z: 28 } },
  seaLevel: -2.5,
  solids: [...TERRAIN_SOLIDS, ...APPROACH_SOLIDS, ...YARD_SOLIDS, ...WAREHOUSE_SOLIDS, ...ANNEX_SOLIDS, ...QUAY_SOLIDS],
  props: [...APPROACH_PROPS, ...YARD_PROPS, ...WAREHOUSE_PROPS, ...ANNEX_PROPS, ...QUAY_PROPS],
  lights: [...APPROACH_LIGHTS, ...YARD_LIGHTS, ...WAREHOUSE_LIGHTS, ...ANNEX_LIGHTS, ...QUAY_LIGHTS],
  nav: [...NAV_APPROACH, ...NAV_YARD, ...NAV_ALLEY, ...NAV_WAREHOUSE, ...NAV_ANNEX, ...NAV_QUAY],
  triggers: TRIGGERS,
  enemies: ENEMIES,
  pickups: PICKUPS,
  doors: DOORS,
  checkpoints: CHECKPOINTS,
  playerStart: { position: { x: -109, y: JETTY_DECK, z: -86 }, yaw: NORTH },
  objective: { position: { x: 80, y: 0, z: -9.2 }, yaw: NORTH, label: 'Copy the Veil manifest' },
  extraction: {
    position: { x: 102, y: 0, z: -64 },
    yaw: NORTH,
    zone: trigger('extraction', 98, -69, 106, -59, -1, 4),
  },
  blastPoint: { x: 60.4, y: 2.5, z: -16 },
  cinematics: { menu: CINEMATIC_MENU, intro: CINEMATIC_INTRO, extraction: CINEMATIC_EXTRACTION },
};
