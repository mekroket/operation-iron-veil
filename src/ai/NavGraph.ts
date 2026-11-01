/** Waypoint graph built from LevelDefinition.nav. Pure: no Babylon, no DOM. */
import { distance } from '../core/math';
import type { Vec3 } from '../core/types';
import type { NavNode } from '../levels/types';

export interface GraphNode {
  readonly id: string;
  readonly position: Vec3;
  readonly links: readonly string[];
  readonly cover: boolean;
  /** Direction a defender here faces, or null when the level gives none. */
  readonly coverYaw: number | null;
}

export type BlockedLink = (nodeA: string, nodeB: string) => boolean;

export interface CoverQuery {
  /** Line-of-sight test from this node to whatever the caller cares about. Omit to ignore sight. */
  hasLineOfSight?: (node: GraphNode) => boolean;
  /** With `hasLineOfSight`: true finds a firing position, false finds a hiding place. Defaults to true. */
  wantLineOfSight?: boolean;
  isOccupied?: (nodeId: string) => boolean;
  maxDistance?: number;
  /** Extra filter, applied before the more expensive line-of-sight test. */
  accept?: (node: GraphNode) => boolean;
  /** Upper bound on line-of-sight callbacks for this query. Defaults to 8. */
  maxLosChecks?: number;
}

export class NavGraph {
  readonly nodes: readonly GraphNode[];
  private readonly byId = new Map<string, GraphNode>();
  private readonly coverNodes: readonly GraphNode[];

  constructor(source: readonly NavNode[]) {
    const known = new Set(source.map((n) => n.id));
    const links = new Map<string, Set<string>>();
    for (const n of source) links.set(n.id, new Set());
    for (const n of source) {
      for (const other of n.links) {
        if (other === n.id || !known.has(other)) continue;
        links.get(n.id)?.add(other);
        links.get(other)?.add(n.id);
      }
    }
    const built: GraphNode[] = source.map((n) => ({
      id: n.id,
      position: { x: n.position.x, y: n.position.y, z: n.position.z },
      links: [...(links.get(n.id) ?? [])],
      cover: n.cover === true,
      coverYaw: n.coverYaw ?? null,
    }));
    for (const n of built) this.byId.set(n.id, n);
    this.nodes = built;
    this.coverNodes = built.filter((n) => n.cover);
  }

  node(id: string): GraphNode | undefined {
    return this.byId.get(id);
  }

  nearestNode(position: Vec3, filter?: (node: GraphNode) => boolean): GraphNode | null {
    let best: GraphNode | null = null;
    let bestDistance = Infinity;
    for (const n of this.nodes) {
      const d = distance(position, n.position);
      if (d < bestDistance && (!filter || filter(n))) {
        best = n;
        bestDistance = d;
      }
    }
    return best;
  }

  nodesWithin(position: Vec3, radius: number): GraphNode[] {
    return this.nodes.filter((n) => distance(position, n.position) <= radius);
  }

  /** A* over the graph. Returns node ids from start to goal inclusive, or null when unreachable. */
  findPath(startId: string, goalId: string, isBlocked?: BlockedLink): string[] | null {
    const goal = this.byId.get(goalId);
    if (!goal || !this.byId.has(startId)) return null;
    if (startId === goalId) return [startId];

    const open = new Set<string>([startId]);
    const closed = new Set<string>();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startId, 0]]);
    const fScore = new Map<string, number>();
    const startNode = this.byId.get(startId);
    fScore.set(startId, startNode ? distance(startNode.position, goal.position) : 0);

    while (open.size > 0) {
      let currentId = '';
      let lowest = Infinity;
      for (const id of open) {
        const f = fScore.get(id) ?? Infinity;
        if (f < lowest) {
          lowest = f;
          currentId = id;
        }
      }
      if (currentId === goalId) return this.rebuild(cameFrom, goalId);
      open.delete(currentId);
      closed.add(currentId);

      const current = this.byId.get(currentId);
      if (!current) continue;
      const currentG = gScore.get(currentId) ?? Infinity;
      for (const nextId of current.links) {
        if (closed.has(nextId) || isBlocked?.(currentId, nextId) === true) continue;
        const next = this.byId.get(nextId);
        if (!next) continue;
        const tentative = currentG + distance(current.position, next.position);
        if (tentative >= (gScore.get(nextId) ?? Infinity)) continue;
        cameFrom.set(nextId, currentId);
        gScore.set(nextId, tentative);
        fScore.set(nextId, tentative + distance(next.position, goal.position));
        open.add(nextId);
      }
    }
    return null;
  }

  /** Total length of a path in metres. Returns Infinity when an id is unknown. */
  pathLength(path: readonly string[]): number {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const a = this.byId.get(path[i - 1]);
      const b = this.byId.get(path[i]);
      if (!a || !b) return Infinity;
      total += distance(a.position, b.position);
    }
    return total;
  }

  /** Nearest unoccupied cover node that matches the query. Sight is tested nearest first, and only as often as needed. */
  nearestCover(position: Vec3, query: CoverQuery = {}): GraphNode | null {
    const maxDistance = query.maxDistance ?? Infinity;
    const candidates: { node: GraphNode; d: number }[] = [];
    for (const node of this.coverNodes) {
      const d = distance(position, node.position);
      if (d > maxDistance) continue;
      if (query.isOccupied?.(node.id) === true) continue;
      if (query.accept && !query.accept(node)) continue;
      candidates.push({ node, d });
    }
    candidates.sort((a, b) => a.d - b.d);

    const wantSight = query.wantLineOfSight ?? true;
    let budget = query.maxLosChecks ?? 8;
    for (const { node } of candidates) {
      if (!query.hasLineOfSight) return node;
      if (budget-- <= 0) return null;
      if (query.hasLineOfSight(node) === wantSight) return node;
    }
    return null;
  }

  private rebuild(cameFrom: ReadonlyMap<string, string>, goalId: string): string[] {
    const path = [goalId];
    let cursor = cameFrom.get(goalId);
    while (cursor !== undefined) {
      path.push(cursor);
      cursor = cameFrom.get(cursor);
    }
    return path.reverse();
  }
}
