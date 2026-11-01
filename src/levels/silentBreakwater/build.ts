/**
 * Authoring helpers for Port Kessary. Pure functions that return level data, so that walls, door gaps, stairs and
 * container stacks are computed from corner coordinates instead of hand-typed centres and sizes.
 *
 * All footprint helpers take (x1, z1, x2, z2) corners in world metres. North = +Z, East = +X.
 */
import type { PropKind } from '../propCatalog';
import type {
  BoxSolid,
  CameraKey,
  CheckpointDef,
  DoorDef,
  EnemySpawn,
  LightDef,
  LightKind,
  MaterialKey,
  NavNode,
  PickupDef,
  PropPlacement,
  TriggerZone,
} from '../types';

export const PI = Math.PI;
export const HALF_PI = Math.PI / 2;
export const NORTH = 0;
export const EAST = Math.PI / 2;
export const SOUTH = Math.PI;
export const WEST = -Math.PI / 2;

/** Height of one ISO container, the stacking interval. */
export const CONTAINER_HEIGHT = 2.59;
/** Tallest step the player capsule climbs is 0.3m. Stairs use this rise to keep a margin. */
export const STEP_RISE = 0.28;
export const STEP_RUN = 0.5;
/** Deck height of the south breakwater, three steps below the quay. */
export const JETTY_DECK = -0.84;
/** Height of the inspection platform in the main warehouse, eight steps above the floor. */
export const PLATFORM_TOP = 2.24;

/** Box from two XZ corners and a vertical range. */
export function box(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y1: number,
  y2: number,
  material: MaterialKey,
  collide = true,
  visible = true,
  castShadow = false,
): BoxSolid {
  const solid: BoxSolid = {
    center: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: (z1 + z2) / 2 },
    size: { x: Math.abs(x2 - x1), y: Math.abs(y2 - y1), z: Math.abs(z2 - z1) },
    material,
  };
  if (!collide) solid.collide = false;
  if (!visible) solid.visible = false;
  if (castShadow) solid.castShadow = true;
  return solid;
}

/** Walkable ground slab. Thick enough that its vertical face runs below the sea surface. */
export function ground(x1: number, z1: number, x2: number, z2: number, material: MaterialKey, top = 0): BoxSolid {
  return box(x1, z1, x2, z2, top - 4, top, material);
}

/** Invisible 6m blocker standing on `base`. */
export function blocker(x1: number, z1: number, x2: number, z2: number, base = 0): BoxSolid {
  return box(x1, z1, x2, z2, base, base + 6, 'concreteDark', true, false);
}

/** Visual-only trim. */
export function trim(x1: number, z1: number, x2: number, z2: number, y1: number, y2: number, material: MaterialKey): BoxSolid {
  return box(x1, z1, x2, z2, y1, y2, material, false);
}

/** Painted floor marking: a 1cm non-colliding slab centred on y = 0.005 above `base`. */
export function paint(x1: number, z1: number, x2: number, z2: number, material: MaterialKey = 'hazardStripe', base = 0): BoxSolid {
  return box(x1, z1, x2, z2, base, base + 0.01, material, false);
}

/** Visual kerb 12cm high. It does not collide, so it never snags the capsule. */
export function kerb(x1: number, z1: number, x2: number, z2: number, material: MaterialKey = 'concreteDark'): BoxSolid {
  return box(x1, z1, x2, z2, 0, 0.12, material, false);
}

export interface WallOpening {
  /** Centre of the opening along the wall's axis, as a world coordinate. */
  center: number;
  width: number;
  /** Clear height. An opening as tall as the wall leaves no header. */
  height: number;
}

export function gap(center: number, width: number, height: number): WallOpening {
  return { center, width, height };
}

/**
 * Axis-aligned wall from (x1, z1) to (x2, z2), centred on that line, with openings cut out. One of the two axes must
 * be constant. Openings must not overlap. Solid pieces and headers are computed, so gaps always line up exactly.
 */
export function wall(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  height: number,
  material: MaterialKey,
  thick = 0.3,
  openings: WallOpening[] = [],
  castShadow = true,
  base = 0,
): BoxSolid[] {
  const alongX = z1 === z2;
  const lo = alongX ? Math.min(x1, x2) : Math.min(z1, z2);
  const hi = alongX ? Math.max(x1, x2) : Math.max(z1, z2);
  const fixed = alongX ? z1 : x1;
  const half = thick / 2;
  const piece = (a: number, b: number, y1: number, y2: number): BoxSolid =>
    alongX
      ? box(a, fixed - half, b, fixed + half, y1, y2, material, true, true, castShadow)
      : box(fixed - half, a, fixed + half, b, y1, y2, material, true, true, castShadow);

  const out: BoxSolid[] = [];
  const sorted = [...openings].sort((p, q) => p.center - q.center);
  let cursor = lo;
  for (const opening of sorted) {
    const a = opening.center - opening.width / 2;
    const b = opening.center + opening.width / 2;
    if (a > cursor) out.push(piece(cursor, a, base, base + height));
    if (opening.height < height) out.push(piece(a, b, base + opening.height, base + height));
    cursor = b;
  }
  if (cursor < hi) out.push(piece(cursor, hi, base, base + height));
  return out;
}

/**
 * Staircase along Z made of filled blocks. `direction` +1 climbs towards +Z, -1 towards -Z. Step i (1-based) covers
 * one run and its top is at base + i * rise, so a nav link from (zStart, base) to the top of the last step runs
 * parallel to the nosing line.
 */
export function stairsZ(
  x1: number,
  x2: number,
  zStart: number,
  direction: number,
  count: number,
  base: number,
  material: MaterialKey,
): BoxSolid[] {
  const out: BoxSolid[] = [];
  for (let i = 1; i <= count; i++) {
    const a = zStart + direction * STEP_RUN * (i - 1);
    const b = zStart + direction * STEP_RUN * i;
    out.push(box(x1, Math.min(a, b), x2, Math.max(a, b), base, base + STEP_RISE * i, material));
  }
  return out;
}

export function prop(kind: PropKind, x: number, z: number, yaw = 0, variant?: number, y = 0): PropPlacement {
  const placed: PropPlacement = { kind, position: { x, y, z }, yaw };
  if (variant !== undefined) placed.variant = variant;
  return placed;
}

/** `count` copies evenly spaced from (x1, z1) to (x2, z2) inclusive. */
export function row(
  kind: PropKind,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  count: number,
  yaw = 0,
  variant?: number,
  y = 0,
): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    out.push(prop(kind, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, yaw, variant, y));
  }
  return out;
}

/** Container stack, levels 1 to 3, one interval per level. */
export function stack(x: number, z: number, yaw: number, levels: number, variant: number): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let level = 0; level < levels; level++) {
    out.push(prop('container', x, z, yaw, variant, level * CONTAINER_HEIGHT));
  }
  return out;
}

/** Same as `stack` with 20-foot containers. */
export function shortStack(x: number, z: number, yaw: number, levels: number, variant: number): PropPlacement[] {
  const out: PropPlacement[] = [];
  for (let level = 0; level < levels; level++) {
    out.push(prop('containerShort', x, z, yaw, variant, level * CONTAINER_HEIGHT));
  }
  return out;
}

/** Chain link fence along an axis. Panels are 4m, spread so the run ends exactly at both corners with no gaps. */
export function fence(x1: number, z1: number, x2: number, z2: number): PropPlacement[] {
  const alongX = z1 === z2;
  const length = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const count = Math.max(1, Math.ceil(length / 4 - 1e-6));
  const out: PropPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    if (alongX) {
      const lo = Math.min(x1, x2) + 2;
      const hi = Math.max(x1, x2) - 2;
      out.push(prop('fencePanel', lo + (hi - lo) * t, z1, 0));
    } else {
      const lo = Math.min(z1, z2) + 2;
      const hi = Math.max(z1, z2) - 2;
      out.push(prop('fencePanel', x1, lo + (hi - lo) * t, HALF_PI));
    }
  }
  return out;
}

export function light(
  kind: LightKind,
  x: number,
  y: number,
  z: number,
  range: number,
  intensity?: number,
  downward = false,
  flicker = false,
): LightDef {
  const def: LightDef = { kind, position: { x, y, z }, range };
  if (intensity !== undefined) def.intensity = intensity;
  if (downward) def.downward = true;
  if (flicker) def.flicker = true;
  return def;
}

/** Sodium head of a lamp post standing at (x, z) on the given base height. */
export function sodium(x: number, z: number, base = 0): LightDef {
  return light('sodium', x, base + 8.6, z, 26, 1.0, true);
}

export function node(id: string, x: number, z: number, links: string[], y = 0): NavNode {
  return { id, position: { x, y, z }, links };
}

export function coverNode(id: string, x: number, z: number, coverYaw: number, links: string[], y = 0): NavNode {
  return { id, position: { x, y, z }, links, cover: true, coverYaw };
}

/** Trigger box from XZ corners. Tall enough for the player on any level of the zone. */
export function trigger(id: string, x1: number, z1: number, x2: number, z2: number, y1 = -2, y2 = 8): TriggerZone {
  return {
    id,
    center: { x: (x1 + x2) / 2, y: (y1 + y2) / 2, z: (z1 + z2) / 2 },
    size: { x: Math.abs(x2 - x1), y: y2 - y1, z: Math.abs(z2 - z1) },
  };
}

export function enemy(id: string, group: string, x: number, z: number, yaw: number, patrol: string[] = [], y = 0): EnemySpawn {
  return { id, group, position: { x, y, z }, yaw, patrol };
}

export function pickup(id: string, kind: 'ammo' | 'medkit', x: number, z: number, y = 0): PickupDef {
  return { id, kind, position: { x, y, z } };
}

export function checkpoint(id: string, x: number, z: number, yaw: number, triggerId: string, y = 0): CheckpointDef {
  return { id, position: { x, y, z }, yaw, trigger: triggerId };
}

/**
 * Personnel door 1.6m x 2.4m standing in a wall opening at (x, z). `alongX` is true when the wall runs along X.
 * The panel slides along the wall into its own width, so the opening stays fully clear when open.
 */
export function door(
  id: string,
  x: number,
  z: number,
  alongX: boolean,
  label: string,
  navLinks: [string, string][],
  material: MaterialKey = 'steelDark',
  startsOpen = false,
): DoorDef {
  const def: DoorDef = {
    id,
    center: { x, y: 1.2, z },
    size: alongX ? { x: 1.6, y: 2.4, z: 0.1 } : { x: 0.1, y: 2.4, z: 1.6 },
    openOffset: alongX ? { x: 1.6, y: 0, z: 0 } : { x: 0, y: 0, z: 1.6 },
    material,
    label,
    navLinks,
  };
  if (startsOpen) def.startsOpen = true;
  return def;
}

export function camKey(
  px: number,
  py: number,
  pz: number,
  tx: number,
  ty: number,
  tz: number,
  duration: number,
  fov?: number,
): CameraKey {
  const key: CameraKey = { position: { x: px, y: py, z: pz }, target: { x: tx, y: ty, z: tz }, duration };
  if (fov !== undefined) key.fov = fov;
  return key;
}
