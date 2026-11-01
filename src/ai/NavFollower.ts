/** Walks a character along NavGraph paths, opening doors on the way. Pure: no Babylon, no DOM. */
import { distanceXZ } from '../core/math';
import type { Vec3 } from '../core/types';
import type { NavGraph } from './NavGraph';

export interface NavDoorsLike {
  isLinkBlocked(nodeA: string, nodeB: string): boolean;
  openLink(nodeA: string, nodeB: string): void;
}

export type FollowStatus = 'moving' | 'waiting' | 'arrived';

/** Seconds to wait at a door that is opening before pushing on anyway. */
const DOOR_WAIT_LIMIT = 2.5;
/** Seconds without getting closer to the waypoint before it is skipped. */
const STUCK_LIMIT = 1.6;
const PROGRESS_EPSILON = 0.2;

export class NavFollower {
  /** Unit direction of travel, valid after update returned 'moving'. */
  dirX = 0;
  dirZ = 0;

  private readonly graph: NavGraph;
  private readonly doors: NavDoorsLike;
  private path: string[] = [];
  private index = 0;
  private finalPoint: Vec3 | null = null;
  private active = false;
  private doorWait = 0;
  private stuckTime = 0;
  private bestDistance = Infinity;

  constructor(graph: NavGraph, doors: NavDoorsLike) {
    this.graph = graph;
    this.doors = doors;
  }

  get isActive(): boolean {
    return this.active;
  }

  stop(): void {
    this.active = false;
    this.path = [];
    this.finalPoint = null;
    this.dirX = 0;
    this.dirZ = 0;
  }

  /** Returns false when the node cannot be reached. */
  goToNode(nodeId: string, from: Vec3): boolean {
    const start = this.graph.nearestNode(from);
    if (!start) return false;
    const path = this.plan(start.id, nodeId);
    if (!path) return false;
    this.begin(path, null);
    return true;
  }

  /** Walks the graph to the node nearest the point, then straight to the point itself. */
  goToPoint(point: Vec3, from: Vec3): boolean {
    const target = { x: point.x, y: point.y, z: point.z };
    const start = this.graph.nearestNode(from);
    const goal = this.graph.nearestNode(point);
    const direct = distanceXZ(from, point);
    if (!start || !goal || direct <= distanceXZ(from, start.position)) {
      this.begin([], target);
      return true;
    }
    const path = this.plan(start.id, goal.id);
    if (!path) return false;
    this.begin(path, target);
    return true;
  }

  update(dt: number, position: Vec3, arriveRadius: number): FollowStatus {
    if (!this.active) return 'arrived';
    this.skipBehindStart(position);

    let waypoint = this.waypoint();
    while (waypoint && distanceXZ(position, waypoint) < arriveRadius) {
      this.advance();
      waypoint = this.waypoint();
    }
    if (!waypoint) return this.finish();

    if (this.isWaitingForDoor(dt)) {
      this.dirX = 0;
      this.dirZ = 0;
      return 'waiting';
    }

    const d = distanceXZ(position, waypoint);
    if (d < this.bestDistance - PROGRESS_EPSILON) {
      this.bestDistance = d;
      this.stuckTime = 0;
    } else {
      this.stuckTime += dt;
      if (this.stuckTime > STUCK_LIMIT) {
        this.advance();
        if (!this.waypoint()) return this.finish();
      }
    }
    this.dirX = (waypoint.x - position.x) / d;
    this.dirZ = (waypoint.z - position.z) / d;
    return 'moving';
  }

  /** Prefers a route that avoids closed doors. Falls back to one through them. */
  private plan(startId: string, goalId: string): string[] | null {
    return (
      this.graph.findPath(startId, goalId, (a, b) => this.doors.isLinkBlocked(a, b)) ??
      this.graph.findPath(startId, goalId)
    );
  }

  private begin(path: string[], finalPoint: Vec3 | null): void {
    this.path = path;
    this.finalPoint = finalPoint;
    this.index = 0;
    this.active = true;
    this.doorWait = 0;
    this.resetProgress();
  }

  private resetProgress(): void {
    this.stuckTime = 0;
    this.bestDistance = Infinity;
  }

  private advance(): void {
    this.index++;
    this.doorWait = 0;
    this.resetProgress();
  }

  private finish(): FollowStatus {
    this.stop();
    return 'arrived';
  }

  /** Does not walk back to the first node when already past it on the way to the second. */
  private skipBehindStart(position: Vec3): void {
    if (this.index !== 0 || this.path.length < 2) return;
    const first = this.graph.node(this.path[0]);
    const second = this.graph.node(this.path[1]);
    if (first && second && distanceXZ(position, second.position) <= distanceXZ(first.position, second.position)) {
      this.index = 1;
      this.resetProgress();
    }
  }

  private waypoint(): Vec3 | null {
    if (this.index < this.path.length) return this.graph.node(this.path[this.index])?.position ?? null;
    return this.index === this.path.length ? this.finalPoint : null;
  }

  private isWaitingForDoor(dt: number): boolean {
    if (this.index < 1 || this.index >= this.path.length) return false;
    const a = this.path[this.index - 1];
    const b = this.path[this.index];
    if (!this.doors.isLinkBlocked(a, b)) {
      this.doorWait = 0;
      return false;
    }
    if (this.doorWait === 0) this.doors.openLink(a, b);
    this.doorWait += dt;
    this.resetProgress();
    return this.doorWait < DOOR_WAIT_LIMIT;
  }
}
