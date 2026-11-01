/**
 * Data model of a playable level. Pure data: gameplay, tests and rendering all consume the same definition.
 *
 * World convention: metres, Y up, left-handed (Babylon default). North = +Z, East = +X. Ground plane is y = 0.
 * `yaw` is radians, 0 faces +Z, positive turns towards +X.
 */
import type { SurfaceType, Vec3 } from '../core/types';
import type { PropKind } from './propCatalog';

/** Surface look. LevelRenderer maps each key to a procedural PBR material. */
export type MaterialKey =
  | 'asphalt'
  | 'concrete'
  | 'concreteDark'
  | 'concretePainted'
  | 'quayStone'
  | 'gravel'
  | 'steelDark'
  | 'steelRust'
  | 'steelYellow'
  | 'corrugatedGrey'
  | 'corrugatedRust'
  | 'corrugatedWhite'
  | 'plasterInterior'
  | 'floorTile'
  | 'floorRubber'
  | 'woodPlank'
  | 'glassDark'
  | 'hazardStripe';

/** Physics surface for bullet impacts and footsteps, derived from the material. */
export const MATERIAL_SURFACE: Record<MaterialKey, SurfaceType> = {
  asphalt: 'asphalt',
  concrete: 'concrete',
  concreteDark: 'concrete',
  concretePainted: 'concrete',
  quayStone: 'concrete',
  gravel: 'gravel',
  steelDark: 'metal',
  steelRust: 'metal',
  steelYellow: 'metal',
  corrugatedGrey: 'metal',
  corrugatedRust: 'metal',
  corrugatedWhite: 'metal',
  plasterInterior: 'concrete',
  floorTile: 'concrete',
  floorRubber: 'concrete',
  woodPlank: 'wood',
  glassDark: 'metal',
  hazardStripe: 'concrete',
};

/** An axis-aligned box, optionally rotated around Y. The basic building block of level geometry. */
export interface BoxSolid {
  center: Vec3;
  /** Full extents: x width, y height, z depth (before yaw). */
  size: Vec3;
  material: MaterialKey;
  yaw?: number;
  /** Defaults to true. False = visual-only trim. */
  collide?: boolean;
  /** Defaults to true. False = invisible blocker. */
  visible?: boolean;
  /** Default false. True means the mesh may cast sun shadows. Large static walls and roofs should. */
  castShadow?: boolean;
}

export interface PropPlacement {
  kind: PropKind;
  /** Base centre of the prop, on its supporting surface. */
  position: Vec3;
  yaw: number;
  /** Colour or wear variant. Interpretation is per kind. */
  variant?: number;
}

export type LightKind = 'sodium' | 'fluorescent' | 'warning' | 'emergency' | 'work';

export interface LightDef {
  kind: LightKind;
  position: Vec3;
  /** Metres of reach. */
  range: number;
  intensity?: number;
  /** Spot lights aim straight down when true. */
  downward?: boolean;
  /** Flicker animation for damaged fixtures. */
  flicker?: boolean;
}

export interface NavNode {
  id: string;
  position: Vec3;
  /** Ids of directly walkable neighbours. Links are bidirectional when both ends list each other; the loader mirrors them. */
  links: string[];
  /** Good place to fight from: low cover nearby. */
  cover?: boolean;
  /** Direction a defender at this node faces, in radians. */
  coverYaw?: number;
}

export interface TriggerZone {
  id: string;
  center: Vec3;
  size: Vec3;
}

export interface EnemySpawn {
  id: string;
  /** Group activated together by the mission script. */
  group: string;
  position: Vec3;
  yaw: number;
  /** Nav node ids walked in a loop. Empty = stands guard at spawn. */
  patrol: string[];
}

export interface PickupDef {
  id: string;
  kind: 'ammo' | 'medkit';
  position: Vec3;
}

/** A hinged-free sliding door. Blocks movement, bullets and vision while closed. */
export interface DoorDef {
  id: string;
  center: Vec3;
  size: Vec3;
  /** World-space offset of the panel when fully open. */
  openOffset: Vec3;
  material: MaterialKey;
  label: string;
  /** Nav links passing through this door, as [nodeA, nodeB]. Blocked for AI while closed unless AI can open it. */
  navLinks: [string, string][];
  startsOpen?: boolean;
}

export interface CheckpointDef {
  id: string;
  position: Vec3;
  yaw: number;
  /** Trigger zone id that activates this checkpoint. */
  trigger: string;
}

export interface CameraKey {
  position: Vec3;
  /** World point the camera looks at. */
  target: Vec3;
  /** Seconds from the previous key to this one. First key's value is ignored. */
  duration: number;
  /** Vertical FOV in degrees. Defaults to 55. */
  fov?: number;
}

export interface LevelDefinition {
  id: string;
  name: string;
  /** Rough world bounds: used for shadow setup and sanity tests. */
  bounds: { min: Vec3; max: Vec3 };
  /** Sea level. Water is rendered at this height, south and east of the quay. */
  seaLevel: number;
  solids: BoxSolid[];
  props: PropPlacement[];
  lights: LightDef[];
  nav: NavNode[];
  triggers: TriggerZone[];
  enemies: EnemySpawn[];
  pickups: PickupDef[];
  doors: DoorDef[];
  checkpoints: CheckpointDef[];
  playerStart: { position: Vec3; yaw: number };
  /** Data terminal the player must reach and operate. */
  objective: { position: Vec3; yaw: number; label: string };
  /** The player must stand in this zone and interact to end the mission. */
  extraction: { position: Vec3; yaw: number; zone: TriggerZone };
  /** Location of the scripted charge detonation after the objective completes. */
  blastPoint: Vec3;
  cinematics: { menu: CameraKey[]; intro: CameraKey[]; extraction: CameraKey[] };
}
