/**
 * Procedural contractor: a TransformNode hierarchy of instanced primitives, animated entirely from code.
 * Legs and arms are solved with two-bone IK in rigMath.ts, so feet stay planted and hands stay on the rifle.
 */
import { clamp, damp, lerp, saturate } from '../core/math';
import type { Vec3 } from '../core/types';
import { Quaternion, TransformNode } from '../engine/bjs';
import type { AbstractMesh, Scene } from '../engine/bjs';
import type { EnemyRigAssets, RigPart } from './EnemyRigAssets';
import { easeInQuad, rotateXY, smoothStep, solveArm, solveLeg } from './rigMath';
import type { LegPose, Quat } from './rigMath';
import {
  AIM, ANKLE_HEIGHT, CHEST_FROM_HIP, CROUCH_HIP, FALL_TIME, FOREARM, GRIP_POINT, HIP_X, POLE_L, POLE_R, POUCH_POINT,
  READY, RELOAD, reloadTrip, SETTLE_TIME, SHIN, SHOULDER_L, SHOULDER_R, STAND_HIP, SUPPORT_POINT, THIGH, UPPER_ARM,
} from './rigPoses';
import type { RigInput } from './rigPoses';

export type { RigInput } from './rigPoses';

const scratch: Vec3 = { x: 0, y: 0, z: 0 };
const grip: Vec3 = { x: 0, y: 0, z: 0 };
const support: Vec3 = { x: 0, y: 0, z: 0 };
const legPose: LegPose = { thighX: 0, kneeX: 0 };

/** Writes a plain solver result into a Babylon quaternion. */
const writeQuat = (q: Quat, target: Quaternion): void => {
  target.set(q.x, q.y, q.z, q.w);
};

interface Arm {
  upper: TransformNode;
  lower: TransformNode;
  qUpper: Quaternion;
  qLower: Quaternion;
}

interface Leg {
  hip: TransformNode;
  knee: TransformNode;
  ankle: TransformNode;
  phaseOffset: number;
}

export class EnemyRig {
  /** Every instance of this body. Register these as shadow casters. */
  readonly meshes: AbstractMesh[] = [];

  private readonly nodes: TransformNode[] = [];
  private readonly root: TransformNode;
  private readonly pelvis: TransformNode;
  private readonly spine: TransformNode;
  private readonly chest: TransformNode;
  private readonly head: TransformNode;
  private readonly headCenter: TransformNode;
  private readonly chestTop: TransformNode;
  private readonly rifle: TransformNode;
  private readonly magazine: TransformNode;
  private readonly magazineMesh: AbstractMesh;
  private readonly muzzle: TransformNode;
  private readonly armR: Arm;
  private readonly armL: Arm;
  private readonly legR: Leg;
  private readonly legL: Leg;
  private readonly seed: number;
  private readonly qA: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly qB: Quat = { x: 0, y: 0, z: 0, w: 1 };

  private time = 0;
  private phase = 0;
  private forward = 0;
  private strafe = 0;
  private crouch = 0;
  private aim = 0;
  private reload = 0;
  private recoil = 0;
  private flinch = 0;
  private flinchSide = 0;
  private lean = 0;
  private deathTime = -1;
  private fallForward = false;
  private feetY = 0;

  constructor(scene: Scene, assets: EnemyRigAssets, id: string, seed: number) {
    this.seed = seed;
    const node = (name: string, parent: TransformNode | null, x = 0, y = 0, z = 0): TransformNode => {
      const n = new TransformNode(`${id}_${name}`, scene);
      if (parent) n.parent = parent;
      n.position.set(x, y, z);
      this.nodes.push(n);
      return n;
    };
    const parts = (parent: TransformNode, ...list: RigPart[]): void => {
      for (const part of list) {
        const mesh = assets.instance(part, `${id}_${part}`);
        mesh.parent = parent;
        this.meshes.push(mesh);
      }
    };

    this.root = node('root', null);
    this.pelvis = node('pelvis', this.root, 0, STAND_HIP, 0);
    parts(this.pelvis, 'hips', 'belt');
    this.spine = node('spine', this.pelvis, 0, 0.1, 0);
    this.chest = node('chest', this.spine, 0, CHEST_FROM_HIP - 0.1, 0);
    parts(this.chest, 'torso', 'carrier', 'pouches');
    this.chestTop = node('chestTop', this.chest, 0, 0.36, 0);
    this.head = node('head', this.chest, 0, 0.4, 0);
    parts(this.head, 'head', 'eyes', 'helmet');
    this.headCenter = node('headCenter', this.head, 0, 0.165, 0);

    this.rifle = node('rifle', this.chest);
    parts(this.rifle, 'rifle');
    this.magazine = node('magazine', this.rifle, 0, -0.01, 0.1);
    parts(this.magazine, 'rifleMag');
    this.magazineMesh = this.meshes[this.meshes.length - 1];
    this.muzzle = node('muzzle', this.rifle, 0, 0.04, 0.59);

    const arm = (name: string, shoulder: Vec3): Arm => {
      const upper = node(`${name}Upper`, this.chest, shoulder.x, shoulder.y, shoulder.z);
      parts(upper, 'upperArm', 'identifier');
      const lower = node(`${name}Lower`, upper, 0, -UPPER_ARM, 0);
      parts(lower, 'forearm', 'glove');
      const qUpper = Quaternion.Identity();
      const qLower = Quaternion.Identity();
      upper.rotationQuaternion = qUpper;
      lower.rotationQuaternion = qLower;
      return { upper, lower, qUpper, qLower };
    };
    this.armR = arm('armR', SHOULDER_R);
    this.armL = arm('armL', SHOULDER_L);

    const leg = (name: string, x: number, phaseOffset: number): Leg => {
      const hip = node(`${name}Hip`, this.pelvis, x, 0, 0);
      parts(hip, 'thigh');
      const knee = node(`${name}Knee`, hip, 0, -THIGH, 0);
      parts(knee, 'kneePad', 'shin');
      const ankle = node(`${name}Ankle`, knee, 0, -SHIN, 0);
      parts(ankle, 'boot');
      return { hip, knee, ankle, phaseOffset };
    };
    this.legR = leg('legR', HIP_X, Math.PI);
    this.legL = leg('legL', -HIP_X, 0);
    this.phase = seed * Math.PI * 2;
  }

  /** Places the feet and the facing. Ignored after death: the body stays where it fell. */
  setTransform(feet: Vec3, yaw: number): void {
    if (this.deathTime >= 0) return;
    this.root.position.set(feet.x, feet.y, feet.z);
    this.root.rotation.y = yaw;
    this.feetY = feet.y;
  }

  triggerRecoil(): void {
    this.recoil = 1;
  }

  /** `side` -1..1 kicks the shoulders that way. */
  triggerFlinch(side: number): void {
    this.flinch = 1;
    this.flinchSide = side;
  }

  triggerDeath(fallForward: boolean): void {
    if (this.deathTime >= 0) return;
    this.deathTime = 0;
    this.fallForward = fallForward;
  }

  /** True once the corpse has come to rest and needs no more updates. */
  get settled(): boolean {
    return this.deathTime >= FALL_TIME + SETTLE_TIME;
  }

  update(dt: number, input: RigInput): void {
    this.time += dt;
    this.recoil = Math.max(0, this.recoil - dt * 11);
    this.flinch = Math.max(0, this.flinch - dt * 3.5);
    if (this.deathTime >= 0) {
      this.updateDeath(dt);
      return;
    }
    this.forward = damp(this.forward, input.forwardSpeed, 10, dt);
    this.strafe = damp(this.strafe, input.strafeSpeed, 10, dt);
    this.crouch = damp(this.crouch, input.crouching ? 1 : 0, 7, dt);
    this.aim = damp(this.aim, input.aiming ? 1 : 0, 9, dt);
    this.reload = damp(this.reload, input.reloading ? 1 : 0, 8, dt);
    this.lean = damp(this.lean, input.lean, 5, dt);

    const speed = Math.hypot(this.forward, this.strafe);
    const moving = saturate(speed / 0.6);
    const running = saturate((speed - 1.8) / 2.4);
    const frequency = lerp(1.35, 2.3, running);
    this.phase += dt * Math.PI * 2 * frequency * moving;

    const sway = Math.sin(this.time * 0.9 + this.seed * 7);
    const bob = Math.abs(Math.sin(this.phase)) * lerp(0.012, 0.035, running) * moving;
    const hipY =
      lerp(STAND_HIP, CROUCH_HIP, this.crouch) -
      running * 0.09 * (1 - this.crouch) -
      bob +
      Math.sin(this.time * 1.6 + this.seed * 3) * 0.004 * (1 - moving);
    this.pelvis.position.y = hipY;

    this.poseLeg(this.legL, hipY, speed, moving, running, 0.1 * this.aim * (1 - moving) + 0.24 * this.crouch);
    this.poseLeg(this.legR, hipY, speed, moving, running, -0.12 * this.aim * (1 - moving) - 0.22 * this.crouch);

    const pitch = clamp(input.aimPitch, -0.7, 0.7);
    const hunch = 0.09 * running + 0.24 * this.crouch * (1 - this.aim);
    this.spine.rotation.x = lerp(hunch, -pitch * 0.75, this.aim) - this.flinch * 0.3;
    this.spine.rotation.z = sway * 0.012 - this.lean * 0.14 * this.aim - this.flinch * this.flinchSide * 0.2;
    this.head.rotation.x = -pitch * 0.25 * this.aim + 0.05 - this.flinch * 0.2;
    this.head.rotation.y = Math.sin(this.time * 0.6 + this.seed * 11) * 0.08 * (1 - this.aim);

    this.poseUpperBody(pitch, input.reloadProgress);
  }

  /** Writes world-space points for the hit capsules. Parents are refreshed top-down, so this is valid mid-frame. */
  readHitPoints(head: Vec3, chestTop: Vec3, spine: Vec3, pelvis: Vec3): void {
    this.root.computeWorldMatrix(true);
    this.pelvis.computeWorldMatrix(true);
    this.spine.computeWorldMatrix(true);
    this.chest.computeWorldMatrix(true);
    this.head.computeWorldMatrix(true);
    this.headCenter.computeWorldMatrix(true);
    this.chestTop.computeWorldMatrix(true);
    copyVec(head, this.headCenter.getAbsolutePosition());
    copyVec(chestTop, this.chestTop.getAbsolutePosition());
    copyVec(spine, this.spine.getAbsolutePosition());
    copyVec(pelvis, this.pelvis.getAbsolutePosition());
  }

  /** World position of the muzzle, refreshed top-down. */
  readMuzzle(out: Vec3): void {
    this.root.computeWorldMatrix(true);
    this.pelvis.computeWorldMatrix(true);
    this.spine.computeWorldMatrix(true);
    this.chest.computeWorldMatrix(true);
    this.rifle.computeWorldMatrix(true);
    this.muzzle.computeWorldMatrix(true);
    copyVec(out, this.muzzle.getAbsolutePosition());
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
    // Children first: nodes were created parent before child.
    for (let i = this.nodes.length - 1; i >= 0; i--) this.nodes[i].dispose(true);
    this.nodes.length = 0;
  }

  private poseLeg(leg: Leg, hipY: number, speed: number, moving: number, running: number, stanceZ: number): void {
    const cycle = this.phase + leg.phaseOffset;
    const halfStride = Math.min(0.42, speed / (4 * lerp(1.35, 2.3, running))) * moving;
    const dirZ = speed > 1e-3 ? this.forward / speed : 1;
    const dirX = speed > 1e-3 ? this.strafe / speed : 0;
    const swing = Math.cos(cycle) * halfStride;
    const lift = Math.max(0, -Math.sin(cycle)) * lerp(0.05, 0.16, running) * moving;
    const footZ = stanceZ + swing * dirZ;
    const footX = swing * dirX;
    const footY = ANKLE_HEIGHT + lift;

    solveLeg(hipY, 0, footY, footZ, THIGH, SHIN, legPose);
    leg.hip.rotation.x = legPose.thighX;
    leg.hip.rotation.z = Math.atan2(footX, hipY - footY);
    leg.knee.rotation.x = legPose.kneeX;
    leg.ankle.rotation.x = -(legPose.thighX + legPose.kneeX);
  }

  private poseUpperBody(pitch: number, reloadProgress: number): void {
    const a = this.aim;
    const r = this.reload;
    let x = lerp(READY.x, AIM.x, a);
    let y = lerp(READY.y, AIM.y, a);
    let z = lerp(READY.z, AIM.z, a);
    let rx = lerp(READY.rx, AIM.rx, a) - pitch * 0.25 * a;
    let ry = lerp(READY.ry, AIM.ry, a);
    x = lerp(x, RELOAD.x, r);
    y = lerp(y, RELOAD.y, r);
    z = lerp(z, RELOAD.z, r) - this.recoil * 0.035;
    rx = lerp(rx, RELOAD.rx, r) - this.recoil * 0.07;
    ry = lerp(ry, RELOAD.ry, r);
    this.rifle.position.set(x, y, z);
    this.rifle.rotation.x = rx;
    this.rifle.rotation.y = ry;

    rotateXY(GRIP_POINT, rx, ry, grip);
    grip.x += x;
    grip.y += y;
    grip.z += z;
    rotateXY(SUPPORT_POINT, rx, ry, support);
    support.x += x;
    support.y += y;
    support.z += z;

    // Reload: support hand drops to the magazine, away to a pouch, and back.
    const toPouch = r * reloadTrip(reloadProgress);
    scratch.x = lerp(support.x, POUCH_POINT.x, toPouch);
    scratch.y = lerp(support.y, POUCH_POINT.y, toPouch);
    scratch.z = lerp(support.z, POUCH_POINT.z, toPouch);
    const magAway = r > 0.5 && reloadProgress > 0.28 && reloadProgress < 0.62;
    this.magazine.position.y = magAway ? -0.22 : -0.01;
    this.magazineMesh.isVisible = !magAway;

    solveArm(SHOULDER_R, grip, POLE_R, UPPER_ARM, FOREARM, this.qA, this.qB);
    writeQuat(this.qA, this.armR.qUpper);
    writeQuat(this.qB, this.armR.qLower);
    solveArm(SHOULDER_L, scratch, POLE_L, UPPER_ARM, FOREARM, this.qA, this.qB);
    writeQuat(this.qA, this.armL.qUpper);
    writeQuat(this.qB, this.armL.qLower);
  }

  private updateDeath(dt: number): void {
    if (this.settled) return;
    this.deathTime += dt;
    const fall = saturate(this.deathTime / FALL_TIME);
    const settle = saturate((this.deathTime - FALL_TIME) / SETTLE_TIME);
    const direction = this.fallForward ? 1 : -1;
    // Accelerates like a fall, then a small bounce as the body meets the ground.
    const angle = (Math.PI / 2) * (easeInQuad(fall) + Math.sin(settle * Math.PI) * 0.025);
    this.root.rotation.x = angle * direction;
    this.root.position.y = this.feetY + (this.fallForward ? 0.19 : 0.15) * smoothStep(fall);

    // Knees give way first, then the body straightens out flat.
    const buckle = Math.sin(saturate(fall * 1.3) * Math.PI);
    const hipY = STAND_HIP - buckle * 0.28;
    this.pelvis.position.y = hipY;
    const splay = 0.09 * smoothStep(fall);
    this.poseCorpseLeg(this.legL, hipY, splay, -0.08);
    this.poseCorpseLeg(this.legR, hipY, -splay, 0.05);

    this.aim = damp(this.aim, 0, 6, dt);
    this.reload = damp(this.reload, 0, 6, dt);
    this.spine.rotation.x = (this.fallForward ? 0.12 : -0.18) * smoothStep(fall);
    this.spine.rotation.z = 0.08 * (this.seed - 0.5) * smoothStep(fall);
    this.head.rotation.x = (this.fallForward ? 0.2 : -0.25) * smoothStep(fall);
    this.head.rotation.y = (this.seed - 0.5) * 1.1 * smoothStep(fall);
    this.poseUpperBody(0, 0);
  }

  private poseCorpseLeg(leg: Leg, hipY: number, splay: number, footZ: number): void {
    solveLeg(hipY, 0, ANKLE_HEIGHT, footZ, THIGH, SHIN, legPose);
    leg.hip.rotation.x = legPose.thighX;
    leg.hip.rotation.z = splay;
    leg.knee.rotation.x = legPose.kneeX;
    leg.ankle.rotation.x = -(legPose.thighX + legPose.kneeX) - 0.5 * saturate(this.deathTime / FALL_TIME);
  }
}

function copyVec(out: Vec3, source: Vec3): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
}
