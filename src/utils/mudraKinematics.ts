import { Landmark3D, HandKinematics, HandednessType } from 'types/mudra';

export const NEAR_ZERO_EPSILON = 1e-6;

export const JOINT_TRIPLETS: Record<string, string> = {
  'thumb.mcp': '1-2-3',
  'thumb.pip': '2-3-4',
  'index.mcp': '0-5-6',
  'index.pip': '5-6-7',
  'index.dip': '6-7-8',
  'middle.mcp': '0-9-10',
  'middle.pip': '9-10-11',
  'middle.dip': '10-11-12',
  'ring.mcp': '0-13-14',
  'ring.pip': '13-14-15',
  'ring.dip': '14-15-16',
  'pinky.mcp': '0-17-18',
  'pinky.pip': '17-18-19',
  'pinky.dip': '18-19-20',
  spreadThumbIndex: '1→2 ∠ 5→6',
  spreadIndexMiddle: '5→6 ∠ 9→10',
  spreadMiddleRing: '9→10 ∠ 13→14',
  spreadRingPinky: '13→14 ∠ 17→18',
  'contact.thumbIndex': '4↔8 / 0↔9',
  'contact.thumbMiddle': '4↔12 / 0↔9',
  'contact.thumbRing': '4↔16 / 0↔9',
  'contact.thumbPinky': '4↔20 / 0↔9',
};

const REQUIRED_BONE_PAIRS: ReadonlyArray<[number, number]> = [
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

/**
 * Checks whether a 3D landmark has finite numeric coordinates
 */
export function isFiniteLandmark(pt: Landmark3D | null | undefined): pt is Landmark3D {
  return (
    Boolean(pt) &&
    Number.isFinite(pt?.x) &&
    Number.isFinite(pt?.y) &&
    Number.isFinite(pt?.z)
  );
}

/**
 * Resolves MediaPipe handedness categories without silently assuming 'Right'
 */
export function resolveHandedness(
  categories?: Array<{ categoryName?: string; displayName?: string }> | null
): HandednessType {
  if (!Array.isArray(categories) || categories.length === 0) {
    return 'Unknown';
  }
  const raw = (categories[0]?.categoryName || categories[0]?.displayName || '').trim().toLowerCase();
  if (raw === 'left') return 'Left';
  if (raw === 'right') return 'Right';
  return 'Unknown';
}

/**
 * Calculates Euclidean distance between two 3D landmarks
 */
export function euclideanDistance3D(a: Landmark3D, b: Landmark3D): number {
  if (!isFiniteLandmark(a) || !isFiniteLandmark(b)) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Validates that a 21-point 3D world landmark array is present, finite, and non-degenerate
 */
export function hasValidWorldLandmarks(
  landmarks: Landmark3D[] | null | undefined
): landmarks is Landmark3D[] {
  if (!Array.isArray(landmarks) || landmarks.length < 21) {
    return false;
  }
  for (let i = 0; i < 21; i += 1) {
    if (!isFiniteLandmark(landmarks[i])) {
      return false;
    }
  }
  const palmScale = euclideanDistance3D(landmarks[0], landmarks[9]);
  if (palmScale <= NEAR_ZERO_EPSILON) {
    return false;
  }
  return REQUIRED_BONE_PAIRS.every(
    ([fromIdx, toIdx]) =>
      euclideanDistance3D(landmarks[fromIdx], landmarks[toIdx]) > NEAR_ZERO_EPSILON
  );
}

/**
 * Creates a 3D vector from point A to point B: B - A
 */
export function createVector(from: Landmark3D, to: Landmark3D): Landmark3D {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  };
}

/**
 * Computes dot product of two 3D vectors
 */
export function dotProduct(a: Landmark3D, b: Landmark3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Computes vector magnitude (length)
 */
export function vectorMagnitude(v: Landmark3D): number {
  if (!isFiniteLandmark(v)) return 0;
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Computes cross product of two 3D vectors: a x b
 */
export function crossProduct(a: Landmark3D, b: Landmark3D): Landmark3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Normalizes a vector to unit length
 */
export function normalizeVector(v: Landmark3D): Landmark3D {
  const mag = vectorMagnitude(v);
  if (mag <= NEAR_ZERO_EPSILON) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / mag,
    y: v.y / mag,
    z: v.z / mag,
  };
}

/**
 * Calculates exterior flexion bend angle (in degrees) between two consecutive bone segments:
 * Bone 1: A -> B (v1 = B - A)
 * Bone 2: B -> C (v2 = C - B)
 * Equivalent to `180 - interior_deg` where `u = A - B` and `v = C - B`:
 * 0° = perfectly straight chain, 90° = right-angle bend, 180° = completely folded back.
 */
export function calculateJointAngle(a: Landmark3D, b: Landmark3D, c: Landmark3D): number {
  if (!isFiniteLandmark(a) || !isFiniteLandmark(b) || !isFiniteLandmark(c)) {
    return 0;
  }

  const v1 = createVector(a, b); // Incoming bone segment
  const v2 = createVector(b, c); // Outgoing bone segment

  const mag1 = vectorMagnitude(v1);
  const mag2 = vectorMagnitude(v2);

  if (mag1 <= NEAR_ZERO_EPSILON || mag2 <= NEAR_ZERO_EPSILON) return 0;

  const cosTheta = dotProduct(v1, v2) / (mag1 * mag2);
  // Clamp to [-1, 1] to prevent NaN from floating point inaccuracies
  const clampedCos = Math.max(-1, Math.min(1, cosTheta));
  const angleRad = Math.acos(clampedCos);

  return (angleRad * 180) / Math.PI;
}

/**
 * Calculates the spread (abduction) angle between two directional vectors
 */
export function calculateSpreadAngle(v1: Landmark3D, v2: Landmark3D): number {
  if (!isFiniteLandmark(v1) || !isFiniteLandmark(v2)) return 0;

  const mag1 = vectorMagnitude(v1);
  const mag2 = vectorMagnitude(v2);

  if (mag1 <= NEAR_ZERO_EPSILON || mag2 <= NEAR_ZERO_EPSILON) return 0;

  const cosTheta = dotProduct(v1, v2) / (mag1 * mag2);
  const clampedCos = Math.max(-1, Math.min(1, cosTheta));
  return (Math.acos(clampedCos) * 180) / Math.PI;
}

/**
 * Translates landmarks relative to wrist (Landmark 0) and normalizes by palm scale (distance 0->9)
 */
export function normalizeHandLandmarks(landmarks: Landmark3D[]): Landmark3D[] {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return landmarks || [];
  if (!isFiniteLandmark(landmarks[0]) || !isFiniteLandmark(landmarks[9])) return [];

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // Palm length: Euclidean distance between wrist (0) and middle MCP (9)
  const rawPalmScale = euclideanDistance3D(wrist, middleMcp);
  const palmScale = rawPalmScale > NEAR_ZERO_EPSILON ? rawPalmScale : 1.0;

  return landmarks.map((pt) => {
    if (!isFiniteLandmark(pt)) {
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: (pt.x - wrist.x) / palmScale,
      y: (pt.y - wrist.y) / palmScale,
      z: (pt.z - wrist.z) / palmScale,
    };
  });
}

/**
 * Extracts comprehensive 3D hand kinematics from MediaPipe 3D worldLandmarks.
 * Returns null when worldLandmarks are missing, non-finite, or geometrically degenerate.
 */
export function extractHandKinematics(
  worldLandmarks: Landmark3D[] | null | undefined,
  handedness: HandednessType = 'Unknown'
): HandKinematics | null {
  if (!hasValidWorldLandmarks(worldLandmarks)) {
    return null;
  }

  const palmScaleMeters = euclideanDistance3D(worldLandmarks[0], worldLandmarks[9]);
  const palmWidthMeters = euclideanDistance3D(worldLandmarks[5], worldLandmarks[17]);
  const norm = normalizeHandLandmarks(worldLandmarks);

  // Landmark indices mapping
  // Thumb: 0 -> 1 -> 2 -> 3 -> 4
  const thumbMcpAngle = calculateJointAngle(norm[1], norm[2], norm[3]);
  const thumbPipAngle = calculateJointAngle(norm[2], norm[3], norm[4]);

  // Index: 0 -> 5 -> 6 -> 7 -> 8
  const indexMcpAngle = calculateJointAngle(norm[0], norm[5], norm[6]);
  const indexPipAngle = calculateJointAngle(norm[5], norm[6], norm[7]);
  const indexDipAngle = calculateJointAngle(norm[6], norm[7], norm[8]);

  // Middle: 0 -> 9 -> 10 -> 11 -> 12
  const middleMcpAngle = calculateJointAngle(norm[0], norm[9], norm[10]);
  const middlePipAngle = calculateJointAngle(norm[9], norm[10], norm[11]);
  const middleDipAngle = calculateJointAngle(norm[10], norm[11], norm[12]);

  // Ring: 0 -> 13 -> 14 -> 15 -> 16
  const ringMcpAngle = calculateJointAngle(norm[0], norm[13], norm[14]);
  const ringPipAngle = calculateJointAngle(norm[13], norm[14], norm[15]);
  const ringDipAngle = calculateJointAngle(norm[14], norm[15], norm[16]);

  // Pinky: 0 -> 17 -> 18 -> 19 -> 20
  const pinkyMcpAngle = calculateJointAngle(norm[0], norm[17], norm[18]);
  const pinkyPipAngle = calculateJointAngle(norm[17], norm[18], norm[19]);
  const pinkyDipAngle = calculateJointAngle(norm[18], norm[19], norm[20]);

  // Proximal finger bone vectors for calculating spreads (in degrees)
  const vThumb = createVector(norm[1], norm[2]);
  const vIndex = createVector(norm[5], norm[6]);
  const vMiddle = createVector(norm[9], norm[10]);
  const vRing = createVector(norm[13], norm[14]);
  const vPinky = createVector(norm[17], norm[18]);

  const spreadThumbIndex = calculateSpreadAngle(vThumb, vIndex);
  const spreadIndexMiddle = calculateSpreadAngle(vIndex, vMiddle);
  const spreadMiddleRing = calculateSpreadAngle(vMiddle, vRing);
  const spreadRingPinky = calculateSpreadAngle(vRing, vPinky);

  // Palm normal: Longitudinal (0 -> 9) x Lateral (5 -> 17 for Right/Unknown, 17 -> 5 for Left)
  const vLong = createVector(norm[0], norm[9]);
  const vLat =
    handedness === 'Left' ? createVector(norm[17], norm[5]) : createVector(norm[5], norm[17]);
  const rawNormal = crossProduct(vLong, vLat);
  const palmNormal = normalizeVector(rawNormal);

  // Inter-fingertip normalized Euclidean distances (divided by palmScale = distance(0, 9))
  const tipDistances = {
    thumbIndex: euclideanDistance3D(norm[4], norm[8]),
    thumbMiddle: euclideanDistance3D(norm[4], norm[12]),
    thumbRing: euclideanDistance3D(norm[4], norm[16]),
    thumbPinky: euclideanDistance3D(norm[4], norm[20]),
  };

  // Tip-to-own-MCP closure distances normalized by palmScale (distance(0, 9))
  const fingerClosure = {
    index: euclideanDistance3D(norm[8], norm[5]),
    middle: euclideanDistance3D(norm[12], norm[9]),
    ring: euclideanDistance3D(norm[16], norm[13]),
    pinky: euclideanDistance3D(norm[20], norm[17]),
  };

  return {
    coordinateSource: 'worldLandmarks',
    handedness,
    palmScaleMeters,
    palmWidthMeters,
    thumb: { mcp: thumbMcpAngle, pip: thumbPipAngle },
    index: { mcp: indexMcpAngle, pip: indexPipAngle, dip: indexDipAngle },
    middle: { mcp: middleMcpAngle, pip: middlePipAngle, dip: middleDipAngle },
    ring: { mcp: ringMcpAngle, pip: ringPipAngle, dip: ringDipAngle },
    pinky: { mcp: pinkyMcpAngle, pip: pinkyPipAngle, dip: pinkyDipAngle },
    spreadThumbIndex,
    spreadIndexMiddle,
    spreadMiddleRing,
    spreadRingPinky,
    tipDistances,
    fingerClosure,
    palmNormal,
  };
}
