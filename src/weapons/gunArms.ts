/** Gloved hands and sleeved forearms for the first-person guns. Pure geometry: no Babylon, no DOM. */
import type { Vec3 } from '../core/types';
import type { GeometryBatch } from './gunGeometry';

const GLOVE: readonly [number, number, number] = [0.05, 0.05, 0.052];
const KNUCKLE: readonly [number, number, number] = [0.085, 0.082, 0.078];
const CUFF: readonly [number, number, number] = [0.03, 0.03, 0.032];
const SLEEVE: readonly [number, number, number] = [0.085, 0.1, 0.062];

const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function polyline(batch: GeometryBatch, points: readonly Vec3[], radiusStart: number, radiusEnd: number): void {
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const ra = radiusStart + ((radiusEnd - radiusStart) * i) / last;
    const rb = radiusStart + ((radiusEnd - radiusStart) * (i + 1)) / last;
    batch.tube(points[i], points[i + 1], ra, rb, 6);
  }
}

/** Wrist cuff and forearm. The far end sits behind the near plane in normal play. */
function addForearm(batch: GeometryBatch, wrist: Vec3, elbow: Vec3): void {
  const dx = elbow.x - wrist.x;
  const dy = elbow.y - wrist.y;
  const dz = elbow.z - wrist.z;
  const along = (t: number): Vec3 => at(wrist.x + dx * t, wrist.y + dy * t, wrist.z + dz * t);
  batch.tint(CUFF[0], CUFF[1], CUFF[2]).tube(wrist, along(0.09), 0.029, 0.033, 10);
  batch.tint(SLEEVE[0], SLEEVE[1], SLEEVE[2]).tube(along(0.07), elbow, 0.036, 0.05, 10);
  // Wrinkled folds so the sleeve is not a clean pipe.
  batch.tube(along(0.22), along(0.28), 0.04, 0.042, 10);
  batch.tube(along(0.44), along(0.5), 0.044, 0.046, 10);
}

/**
 * A closed fist round a roughly vertical grip.
 * @param centre Middle of the grip in model space.
 * @param side 1 is the right hand with the palm on +X, -1 the left with the palm on -X.
 * @param lean How far the grip runs back per unit of height.
 */
export function addGripHand(
  batch: GeometryBatch,
  centre: Vec3,
  side: 1 | -1,
  lean: number,
  elbowOffset: Vec3,
  triggerFinger: boolean,
): void {
  const zAt = (y: number): number => centre.z + (y - centre.y) * lean;
  batch.tint(GLOVE[0], GLOVE[1], GLOVE[2]);

  batch.box(centre.x + side * 0.026, centre.y, centre.z - 0.008, 0.02, 0.078, 0.052, 0.007);
  batch.box(centre.x + side * 0.006, centre.y - 0.002, centre.z - 0.036, 0.03, 0.07, 0.016, 0.006);

  const fingerRows = triggerFinger ? 3 : 4;
  for (let i = 0; i < fingerRows; i++) {
    const y = centre.y + (triggerFinger ? 0.012 : 0.03) - i * 0.021;
    const z = zAt(y);
    polyline(
      batch,
      [
        at(centre.x + side * 0.03, y, z - 0.012),
        at(centre.x + side * 0.026, y, z + 0.027),
        at(centre.x - side * 0.006, y, z + 0.037),
        at(centre.x - side * 0.025, y, z + 0.018),
      ],
      0.0098,
      0.0082,
    );
  }

  batch.tint(KNUCKLE[0], KNUCKLE[1], KNUCKLE[2]);
  batch.box(centre.x + side * 0.034, centre.y - 0.002, centre.z + 0.012, 0.006, 0.066, 0.02, 0.002);

  batch.tint(GLOVE[0], GLOVE[1], GLOVE[2]);
  polyline(
    batch,
    [
      at(centre.x + side * 0.024, centre.y + 0.034, zAt(centre.y + 0.034) - 0.022),
      at(centre.x - side * 0.008, centre.y + 0.042, zAt(centre.y + 0.042) - 0.004),
      at(centre.x - side * 0.022, centre.y + 0.036, zAt(centre.y + 0.036) + 0.018),
    ],
    0.0108,
    0.0088,
  );
  if (triggerFinger) {
    polyline(
      batch,
      [
        at(centre.x + side * 0.024, centre.y + 0.036, zAt(centre.y + 0.036) + 0.002),
        at(centre.x + side * 0.018, centre.y + 0.04, centre.z + 0.038),
        at(centre.x + side * 0.003, centre.y + 0.031, centre.z + 0.055),
      ],
      0.0088,
      0.0074,
    );
  }

  const wrist = at(centre.x + side * 0.036, centre.y - 0.042, centre.z - 0.05);
  batch.tube(at(centre.x + side * 0.027, centre.y - 0.012, centre.z - 0.02), wrist, 0.026, 0.026, 8);
  addForearm(batch, wrist, at(wrist.x + elbowOffset.x, wrist.y + elbowOffset.y, wrist.z + elbowOffset.z));
}

/** A left hand cradling a handguard from below. `centre` is the underside of the handguard, under the palm. */
export function addCradleHand(batch: GeometryBatch, centre: Vec3, halfWidth: number, elbowOffset: Vec3): void {
  const { x, y, z } = centre;
  batch.tint(GLOVE[0], GLOVE[1], GLOVE[2]);
  batch.box(x, y - 0.014, z, 0.056, 0.02, 0.078, 0.007);

  for (let i = 0; i < 4; i++) {
    const fz = z + 0.03 - i * 0.02;
    polyline(
      batch,
      [
        at(x + 0.018, y - 0.018, fz),
        at(x + halfWidth + 0.009, y - 0.009, fz + 0.004),
        at(x + halfWidth + 0.011, y + 0.02, fz + 0.006),
        at(x + halfWidth + 0.003, y + 0.036, fz + 0.006),
      ],
      0.0098,
      0.0082,
    );
  }
  polyline(
    batch,
    [
      at(x - 0.024, y - 0.016, z - 0.03),
      at(x - halfWidth - 0.009, y + 0.006, z - 0.006),
      at(x - halfWidth - 0.008, y + 0.024, z + 0.026),
    ],
    0.0112,
    0.0088,
  );

  batch.tint(KNUCKLE[0], KNUCKLE[1], KNUCKLE[2]);
  batch.box(x + 0.012, y - 0.027, z, 0.03, 0.006, 0.066, 0.002);

  batch.tint(GLOVE[0], GLOVE[1], GLOVE[2]);
  const wrist = at(x - 0.036, y - 0.05, z - 0.062);
  batch.tube(at(x - 0.012, y - 0.02, z - 0.03), wrist, 0.027, 0.026, 8);
  addForearm(batch, wrist, at(wrist.x + elbowOffset.x, wrist.y + elbowOffset.y, wrist.z + elbowOffset.z));
}
