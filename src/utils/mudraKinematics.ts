import { Landmark3D, HandKinematics } from 'types/mudra';

/**
 * Calculates Euclidean distance between two 3D landmarks
 */
export function euclideanDistance3D(a: Landmark3D, b: Landmark3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
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
  if (mag === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / mag,
    y: v.y / mag,
    z: v.z / mag,
  };
}

/**
 * Calculates flexion angle (in degrees) between two consecutive bone segments:
 * Bone 1: A -> B
 * Bone 2: B -> C
 * 0° = perfectly straight, 90° = right angle bend, 180° = completely folded
 */
export function calculateJointAngle(a: Landmark3D, b: Landmark3D, c: Landmark3D): number {
  const v1 = createVector(a, b); // Incoming bone segment
  const v2 = createVector(b, c); // Outgoing bone segment

  const mag1 = vectorMagnitude(v1);
  const mag2 = vectorMagnitude(v2);

  if (mag1 === 0 || mag2 === 0) return 0;

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
  const mag1 = vectorMagnitude(v1);
  const mag2 = vectorMagnitude(v2);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosTheta = dotProduct(v1, v2) / (mag1 * mag2);
  const clampedCos = Math.max(-1, Math.min(1, cosTheta));
  return (Math.acos(clampedCos) * 180) / Math.PI;
}

/**
 * Translates landmarks relative to wrist (Landmark 0) and normalizes by palm scale
 */
export function normalizeHandLandmarks(landmarks: Landmark3D[]): Landmark3D[] {
  if (!landmarks || landmarks.length < 21) return landmarks;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  // Palm length: Euclidean distance between wrist and middle MCP
  const palmScale = euclideanDistance3D(wrist, middleMcp) || 1.0;

  return landmarks.map((pt) => ({
    x: (pt.x - wrist.x) / palmScale,
    y: (pt.y - wrist.y) / palmScale,
    z: (pt.z - wrist.z) / palmScale,
  }));
}

/**
 * Extracts comprehensive 3D hand kinematics from the 21 landmarks
 */
export function extractHandKinematics(
  landmarks: Landmark3D[],
  handedness: 'Left' | 'Right' = 'Right'
): HandKinematics {
  const norm = normalizeHandLandmarks(landmarks);

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

  // Proximal finger bone vectors for calculating spreads
  const vThumb = createVector(norm[1], norm[2]);
  const vIndex = createVector(norm[5], norm[6]);
  const vMiddle = createVector(norm[9], norm[10]);
  const vRing = createVector(norm[13], norm[14]);
  const vPinky = createVector(norm[17], norm[18]);

  const spreadThumbIndex = calculateSpreadAngle(vThumb, vIndex);
  const spreadIndexMiddle = calculateSpreadAngle(vIndex, vMiddle);
  const spreadMiddleRing = calculateSpreadAngle(vMiddle, vRing);
  const spreadRingPinky = calculateSpreadAngle(vRing, vPinky);

  // Palm normal: Longitudinal (0 -> 9) x Lateral (5 -> 17)
  const vLong = createVector(norm[0], norm[9]);
  const vLat = createVector(norm[5], norm[17]);
  const rawNormal = crossProduct(vLong, vLat);
  const palmNormal = normalizeVector(rawNormal);

  // Inter-fingertip normalized Euclidean distances (Landmark 4 = thumb tip, 8 = index tip, 12 = middle, 16 = ring, 20 = pinky)
  const tipDistances = {
    thumbIndex: euclideanDistance3D(norm[4], norm[8]),
    thumbMiddle: euclideanDistance3D(norm[4], norm[12]),
    thumbRing: euclideanDistance3D(norm[4], norm[16]),
    thumbPinky: euclideanDistance3D(norm[4], norm[20]),
  };

  return {
    handedness,
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
    palmNormal,
  };
}
