/** The shape vocabulary used by the batcher, every prop and the dressing, on top of GeoCore's vertex writer. */
import { GeoCore, addScaled, cross, dot, norm, sub } from './GeoCore';
import type { P3, RGB } from './GeoCore';

export { WHITE, freezeStatic, hex, scaled, shareGeometry } from './GeoCore';
export type { P3, RGB } from './GeoCore';

/** Two unit vectors perpendicular to `d`. */
function frame(d: P3): { side: P3; up: P3 } {
  const ref: P3 = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const side = norm(cross(ref, d));
  return { side, up: cross(d, side) };
}

export interface BoxOptions {
  color?: RGB;
  yaw?: number;
  /** Runs the texture's u along the longest edge of each face: planks and grain follow the part. */
  grain?: boolean;
}

/** Normal, u axis, v axis for each box face. */
const FACE_AXES: readonly (readonly [P3, P3, P3])[] = [
  [[1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[0, 0, 1], [-1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [1, 0, 0], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
];

export class Geo extends GeoCore {
  /** Axis-aligned box, optionally yawed about its own centre. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, options: BoxOptions = {}): void {
    const half: P3 = [sx / 2, sy / 2, sz / 2];
    const cy0 = Math.cos(options.yaw ?? 0);
    const sy0 = Math.sin(options.yaw ?? 0);
    const color = options.color ?? this.color;
    const place = (p: P3): P3 => [p[0] * cy0 + p[2] * sy0 + cx, p[1] + cy, -p[0] * sy0 + p[2] * cy0 + cz];
    for (const [n, a, b] of FACE_AXES) {
      const hn = dot(n, n) * Math.abs(dot(n, half));
      const ha = Math.abs(dot(a, half));
      const hb = Math.abs(dot(b, half));
      const swap = options.grain === true && hb > ha;
      const corner = (ka: number, kb: number): number => {
        const local: P3 = [
          n[0] * hn + a[0] * ha * ka + b[0] * hb * kb,
          n[1] * hn + a[1] * ha * ka + b[1] * hb * kb,
          n[2] * hn + a[2] * ha * ka + b[2] * hb * kb,
        ];
        const u = dot(local, a) + (cx + cz) * 0.37;
        const v = dot(local, b) + cy * 0.53;
        const nw: P3 = [n[0] * cy0 + n[2] * sy0, n[1], -n[0] * sy0 + n[2] * cy0];
        return this.vertex(place(local), nw, (swap ? v : u) / this.uvScale, (swap ? u : v) / this.uvScale, color);
      };
      this.quadIndices(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
    }
  }

  /** A square bar between two arbitrary points. Crane lattice, braces, struts. */
  beam(a: P3, b: P3, width: number, height = width, color?: RGB): void {
    const d = norm(sub(b, a));
    const { side, up } = frame(d);
    const hw = width / 2;
    const hh = height / 2;
    const at = (p: P3, ks: number, ku: number): P3 => addScaled(addScaled(p, side, ks * hw), up, ku * hh);
    const sides: readonly [number, number, number, number, P3][] = [
      [1, -1, 1, 1, side],
      [1, 1, -1, 1, up],
      [-1, 1, -1, -1, [-side[0], -side[1], -side[2]]],
      [-1, -1, 1, -1, [-up[0], -up[1], -up[2]]],
    ];
    for (const [s0, u0, s1, u1, n] of sides) {
      this.quad(at(a, s0, u0), at(b, s0, u0), at(b, s1, u1), at(a, s1, u1), n, undefined, color);
    }
    this.quad(at(a, -1, -1), at(a, 1, -1), at(a, 1, 1), at(a, -1, 1), [-d[0], -d[1], -d[2]], undefined, color);
    this.quad(at(b, -1, -1), at(b, 1, -1), at(b, 1, 1), at(b, -1, 1), d, undefined, color);
  }

  /** Round bar between two points, smooth around, with optional flat caps. */
  cyl(a: P3, b: P3, r0: number, r1: number, segments: number, caps = true, color?: RGB): void {
    const axis = sub(b, a);
    const length = Math.hypot(axis[0], axis[1], axis[2]);
    const d = norm(axis);
    const { side, up } = frame(d);
    const slope = (r0 - r1) / (length || 1);
    const around = Math.max(1, Math.round((Math.PI * 2 * Math.max(r0, r1)) / this.uvScale));
    const first = this.positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      const radial: P3 = [side[0] * ca + up[0] * sa, side[1] * ca + up[1] * sa, side[2] * ca + up[2] * sa];
      const n = norm(addScaled(radial, d, slope));
      const u = (i / segments) * around;
      this.vertex(addScaled(a, radial, r0), n, u, 0, color);
      this.vertex(addScaled(b, radial, r1), n, u, length / this.uvScale, color);
    }
    for (let i = 0; i < segments; i++) {
      const k = first + i * 2;
      this.quadIndices(k, k + 1, k + 3, k + 2);
    }
    if (caps) {
      this.disc(a, [-d[0], -d[1], -d[2]], r0, segments, color);
      this.disc(b, d, r1, segments, color);
    }
  }

  /** Filled circle facing along `n`. */
  disc(center: P3, n: P3, radius: number, segments: number, color?: RGB): void {
    const { side, up } = frame(n);
    const k = radius / this.uvScale;
    const hub = this.vertex(center, n, 0.5, 0.5, color);
    const first = this.positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const ca = Math.cos(t);
      const sa = Math.sin(t);
      const p: P3 = [
        center[0] + (side[0] * ca + up[0] * sa) * radius,
        center[1] + (side[1] * ca + up[1] * sa) * radius,
        center[2] + (side[2] * ca + up[2] * sa) * radius,
      ];
      this.vertex(p, n, 0.5 + ca * k, 0.5 + sa * k, color);
    }
    for (let i = 0; i < segments; i++) this.tri(hub, first + i, first + i + 1);
  }

  /** Revolves an (r, y) profile, listed bottom to top, about a vertical axis. Hard edge at every profile point. */
  lathe(x: number, y: number, z: number, profile: readonly (readonly [number, number])[], segments: number, color?: RGB): void {
    const maxR = profile.reduce((m, q) => Math.max(m, q[0]), 0);
    const around = Math.max(1, Math.round((Math.PI * 2 * maxR) / this.uvScale));
    let along = 0;
    for (let k = 0; k + 1 < profile.length; k++) {
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      const dr = r1 - r0;
      const dy = y1 - y0;
      const l = Math.hypot(dr, dy) || 1;
      const nr = dy / l;
      const ny = -dr / l;
      const first = this.positions.length / 3;
      for (let i = 0; i <= segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const ca = Math.cos(t);
        const sa = Math.sin(t);
        const n: P3 = [ca * nr, ny, sa * nr];
        const u = (i / segments) * around;
        this.vertex([x + ca * r0, y + y0, z + sa * r0], n, u, along / this.uvScale, color);
        this.vertex([x + ca * r1, y + y1, z + sa * r1], n, u, (along + l) / this.uvScale, color);
      }
      for (let i = 0; i < segments; i++) {
        const q = first + i * 2;
        this.quadIndices(q, q + 1, q + 3, q + 2);
      }
      along += l;
    }
  }

  /** Extrudes a star-shaped outline along X (outline is z, y) or Z (outline is x, y), flat-shaded, capped by default. */
  extrude(outline: readonly (readonly [number, number])[], axis: 'x' | 'z', from: number, to: number, caps = true, color?: RGB): void {
    const point = (o: readonly [number, number], d: number): P3 => (axis === 'x' ? [d, o[1], o[0]] : [o[0], o[1], d]);
    const count = outline.length;
    const ca = outline.reduce((s, o) => s + o[0], 0) / count;
    const cb = outline.reduce((s, o) => s + o[1], 0) / count;
    for (let i = 0; i < count; i++) {
      const p = outline[i];
      const q = outline[(i + 1) % count];
      const ea = q[0] - p[0];
      const eb = q[1] - p[1];
      const l = Math.hypot(ea, eb) || 1;
      let na = eb / l;
      let nb = -ea / l;
      if (na * ((p[0] + q[0]) / 2 - ca) + nb * ((p[1] + q[1]) / 2 - cb) < 0) {
        na = -na;
        nb = -nb;
      }
      const n: P3 = axis === 'x' ? [0, nb, na] : [na, nb, 0];
      this.quad(point(p, from), point(q, from), point(q, to), point(p, to), n, undefined, color);
    }
    if (!caps) return;
    for (const [d, sign] of [
      [from, Math.sign(from - to)],
      [to, Math.sign(to - from)],
    ] as const) {
      const n: P3 = axis === 'x' ? [sign, 0, 0] : [0, 0, sign];
      const hub = this.vertex(point([ca, cb], d), n, ca / this.uvScale, cb / this.uvScale, color);
      const first = this.positions.length / 3;
      for (const o of outline) this.vertex(point(o, d), n, o[0] / this.uvScale, o[1] / this.uvScale, color);
      for (let i = 0; i < count; i++) this.tri(hub, first + i, first + (i + 1) % count);
    }
  }

  /** Sweeps a circle along a polyline: inflatable tubes, rope coils, curved lamp arms. */
  tube(path: readonly P3[], radius: number, segments: number, closed = false, color?: RGB): void {
    const count = path.length;
    let along = 0;
    const first = this.positions.length / 3;
    const start = norm(closed ? sub(path[1], path[count - 1]) : sub(path[1], path[0]));
    let { side } = frame(start);
    for (let k = 0; k <= (closed ? count : count - 1); k++) {
      const i = k % count;
      const prev = closed ? path[(i + count - 1) % count] : path[Math.max(0, i - 1)];
      const next = closed ? path[(i + 1) % count] : path[Math.min(count - 1, i + 1)];
      const d = norm(sub(next, prev));
      side = norm(addScaled(side, d, -dot(side, d)));
      const up = cross(d, side);
      if (k > 0) along += Math.hypot(...sub(path[i], path[(i + count - 1) % count]));
      for (let j = 0; j <= segments; j++) {
        const t = (j / segments) * Math.PI * 2;
        const n: P3 = [side[0] * Math.cos(t) + up[0] * Math.sin(t), side[1] * Math.cos(t) + up[1] * Math.sin(t), side[2] * Math.cos(t) + up[2] * Math.sin(t)];
        this.vertex(addScaled(path[i], n, radius), n, j / segments, along / this.uvScale, color);
      }
    }
    const rings = closed ? count : count - 1;
    const stride = segments + 1;
    for (let k = 0; k < rings; k++) {
      for (let j = 0; j < segments; j++) {
        const q = first + k * stride + j;
        this.quadIndices(q, q + 1, q + stride + 1, q + stride);
      }
    }
  }

  /** Squashed superellipsoid: `power` under 1 fills out towards a rounded box. Sandbags and cargo sacks. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, around: number, rings: number, power: number, yaw = 0, color?: RGB): void {
    const signedPow = (v: number): number => Math.sign(v) * Math.pow(Math.abs(v), power);
    const c0 = Math.cos(yaw);
    const s0 = Math.sin(yaw);
    const first = this.positions.length / 3;
    for (let i = 0; i <= rings; i++) {
      const lat = (i / rings - 0.5) * Math.PI;
      for (let j = 0; j <= around; j++) {
        const lon = (j / around) * Math.PI * 2;
        const cl = signedPow(Math.cos(lat));
        const lx = rx * cl * signedPow(Math.cos(lon));
        const ly = ry * signedPow(Math.sin(lat));
        const lz = rz * cl * signedPow(Math.sin(lon));
        const nl = norm([lx / (rx * rx), ly / (ry * ry), lz / (rz * rz)]);
        this.vertex(
          [lx * c0 + lz * s0 + cx, ly + cy, -lx * s0 + lz * c0 + cz],
          [nl[0] * c0 + nl[2] * s0, nl[1], -nl[0] * s0 + nl[2] * c0],
          (j / around) * 0.8,
          (i / rings) * 0.45,
          color,
        );
      }
    }
    const stride = around + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < around; j++) {
        const q = first + i * stride + j;
        this.quadIndices(q, q + 1, q + stride + 1, q + stride);
      }
    }
  }

}
