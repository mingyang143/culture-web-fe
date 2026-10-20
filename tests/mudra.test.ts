import { test, expect } from '@playwright/test';
import { Landmark3D } from 'types/mudra';
import {
  calculateJointAngle,
  calculateSpreadAngle,
  extractHandKinematics,
  hasValidWorldLandmarks,
  resolveHandedness,
} from 'utils/mudraKinematics';
import {
  evaluateMudraKinematics,
  computeTemporalFeatureStats,
  extractKinematicsFeatureVector,
  areKinematicsVectorsSimilar,
  stabilizeCoachingEvaluation,
} from 'utils/mudraEvaluator';
import { CANONICAL_MUDRAS, resolveCanonicalMudraId } from 'data/canonicalMudras';

/**
 * Builds a synthetic 21-point 3D hand in metric world coordinates (meters)
 * for verifying geometric formulas and invariance properties.
 * Note: Synthetic geometry verifies mathematical calculations, not authentic Kathakali form.
 */
function createSyntheticWorldHand(): Landmark3D[] {
  const pts: Landmark3D[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

  // Wrist (0)
  pts[0] = { x: 0, y: 0, z: 0 };

  // Thumb: 1 -> 2 -> 3 -> 4
  pts[1] = { x: -0.025, y: 0.02, z: -0.005 };
  pts[2] = { x: -0.04, y: 0.045, z: -0.01 };
  pts[3] = { x: -0.03, y: 0.068, z: -0.012 };
  pts[4] = { x: -0.02, y: 0.085, z: -0.014 };

  // Index: 5 -> 6 -> 7 -> 8 (straight upward along +y)
  pts[5] = { x: -0.02, y: 0.08, z: 0 };
  pts[6] = { x: -0.02, y: 0.11, z: 0 };
  pts[7] = { x: -0.02, y: 0.135, z: 0 };
  pts[8] = { x: -0.02, y: 0.155, z: 0 };

  // Middle: 9 -> 10 -> 11 -> 12
  pts[9] = { x: -0.005, y: 0.085, z: 0 };
  pts[10] = { x: -0.005, y: 0.118, z: 0 };
  pts[11] = { x: -0.005, y: 0.145, z: 0 };
  pts[12] = { x: -0.005, y: 0.168, z: 0 };

  // Ring: 13 -> 14 -> 15 -> 16
  pts[13] = { x: 0.01, y: 0.08, z: 0 };
  pts[14] = { x: 0.01, y: 0.11, z: 0 };
  pts[15] = { x: 0.01, y: 0.135, z: 0 };
  pts[16] = { x: 0.01, y: 0.155, z: 0 };

  // Pinky: 17 -> 18 -> 19 -> 20
  pts[17] = { x: 0.025, y: 0.072, z: 0 };
  pts[18] = { x: 0.025, y: 0.098, z: 0 };
  pts[19] = { x: 0.025, y: 0.118, z: 0 };
  pts[20] = { x: 0.025, y: 0.135, z: 0 };

  return pts;
}

function transformLandmarks(
  landmarks: Landmark3D[],
  scale: number,
  translation: Landmark3D,
  rotZRad: number,
  rotXRad: number
): Landmark3D[] {
  const cosZ = Math.cos(rotZRad);
  const sinZ = Math.sin(rotZRad);
  const cosX = Math.cos(rotXRad);
  const sinX = Math.sin(rotXRad);

  return landmarks.map((p) => {
    // 1. Uniform scale
    const sx = p.x * scale;
    const sy = p.y * scale;
    const sz = p.z * scale;

    // 2. Rotate around Z
    const rx = sx * cosZ - sy * sinZ;
    const ry = sx * sinZ + sy * cosZ;
    const rz = sz;

    // 3. Rotate around X
    const rxx = rx;
    const rxy = ry * cosX - rz * sinX;
    const rxz = ry * sinX + rz * cosX;

    // 4. Translate
    return {
      x: rxx + translation.x,
      y: rxy + translation.y,
      z: rxz + translation.z,
    };
  });
}

test.describe('Mudra 3D Kinematics & Evaluator Unit Suite', () => {
  test('computes exterior bend angle conventions and handles degenerate inputs safely', () => {
    // Straight collinear chain A -> B -> C => 0° exterior bend (180° interior)
    const straightDeg = calculateJointAngle(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 }
    );
    expect(straightDeg).toBeCloseTo(0, 5);

    // Right-angle chain => 90° bend
    const rightAngleDeg = calculateJointAngle(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 }
    );
    expect(rightAngleDeg).toBeCloseTo(90, 5);

    // Folded-back chain => 180° bend
    const foldedDeg = calculateJointAngle(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 0 }
    );
    expect(foldedDeg).toBeCloseTo(180, 5);

    // Degenerate zero-length and non-finite inputs return 0 (never NaN)
    expect(
      calculateJointAngle({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 })
    ).toBe(0);
    expect(
      calculateJointAngle(
        { x: Number.NaN, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 }
      )
    ).toBe(0);
    expect(calculateSpreadAngle({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(0);
  });

  test('enforces translation, rigid 3D rotation, and uniform-scale invariance on worldLandmarks', () => {
    const baseHand = createSyntheticWorldHand();
    const transformedHand = transformLandmarks(
      baseHand,
      2.75,
      { x: 14.2, y: -8.6, z: 3.9 },
      0.65,
      -0.42
    );

    const k1 = extractHandKinematics(baseHand, 'Right');
    const k2 = extractHandKinematics(transformedHand, 'Right');

    expect(k1).not.toBeNull();
    expect(k2).not.toBeNull();
    if (!k1 || !k2) return;

    expect(k2.index.mcp).toBeCloseTo(k1.index.mcp, 5);
    expect(k2.index.pip).toBeCloseTo(k1.index.pip, 5);
    expect(k2.middle.pip).toBeCloseTo(k1.middle.pip, 5);
    expect(k2.ring.pip).toBeCloseTo(k1.ring.pip, 5);
    expect(k2.pinky.pip).toBeCloseTo(k1.pinky.pip, 5);
    expect(k2.spreadIndexMiddle).toBeCloseTo(k1.spreadIndexMiddle, 5);
    expect(k2.spreadMiddleRing).toBeCloseTo(k1.spreadMiddleRing, 5);
    expect(k2.spreadRingPinky).toBeCloseTo(k1.spreadRingPinky, 5);
    expect(k2.tipDistances.thumbIndex).toBeCloseTo(k1.tipDistances.thumbIndex, 5);
    expect(k2.fingerClosure.index).toBeCloseTo(k1.fingerClosure.index, 5);
    expect(k2.fingerClosure.pinky).toBeCloseTo(k1.fingerClosure.pinky, 5);
  });

  test('handles missing or degenerate worldLandmarks and resolves legacy mudra route aliases', () => {
    expect(resolveHandedness(undefined)).toBe('Unknown');
    expect(resolveHandedness([])).toBe('Unknown');
    expect(resolveHandedness([{ categoryName: 'Left' }])).toBe('Left');
    expect(resolveHandedness([{ categoryName: 'Right' }])).toBe('Right');

    expect(resolveCanonicalMudraId('pathaka')).toBe('pathaka');
    expect(resolveCanonicalMudraId('pataka')).toBe('pathaka');
    expect(resolveCanonicalMudraId('mudrakhya')).toBe('mudrakhyam');
    expect(resolveCanonicalMudraId('kataka')).toBe('katakam');
    expect(resolveCanonicalMudraId('katakamukha')).toBe('katakam');
    expect(resolveCanonicalMudraId('musti')).toBe('mushti');
    expect(resolveCanonicalMudraId('tripataka')).toBe('thripathaka');

    expect(hasValidWorldLandmarks(undefined)).toBe(false);
    expect(hasValidWorldLandmarks([])).toBe(false);
    expect(extractHandKinematics(null)).toBeNull();

    // Collapsed 21-point array must be rejected
    const collapsed = new Array(21).fill({ x: 0.5, y: 0.5, z: 0.5 });
    expect(hasValidWorldLandmarks(collapsed)).toBe(false);
    expect(extractHandKinematics(collapsed)).toBeNull();

    // Evaluator returns MEASUREMENT_UNAVAILABLE when kinematics is null
    const unavailableEval = evaluateMudraKinematics(null, CANONICAL_MUDRAS.mushti);
    expect(unavailableEval.measurementStatus).toBe('MEASUREMENT_UNAVAILABLE');
    expect(unavailableEval.coordinateSource).toBe('unavailable');
    expect(unavailableEval.matchScore).toBe(0);
    expect(unavailableEval.isMastered).toBe(false);
    expect(unavailableEval.jointEvaluations).toHaveLength(0);
  });

  test('uses identical condition-matching logic for primary and secondary directives', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    // Case 1: Both index.pip (+65° over 95° target) and pinky.pip (+60° over 92° target) are TOO_BENT in Mushti.
    // Mushti only has TOO_STRAIGHT rules in pedagogicalRules, so NEITHER primary nor secondary
    // may falsely match a TOO_STRAIGHT rule ("Curl your pinky finger tightly into your palm.").
    const overBentMushti: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 35, pip: 42 },
      index: { mcp: 78, pip: 160, dip: 80 },
      middle: { mcp: 78, pip: 95, dip: 80 },
      ring: { mcp: 75, pip: 95, dip: 80 },
      pinky: { mcp: 75, pip: 152, dip: 80 },
    };

    const resOverBent = evaluateMudraKinematics(overBentMushti, CANONICAL_MUDRAS.mushti);
    expect(resOverBent.primaryDirective).toContain('Index Middle (PIP) is too bent by ~65°');
    expect(resOverBent.secondaryDirective).toBeDefined();
    expect(resOverBent.secondaryDirective).toContain('Pinky Knuckle (PIP) is too bent by ~60°');
    expect(resOverBent.secondaryDirective).not.toContain('Curl your pinky');

    // Case 2: Both index.pip (-75° under 95° target) and pinky.pip (-62° under 92° target) are TOO_STRAIGHT.
    // Both primary and secondary must match their configured TOO_STRAIGHT rules.
    const underBentMushti: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 35, pip: 42 },
      index: { mcp: 78, pip: 20, dip: 10 },
      middle: { mcp: 78, pip: 95, dip: 80 },
      ring: { mcp: 75, pip: 95, dip: 80 },
      pinky: { mcp: 75, pip: 30, dip: 10 },
    };

    const resUnderBent = evaluateMudraKinematics(underBentMushti, CANONICAL_MUDRAS.mushti);
    expect(resUnderBent.primaryDirective).toBe(
      'Curl your index finger tightly into your palm to form a closed fist.'
    );
    expect(resUnderBent.secondaryDirective).toBe('Curl your pinky finger tightly into your palm.');
  });

  test('evaluates all configured spread targets (spreadIndexMiddle, spreadMiddleRing, spreadRingPinky)', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    const wideSpreadThripathaka: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 26, pip: 38 },
      index: { mcp: 12, pip: 16, dip: 5 },
      middle: { mcp: 10, pip: 16, dip: 5 },
      ring: { mcp: 12, pip: 18, dip: 5 },
      pinky: { mcp: 12, pip: 16, dip: 5 },
      spreadIndexMiddle: 8,
      spreadMiddleRing: 30, // +22° above target 8° (tolerance 12°)
      spreadRingPinky: 40, // +30° above target 10° (tolerance 12°)
    };

    const evalThripathaka = evaluateMudraKinematics(
      wideSpreadThripathaka,
      CANONICAL_MUDRAS.thripathaka
    );
    const spreadKeys = evalThripathaka.jointEvaluations
      .filter((j) => j.jointKey.startsWith('spread'))
      .map((j) => j.jointKey);

    expect(spreadKeys).toEqual([
      'spreadIndexMiddle',
      'spreadMiddleRing',
      'spreadRingPinky',
    ]);
    expect(evalThripathaka.isMastered).toBe(false);
    expect(evalThripathaka.primaryDirective).toContain('Ring-Pinky Gap is too wide by ~30°');
    expect(evalThripathaka.secondaryDirective).toContain('Middle-Ring Gap is too wide by ~22°');
  });

  test('validates Kathakali Pathaka (#1), Mudrakhyam (#2), Katakam (#3), Mushti (#4), and Thripathaka (#17) with cross-mudra disambiguation', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    // 1. Pathaka (#1): ring finger bent forward, index/middle/pinky straight
    const pathakaPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 19, pip: 14 },
      index: { mcp: 18, pip: 16, dip: 12 },
      middle: { mcp: 15, pip: 17, dip: 11 },
      ring: { mcp: 38, pip: 53, dip: 10 },
      pinky: { mcp: 26, pip: 18, dip: 10 },
      spreadIndexMiddle: 8,
      spreadMiddleRing: 33,
      spreadRingPinky: 40,
    };
    const pathakaEval = evaluateMudraKinematics(pathakaPose, CANONICAL_MUDRAS.pathaka);
    expect(pathakaEval.isMastered).toBe(true);
    expect(pathakaEval.matchScore).toBe(100);

    // Pathaka pose must NOT pass as Thripathaka (#17)
    const pathakaAsThripathaka = evaluateMudraKinematics(
      pathakaPose,
      CANONICAL_MUDRAS.thripathaka
    );
    expect(pathakaAsThripathaka.isMastered).toBe(false);
    expect(pathakaAsThripathaka.primaryDirective).toContain(
      'Keep your ring finger completely straight for Kathakali Thripathaka'
    );

    // 2. Thripathaka (#17): all 4 fingers straight, thumb bent inward
    const thripathakaPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 28, pip: 39 },
      index: { mcp: 10, pip: 16, dip: 13 },
      middle: { mcp: 7, pip: 16, dip: 9 },
      ring: { mcp: 8, pip: 19, dip: 8 },
      pinky: { mcp: 11, pip: 16, dip: 9 },
      spreadIndexMiddle: 7,
      spreadMiddleRing: 7,
      spreadRingPinky: 11,
    };
    const thripathakaEval = evaluateMudraKinematics(
      thripathakaPose,
      CANONICAL_MUDRAS.thripathaka
    );
    expect(thripathakaEval.isMastered).toBe(true);
    expect(thripathakaEval.matchScore).toBe(100);

    // Thripathaka pose must NOT pass as Pathaka (#1)
    const thripathakaAsPathaka = evaluateMudraKinematics(
      thripathakaPose,
      CANONICAL_MUDRAS.pathaka
    );
    expect(thripathakaAsPathaka.isMastered).toBe(false);
    expect(thripathakaAsPathaka.matchScore).toBeLessThanOrEqual(84);
    expect(thripathakaAsPathaka.primaryDirective).toContain(
      'In Kathakali Pathaka (#1), bend your ring finger forward'
    );

    // 3. Mudrakhyam (#2): thumb + index tips pinched, middle/ring/pinky straight
    const mudrakhyamPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 21, pip: 15 },
      index: { mcp: 55, pip: 61, dip: 33 },
      middle: { mcp: 19, pip: 20, dip: 14 },
      ring: { mcp: 22, pip: 19, dip: 9 },
      pinky: { mcp: 23, pip: 16, dip: 11 },
      tipDistances: {
        ...baseKinematics.tipDistances,
        thumbIndex: 0.31,
      },
    };
    const mudrakhyamEval = evaluateMudraKinematics(
      mudrakhyamPose,
      CANONICAL_MUDRAS.mudrakhyam
    );
    expect(mudrakhyamEval.isMastered).toBe(true);
    expect(mudrakhyamEval.matchScore).toBe(100);

    // Mudrakhyam pose must NOT pass as Katakam (#3) because middle finger is straight
    const mudrakhyamAsKatakam = evaluateMudraKinematics(
      mudrakhyamPose,
      CANONICAL_MUDRAS.katakam
    );
    expect(mudrakhyamAsKatakam.isMastered).toBe(false);
    expect(mudrakhyamAsKatakam.primaryDirective).toContain(
      'Fold your middle finger completely down onto the center of your palm'
    );

    // 4. Katakam (#3): upright pose (index tip touching upright thumb tip, middle folded into palm, ring & pinky straight up)
    const uprightKatakamPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 22, pip: 18 },
      index: { mcp: 45, pip: 65, dip: 25 },
      middle: { mcp: 70, pip: 82, dip: 45 },
      ring: { mcp: 18, pip: 15, dip: 10 },
      pinky: { mcp: 18, pip: 15, dip: 10 },
      spreadRingPinky: 12,
      tipDistances: {
        ...baseKinematics.tipDistances,
        thumbIndex: 0.38,
        thumbMiddle: 0.95, // middle finger folded onto palm, not touching thumb
      },
    };
    const uprightKatakamEval = evaluateMudraKinematics(
      uprightKatakamPose,
      CANONICAL_MUDRAS.katakam
    );
    expect(uprightKatakamEval.isMastered).toBe(true);
    expect(uprightKatakamEval.matchScore).toBe(100);

    // Katakam (#3) horizontal dataset sample (katakamukha_sample.jpg / 3.kataka.jpg) also masters
    const sampleKatakamPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 29, pip: 21 },
      index: { mcp: 43, pip: 66, dip: 20 },
      middle: { mcp: 67, pip: 67, dip: 29 },
      ring: { mcp: 55, pip: 21, dip: 10 },
      pinky: { mcp: 23, pip: 14, dip: 12 },
      spreadRingPinky: 55,
      tipDistances: {
        ...baseKinematics.tipDistances,
        thumbIndex: 0.41,
      },
    };
    const sampleKatakamEval = evaluateMudraKinematics(
      sampleKatakamPose,
      CANONICAL_MUDRAS.katakam
    );
    expect(sampleKatakamEval.isMastered).toBe(true);
    expect(sampleKatakamEval.matchScore).toBe(100);

    // 5. Mushti (#4): closed fist (both sample flexion ~85° and tight webcam flexion ~120°)
    const sampleMushtiPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 36, pip: 41 },
      index: { mcp: 81, pip: 81, dip: 53 },
      middle: { mcp: 80, pip: 91, dip: 68 },
      ring: { mcp: 74, pip: 90, dip: 62 },
      pinky: { mcp: 77, pip: 85, dip: 49 },
    };
    expect(evaluateMudraKinematics(sampleMushtiPose, CANONICAL_MUDRAS.mushti).isMastered).toBe(
      true
    );

    const tightMushtiPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 40, pip: 50 },
      index: { mcp: 85, pip: 120, dip: 75 },
      middle: { mcp: 85, pip: 122, dip: 75 },
      ring: { mcp: 80, pip: 120, dip: 75 },
      pinky: { mcp: 80, pip: 118, dip: 70 },
    };
    expect(evaluateMudraKinematics(tightMushtiPose, CANONICAL_MUDRAS.mushti).isMastered).toBe(
      true
    );
  });

  test('computes rolling temporal variability stats accurately for calibration telemetry', () => {
    const stats = computeTemporalFeatureStats([140, 142, 138, 140]);
    expect(stats.sampleCount).toBe(4);
    expect(stats.mean).toBeCloseTo(140, 2);
    expect(stats.min).toBe(138);
    expect(stats.max).toBe(142);
    expect(stats.stdDev).toBeCloseTo(1.41, 2);
  });

  test('stabilizes AI coach directives via anchor-vector similarity gate and sticky joint completion', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    // 1. Frame 0: index.pip is slightly more wrong than middle.pip in Mushti
    const frame0Pose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 35, pip: 42 },
      index: { mcp: 78, pip: 28, dip: 20 }, // -67° from 95° target
      middle: { mcp: 78, pip: 30, dip: 20 }, // -65° from 95° target
      ring: { mcp: 75, pip: 95, dip: 60 },
      pinky: { mcp: 75, pip: 92, dip: 60 },
    };

    // Frame 1 (50ms later): minor MediaPipe jitter (±3°) swaps raw rank #1 and #2 between index.pip and middle.pip
    const frame1JitterPose: typeof baseKinematics = {
      ...frame0Pose,
      index: { mcp: 78, pip: 31, dip: 20 }, // -64°
      middle: { mcp: 78, pip: 27, dip: 20 }, // -68°
    };

    const vec0 = extractKinematicsFeatureVector(frame0Pose);
    const vec1 = extractKinematicsFeatureVector(frame1JitterPose);
    expect(vec0).toHaveLength(17);
    expect(areKinematicsVectorsSimilar(vec0, vec1)).toBe(true);

    const rawEval0 = evaluateMudraKinematics(frame0Pose, CANONICAL_MUDRAS.mushti);
    const rawEval1 = evaluateMudraKinematics(frame1JitterPose, CANONICAL_MUDRAS.mushti);
    // Raw evaluation flips primary joint from index.pip to middle.pip on a 3° jitter
    expect(rawEval0.primaryJointKey).toBe('index.pip');
    expect(rawEval1.primaryJointKey).toBe('middle.pip');

    // Stabilized evaluation freezes the anchor directive on frame 1
    const step0 = stabilizeCoachingEvaluation(rawEval0, frame0Pose, null, 1000);
    expect(step0.stabilizedEval.primaryJointKey).toBe('index.pip');

    const step1 = stabilizeCoachingEvaluation(
      rawEval1,
      frame1JitterPose,
      step0.nextAnchor,
      1050
    );
    expect(step1.stabilizedEval.primaryJointKey).toBe('index.pip');
    expect(step1.stabilizedEval.primaryDirective).toBe(step0.stabilizedEval.primaryDirective);
    // Live matchScore is still updated every frame
    expect(step1.stabilizedEval.matchScore).toBe(rawEval1.matchScore);

    // 2. Frame 2 (400ms later): user is mid-way curling index.pip (moved +30° to 58°, still <73° min).
    // Even though vector moved >12° (not similar to anchor), sticky joint lock holds index.pip directive
    // while user is actively fixing it so the coach doesn't switch to middle.pip mid-action.
    const frame2MidActionPose: typeof baseKinematics = {
      ...frame0Pose,
      index: { mcp: 78, pip: 58, dip: 45 }, // still TOO_STRAIGHT (-37°), now less wrong than middle.pip (-65°)
      middle: { mcp: 78, pip: 30, dip: 20 },
    };
    const vec2 = extractKinematicsFeatureVector(frame2MidActionPose);
    expect(areKinematicsVectorsSimilar(vec0, vec2)).toBe(false);

    const rawEval2 = evaluateMudraKinematics(frame2MidActionPose, CANONICAL_MUDRAS.mushti);
    expect(rawEval2.primaryJointKey).toBe('middle.pip');

    const step2 = stabilizeCoachingEvaluation(
      rawEval2,
      frame2MidActionPose,
      step1.nextAnchor,
      1400
    );
    expect(step2.stabilizedEval.primaryJointKey).toBe('index.pip');
    expect(step2.stabilizedEval.primaryDirective).toContain('Curl your index finger');

    // 3. Frame 3 (600ms later): user finishes curling index.pip into CORRECT range (92°).
    // Even before minDwellMs (1400ms) expires, stabilizer immediately releases index.pip and advances to middle.pip!
    const frame3IndexFixedPose: typeof baseKinematics = {
      ...frame0Pose,
      index: { mcp: 78, pip: 92, dip: 65 }, // CORRECT
      middle: { mcp: 78, pip: 30, dip: 20 }, // still TOO_STRAIGHT
    };
    const rawEval3 = evaluateMudraKinematics(frame3IndexFixedPose, CANONICAL_MUDRAS.mushti);
    const step3 = stabilizeCoachingEvaluation(
      rawEval3,
      frame3IndexFixedPose,
      step2.nextAnchor,
      1600
    );
    expect(step3.stabilizedEval.primaryJointKey).toBe('middle.pip');
    expect(step3.stabilizedEval.primaryDirective).toBe(
      'Fold your middle finger firmly into your palm.'
    );
  });

  test('renders updated tolerance legend and optional Developer Diagnostic View with calibration snapshot', async ({
    page,
  }) => {
    // Verify legacy route slug 'musti' resolves to canonical 'mushti'
    await page.goto('/learn/mudras/practice/musti');

    await expect(
      page.getByRole('heading', { name: /MudraGuide: 3D Hand Pose Analysis/i })
    ).toBeVisible();

    const diagSwitch = page.getByRole('switch', { name: 'Toggle Developer Diagnostics' });
    await expect(diagSwitch).toBeVisible();
    await diagSwitch.click();

    await expect(
      page.getByText('Developer Diagnostic View (3D World-Landmark Telemetry & Calibration)')
    ).toBeVisible();

    const captureBtn = page.getByRole('button', { name: /Capture Calibration Snapshot/i });
    await captureBtn.click();

    const snapshotPre = page.getByTestId('calibration-snapshot-json');
    await expect(snapshotPre).toBeVisible();
    await expect(snapshotPre).toContainText('"mudraId": "mushti"');
    await expect(snapshotPre).toContainText('"mudraName": "Mushti"');
  });
});
