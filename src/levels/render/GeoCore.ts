/**
 * The vertex-writing half of Geo: arrays, placement, winding and upload. It works directly in vertex arrays, so it needs
 * none of the MeshBuilder side-effect registration, and it fixes winding from the vertex normals, so callers only ever
 * state which way a surface faces.
 */
import { Mesh, VertexData } from '../../engine/bjs';
import type { Scene } from '../../engine/bjs';

export type RGB = readonly [number, number, number];
export type P3 = readonly [number, number, number];

const toLinear = (c: number): number => Math.pow(c, 2.2);

/** Vertex colours multiply albedo after it is linearised, so tints are authored in sRGB and stored linear. */
export const hex = (value: number): RGB => [
  toLinear(((value >> 16) & 255) / 255),
  toLinear(((value >> 8) & 255) / 255),
  toLinear((value & 255) / 255),
];
export const WHITE: RGB = [1, 1, 1];

export const scaled = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: P3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const addScaled = (a: P3, b: P3, k: number): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** A new mesh drawing `source`'s vertex buffers. Unlike clone(), it carries over no thin-instance or material state. */
export function shareGeometry(source: Mesh, name: string, scene: Scene): Mesh {
  const mesh = new Mesh(name, scene);
  source.geometry?.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
}

/** Marks a mesh that will never move, after its transform and thin instances are final. */
export function freezeStatic(mesh: Mesh): void {
  mesh.freezeWorldMatrix();
  mesh.doNotSyncBoundingInfo = true;
}

export class GeoCore {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  color: RGB = WHITE;
  /** Metres per texture repeat. Matches level geometry so texel density is consistent. */
  uvScale = 3;

  private c = 1;
  private s = 0;
  private tx = 0;
  private ty = 0;
  private tz = 0;

  /** Applies to everything written until the next call: yaw about Y, then translate. */
  place(x = 0, y = 0, z = 0, yaw = 0): this {
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
    this.tx = x;
    this.ty = y;
    this.tz = z;
    return this;
  }

  tint(color: RGB): this {
    this.color = color;
    return this;
  }

  vertex(p: P3, n: P3, u: number, v: number, color: RGB = this.color): number {
    const index = this.positions.length / 3;
    this.positions.push(p[0] * this.c + p[2] * this.s + this.tx, p[1] + this.ty, -p[0] * this.s + p[2] * this.c + this.tz);
    this.normals.push(n[0] * this.c + n[2] * this.s, n[1], -n[0] * this.s + n[2] * this.c);
    this.uvs.push(u, v);
    this.colors.push(color[0], color[1], color[2], 1);
    return index;
  }

  /** Adds a triangle facing the side its vertex normals point to. Babylon's default front face is clockwise here. */
  tri(a: number, b: number, c: number): void {
    const P = this.positions;
    const N = this.normals;
    const pa: P3 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]];
    const e1 = sub([P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], pa);
    const e2 = sub([P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], pa);
    const n: P3 = [N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]];
    if (dot(cross(e1, e2), n) > 0) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }

  quadIndices(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** A flat quad. Corners go around the edge; UVs follow its edges in metres unless explicit ones are given. */
  quad(p0: P3, p1: P3, p2: P3, p3: P3, n: P3, uv?: readonly [number, number, number, number], color?: RGB): void {
    const w = Math.hypot(...sub(p1, p0));
    const h = Math.hypot(...sub(p3, p0));
    const [u0, v0, u1, v1] = uv ?? [0, 0, w / this.uvScale, h / this.uvScale];
    this.quadIndices(
      this.vertex(p0, n, u0, v0, color),
      this.vertex(p1, n, u1, v0, color),
      this.vertex(p2, n, u1, v1, color),
      this.vertex(p3, n, u0, v1, color),
    );
  }

  /** Darkens vertices near the ground in place: cheap contact occlusion that seats a prop on the floor. */
  bakeContact(y0: number, y1: number, floor: number): void {
    for (let i = 0; i < this.positions.length / 3; i++) {
      const t = Math.min(1, Math.max(0, (this.positions[i * 3 + 1] - y0) / (y1 - y0)));
      const k = floor + (1 - floor) * t * t * (3 - 2 * t);
      this.colors[i * 4] *= k;
      this.colors[i * 4 + 1] *= k;
      this.colors[i * 4 + 2] *= k;
    }
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  toVertexData(): VertexData {
    const data = new VertexData();
    data.positions = new Float32Array(this.positions);
    data.normals = new Float32Array(this.normals);
    data.uvs = new Float32Array(this.uvs);
    data.colors = new Float32Array(this.colors);
    data.indices = this.positions.length / 3 > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices);
    return data;
  }

  toMesh(name: string, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene);
    this.toVertexData().applyToMesh(mesh, false);
    return mesh;
  }
}
