/** What a prop builder writes into: one Geo per surface, so each surface becomes one thin-instanced draw call. */
import type { DecalName } from '../decalAtlas';
import { decalUV } from '../decalAtlas';
import { Geo, hex } from '../Geo';
import type { P3 } from '../Geo';
import type { SurfaceKey } from '../materialLibrary';

export class PropBuild {
  readonly parts = new Map<SurfaceKey, Geo>();

  geo(surface: SurfaceKey, uvScale = 3): Geo {
    let geo = this.parts.get(surface);
    if (!geo) {
      geo = new Geo();
      geo.uvScale = uvScale;
      this.parts.set(surface, geo);
    }
    return geo;
  }
}

export type PropBuilder = (b: PropBuild, variant: number) => void;

export type Facing = 'x+' | 'x-' | 'z+' | 'z-';

const FACING: Record<Facing, { n: P3; right: P3 }> = {
  // `right` is the viewer's right when looking at that face, in Babylon's left-handed frame.
  'z+': { n: [0, 0, 1], right: [-1, 0, 0] },
  'z-': { n: [0, 0, -1], right: [1, 0, 0] },
  'x+': { n: [1, 0, 0], right: [0, 0, 1] },
  'x-': { n: [-1, 0, 0], right: [0, 0, -1] },
};

/** A printed rectangle from the atlas, read the right way round from outside. */
export function plate(b: PropBuild, decal: DecalName, center: P3, facing: Facing, width: number, height: number): void {
  const { n, right } = FACING[facing];
  const hw = width / 2;
  const hh = height / 2;
  const at = (kr: number, ky: number): P3 => [center[0] + right[0] * hw * kr, center[1] + hh * ky, center[2] + right[2] * hw * kr];
  b.geo('decals').quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), n, decalUV(decal));
}

/** Weathered industrial palette, sRGB. */
export const PAINT = {
  rustRed: hex(0x7a3424),
  navy: hex(0x223550),
  teal: hex(0x235f60),
  dirtyWhite: hex(0xb4b0a2),
  drumBlue: hex(0x234c76),
  hazardYellow: hex(0xc79b1f),
  machineGrey: hex(0x4b5157),
  darkSteel: hex(0x2a2e33),
  black: hex(0x101214),
  olive: hex(0x3f4a38),
  rackBlue: hex(0x254a7c),
  rackOrange: hex(0xbc5a1c),
  craneBlue: hex(0x35566e),
  boothWhite: hex(0xa8aca6),
  truckBlue: hex(0x2f4a5e),
  sackTan: hex(0x8c7d5c),
  cardboard: hex(0x8d7350),
  inner: hex(0x0c0c0d),
} as const;
