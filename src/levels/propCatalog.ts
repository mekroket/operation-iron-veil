/**
 * Every placeable prop: its footprint and collision. Pure data shared by level design, physics and rendering.
 * The renderer must model each prop inside the size given here so what you see is what you collide with.
 * All boxes are relative to the prop's base centre, before yaw.
 */
import type { SurfaceType, Vec3 } from '../core/types';

export interface PropCollider {
  center: Vec3;
  size: Vec3;
}

export interface PropSpec {
  /** Overall width (x), height (y), depth (z) in metres. */
  size: Vec3;
  surface: SurfaceType;
  /** Defaults to one box filling `size`. Empty array = no collision. */
  colliders?: PropCollider[];
  /** Blocks line of sight and bullets. Default true. */
  castShadow?: boolean;
  /** Variants the renderer supports. Default 1. */
  variants?: number;
}

const s = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const PROP_CATALOG = {
  /** ISO 40-foot shipping container. Variants: 0 rust red, 1 navy, 2 teal, 3 dirty white. */
  container: { size: s(2.44, 2.59, 12.19), surface: 'metal', castShadow: true, variants: 4 },
  /** ISO 20-foot shipping container. Same variants. */
  containerShort: { size: s(2.44, 2.59, 6.06), surface: 'metal', castShadow: true, variants: 4 },
  /** Wooden shipping crate. Good waist-high cover. */
  crate: { size: s(1.2, 1.1, 1.2), surface: 'wood', castShadow: true, variants: 2 },
  crateLarge: { size: s(1.8, 1.6, 1.8), surface: 'wood', castShadow: true },
  /** Steel drum. Variants: 0 blue, 1 rust, 2 yellow hazard. */
  barrel: { size: s(0.6, 0.9, 0.6), surface: 'metal', castShadow: true, variants: 3 },
  pallet: { size: s(1.2, 0.15, 1.0), surface: 'wood', colliders: [] },
  palletStack: { size: s(1.2, 1.0, 1.0), surface: 'wood', castShadow: true },
  /** Waist-high sandbag wall segment. */
  sandbags: { size: s(2.4, 1.1, 0.8), surface: 'gravel', castShadow: true },
  /** Concrete traffic barrier. */
  jerseyBarrier: { size: s(3.0, 0.95, 0.6), surface: 'concrete', castShadow: true },
  /** Gate arm in the lowered position. Only the post collides so the player can duck under the arm visually. */
  boomGate: {
    size: s(6.0, 1.3, 0.5),
    surface: 'metal',
    castShadow: true,
    colliders: [{ center: s(-2.8, 0.55, 0), size: s(0.4, 1.1, 0.4) }],
  },
  /** Prefab sentry hut. Solid: the player cannot enter it. */
  guardBooth: { size: s(2.4, 2.8, 2.4), surface: 'metal', castShadow: true },
  /** 9m street lamp with sodium head. Only the pole collides. */
  lampPost: {
    size: s(1.8, 9.0, 0.4),
    surface: 'metal',
    castShadow: true,
    colliders: [{ center: s(0, 4.5, 0), size: s(0.3, 9.0, 0.3) }],
  },
  forklift: {
    size: s(1.2, 2.2, 3.0),
    surface: 'metal',
    castShadow: true,
    colliders: [{ center: s(0, 1.1, -0.2), size: s(1.2, 2.2, 2.2) }],
  },
  bollard: { size: s(0.3, 1.0, 0.3), surface: 'metal' },
  /** Chain link fence panel, 4m wide. Blocks movement. Bullets and sight are also stopped for simplicity. */
  fencePanel: { size: s(4.0, 3.0, 0.12), surface: 'metal' },
  /** Warehouse pallet racking bay. Tall, blocks sight except for gaps the renderer shows. */
  shelfRack: { size: s(3.0, 5.0, 1.2), surface: 'metal', castShadow: true },
  desk: { size: s(1.6, 0.78, 0.8), surface: 'wood' },
  /** Tall server cabinet with blinking LEDs. */
  serverRack: { size: s(0.8, 2.1, 1.1), surface: 'metal' },
  /** Ship-to-shore crane. Four legs collide, the rest towers overhead. */
  craneGantry: {
    size: s(18.0, 42.0, 26.0),
    surface: 'metal',
    castShadow: true,
    colliders: [
      { center: s(-8.5, 8, -11), size: s(1.2, 16, 1.2) },
      { center: s(8.5, 8, -11), size: s(1.2, 16, 1.2) },
      { center: s(-8.5, 8, 11), size: s(1.2, 16, 1.2) },
      { center: s(8.5, 8, 11), size: s(1.2, 16, 1.2) },
    ],
  },
  /** Rigid inflatable assault boat. No collision: it sits in the water beside the jetty. */
  rhib: { size: s(2.6, 1.6, 7.5), surface: 'metal', colliders: [] },
  pipeBundle: { size: s(2.0, 1.0, 5.0), surface: 'metal', castShadow: true },
  cableSpool: { size: s(1.4, 1.0, 1.4), surface: 'wood', castShadow: true },
  /** Stack of tyres used as quay fender. */
  tyreStack: { size: s(0.9, 0.9, 0.9), surface: 'gravel' },
  /** Wall-mounted or free-standing warning sign. No collision. */
  warningSign: { size: s(0.9, 1.6, 0.1), surface: 'metal', colliders: [] },
  /** Generator or compressor unit, chest high. Good cover. */
  generator: { size: s(2.2, 1.5, 1.1), surface: 'metal', castShadow: true },
  /** Objective data terminal. */
  dataTerminal: { size: s(1.0, 1.5, 0.6), surface: 'metal' },
  /** Bollard with mooring rope. Decorative quay detail. */
  mooringCleat: { size: s(0.5, 0.5, 0.5), surface: 'metal' },
  /** Flatbed truck for cover in exterior spaces. */
  truck: {
    size: s(2.5, 3.1, 8.0),
    surface: 'metal',
    castShadow: true,
    colliders: [
      { center: s(0, 1.55, 2.9), size: s(2.5, 3.1, 2.2) },
      { center: s(0, 0.8, -1.1), size: s(2.5, 1.6, 5.8) },
    ],
  },
} satisfies Record<string, PropSpec>;

export type PropKind = keyof typeof PROP_CATALOG;

/** Colliders of a placed prop in its local frame. */
export function propColliders(kind: PropKind): PropCollider[] {
  const spec: PropSpec = PROP_CATALOG[kind];
  return spec.colliders ?? [{ center: { x: 0, y: spec.size.y / 2, z: 0 }, size: spec.size }];
}
