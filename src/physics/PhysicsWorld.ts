import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import type { ICharacterBody, IDoorBlocker, IPhysicsWorld, WorldHit } from '../core/contracts';
import type { SurfaceType, Vec3 } from '../core/types';
import {
  HavokPlugin,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsRaycastResult,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  Quaternion,
  TransformNode,
  Vector3,
} from '../engine/bjs';
import type { Scene } from '../engine/bjs';
import type { WorldCollider } from '../levels/levelGeometry';
import { CharacterBody } from './CharacterBody';

/** Static collision world plus the queries gameplay uses. Havok is the only source of collision truth. */
export class PhysicsWorld implements IPhysicsWorld {
  private readonly surfaces = new Map<PhysicsBody, SurfaceType>();
  private readonly nodes: TransformNode[] = [];
  private readonly ray = new PhysicsRaycastResult();
  private readonly rayFrom = new Vector3();
  private readonly rayTo = new Vector3();

  private constructor(
    private readonly scene: Scene,
    private readonly plugin: HavokPlugin,
  ) {}

  static async create(scene: Scene): Promise<PhysicsWorld> {
    const havok = await HavokPhysics({ locateFile: () => havokWasmUrl });
    const plugin = new HavokPlugin(true, havok);
    if (!scene.enablePhysics(new Vector3(0, -18, 0), plugin)) {
      throw new Error('Havok physics failed to start.');
    }
    return new PhysicsWorld(scene, plugin);
  }

  /** Builds one static body per surface type, each holding a compound of boxes. */
  buildStatic(colliders: readonly WorldCollider[]): void {
    const bySurface = new Map<SurfaceType, WorldCollider[]>();
    for (const collider of colliders) {
      const list = bySurface.get(collider.surface);
      if (list) list.push(collider);
      else bySurface.set(collider.surface, [collider]);
    }
    for (const [surface, list] of bySurface) {
      const node = new TransformNode(`static-${surface}`, this.scene);
      const container = new PhysicsShapeContainer(this.scene);
      for (const c of list) {
        const rotation = Quaternion.FromEulerAngles(0, c.yaw, 0);
        const box = new PhysicsShapeBox(
          new Vector3(c.center.x, c.center.y, c.center.z),
          rotation,
          new Vector3(c.size.x, c.size.y, c.size.z),
          this.scene,
        );
        container.addChild(box);
      }
      const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
      body.shape = container;
      this.surfaces.set(body, surface);
      this.nodes.push(node);
    }
  }

  raycast(from: Vec3, to: Vec3): WorldHit | null {
    this.cast(from, to);
    if (!this.ray.hasHit) return null;
    const p = this.ray.hitPointWorld;
    const n = this.ray.hitNormalWorld;
    const body = this.ray.body;
    return {
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: n.x, y: n.y, z: n.z },
      distance: Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z),
      surface: (body && this.surfaces.get(body)) ?? 'concrete',
    };
  }

  lineOfSight(from: Vec3, to: Vec3): boolean {
    this.cast(from, to);
    return !this.ray.hasHit;
  }

  createCharacter(feet: Vec3, height: number, radius: number): ICharacterBody {
    return new CharacterBody(this.scene, this, feet, height, radius);
  }

  /** A door panel's collision. It exists only while blocking. */
  createDoorBlocker(center: Vec3, size: Vec3, surface: SurfaceType = 'metal'): IDoorBlocker {
    const node = new TransformNode('door-blocker', this.scene);
    node.position.set(center.x, center.y, center.z);
    this.nodes.push(node);
    let body: PhysicsBody | null = null;
    const setBlocking = (blocking: boolean): void => {
      if (blocking === (body !== null)) return;
      if (blocking) {
        const created = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
        created.shape = new PhysicsShapeBox(
          Vector3.Zero(),
          Quaternion.Identity(),
          new Vector3(size.x, size.y, size.z),
          this.scene,
        );
        this.surfaces.set(created, surface);
        body = created;
      } else if (body) {
        this.surfaces.delete(body);
        body.dispose();
        body = null;
      }
    };
    setBlocking(true);
    return { setBlocking };
  }

  surfaceBelow(feet: Vec3): SurfaceType | null {
    this.cast({ x: feet.x, y: feet.y + 0.2, z: feet.z }, { x: feet.x, y: feet.y - 0.5, z: feet.z });
    if (!this.ray.hasHit || !this.ray.body) return null;
    return this.surfaces.get(this.ray.body) ?? null;
  }

  hasHeadroom(feet: Vec3, top: number, radius: number): boolean {
    const r = radius * 0.8;
    const y = feet.y + 1;
    const offsets: readonly [number, number][] = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    return offsets.every(([dx, dz]) =>
      this.lineOfSight({ x: feet.x + dx, y, z: feet.z + dz }, { x: feet.x + dx, y: feet.y + top, z: feet.z + dz }),
    );
  }

  dispose(): void {
    for (const body of this.surfaces.keys()) body.dispose();
    this.surfaces.clear();
    for (const node of this.nodes) node.dispose();
    this.nodes.length = 0;
    this.scene.disablePhysicsEngine();
  }

  private cast(from: Vec3, to: Vec3): void {
    this.rayFrom.set(from.x, from.y, from.z);
    this.rayTo.set(to.x, to.y, to.z);
    this.plugin.raycast(this.rayFrom, this.rayTo, this.ray);
  }
}
