import { describe, expect, it } from 'vitest';
import {
  REQUIRED_TRIGGERS,
  collectColliders,
  navAdjacency,
  navReachable,
  nearestNavNode,
  pointInsideColliders,
  segmentHitsColliders,
  validateLevel,
} from '../src/levels/levelGeometry';
import type { WorldCollider } from '../src/levels/levelGeometry';
import { SILENT_BREAKWATER as level } from '../src/levels/silentBreakwater';
import type { NavNode, TriggerZone } from '../src/levels/types';

/** Fight areas as XZ rectangles [x1, z1, x2, z2]. */
const FIGHT_ZONES: Record<string, [number, number, number, number]> = {
  checkpoint: [-90, -24, -64, 24],
  yard: [-64, -36, 0, 24],
  warehouse: [0, -22, 60, 10],
  annex: [60, -10, 84, 10],
  quay: [60, -36, 108, 24],
};

/** Triggers crossed after the objective, on the way out to the pier. */
const AFTER_OBJECTIVE = new Set(['quay_entry', 'quay_mid', 'extraction_near']);

function nodeId(p: { x: number; y: number; z: number }): string {
  const nearest = nearestNavNode(level.nav, p);
  if (nearest === null) throw new Error('empty nav graph');
  return nearest.node.id;
}

/** True when the XZ projection of a nav link passes through a trigger box. */
function linkCrossesTrigger(a: NavNode, b: NavNode, zone: TriggerZone): boolean {
  let tMin = 0;
  let tMax = 1;
  const axes: readonly (readonly [number, number, number, number])[] = [
    [a.position.x, b.position.x, zone.center.x, zone.size.x / 2],
    [a.position.z, b.position.z, zone.center.z, zone.size.z / 2],
  ];
  for (const [from, to, center, half] of axes) {
    const delta = to - from;
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(from - center) > half) return false;
      continue;
    }
    const t1 = (center - half - from) / delta;
    const t2 = (center + half - from) / delta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) return false;
  }
  return true;
}

function isIndoors(p: { x: number; z: number }): boolean {
  const inWarehouse = p.x >= 0 && p.x <= 60 && p.z >= -22 && p.z <= 10;
  const inAnnex = p.x > 60 && p.x <= 84 && p.z >= -10 && p.z <= 10;
  return inWarehouse || inAnnex;
}

describe('level geometry helpers', () => {
  const unit: WorldCollider = {
    center: { x: 0, y: 0, z: 0 },
    size: { x: 2, y: 2, z: 10 },
    yaw: Math.PI / 2,
    surface: 'metal',
  };

  it('honours yaw: a long box turned a quarter lies along X', () => {
    expect(pointInsideColliders({ x: 4, y: 0, z: 0 }, [unit])).toBe(true);
    expect(pointInsideColliders({ x: 0, y: 0, z: 4 }, [unit])).toBe(false);
  });

  it('inflates on XZ only', () => {
    expect(pointInsideColliders({ x: 0, y: 0, z: 1.2 }, [unit], 0.3)).toBe(true);
    expect(pointInsideColliders({ x: 0, y: 1.2, z: 0 }, [unit], 0.3)).toBe(false);
  });

  it('finds segment hits and misses', () => {
    const across = segmentHitsColliders({ x: 0, y: 0, z: -3 }, { x: 0, y: 0, z: 3 }, [unit]);
    const past = segmentHitsColliders({ x: 6, y: 0, z: -3 }, { x: 6, y: 0, z: 3 }, [unit]);
    expect(across).toBe(true);
    expect(past).toBe(false);
  });

  it('transforms prop colliders by position and yaw', () => {
    const colliders = collectColliders({
      ...level,
      solids: [],
      props: [{ kind: 'truck', position: { x: 10, y: 0, z: 0 }, yaw: Math.PI / 2 }],
    });
    expect(colliders).toHaveLength(2);
    // The truck cab sits 2.9m ahead of the base centre, along +X at this yaw.
    expect(colliders[0]?.center.x).toBeCloseTo(12.9);
    expect(colliders[0]?.center.z).toBeCloseTo(0);
  });
});

describe('Silent Breakwater', () => {
  it('passes validateLevel', () => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('has 30 to 38 enemies in the named groups', () => {
    expect(level.enemies.length).toBeGreaterThanOrEqual(30);
    expect(level.enemies.length).toBeLessThanOrEqual(38);
    const groups = new Set(level.enemies.map((e) => e.group));
    expect([...groups].sort()).toEqual(
      ['annex', 'checkpoint', 'quay', 'quay_reinforce', 'warehouse', 'warehouse_reinforce', 'yard_a', 'yard_b'].sort(),
    );
    const patrolling = level.enemies.filter((e) => e.patrol.length > 0).length;
    expect(patrolling * 2).toBeGreaterThanOrEqual(level.enemies.length);
  });

  it('has every required trigger, and none can be bypassed on the nav graph', () => {
    const byId = new Map(level.nav.map((n) => [n.id, n]));
    const start = nodeId(level.playerStart.position);
    const objective = nodeId(level.objective.position);
    const extraction = nodeId(level.extraction.position);

    for (const id of REQUIRED_TRIGGERS) {
      const zone = level.triggers.find((t) => t.id === id);
      expect(zone, id).toBeDefined();
      if (zone === undefined) continue;

      const late = AFTER_OBJECTIVE.has(id);
      const adjacency = navAdjacency(level.nav);
      for (const [from, neighbours] of adjacency) {
        for (const to of [...neighbours]) {
          const a = byId.get(from);
          const b = byId.get(to);
          if (a !== undefined && b !== undefined && linkCrossesTrigger(a, b, zone)) neighbours.delete(to);
        }
      }
      const reached = navReachable(adjacency, late ? objective : start);
      expect(reached.has(late ? extraction : objective), `route avoids ${id}`).toBe(false);
    }
  });

  it('connects start, objective and extraction', () => {
    const adjacency = navAdjacency(level.nav);
    const reachable = navReachable(adjacency, nodeId(level.playerStart.position));
    expect(reachable.size).toBe(level.nav.length);
    expect(reachable.has(nodeId(level.objective.position))).toBe(true);
    expect(reachable.has(nodeId(level.extraction.position))).toBe(true);
  });

  it('keeps nav size in the target range', () => {
    expect(level.nav.length).toBeGreaterThanOrEqual(90);
    expect(level.nav.length).toBeLessThanOrEqual(150);
  });

  it('has cover nodes at every fight', () => {
    for (const [zone, [x1, z1, x2, z2]] of Object.entries(FIGHT_ZONES)) {
      const cover = level.nav.filter(
        (n) =>
          n.cover === true &&
          n.coverYaw !== undefined &&
          n.position.x >= x1 &&
          n.position.x <= x2 &&
          n.position.z >= z1 &&
          n.position.z <= z2,
      );
      expect(cover.length, zone).toBeGreaterThanOrEqual(3);
    }
  });

  it('respects light density: 3 in the open and 5 indoors within 25m', () => {
    for (const center of level.lights) {
      const indoors = isIndoors(center.position);
      const near = level.lights.filter(
        (other) =>
          isIndoors(other.position) === indoors &&
          Math.hypot(other.position.x - center.position.x, other.position.z - center.position.z) <= 25,
      );
      expect(near.length, `${center.kind} at ${center.position.x}, ${center.position.z}`).toBeLessThanOrEqual(indoors ? 5 : 3);
    }
  });

  it('places 12 to 16 pickups and the four checkpoints', () => {
    expect(level.pickups.length).toBeGreaterThanOrEqual(12);
    expect(level.pickups.length).toBeLessThanOrEqual(16);
    expect(level.checkpoints.map((c) => c.id).sort()).toEqual(['cp_annex', 'cp_checkpoint', 'cp_quay', 'cp_warehouse']);
  });

  it('leaves clear space in front of the data terminal', () => {
    const colliders = collectColliders(level);
    const { position, yaw } = level.objective;
    for (const reach of [0.9, 1.5, 2.5]) {
      const standing = {
        x: position.x + Math.sin(yaw) * reach,
        y: position.y + 1.2,
        z: position.z + Math.cos(yaw) * reach,
      };
      expect(pointInsideColliders(standing, colliders, 0.35), `${reach}m in front`).toBe(false);
    }
    expect(level.props.some((p) => p.kind === 'dataTerminal')).toBe(true);
  });

  it('ends the intro at the player eye, looking along the player yaw', () => {
    const last = level.cinematics.intro[level.cinematics.intro.length - 1];
    expect(last).toBeDefined();
    if (last === undefined) return;
    const start = level.playerStart;
    expect(last.position.x).toBeCloseTo(start.position.x);
    expect(last.position.y).toBeCloseTo(start.position.y + 1.65);
    expect(last.position.z).toBeCloseTo(start.position.z);
    expect(Math.atan2(last.target.x - last.position.x, last.target.z - last.position.z)).toBeCloseTo(start.yaw);
    expect(level.cinematics.menu.length).toBeGreaterThanOrEqual(4);
  });
});
