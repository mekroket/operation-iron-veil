/**
 * Pure geometry queries over a LevelDefinition, plus the level validator used by tests and CI.
 * No Babylon and no DOM: everything here runs under Vitest.
 *
 * Inflation is applied on the XZ plane only. It models the width of a walker, not its height, so a 12cm step never
 * counts as blocking and a 0.5m test height passes over it.
 */
import type { SurfaceType, Vec3 } from '../core/types';
import { PROP_CATALOG, propColliders } from './propCatalog';
import { MATERIAL_SURFACE } from './types';
import type { LevelDefinition, NavNode } from './types';

export interface WorldCollider {
  center: Vec3;
  size: Vec3;
  yaw: number;
  surface: SurfaceType;
}

/** Trigger ids the mission script depends on. */
export const REQUIRED_TRIGGERS: readonly string[] = [
  'enter_port',
  'checkpoint_near',
  'checkpoint_passed',
  'yard_entry',
  'yard_mid',
  'warehouse_entry',
  'warehouse_mid',
  'annex_entry',
  'server_room',
  'quay_entry',
  'quay_mid',
  'extraction_near',
];

/** Half the width of the player capsule. */
const CAPSULE_RADIUS = 0.35;
/** Height of the capsule test above a position's floor. */
const CHEST_HEIGHT = 1.2;
const NAV_INFLATE = 0.3;
const NAV_TEST_HEIGHTS: readonly number[] = [0.5, 1.2];
/** Furthest a point of interest may sit from the nav graph and still count as reachable. */
const MAX_NODE_DISTANCE = 4;

/** Rotates a prop-local offset into world space. Left-handed: local +Z maps to (sin yaw, cos yaw). */
function rotateLocal(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** Every colliding solid and every prop collider, in world space. Doors are dynamic and excluded. */
export function collectColliders(level: LevelDefinition): WorldCollider[] {
  const colliders: WorldCollider[] = [];
  for (const solid of level.solids) {
    if (solid.collide === false) continue;
    colliders.push({
      center: solid.center,
      size: solid.size,
      yaw: solid.yaw ?? 0,
      surface: MATERIAL_SURFACE[solid.material],
    });
  }
  for (const placed of level.props) {
    const surface = PROP_CATALOG[placed.kind].surface;
    for (const local of propColliders(placed.kind)) {
      const offset = rotateLocal(local.center.x, local.center.z, placed.yaw);
      colliders.push({
        center: {
          x: placed.position.x + offset.x,
          y: placed.position.y + local.center.y,
          z: placed.position.z + offset.z,
        },
        size: local.size,
        yaw: placed.yaw,
        surface,
      });
    }
  }
  return colliders;
}

/** Inverse of `rotateLocal`, relative to the collider centre. */
function toLocal(p: Vec3, collider: WorldCollider): Vec3 {
  const dx = p.x - collider.center.x;
  const dz = p.z - collider.center.z;
  const c = Math.cos(collider.yaw);
  const s = Math.sin(collider.yaw);
  return { x: dx * c - dz * s, y: p.y - collider.center.y, z: dx * s + dz * c };
}

function segmentHitsCollider(a: Vec3, b: Vec3, collider: WorldCollider, inflate: number): boolean {
  const la = toLocal(a, collider);
  const lb = toLocal(b, collider);
  const axes: readonly (readonly [number, number, number])[] = [
    [la.x, lb.x, collider.size.x / 2 + inflate],
    [la.y, lb.y, collider.size.y / 2],
    [la.z, lb.z, collider.size.z / 2 + inflate],
  ];
  let tMin = 0;
  let tMax = 1;
  for (const [start, end, half] of axes) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-9) {
      if (start < -half || start > half) return false;
      continue;
    }
    let t1 = (-half - start) / delta;
    let t2 = (half - start) / delta;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** True when the segment a-b touches any collider. `inflate` widens colliders on XZ only. */
export function segmentHitsColliders(a: Vec3, b: Vec3, colliders: readonly WorldCollider[], inflate = 0): boolean {
  for (const collider of colliders) {
    if (segmentHitsCollider(a, b, collider, inflate)) return true;
  }
  return false;
}

/** True when p is inside any collider. `inflate` widens colliders on XZ only. */
export function pointInsideColliders(p: Vec3, colliders: readonly WorldCollider[], inflate = 0): boolean {
  for (const collider of colliders) {
    const local = toLocal(p, collider);
    if (
      Math.abs(local.x) <= collider.size.x / 2 + inflate &&
      Math.abs(local.y) <= collider.size.y / 2 &&
      Math.abs(local.z) <= collider.size.z / 2 + inflate
    ) {
      return true;
    }
  }
  return false;
}

function withHeight(p: Vec3, height: number): Vec3 {
  return { x: p.x, y: p.y + height, z: p.z };
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

/** Undirected adjacency with the links mirrored, as the nav loader does. Unknown link targets are left out. */
export function navAdjacency(nodes: readonly NavNode[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const navNode of nodes) adjacency.set(navNode.id, new Set());
  for (const navNode of nodes) {
    for (const link of navNode.links) {
      if (!adjacency.has(link)) continue;
      adjacency.get(navNode.id)?.add(link);
      adjacency.get(link)?.add(navNode.id);
    }
  }
  return adjacency;
}

/** Ids reachable from `start`, walking the mirrored graph. */
export function navReachable(adjacency: ReadonlyMap<string, ReadonlySet<string>>, start: string): Set<string> {
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

/** The nav node closest to a point, by 3D distance. Null only for an empty graph. */
export function nearestNavNode(nodes: readonly NavNode[], p: Vec3): { node: NavNode; distance: number } | null {
  let best: { node: NavNode; distance: number } | null = null;
  for (const navNode of nodes) {
    const distance = Math.hypot(navNode.position.x - p.x, navNode.position.y - p.y, navNode.position.z - p.z);
    if (best === null || distance < best.distance) best = { node: navNode, distance };
  }
  return best;
}

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function checkDuplicates(level: LevelDefinition, problems: string[]): void {
  const lists: readonly (readonly [string, readonly string[]])[] = [
    ['nav node', level.nav.map((n) => n.id)],
    ['trigger', level.triggers.map((t) => t.id)],
    ['enemy', level.enemies.map((e) => e.id)],
    ['pickup', level.pickups.map((p) => p.id)],
    ['door', level.doors.map((d) => d.id)],
    ['checkpoint', level.checkpoints.map((c) => c.id)],
  ];
  for (const [label, ids] of lists) {
    for (const duplicate of findDuplicates(ids)) problems.push(`duplicate ${label} id: ${duplicate}`);
  }
}

function checkPositions(level: LevelDefinition, colliders: readonly WorldCollider[], problems: string[]): void {
  const capsule = (label: string, p: Vec3): void => {
    if (pointInsideColliders(withHeight(p, CHEST_HEIGHT), colliders, CAPSULE_RADIUS)) {
      problems.push(`${label} embedded in a collider at chest height (${p.x}, ${p.y}, ${p.z})`);
    }
  };
  capsule('player start', level.playerStart.position);
  capsule('extraction', level.extraction.position);
  for (const spawn of level.enemies) capsule(`enemy ${spawn.id}`, spawn.position);
  for (const point of level.checkpoints) capsule(`checkpoint ${point.id}`, point.position);
  for (const item of level.pickups) {
    if (pointInsideColliders(withHeight(item.position, 0.1), colliders)) {
      problems.push(`pickup ${item.id} embedded in a collider (${item.position.x}, ${item.position.y}, ${item.position.z})`);
    }
    const nearest = nearestNavNode(level.nav, item.position);
    if (nearest === null || nearest.distance > MAX_NODE_DISTANCE * 2) {
      problems.push(`pickup ${item.id} is far from the nav graph`);
    }
  }
}

function checkNav(level: LevelDefinition, colliders: readonly WorldCollider[], problems: string[]): void {
  const byId = new Map<string, NavNode>();
  for (const navNode of level.nav) byId.set(navNode.id, navNode);

  const doorLinks = new Set<string>();
  for (const definition of level.doors) {
    for (const [a, b] of definition.navLinks) {
      doorLinks.add(linkKey(a, b));
      if (!byId.has(a) || !byId.has(b)) problems.push(`door ${definition.id} names a missing nav node: ${a}, ${b}`);
      const linked = byId.get(a)?.links.includes(b) === true || byId.get(b)?.links.includes(a) === true;
      if (!linked) problems.push(`door ${definition.id} names a nav link that does not exist: ${a}-${b}`);
    }
  }

  const tested = new Set<string>();
  for (const navNode of level.nav) {
    for (const height of NAV_TEST_HEIGHTS) {
      if (pointInsideColliders(withHeight(navNode.position, height), colliders, NAV_INFLATE)) {
        problems.push(`nav node ${navNode.id} embedded in a collider at +${height}`);
      }
    }
    for (const link of navNode.links) {
      const other = byId.get(link);
      if (other === undefined) {
        problems.push(`nav node ${navNode.id} links to missing node ${link}`);
        continue;
      }
      const key = linkKey(navNode.id, link);
      if (tested.has(key)) continue;
      tested.add(key);
      if (doorLinks.has(key)) continue;
      for (const height of NAV_TEST_HEIGHTS) {
        const a = withHeight(navNode.position, height);
        const b = withHeight(other.position, height);
        if (segmentHitsColliders(a, b, colliders, NAV_INFLATE)) {
          problems.push(`nav link ${navNode.id}-${link} blocked at +${height}`);
        }
      }
    }
  }

  if (level.nav.length > 0) {
    const adjacency = navAdjacency(level.nav);
    const reachable = navReachable(adjacency, level.nav[0]?.id ?? '');
    for (const navNode of level.nav) {
      if (!reachable.has(navNode.id)) problems.push(`nav node ${navNode.id} is not connected to the graph`);
    }
  }

  for (const spawn of level.enemies) {
    for (const id of spawn.patrol) {
      if (!byId.has(id)) problems.push(`enemy ${spawn.id} patrols missing nav node ${id}`);
    }
  }
}

function checkTriggers(level: LevelDefinition, problems: string[]): void {
  const ids = new Set(level.triggers.map((t) => t.id));
  for (const id of REQUIRED_TRIGGERS) {
    if (!ids.has(id)) problems.push(`required trigger missing: ${id}`);
  }
  for (const point of level.checkpoints) {
    if (!ids.has(point.trigger)) problems.push(`checkpoint ${point.id} uses missing trigger ${point.trigger}`);
  }
}

function checkRoute(level: LevelDefinition, problems: string[]): void {
  const start = nearestNavNode(level.nav, level.playerStart.position);
  const objective = nearestNavNode(level.nav, level.objective.position);
  const extraction = nearestNavNode(level.nav, level.extraction.position);
  if (start === null || objective === null || extraction === null) {
    problems.push('nav graph is empty');
    return;
  }
  if (start.distance > MAX_NODE_DISTANCE * 2) problems.push('player start is far from the nav graph');
  if (objective.distance > MAX_NODE_DISTANCE) problems.push('objective is far from the nav graph');
  if (extraction.distance > MAX_NODE_DISTANCE) problems.push('extraction is far from the nav graph');
  const reachable = navReachable(navAdjacency(level.nav), start.node.id);
  if (!reachable.has(objective.node.id)) problems.push('no nav route from player start to objective');
  const onward = navReachable(navAdjacency(level.nav), objective.node.id);
  if (!onward.has(extraction.node.id)) problems.push('no nav route from objective to extraction');
}

/** Returns every problem found. An empty list means the level is structurally sound. */
export function validateLevel(level: LevelDefinition): string[] {
  const problems: string[] = [];
  const colliders = collectColliders(level);
  checkDuplicates(level, problems);
  checkPositions(level, colliders, problems);
  checkNav(level, colliders, problems);
  checkTriggers(level, problems);
  checkRoute(level, problems);
  return problems;
}
