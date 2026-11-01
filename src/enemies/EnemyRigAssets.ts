/**
 * Shared geometry and PBR materials of the Black Meridian contractor.
 * One hidden source mesh per part, so any number of enemies batch into a handful of draw calls.
 * Each source's origin is the joint it rotates around.
 */
import { Color3, Mesh, MeshBuilder, PBRMaterial } from '../engine/bjs';
import type { InstancedMesh, Scene } from '../engine/bjs';

export type RigPart =
  | 'head'
  | 'eyes'
  | 'helmet'
  | 'torso'
  | 'carrier'
  | 'pouches'
  | 'hips'
  | 'belt'
  | 'upperArm'
  | 'identifier'
  | 'forearm'
  | 'glove'
  | 'thigh'
  | 'kneePad'
  | 'shin'
  | 'boot'
  | 'rifle'
  | 'rifleMag';

interface Offset {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  rz?: number;
}

export class EnemyRigAssets {
  private readonly scene: Scene;
  private readonly materials: PBRMaterial[] = [];
  private readonly sources = new Map<RigPart, Mesh>();

  constructor(scene: Scene, maxLights: number) {
    this.scene = scene;

    const fatigue = this.material('fatigue', 0.075, 0.08, 0.085, 0.92, 0, maxLights);
    const armour = this.material('armour', 0.13, 0.135, 0.14, 0.62, 0.08, maxLights);
    const webbing = this.material('webbing', 0.095, 0.095, 0.085, 0.85, 0, maxLights);
    const gear = this.material('gear', 0.035, 0.035, 0.038, 0.75, 0, maxLights);
    const shell = this.material('helmet', 0.1, 0.105, 0.11, 0.5, 0.15, maxLights);
    const cloth = this.material('balaclava', 0.028, 0.028, 0.032, 0.95, 0, maxLights);
    const skin = this.material('skin', 0.42, 0.29, 0.22, 0.65, 0, maxLights);
    const steel = this.material('steel', 0.055, 0.057, 0.06, 0.42, 0.75, maxLights);
    const orange = this.material('identifier', 0.62, 0.25, 0.05, 0.7, 0, maxLights);

    this.source('head', cloth, [
      this.cyl(0.1, 0.11, 0.11, { y: 0.045 }),
      this.ball(0.19, 0.235, 0.21, { y: 0.155 }),
    ]);
    this.source('eyes', skin, [this.box(0.125, 0.034, 0.02, { y: 0.178, z: 0.098 })]);
    this.source('helmet', shell, [
      this.ball(0.245, 0.215, 0.27, { y: 0.205 }, 0.6),
      this.box(0.07, 0.035, 0.02, { y: 0.27, z: 0.125 }),
      this.box(0.02, 0.03, 0.14, { x: 0.118, y: 0.235 }),
      this.box(0.02, 0.03, 0.14, { x: -0.118, y: 0.235 }),
      this.cyl(0.075, 0.075, 0.035, { x: 0.112, y: 0.155, rz: Math.PI / 2 }),
      this.cyl(0.075, 0.075, 0.035, { x: -0.112, y: 0.155, rz: Math.PI / 2 }),
    ]);

    this.source('torso', fatigue, [
      this.squashed(this.cyl(0.39, 0.31, 0.4, { y: 0.17 }), 0.62),
      this.ball(0.46, 0.14, 0.24, { y: 0.36 }),
    ]);
    this.source('carrier', armour, [
      this.box(0.31, 0.34, 0.045, { y: 0.17, z: 0.125 }),
      this.box(0.31, 0.34, 0.045, { y: 0.17, z: -0.125 }),
      this.squashed(this.cyl(0.35, 0.35, 0.2, { y: 0.05 }), 0.78),
      this.box(0.05, 0.02, 0.25, { x: 0.105, y: 0.355 }),
      this.box(0.05, 0.02, 0.25, { x: -0.105, y: 0.355 }),
    ]);
    this.source('pouches', webbing, [
      this.box(0.075, 0.125, 0.05, { x: -0.085, y: 0.05, z: 0.168 }),
      this.box(0.075, 0.125, 0.05, { y: 0.05, z: 0.168 }),
      this.box(0.075, 0.125, 0.05, { x: 0.085, y: 0.05, z: 0.168 }),
      this.box(0.13, 0.05, 0.03, { y: 0.26, z: 0.158 }),
      this.box(0.055, 0.135, 0.06, { x: 0.195, y: 0.06 }),
      this.box(0.055, 0.1, 0.07, { x: -0.195, y: 0.05 }),
      this.box(0.17, 0.09, 0.05, { y: 0.09, z: -0.175 }),
    ]);

    this.source('hips', fatigue, [this.ball(0.33, 0.24, 0.23, { y: -0.01 })]);
    this.source('belt', webbing, [
      this.squashed(this.cyl(0.335, 0.335, 0.055, { y: 0.09 }), 0.72),
      this.box(0.06, 0.15, 0.1, { x: 0.185, y: -0.06 }),
    ]);

    this.source('upperArm', fatigue, [
      this.ball(0.12, 0.12, 0.12, {}),
      this.cyl(0.105, 0.085, 0.3, { y: -0.15 }),
    ]);
    this.source('identifier', orange, [
      this.ball(0.127, 0.127, 0.127, { y: 0.004 }, 0.5),
      this.cyl(0.108, 0.104, 0.055, { y: -0.085 }),
    ]);
    this.source('forearm', fatigue, [this.cyl(0.085, 0.068, 0.26, { y: -0.13 })]);
    this.source('glove', gear, [
      this.box(0.074, 0.05, 0.05, { y: -0.27 }),
      this.box(0.07, 0.05, 0.06, { y: -0.315, z: 0.008, rx: 0.5 }),
      this.box(0.022, 0.05, 0.022, { x: 0.038, y: -0.29, z: 0.02 }),
    ]);

    this.source('thigh', fatigue, [this.cyl(0.165, 0.115, 0.44, { y: -0.22 })]);
    this.source('kneePad', armour, [this.box(0.1, 0.12, 0.03, { z: 0.058 })]);
    this.source('shin', fatigue, [this.cyl(0.11, 0.082, 0.43, { y: -0.215 })]);
    this.source('boot', gear, [
      this.cyl(0.092, 0.096, 0.1, { y: 0.01 }),
      this.box(0.094, 0.06, 0.25, { y: -0.04, z: 0.05 }),
      this.box(0.098, 0.022, 0.255, { y: -0.069, z: 0.05 }),
    ]);

    this.source('rifle', steel, [
      this.box(0.05, 0.075, 0.28, { y: 0.03, z: 0.02 }),
      this.box(0.045, 0.055, 0.24, { y: 0.035, z: 0.27 }),
      this.cyl(0.018, 0.018, 0.16, { y: 0.04, z: 0.47, rx: Math.PI / 2 }),
      this.cyl(0.028, 0.028, 0.05, { y: 0.04, z: 0.565, rx: Math.PI / 2 }),
      this.box(0.035, 0.09, 0.18, { y: 0.015, z: -0.21 }),
      this.box(0.04, 0.125, 0.03, { y: 0.005, z: -0.305 }),
      this.box(0.035, 0.09, 0.045, { y: -0.045, z: -0.02, rx: 0.3 }),
      this.box(0.035, 0.05, 0.1, { y: 0.095, z: 0.03 }),
    ]);
    this.source('rifleMag', gear, [this.box(0.03, 0.16, 0.055, { y: -0.07, z: 0.015, rx: -0.22 })]);
  }

  /** Creates an invisible-source instance of a part. The caller owns and disposes the instance. */
  instance(part: RigPart, name: string): InstancedMesh {
    const source = this.sources.get(part);
    if (!source) throw new Error(`EnemyRigAssets: missing part ${part}`);
    const mesh = source.createInstance(name);
    mesh.isPickable = false;
    return mesh;
  }

  dispose(): void {
    for (const source of this.sources.values()) source.dispose();
    this.sources.clear();
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
  }

  private material(
    name: string,
    r: number,
    g: number,
    b: number,
    roughness: number,
    metallic: number,
    maxLights: number,
  ): PBRMaterial {
    const material = new PBRMaterial(`enemy_${name}`, this.scene);
    material.albedoColor = new Color3(r, g, b);
    material.roughness = roughness;
    material.metallic = metallic;
    material.maxSimultaneousLights = maxLights;
    this.materials.push(material);
    return material;
  }

  private source(part: RigPart, material: PBRMaterial, pieces: Mesh[]): void {
    const merged = pieces.length === 1 ? pieces[0] : Mesh.MergeMeshes(pieces, true, true);
    if (!merged) throw new Error(`EnemyRigAssets: could not merge ${part}`);
    merged.name = `enemy_${part}_source`;
    merged.material = material;
    merged.isVisible = false;
    merged.isPickable = false;
    merged.receiveShadows = true;
    this.sources.set(part, merged);
  }

  private place(mesh: Mesh, at: Offset): Mesh {
    mesh.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
    mesh.rotation.set(at.rx ?? 0, 0, at.rz ?? 0);
    mesh.bakeCurrentTransformIntoVertices();
    return mesh;
  }

  private box(width: number, height: number, depth: number, at: Offset): Mesh {
    return this.place(MeshBuilder.CreateBox('part', { width, height, depth }, this.scene), at);
  }

  private cyl(diameterTop: number, diameterBottom: number, height: number, at: Offset): Mesh {
    const options = { diameterTop, diameterBottom, height, tessellation: 10 };
    return this.place(MeshBuilder.CreateCylinder('part', options, this.scene), at);
  }

  private ball(diameterX: number, diameterY: number, diameterZ: number, at: Offset, slice = 1): Mesh {
    const options = { diameterX, diameterY, diameterZ, segments: 8, slice };
    return this.place(MeshBuilder.CreateSphere('part', options, this.scene), at);
  }

  /** Flattens front to back, keeping the vertical axis. */
  private squashed(mesh: Mesh, zScale: number): Mesh {
    mesh.scaling.set(1, 1, zScale);
    mesh.bakeCurrentTransformIntoVertices();
    return mesh;
  }
}
