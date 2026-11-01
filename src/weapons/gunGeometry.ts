/**
 * Accumulates procedural primitives into one vertex buffer, so each material of a gun costs one draw call.
 * Pure: no Babylon, no DOM.
 *
 * Winding follows Babylon's left-handed convention, taken from its own box builder: for a triangle (a, b, c)
 * the outward normal is -cross(b - a, c - a).
 */
import type { Vec3 } from '../core/types';

export type Axis = 'x' | 'y' | 'z';
export type Point2 = readonly [number, number];

type Vec = readonly [number, number, number];

const subVec = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossVec = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotVec = (a: Vec, b: Vec): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function unit(a: Vec): Vec {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len > 1e-9 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 1, 0];
}

/** Maps profile coordinates (u, v) and depth w onto an extrusion axis. */
function mapAxis(axis: Axis, u: number, v: number, w: number): Vec {
  if (axis === 'z') return [u, v, w];
  if (axis === 'x') return [w, v, u];
  return [u, w, v];
}

export class GeometryBatch {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  private red = 1;
  private green = 1;
  private blue = 1;

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }
  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Linear colour used for every primitive added after this call. */
  tint(red: number, green: number, blue: number): this {
    this.red = red;
    this.green = green;
    this.blue = blue;
    return this;
  }

  /** Box centred on the point. A chamfer cuts the four edges that run along Z. */
  box(cx: number, cy: number, cz: number, width: number, height: number, depth: number, chamfer = 0): this {
    const hw = width / 2;
    const hh = height / 2;
    const c = Math.min(chamfer, hw * 0.9, hh * 0.9);
    const profile: Point2[] =
      c > 0
        ? [
            [cx + hw - c, cy + hh],
            [cx + hw, cy + hh - c],
            [cx + hw, cy - hh + c],
            [cx + hw - c, cy - hh],
            [cx - hw + c, cy - hh],
            [cx - hw, cy - hh + c],
            [cx - hw, cy + hh - c],
            [cx - hw + c, cy + hh],
          ]
        : [
            [cx + hw, cy + hh],
            [cx + hw, cy - hh],
            [cx - hw, cy - hh],
            [cx - hw, cy + hh],
          ];
    return this.extrude('z', profile, cz - depth / 2, cz + depth / 2);
  }

  /**
   * Prism from a convex side-on outline, given as (z, y) points, centred on x = 0.
   * This is how angled grips, stocks and curved magazines get their silhouette.
   */
  side(profile: readonly Point2[], width: number): this {
    return this.extrude('x', profile, -width / 2, width / 2);
  }

  /**
   * Extrudes a convex profile along an axis from depth `from` to depth `to`, with flat-shaded faces.
   * Profile coordinates are (x, y) along z, (z, y) along x, and (x, z) along y.
   * @param endScale Scales the profile about its centre at the `to` end, for tapered shapes.
   */
  extrude(axis: Axis, profile: readonly Point2[], from: number, to: number, endScale = 1): this {
    let cu = 0;
    let cv = 0;
    for (const point of profile) {
      cu += point[0] / profile.length;
      cv += point[1] / profile.length;
    }
    const near = profile.map((p) => mapAxis(axis, p[0], p[1], from));
    const far = profile.map((p) => mapAxis(axis, cu + (p[0] - cu) * endScale, cv + (p[1] - cv) * endScale, to));

    const direction = Math.sign(to - from) || 1;
    this.face(near, mapAxis(axis, 0, 0, -direction));
    this.face(far, mapAxis(axis, 0, 0, direction));

    for (let i = 0; i < profile.length; i++) {
      const j = (i + 1) % profile.length;
      const midU = (profile[i][0] + profile[j][0]) / 2 - cu;
      const midV = (profile[i][1] + profile[j][1]) / 2 - cv;
      this.face([near[i], near[j], far[j], far[i]], mapAxis(axis, midU, midV, 0));
    }
    return this;
  }

  /** Round bar between two points, smooth-shaded, with optional flat end caps. */
  tube(a: Vec3, b: Vec3, radiusA: number, radiusB: number = radiusA, sides = 8, caps = true): this {
    const start: Vec = [a.x, a.y, a.z];
    const end: Vec = [b.x, b.y, b.z];
    const axis = unit(subVec(end, start));
    const reference: Vec = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const side = unit(crossVec(reference, axis));
    const other = crossVec(axis, side);

    const ringA: Vec[] = [];
    const ringB: Vec[] = [];
    const first = this.vertexCount;
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const dir: Vec = [
        side[0] * Math.cos(angle) + other[0] * Math.sin(angle),
        side[1] * Math.cos(angle) + other[1] * Math.sin(angle),
        side[2] * Math.cos(angle) + other[2] * Math.sin(angle),
      ];
      const pa: Vec = [start[0] + dir[0] * radiusA, start[1] + dir[1] * radiusA, start[2] + dir[2] * radiusA];
      const pb: Vec = [end[0] + dir[0] * radiusB, end[1] + dir[1] * radiusB, end[2] + dir[2] * radiusB];
      ringA.push(pa);
      ringB.push(pb);
      this.vertex(pa, dir);
      this.vertex(pb, dir);
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a0 = first + i * 2;
      const b0 = a0 + 1;
      const a1 = first + j * 2;
      const b1 = a1 + 1;
      this.triangle(a0, a1, b1);
      this.triangle(a0, b1, b0);
    }
    if (caps) {
      this.face(ringA, [-axis[0], -axis[1], -axis[2]]);
      this.face(ringB, axis);
    }
    return this;
  }

  /** Circle of thin bars in the XY plane, used for aperture sights. */
  ring(cx: number, cy: number, cz: number, radius: number, thickness: number, segments = 12): this {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const b = ((i + 1) / segments) * Math.PI * 2;
      this.tube(
        { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, z: cz },
        { x: cx + Math.cos(b) * radius, y: cy + Math.sin(b) * radius, z: cz },
        thickness,
        thickness,
        4,
        false,
      );
    }
    return this;
  }

  private vertex(position: Vec, normal: Vec): number {
    this.positions.push(position[0], position[1], position[2]);
    this.normals.push(normal[0], normal[1], normal[2]);
    this.colors.push(this.red, this.green, this.blue, 1);
    return this.positions.length / 3 - 1;
  }

  /** Adds a triangle, flipping it when its stored normals say it faces the wrong way. */
  private triangle(a: number, b: number, c: number): void {
    const pa = this.positionOf(a);
    const face = crossVec(subVec(this.positionOf(b), pa), subVec(this.positionOf(c), pa));
    const stored: Vec = [this.normals[a * 3], this.normals[a * 3 + 1], this.normals[a * 3 + 2]];
    if (dotVec(face, stored) <= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  private positionOf(index: number): Vec {
    return [this.positions[index * 3], this.positions[index * 3 + 1], this.positions[index * 3 + 2]];
  }

  /** Flat convex polygon, with its normal turned to agree with `outward`. */
  private face(points: readonly Vec[], outward: Vec): void {
    // Newell's method copes with slightly non-planar quads on tapered shapes.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    let normal = unit([nx, ny, nz]);
    if (dotVec(normal, outward) < 0) normal = [-normal[0], -normal[1], -normal[2]];

    const first = this.vertex(points[0], normal);
    for (let i = 1; i < points.length; i++) this.vertex(points[i], normal);
    for (let i = 1; i < points.length - 1; i++) this.triangle(first, first + i, first + i + 1);
  }
}
