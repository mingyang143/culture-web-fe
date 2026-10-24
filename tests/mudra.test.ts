import { test, expect } from '@playwright/test';
import {
  Landmark3D,
  CoachingAnchorState,
  HoldTimerState,
  ThumbPlacementReferenceRequirement,
  MudraEvaluationResult,
} from 'types/mudra';
import {
  calculateJointAngle,
  calculateSpreadAngle,
  extractHandKinematics,
  smoothHandKinematics,
  hasValidWorldLandmarks,
  resolveHandedness,
  selectStickyHand,
} from 'utils/mudraKinematics';
import {
  evaluateMudraKinematics,
  computeTemporalFeatureStats,
  extractKinematicsFeatureVector,
  areKinematicsVectorsSimilar,
  stabilizeCoachingEvaluation,
  advanceHoldTimerState,
  getNormalizedJointError,
  formatFallbackThumbPlacementDirective,
  WITHIN_TARGET_RANGES_DIRECTIVE,
  STATUS_EXIT_HYSTERESIS_RATIO,
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

    // Degenerate zero-length and non-finite inputs return NaN (never valid 0° measurements)
    expect(
      Number.isNaN(
        calculateJointAngle({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 })
      )
    ).toBe(true);
    expect(
      Number.isNaN(
        calculateJointAngle(
          { x: Number.NaN, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 2, z: 0 }
        )
      )
    ).toBe(true);
    expect(
      Number.isNaN(calculateSpreadAngle({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }))
    ).toBe(true);

    // Verify unavailable geometry propagates consistently through scoring and timing:
    // Degenerate landmarks with NaN or zero-length bone return null kinematics
    const degenerateHand = createSyntheticWorldHand();
    degenerateHand[6] = { x: degenerateHand[5].x, y: degenerateHand[5].y, z: degenerateHand[5].z }; // collapsed zero-length index bone 5->6
    const degenKinematics = extractHandKinematics(degenerateHand, 'Right');
    expect(degenKinematics).toBeNull();

    // Evaluating null kinematics returns MEASUREMENT_UNAVAILABLE and score 0
    const degenEval = evaluateMudraKinematics(degenKinematics, CANONICAL_MUDRAS.pathaka);
    expect(degenEval.measurementStatus).toBe('MEASUREMENT_UNAVAILABLE');
    expect(degenEval.matchScore).toBe(0);
    expect(degenEval.isMastered).toBe(false);

    // Timing hard-resets on MEASUREMENT_UNAVAILABLE
    const resetTimer = advanceHoldTimerState(
      { holdElapsedMs: 1200, dropoutElapsedMs: 0, isHoldMastered: false, hasValidAnchor: true },
      degenEval,
      33
    );
    expect(resetTimer.holdElapsedMs).toBe(0);
    expect(resetTimer.hasValidAnchor).toBe(false);
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
    expect(unavailableEval.isValidHoldFrame).toBe(false);
    expect(unavailableEval.isFlawless).toBe(false);
    expect(unavailableEval.jointEvaluations).toHaveLength(0);
  });

  test('uses identical condition-matching logic for primary and secondary directives', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    // Case 1: Both index.pip (+65° over 95° target) and pinky.pip (+60° over 92° target) are TOO_BENT in Mushti.
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
    expect(pathakaEval.isValidHoldFrame).toBe(true);
    expect(pathakaEval.isFlawless).toBe(true);
    expect(pathakaEval.primaryDirective).toBe(WITHIN_TARGET_RANGES_DIRECTIVE);
    expect(pathakaEval.primaryDirective).not.toContain('Flawless Form');
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
    expect(thripathakaEval.isFlawless).toBe(true);
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

    // 4. Katakam (#3): upright pose
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
        thumbMiddle: 0.95,
      },
    };
    const uprightKatakamEval = evaluateMudraKinematics(
      uprightKatakamPose,
      CANONICAL_MUDRAS.katakam
    );
    expect(uprightKatakamEval.isMastered).toBe(true);
    expect(uprightKatakamEval.matchScore).toBe(100);

    // 5. Mushti (#4): closed fist
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
  });

  test('verifies feature-specific units (deg vs palmRatio) and tolerance-normalized hysteresis margins', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    const mudrakhyamPose: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 21, pip: 15 },
      index: { mcp: 55, pip: 61, dip: 33 },
      middle: { mcp: 19, pip: 20, dip: 14 },
      ring: { mcp: 22, pip: 19, dip: 9 },
      pinky: { mcp: 23, pip: 16, dip: 11 },
      tipDistances: {
        thumbIndex: 0.31,
        thumbMiddle: 0.85,
        thumbRing: 0.92,
        thumbPinky: 1.05,
      },
    };

    // 1. Feature vector keeps [0..12] in degrees and [13..16] in native palmRatio (never * 100)
    const vec = extractKinematicsFeatureVector(mudrakhyamPose);
    expect(vec).toHaveLength(17);
    expect(vec[13]).toBeCloseTo(0.31, 4);
    expect(vec[14]).toBeCloseTo(0.85, 4);

    // Moving thumbIndex contact by 0.08 palm widths (> 0.06 threshold) breaks vector similarity
    const brokenContactPose: typeof baseKinematics = {
      ...mudrakhyamPose,
      tipDistances: { ...mudrakhyamPose.tipDistances, thumbIndex: 0.39 },
    };
    expect(
      areKinematicsVectorsSimilar(vec, extractKinematicsFeatureVector(brokenContactPose))
    ).toBe(false);

    // 2. JointEvaluations explicitly tag 'deg' vs 'palmRatio' and compute dimensionless normalizedError
    const evalRes = evaluateMudraKinematics(mudrakhyamPose, CANONICAL_MUDRAS.mudrakhyam);
    const contactEval = evalRes.jointEvaluations.find(
      (j) => j.jointKey === 'contact.thumbIndex'
    );
    const indexPipEval = evalRes.jointEvaluations.find((j) => j.jointKey === 'index.pip');

    expect(contactEval).toBeDefined();
    expect(contactEval?.unit).toBe('palmRatio');
    expect(contactEval?.rawValue).toBeCloseTo(0.31, 3);
    expect(contactEval?.targetDegrees).toBeCloseTo(0.45, 2); // maxDistance in palmRatio
    expect(getNormalizedJointError(contactEval!)).toBeCloseTo(0.31 / 0.45, 2);

    expect(indexPipEval).toBeDefined();
    expect(indexPipEval?.unit).toBe('deg');

    // 3. Tolerance-normalized exit hysteresis (8% of maxDistance = 0.45 * 1.08 = 0.486 palmRatio)
    const step0 = stabilizeCoachingEvaluation(evalRes, mudrakhyamPose, null, 1000);
    expect(step0.stabilizedEval.isMastered).toBe(true);

    // A tiny contact fluctuation to 0.47 palmRatio (normalizedError = 1.044 <= 1.08) stays CORRECT under exit hysteresis
    // for a brief frame, but isValidHoldFrame is false so it earns 0ms hold time.
    const slightContactSlip: typeof baseKinematics = {
      ...mudrakhyamPose,
      tipDistances: { ...mudrakhyamPose.tipDistances, thumbIndex: 0.47 },
    };
    const rawSlipEval = evaluateMudraKinematics(slightContactSlip, CANONICAL_MUDRAS.mudrakhyam);
    expect(rawSlipEval.isMastered).toBe(false);
    const step1 = stabilizeCoachingEvaluation(
      rawSlipEval,
      slightContactSlip,
      step0.nextAnchor,
      1033
    );
    expect(
      step1.stabilizedEval.jointEvaluations.find((j) => j.jointKey === 'contact.thumbIndex')
        ?.status
    ).toBe('CORRECT');
    expect(step1.stabilizedEval.isValidHoldFrame).toBe(false);

    // A real contact separation to 0.52 palmRatio (normalizedError = 1.156 > 1.08) immediately fails even with hysteresis
    const realContactBreak: typeof baseKinematics = {
      ...mudrakhyamPose,
      tipDistances: { ...mudrakhyamPose.tipDistances, thumbIndex: 0.52 },
    };
    const rawBreakEval = evaluateMudraKinematics(realContactBreak, CANONICAL_MUDRAS.mudrakhyam);
    const step2 = stabilizeCoachingEvaluation(
      rawBreakEval,
      realContactBreak,
      step0.nextAnchor,
      1066
    );
    expect(step2.stabilizedEval.isMastered).toBe(false);
    expect(STATUS_EXIT_HYSTERESIS_RATIO).toBeCloseTo(0.08, 4);
  });

  test('paired boundary tests: (a) valid pose with brief noise passes, (b) 24.2-31.2° out-of-range replay fails, (c) failing pose entry never passes, (d) departure stops hold fast', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    const canonicalPathaka: typeof baseKinematics = {
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

    // --- PAIR A: Valid boundary pose (mean ~31.8° inside [30°, 86°]) with a single brief (<100ms) dip to 28.8° ---
    const validSteadyCycle = [32.5, 32.2, 31.8, 31.6, 32.0, 32.4, 32.1, 31.9];
    let smoothedA: typeof baseKinematics | null = null;
    let anchorA: CoachingAnchorState | null = null;
    let holdA: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    let nowA = 1000;
    const dtMs = 34;

    for (let i = 0; i < 66; i += 1) {
      // Inject a single brief 2-frame boundary dip at frames 10..11 (29.2°, 28.8°), valid elsewhere
      let rawPip = validSteadyCycle[i % validSteadyCycle.length];
      if (i === 10) rawPip = 29.2;
      if (i === 11) rawPip = 28.8;
      const frameKin = { ...canonicalPathaka, ring: { mcp: 35, pip: rawPip, dip: 10 } };
      smoothedA = smoothHandKinematics(smoothedA, frameKin, 0.4, dtMs);
      const rawEval = evaluateMudraKinematics(smoothedA, CANONICAL_MUDRAS.pathaka);
      const { stabilizedEval, nextAnchor } = stabilizeCoachingEvaluation(
        rawEval,
        smoothedA,
        anchorA,
        nowA
      );
      anchorA = nextAnchor;
      holdA = advanceHoldTimerState(holdA, stabilizedEval, dtMs, 2000);
      expect(stabilizedEval.isMastered).toBe(true);
      expect(stabilizedEval.primaryDirective).not.toContain('Flawless Form');
      if (!stabilizedEval.isFlawless) {
        expect(stabilizedEval.primaryDirective).not.toContain('Within target ranges');
      }
      nowA += dtMs;
    }
    expect(holdA.isHoldMastered).toBe(true);
    expect(holdA.holdElapsedMs).toBe(2000);

    // --- PAIR B: Synthetic 24.2°–31.2° out-of-range replay (10-frame cycle, 6/10 frames < 30°, mean 28.04° < 30°) ---
    // Because 6/10 frames lie below the configured [30°, 86°] accepted range, this sequence MUST NOT complete the hold
    // and MUST exit mastery to show corrective ring.pip feedback once the 350ms exit-hysteresis window expires.
    const outOfRangeSeries = [
      31.2, 30.8, 30.1, 28.4, 26.8, 25.1, 24.2, 25.5, 27.9, 30.4,
    ];
    expect(outOfRangeSeries).toHaveLength(10);
    expect(outOfRangeSeries.filter((deg) => deg < 30.0)).toHaveLength(6);
    let smoothedB: typeof baseKinematics | null = null;
    let anchorB: CoachingAnchorState | null = null;
    let holdB: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    let nowB = 1000;
    let failedFrameCount = 0;

    for (let i = 0; i < 72; i += 1) {
      const rawPip = outOfRangeSeries[i % outOfRangeSeries.length];
      const frameKin = { ...canonicalPathaka, ring: { mcp: 34, pip: rawPip, dip: 10 } };
      smoothedB = smoothHandKinematics(smoothedB, frameKin, 0.4, dtMs);
      const rawEval = evaluateMudraKinematics(smoothedB, CANONICAL_MUDRAS.pathaka);
      const { stabilizedEval, nextAnchor } = stabilizeCoachingEvaluation(
        rawEval,
        smoothedB,
        anchorB,
        nowB
      );
      anchorB = nextAnchor;
      holdB = advanceHoldTimerState(holdB, stabilizedEval, dtMs, 2000);
      if (!stabilizedEval.isMastered) {
        failedFrameCount += 1;
      }
      nowB += dtMs;
    }
    expect(holdB.isHoldMastered).toBe(false);
    expect(holdB.holdElapsedMs).toBeLessThan(400);
    expect(failedFrameCount).toBeGreaterThan(40);

    // --- PAIR C: Entry from a sustained failing pose (ring.pip = 28.5° < 30.0°) ---
    // Even though 28.5° is within the 8% exit-hysteresis band (27.76°..30.0°), starting from a failing pose
    // must NEVER enter isMastered = true or accumulate any hold time.
    let smoothedC: typeof baseKinematics | null = null;
    let anchorC: CoachingAnchorState | null = null;
    let holdC: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    let nowC = 1000;

    for (let i = 0; i < 60; i += 1) {
      const frameKin = { ...canonicalPathaka, ring: { mcp: 34, pip: 28.5, dip: 10 } };
      smoothedC = smoothHandKinematics(smoothedC, frameKin, 0.4, dtMs);
      const rawEval = evaluateMudraKinematics(smoothedC, CANONICAL_MUDRAS.pathaka);
      const { stabilizedEval, nextAnchor } = stabilizeCoachingEvaluation(
        rawEval,
        smoothedC,
        anchorC,
        nowC
      );
      anchorC = nextAnchor;
      holdC = advanceHoldTimerState(holdC, stabilizedEval, dtMs, 2000);
      expect(stabilizedEval.isMastered).toBe(false);
      expect(stabilizedEval.isValidHoldFrame).toBe(false);
      expect(holdC.holdElapsedMs).toBe(0);
      nowC += dtMs;
    }

    // --- PAIR D: Departure from a passing pose (ring.pip drops from 50° to 20°) ---
    // Verify hold accumulation stops on the first frame below 30° and coaching switches to ring.pip error within 2 frames.
    let smoothedD: typeof baseKinematics | null = null;
    let anchorD: CoachingAnchorState | null = null;
    let holdD: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    let nowD = 1000;

    // 10 frames of passing pose (50°): Frame 0 anchors (0ms), Frames 1..9 earn 9 * 34ms = 306ms
    for (let i = 0; i < 10; i += 1) {
      const frameKin = { ...canonicalPathaka, ring: { mcp: 38, pip: 50, dip: 10 } };
      smoothedD = smoothHandKinematics(smoothedD, frameKin, 0.4, dtMs);
      const rawEval = evaluateMudraKinematics(smoothedD, CANONICAL_MUDRAS.pathaka);
      const { stabilizedEval, nextAnchor } = stabilizeCoachingEvaluation(
        rawEval,
        smoothedD,
        anchorD,
        nowD
      );
      anchorD = nextAnchor;
      holdD = advanceHoldTimerState(holdD, stabilizedEval, dtMs, 2000);
      nowD += dtMs;
    }
    const holdBeforeDeparture = holdD.holdElapsedMs;
    expect(holdBeforeDeparture).toBe(306);

    // Step departure to 20° (outside accepted range [30°, 86°])
    const departFrame1 = { ...canonicalPathaka, ring: { mcp: 20, pip: 20, dip: 10 } };
    smoothedD = smoothHandKinematics(smoothedD, departFrame1, 0.4, dtMs);
    const rawDepart1 = evaluateMudraKinematics(smoothedD, CANONICAL_MUDRAS.pathaka);
    const stabDepart1 = stabilizeCoachingEvaluation(rawDepart1, smoothedD, anchorD, nowD);
    anchorD = stabDepart1.nextAnchor;
    holdD = advanceHoldTimerState(holdD, stabDepart1.stabilizedEval, dtMs, 2000);
    nowD += dtMs;

    // Frame 1 of departure (34ms): smoothed ring.pip drops from 50° -> 29° (because |Δθ|=30° > 10° triggers 0.70 step-blend).
    // Hold accumulation stops immediately on Frame 1 (+0ms earned), and "Within target ranges" is NOT shown!
    expect(stabDepart1.stabilizedEval.isValidHoldFrame).toBe(false);
    expect(stabDepart1.stabilizedEval.isFlawless).toBe(false);
    expect(stabDepart1.stabilizedEval.primaryDirective).not.toContain('Within target ranges');
    expect(holdD.holdElapsedMs).toBe(holdBeforeDeparture);

    // Frame 2 of departure (68ms): smoothed ring.pip is 25.4° (< 27.76° hysteresis limit) -> coaching immediately updates!
    smoothedD = smoothHandKinematics(smoothedD, departFrame1, 0.4, dtMs);
    const rawDepart2 = evaluateMudraKinematics(smoothedD, CANONICAL_MUDRAS.pathaka);
    const stabDepart2 = stabilizeCoachingEvaluation(rawDepart2, smoothedD, anchorD, nowD);
    expect(stabDepart2.stabilizedEval.isMastered).toBe(false);
    expect(stabDepart2.stabilizedEval.primaryJointKey).toBe('ring.pip');
    expect(stabDepart2.stabilizedEval.primaryDirective).toContain('bend your ring finger forward');
  });

  test('measures combined response latency across 15 FPS, 30 FPS, and 60 FPS and resets state on hand switch / tracking loss', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    const canonicalPathaka: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 19, pip: 14 },
      index: { mcp: 18, pip: 16, dip: 12 },
      middle: { mcp: 15, pip: 17, dip: 11 },
      ring: { mcp: 38, pip: 50, dip: 10 },
      pinky: { mcp: 26, pip: 18, dip: 10 },
      spreadIndexMiddle: 8,
      spreadMiddleRing: 33,
      spreadRingPinky: 40,
    };

    const testFrameRateResponse = (fps: number) => {
      const dtMs = 1000 / fps;
      let smoothed: typeof baseKinematics | null = null;
      let anchor: CoachingAnchorState | null = null;
      let hold: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
      let now = 1000;

      // Establish ~500ms of valid hold
      const warmupFrames = Math.round(500 / dtMs) + 1;
      for (let i = 0; i < warmupFrames; i += 1) {
        smoothed = smoothHandKinematics(smoothed, canonicalPathaka, 0.4, dtMs);
        const rawEval = evaluateMudraKinematics(smoothed, CANONICAL_MUDRAS.pathaka);
        const res = stabilizeCoachingEvaluation(rawEval, smoothed, anchor, now);
        anchor = res.nextAnchor;
        hold = advanceHoldTimerState(hold, res.stabilizedEval, dtMs, 2000);
        now += dtMs;
      }
      const peakHoldMs = hold.holdElapsedMs;

      // Inject sustained real error: ring.pip drops from 50° to 15°
      const errorPose = { ...canonicalPathaka, ring: { mcp: 15, pip: 15, dip: 8 } };
      let msToStopHold = -1;
      let msToCoachUpdate = -1;

      for (let f = 1; f <= 10; f += 1) {
        smoothed = smoothHandKinematics(smoothed, errorPose, 0.4, dtMs);
        const rawEval = evaluateMudraKinematics(smoothed, CANONICAL_MUDRAS.pathaka);
        const res = stabilizeCoachingEvaluation(rawEval, smoothed, anchor, now);
        anchor = res.nextAnchor;
        hold = advanceHoldTimerState(hold, res.stabilizedEval, dtMs, 2000);

        if (msToStopHold < 0 && hold.holdElapsedMs <= peakHoldMs) {
          msToStopHold = Math.round(f * dtMs);
        }
        if (
          msToCoachUpdate < 0 &&
          !res.stabilizedEval.isMastered &&
          res.stabilizedEval.primaryJointKey === 'ring.pip'
        ) {
          msToCoachUpdate = Math.round(f * dtMs);
        }
        now += dtMs;
      }

      return { msToStopHold, msToCoachUpdate };
    };

    const r15 = testFrameRateResponse(15); // dt = 66.7ms
    const r30 = testFrameRateResponse(30); // dt = 33.3ms
    const r60 = testFrameRateResponse(60); // dt = 16.7ms

    // Across 15, 30, and 60 FPS, hold accumulation stops on the very first error frame (17–67ms)
    // and corrective coaching updates within <= 67ms (1–2 frames).
    expect(r15.msToStopHold).toBeLessThanOrEqual(67);
    expect(r30.msToStopHold).toBeLessThanOrEqual(34);
    expect(r60.msToStopHold).toBeLessThanOrEqual(17);

    expect(r15.msToCoachUpdate).toBeLessThanOrEqual(67);
    expect(r30.msToCoachUpdate).toBeLessThanOrEqual(67);
    expect(r60.msToCoachUpdate).toBeLessThanOrEqual(34);

    // Verify handedness switch ('Right' -> 'Left') resets hold timer and anchor state
    const rightEval = evaluateMudraKinematics(
      { ...canonicalPathaka, handedness: 'Right' },
      CANONICAL_MUDRAS.pathaka
    );
    const leftEval = evaluateMudraKinematics(
      { ...canonicalPathaka, handedness: 'Left' },
      CANONICAL_MUDRAS.pathaka
    );
    let holdState: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    // Frame 0 establishes anchor (0ms), followed by 4 valid 200ms intervals (= 800ms)
    holdState = advanceHoldTimerState(holdState, rightEval, 33, 2000);
    expect(holdState.holdElapsedMs).toBe(0);
    expect(holdState.hasValidAnchor).toBe(true);
    for (let step = 0; step < 4; step += 1) {
      holdState = advanceHoldTimerState(holdState, rightEval, 200, 2000);
    }
    expect(holdState.holdElapsedMs).toBe(800);

    // Switching hand to 'Left' mid-hold resets holdElapsedMs to 0 and clears hasValidAnchor
    holdState = advanceHoldTimerState(holdState, leftEval, 100, 2000);
    expect(holdState.holdElapsedMs).toBe(0);
    expect(holdState.hasValidAnchor).toBe(false);
    expect(holdState.handedness).toBe('Left');

    // Verify selectStickyHand locks onto the active hand across multi-hand frames
    const mockLeftHand = [{ x: 0.3, y: 0.5, z: 0 }];
    const mockRightHand = [{ x: 0.7, y: 0.5, z: 0 }];

    // Empty/missing returns null
    expect(selectStickyHand(null)).toBeNull();
    expect(selectStickyHand({ landmarks: [] })).toBeNull();

    // 1. Single hand returns immediately
    const singleHandResult = selectStickyHand({
      landmarks: [mockLeftHand],
      handedness: [[{ categoryName: 'Left', score: 0.92 }]],
    });
    expect(singleHandResult).not.toBeNull();
    expect(singleHandResult?.handedness).toBe('Left');
    expect(singleHandResult?.handIndex).toBe(0);

    // 2. Multiple hands with no prior hand picks higher-confidence hand
    const initialMultiResult = selectStickyHand({
      landmarks: [mockRightHand, mockLeftHand],
      handedness: [
        [{ categoryName: 'Right', score: 0.95 }],
        [{ categoryName: 'Left', score: 0.85 }],
      ],
    });
    expect(initialMultiResult?.handIndex).toBe(0);
    expect(initialMultiResult?.handedness).toBe('Right');

    // 3. Multiple hands where student is actively practicing with 'Left':
    // Even if Right hand has higher confidence score (0.96 vs 0.88) and appears at index 0,
    // selectStickyHand sticks to candidate 1 ('Left')
    const stickyLeftResult = selectStickyHand(
      {
        landmarks: [mockRightHand, mockLeftHand],
        handedness: [
          [{ categoryName: 'Right', score: 0.96 }],
          [{ categoryName: 'Left', score: 0.88 }],
        ],
      },
      {
        prevHandedness: 'Left',
        prevWrist2D: { x: 0.31, y: 0.51 },
      }
    );
    expect(stickyLeftResult).not.toBeNull();
    expect(stickyLeftResult?.handIndex).toBe(1);
    expect(stickyLeftResult?.handedness).toBe('Left');

    // 4. Proximity fallback: when candidate handedness is identical/unknown, closer wrist wins
    const proximityResult = selectStickyHand(
      {
        landmarks: [mockRightHand, mockLeftHand],
        handedness: [
          [{ categoryName: 'Right', score: 0.9 }],
          [{ categoryName: 'Right', score: 0.89 }],
        ],
      },
      {
        prevHandedness: 'Right',
        prevWrist2D: { x: 0.69, y: 0.51 }, // close to mockRightHand (0.7, 0.5)
      }
    );
    expect(proximityResult?.handIndex).toBe(0);
  });

  test('enforces strict target-range wording, mandatory vs non-signature criteria, and hold-time accounting', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    const canonicalPathaka: typeof baseKinematics = {
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

    const passingEval = evaluateMudraKinematics(canonicalPathaka, CANONICAL_MUDRAS.pathaka);
    expect(passingEval.isMastered).toBe(true);
    expect(passingEval.isValidHoldFrame).toBe(true);
    expect(passingEval.isFlawless).toBe(true);
    expect(passingEval.primaryDirective).toBe(WITHIN_TARGET_RANGES_DIRECTIVE);

    // 1. Non-signature joint (pinky.mcp, weight 1.2 < 2.0) with permitted MINOR_DEVIATION (46°, target 22°±20°, normErr = 1.20):
    //    Passes mandatory criteria (matchScore >= 88, signature joints <= 1.0), but MUST NOT claim "Within target ranges".
    const nonSignatureDeviationPose: typeof baseKinematics = {
      ...canonicalPathaka,
      pinky: { mcp: 46, pip: 18, dip: 10 },
    };
    const nonSigEval = evaluateMudraKinematics(
      nonSignatureDeviationPose,
      CANONICAL_MUDRAS.pathaka
    );
    expect(nonSigEval.isMastered).toBe(true);
    expect(nonSigEval.isValidHoldFrame).toBe(true);
    expect(nonSigEval.isFlawless).toBe(false);
    expect(nonSigEval.primaryDirective).not.toContain('Within target ranges');
    expect(nonSigEval.primaryDirective).toContain(
      'Good Form — hold steady! Optional refinement (Pinky Base (MCP)):'
    );

    const stabilizedNonSig = stabilizeCoachingEvaluation(
      nonSigEval,
      nonSignatureDeviationPose,
      null,
      1000
    );
    expect(stabilizedNonSig.stabilizedEval.isMastered).toBe(true);
    expect(stabilizedNonSig.stabilizedEval.isFlawless).toBe(false);
    expect(stabilizedNonSig.stabilizedEval.primaryDirective).not.toContain('Within target ranges');
    expect(stabilizedNonSig.stabilizedEval.primaryDirective).toBe(
      'Good Form — hold steady! Optional refinement (Pinky Base (MCP)): Your Pinky Base (MCP) is too bent by ~22°. Adjust to ~24°.'
    );
    // Verify prefix is never recursively duplicated even when parenthesized joint labels are present
    expect(
      stabilizedNonSig.stabilizedEval.primaryDirective.split('Optional refinement (').length - 1
    ).toBe(1);

    // 2. Hold-time accounting:
    //    (a) First valid frame establishes anchor (hasValidAnchor: true) and credits 0ms before an observed elapsed interval.
    let state: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    state = advanceHoldTimerState(state, passingEval, 33, 2000, 350);
    expect(state.holdElapsedMs).toBe(0);
    expect(state.hasValidAnchor).toBe(true);

    //    (b) Subsequent valid frames across valid observed intervals (0 < dtMs <= 250ms) earn +dtMs.
    state = advanceHoldTimerState(state, passingEval, 200, 2000, 350);
    state = advanceHoldTimerState(state, passingEval, 200, 2000, 350);
    state = advanceHoldTimerState(state, passingEval, 200, 2000, 350);
    expect(state.holdElapsedMs).toBe(600);

    //    (c) Stalled frames or background-tab gaps (dtMs > 250ms or dtMs = 0) earn +0ms.
    state = advanceHoldTimerState(state, passingEval, 800, 2000, 350);
    expect(state.holdElapsedMs).toBe(600);
    state = advanceHoldTimerState(state, passingEval, 0, 2000, 350);
    expect(state.holdElapsedMs).toBe(600);

    //    (d) Hysteresis-only frames (isMastered: true, isValidHoldFrame: false) earn +0ms, clear hasValidAnchor, and consume grace.
    const hysteresisEval = {
      ...passingEval,
      matchScore: 86,
      isMastered: true,
      isValidHoldFrame: false,
      isFlawless: false,
    };
    state = advanceHoldTimerState(state, hysteresisEval, 200, 2000, 350);
    expect(state.holdElapsedMs).toBe(600);
    expect(state.hasValidAnchor).toBe(false);
    expect(state.totalGraceUsedMs).toBe(200);

    //    (e) Resuming valid pose after an invalid frame first re-anchors (+0ms on transition frame), then earns +dtMs on the next valid interval.
    state = advanceHoldTimerState(state, passingEval, 100, 2000, 350);
    expect(state.holdElapsedMs).toBe(600);
    expect(state.hasValidAnchor).toBe(true);
    state = advanceHoldTimerState(state, passingEval, 100, 2000, 350);
    expect(state.holdElapsedMs).toBe(700);
    expect(state.totalGraceUsedMs).toBe(200); // Cumulative grace used is retained during the attempt

    //    (f) Second 200ms dip pushes totalGraceUsedMs to 400ms (> 350ms graceWindowMs) -> decays by 0.75 * 200 = 150ms!
    state = advanceHoldTimerState(state, hysteresisEval, 200, 2000, 350);
    expect(state.totalGraceUsedMs).toBe(400);
    expect(state.holdElapsedMs).toBe(550);

    //    (g) Completion can NEVER occur on an invalid frame, even if holdElapsedMs is near/at holdDurationMs.
    const nearCompleteState: HoldTimerState = {
      holdElapsedMs: 1995,
      dropoutElapsedMs: 0,
      totalGraceUsedMs: 0,
      hasValidAnchor: true,
      isHoldMastered: false,
    };
    const afterInvalidNearEnd = advanceHoldTimerState(
      nearCompleteState,
      hysteresisEval,
      100,
      2000,
      350
    );
    expect(afterInvalidNearEnd.isHoldMastered).toBe(false);
    expect(afterInvalidNearEnd.holdElapsedMs).toBe(1995);
    expect(afterInvalidNearEnd.hasValidAnchor).toBe(false);

    //    (h) Tracking loss hard-resets holdElapsedMs to 0 and clears hasValidAnchor.
    const afterTrackingLoss = advanceHoldTimerState(afterInvalidNearEnd, null, 33, 2000, 350);
    expect(afterTrackingLoss.holdElapsedMs).toBe(0);
    expect(afterTrackingLoss.hasValidAnchor).toBe(false);
    expect(afterTrackingLoss.isHoldMastered).toBe(false);
  });

  test('computes rolling temporal variability stats accurately for calibration telemetry', () => {
    const stats = computeTemporalFeatureStats([140, 142, 138, 140]);
    expect(stats.sampleCount).toBe(4);
    expect(stats.mean).toBeCloseTo(140, 2);
    expect(stats.min).toBe(138);
    expect(stats.max).toBe(142);
    expect(stats.stdDev).toBeCloseTo(1.41, 2);
  });

  test('paired Thripathaka reproduction: inward vs outward thumb with identical 4-finger posture, IP label verification, and palm-relative thumbPlacement', () => {
    const buildThripathakaHand = (
      thumbCmcDeg: number,
      thumbMcpBendSignedDeg: number,
      thumbIpBendSignedDeg: number
    ): Landmark3D[] => {
      const pts: Landmark3D[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
      pts[0] = { x: 0, y: 0, z: 0 };

      const buildChain = (
        p0: Landmark3D,
        baseAngleDeg: number,
        lengths: [number, number, number],
        mcpDeg: number,
        pipDeg: number,
        dipDeg: number
      ): [Landmark3D, Landmark3D, Landmark3D] => {
        const toRad = (d: number) => (d * Math.PI) / 180;
        const a1 = toRad(baseAngleDeg);
        const dir1 = {
          x: Math.sin(a1),
          y: Math.cos(a1) * Math.cos(toRad(mcpDeg)),
          z: -Math.sin(toRad(mcpDeg)),
        };
        const p1 = {
          x: p0.x + dir1.x * lengths[0],
          y: p0.y + dir1.y * lengths[0],
          z: p0.z + dir1.z * lengths[0],
        };
        const a2 = toRad(mcpDeg + pipDeg);
        const dir2 = {
          x: Math.sin(a1) * Math.cos(toRad(pipDeg)),
          y: Math.cos(a1) * Math.cos(a2),
          z: -Math.sin(a2),
        };
        const p2 = {
          x: p1.x + dir2.x * lengths[1],
          y: p1.y + dir2.y * lengths[1],
          z: p1.z + dir2.z * lengths[1],
        };
        const a3 = toRad(mcpDeg + pipDeg + dipDeg);
        const dir3 = {
          x: Math.sin(a1) * Math.cos(toRad(pipDeg + dipDeg)),
          y: Math.cos(a1) * Math.cos(a3),
          z: -Math.sin(a3),
        };
        const p3 = {
          x: p2.x + dir3.x * lengths[2],
          y: p2.y + dir3.y * lengths[2],
          z: p2.z + dir3.z * lengths[2],
        };
        return [p1, p2, p3];
      };

      // Identical 4-finger posture across all paired poses
      pts[5] = { x: -0.019, y: 0.082, z: 0 };
      [pts[6], pts[7], pts[8]] = buildChain(pts[5], -8, [0.028, 0.02, 0.016], 14, 16, 8);
      pts[9] = { x: -0.005, y: 0.085, z: 0 };
      [pts[10], pts[11], pts[12]] = buildChain(pts[9], 0, [0.03, 0.022, 0.017], 10, 16, 8);
      pts[13] = { x: 0.009, y: 0.081, z: 0 };
      [pts[14], pts[15], pts[16]] = buildChain(pts[13], 8, [0.028, 0.02, 0.016], 12, 18, 8);
      pts[17] = { x: 0.022, y: 0.074, z: 0 };
      [pts[18], pts[19], pts[20]] = buildChain(pts[17], 17, [0.024, 0.017, 0.014], 15, 15, 8);

      // Thumb chain 1 -> 2 -> 3 -> 4
      const toRad = (d: number) => (d * Math.PI) / 180;
      pts[1] = { x: -0.018, y: 0.024, z: -0.006 };
      const a1 = toRad(thumbCmcDeg);
      pts[2] = {
        x: pts[1].x + Math.sin(a1) * 0.03,
        y: pts[1].y + Math.cos(a1) * 0.03,
        z: pts[1].z - 0.003,
      };
      const a2 = toRad(thumbCmcDeg + thumbMcpBendSignedDeg);
      pts[3] = {
        x: pts[2].x + Math.sin(a2) * 0.025,
        y: pts[2].y + Math.cos(a2) * 0.025,
        z: pts[2].z - 0.003,
      };
      const a3 = toRad(thumbCmcDeg + thumbMcpBendSignedDeg + thumbIpBendSignedDeg);
      pts[4] = {
        x: pts[3].x + Math.sin(a3) * 0.02,
        y: pts[3].y + Math.cos(a3) * 0.02,
        z: pts[3].z - 0.003,
      };

      return pts;
    };

    // Pose A: Approved inward-thumb Thripathaka (MCP ~26°, IP ~38°, tucked inward alongside palm)
    const poseA = extractHandKinematics(buildThripathakaHand(-14, 26, 38), 'Right')!;
    // Pose B1 (Screenshot 2): Outward extended thumb with MCP ~9°, IP ~22°
    const poseB1 = extractHandKinematics(buildThripathakaHand(-38, -9, -22), 'Right')!;
    // Pose B2 (Screenshot 1): Outward extended thumb with MCP ~9°, IP ~10° -> matchScore = 95%
    const poseB2 = extractHandKinematics(buildThripathakaHand(-42, -9, -10), 'Right')!;
    // Pose B3: Outward-bent thumb with exact target scalar angles MCP ~26°, IP ~38°
    const poseB3 = extractHandKinematics(buildThripathakaHand(-25, -26, -38), 'Right')!;

    // Verify 4 fingers are identical across all 4 paired poses
    expect(poseB1.index).toEqual(poseA.index);
    expect(poseB2.middle).toEqual(poseA.middle);
    expect(poseB3.ring).toEqual(poseA.ring);
    expect(poseB3.pinky).toEqual(poseA.pinky);

    const evalA = evaluateMudraKinematics(poseA, CANONICAL_MUDRAS.thripathaka);
    const evalB1 = evaluateMudraKinematics(poseB1, CANONICAL_MUDRAS.thripathaka);
    const evalB2 = evaluateMudraKinematics(poseB2, CANONICAL_MUDRAS.thripathaka);
    const evalB3 = evaluateMudraKinematics(poseB3, CANONICAL_MUDRAS.thripathaka);

    // 1. Verify Thumb Joint (IP) label on vertex landmark 3 ('2-3-4')
    const thumbIpEvalB1 = evalB1.jointEvaluations.find((j) => j.jointKey === 'thumb.pip')!;
    expect(thumbIpEvalB1.label).toBe('Thumb Joint (IP)');
    expect(thumbIpEvalB1.triplet).toBe('2-3-4');

    // 2. Pose A (Approved inward-thumb Thripathaka) passes with 100% match score and flawless mastery
    expect(evalA.matchScore).toBe(100);
    expect(evalA.isMastered).toBe(true);
    expect(evalA.isValidHoldFrame).toBe(true);
    expect(evalA.isFlawless).toBe(true);
    expect(evalA.primaryDirective).toBe(WITHIN_TARGET_RANGES_DIRECTIVE);

    // 3. Paired Rejection Evidence: Pose B3 has exact 26°/38° scalar angles but abducted outward thumb
    // Must be actively REJECTED by thumbPlacement requirements with score <= 65% and corrective directive
    expect(evalB3.matchScore).toBeLessThanOrEqual(65);
    expect(evalB3.isMastered).toBe(false);
    expect(evalB3.isValidHoldFrame).toBe(false);
    expect(evalB3.isFlawless).toBe(false);
    expect(evalB2.isMastered).toBe(false); // Outward Pose B2 is likewise rejected by thumb placement

    const placementEvalB3 = evalB3.jointEvaluations.find(
      (j) => j.jointKey === 'thumbPlacement.radialGapFromIndexMcp'
    );
    expect(placementEvalB3).toBeDefined();
    expect(placementEvalB3?.status).toBe('INCORRECT');
    expect(placementEvalB3?.rawValue).toBeGreaterThan(0.5); // abducted outward >0.5
    expect(evalB3.primaryDirective).toContain(
      'In Kathakali Thripathaka (#17), tuck your thumb inward alongside your palm face rather than abducting outward.'
    );

    // 4. Inward pose with permitted minor IP deviation (MCP 26°, IP 18° -> matchScore >= 88%, isMastered = true)
    const poseAMinor = extractHandKinematics(buildThripathakaHand(-14, 26, 18), 'Right')!;
    const evalAMinor = evaluateMudraKinematics(poseAMinor, CANONICAL_MUDRAS.thripathaka);
    expect(evalAMinor.isMastered).toBe(true);
    expect(evalAMinor.isValidHoldFrame).toBe(true);
    expect(evalAMinor.isFlawless).toBe(false);

    // Multi-frame stabilization on poseAMinor must NEVER duplicate the "Optional refinement (...)" prefix
    let anchorAMinor: CoachingAnchorState | null = null;
    let holdAMinor: HoldTimerState = { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false };
    for (let f = 0; f < 62; f += 1) {
      const stab = stabilizeCoachingEvaluation(evalAMinor, poseAMinor, anchorAMinor, 1000 + f * 34);
      anchorAMinor = stab.nextAnchor;
      holdAMinor = advanceHoldTimerState(holdAMinor, stab.stabilizedEval, 34, 2000);
      expect(stab.stabilizedEval.primaryDirective).toBe(
        'Good Form — hold steady! Optional refinement (Thumb Joint (IP)): In Kathakali Thripathaka (#17), bend your thumb inward at the joint while keeping all four fingers straight.'
      );
      expect(
        stab.stabilizedEval.primaryDirective.split('Optional refinement (').length - 1
      ).toBe(1);
    }
    expect(holdAMinor.isHoldMastered).toBe(true);
    expect(holdAMinor.holdElapsedMs).toBe(2000);

    // 5. Verify palm-relative thumbPlacement cleanly separates inward Pose A from outward Poses B1, B2, B3
    expect(poseA.thumbPlacement).toBeDefined();
    expect(poseA.thumbPlacement!.radialGapFromIndexMcp).toBeLessThan(0); // tucked inward past Index MCP
    expect(poseA.thumbPlacement!.tipToIndexMcp).toBeLessThan(0.35);
    expect(poseA.thumbPlacement!.tipToMiddleMcp).toBeLessThan(0.3);

    [poseB1, poseB2, poseB3].forEach((outwardPose) => {
      expect(outwardPose.thumbPlacement!.radialGapFromIndexMcp).toBeGreaterThan(0.5); // abducted outward
      expect(outwardPose.thumbPlacement!.tipToIndexMcp).toBeGreaterThan(0.6);
      expect(outwardPose.thumbPlacement!.tipToMiddleMcp).toBeGreaterThan(0.75);
    });

    // Verify thumbPlacement is invariant to 3D translation, rotation, and uniform scale
    const transformedHandA = transformLandmarks(
      buildThripathakaHand(-14, 26, 38),
      1.85,
      { x: -3.2, y: 7.4, z: 1.9 },
      -0.52,
      0.38
    );
    const poseATransformed = extractHandKinematics(transformedHandA, 'Right')!;
    expect(poseATransformed.thumbPlacement!.radialGapFromIndexMcp).toBeCloseTo(
      poseA.thumbPlacement!.radialGapFromIndexMcp,
      5
    );
    expect(poseATransformed.thumbPlacement!.tipToIndexMcp).toBeCloseTo(
      poseA.thumbPlacement!.tipToIndexMcp,
      5
    );

    // 6. Verify post-2.0s hold latching: once holdAMinor.isHoldMastered === true, subsequent non-passing frames keep isHoldMastered latched
    const postHoldAfterInvalidFrame = advanceHoldTimerState(
      holdAMinor,
      {
        ...evalAMinor,
        isMastered: false,
        isValidHoldFrame: false,
        matchScore: 40,
      },
      500,
      2000
    );
    expect(postHoldAfterInvalidFrame.isHoldMastered).toBe(true);
    expect(postHoldAfterInvalidFrame.holdElapsedMs).toBe(2000);

    // 7. Mandatory thumb placement requirements cannot be bypassed by missing, NaN, infinite, or out-of-bounds metrics:
    // a. Missing thumbPlacement object entirely:
    const poseMissingThumb: typeof poseA = {
      ...poseA,
      thumbPlacement: undefined,
    };
    const evalMissingThumb = evaluateMudraKinematics(poseMissingThumb, CANONICAL_MUDRAS.thripathaka);
    expect(evalMissingThumb.isMastered).toBe(false);
    expect(evalMissingThumb.isValidHoldFrame).toBe(false);
    expect(evalMissingThumb.poseStatus).toBe('ACTIONABLE_ADJUSTMENT');
    const timerMissingThumb = advanceHoldTimerState(
      { holdElapsedMs: 500, dropoutElapsedMs: 0, isHoldMastered: false, hasValidAnchor: true },
      evalMissingThumb,
      33
    );
    expect(timerMissingThumb.hasValidAnchor).toBe(false);

    // b. NaN radial gap:
    const poseNaNThumb: typeof poseA = {
      ...poseA,
      thumbPlacement: {
        ...poseA.thumbPlacement!,
        radialGapFromIndexMcp: NaN,
      },
    };
    const evalNaNThumb = evaluateMudraKinematics(poseNaNThumb, CANONICAL_MUDRAS.thripathaka);
    expect(evalNaNThumb.isMastered).toBe(false);
    expect(evalNaNThumb.isValidHoldFrame).toBe(false);
    expect(evalNaNThumb.poseStatus).toBe('ACTIONABLE_ADJUSTMENT');

    // c. Infinite radial gap:
    const poseInfThumb: typeof poseA = {
      ...poseA,
      thumbPlacement: {
        ...poseA.thumbPlacement!,
        radialGapFromIndexMcp: Infinity,
      },
    };
    const evalInfThumb = evaluateMudraKinematics(poseInfThumb, CANONICAL_MUDRAS.thripathaka);
    expect(evalInfThumb.isMastered).toBe(false);
    expect(evalInfThumb.isValidHoldFrame).toBe(false);

    // d. tipToIndexMcp exceeds configured maxAllowedPalmRatio (0.45):
    const poseFarTipThumb: typeof poseA = {
      ...poseA,
      thumbPlacement: {
        ...poseA.thumbPlacement!,
        tipToIndexMcp: 0.58, // exceeds 0.45
      },
    };
    const evalFarTipThumb = evaluateMudraKinematics(poseFarTipThumb, CANONICAL_MUDRAS.thripathaka);
    expect(evalFarTipThumb.isMastered).toBe(false);
    expect(evalFarTipThumb.isValidHoldFrame).toBe(false);
    const tipEval = evalFarTipThumb.jointEvaluations.find(
      (j) => j.jointKey === 'thumbPlacement.tipToIndexMcp'
    )!;
    expect(tipEval).toBeDefined();
    expect(tipEval.status).not.toBe('CORRECT');
  });

  test('verifies coaching feedback stability: prevents alternating instruction jitter between competing joints, releases immediately on correction, and escalates on critical errors', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    // Simulate a student attempting Pathaka where both Index and Middle are bent
    // Index PIP (target 16°±18°) and Middle PIP (target 17°±18°) are both INCORRECT
    // Natural webcam noise causes top error to alternate between Index and Middle
    const competingPoseA: typeof baseKinematics = {
      ...baseKinematics,
      index: { mcp: 18, pip: 55, dip: 12 }, // delta 39° -> higher penalty on Frame 1
      middle: { mcp: 16, pip: 50, dip: 10 }, // delta 33°
      ring: { mcp: 42, pip: 58, dip: 10 }, // target 42°/58° (CORRECT)
      pinky: { mcp: 24, pip: 18, dip: 10 }, // target 24°/18° (CORRECT)
      thumb: { mcp: 20, pip: 16 }, // target 20°/16° (CORRECT)
    };

    const competingPoseB: typeof baseKinematics = {
      ...competingPoseA,
      index: { mcp: 18, pip: 50, dip: 12 }, // delta 34°
      middle: { mcp: 16, pip: 55, dip: 10 }, // delta 38° -> higher penalty on Frame 2
    };

    let anchor: CoachingAnchorState | null = null;
    let now = 1000;

    // Frame 1: Pose A -> establishes anchor on Index PIP
    const evalA = evaluateMudraKinematics(competingPoseA, CANONICAL_MUDRAS.pathaka);
    const stab1 = stabilizeCoachingEvaluation(evalA, competingPoseA, anchor, now, 1000);
    anchor = stab1.nextAnchor;
    const initialPrimaryJoint = stab1.stabilizedEval.primaryJointKey;
    const initialPrimaryDirective = stab1.stabilizedEval.primaryDirective;
    expect(initialPrimaryJoint).toBe('index.pip');
    expect(initialPrimaryDirective).toBe('Straighten your index finger completely.');

    // Frames 2-19 (simulated 30 FPS over 600ms): noise causes raw primary to flip back and forth between Index and Middle
    for (let f = 1; f <= 18; f += 1) {
      now += 33.3;
      const pose = f % 2 === 1 ? competingPoseB : competingPoseA;
      const rawEval = evaluateMudraKinematics(pose, CANONICAL_MUDRAS.pathaka);

      // Verify that the RAW evaluation flips every frame
      const expectedRawJoint = f % 2 === 1 ? 'middle.pip' : 'index.pip';
      expect(rawEval.primaryJointKey).toBe(expectedRawJoint);

      // Verify that the STABILIZED evaluation remains rock-solid on Index (zero instruction flip-flopping)
      const stab = stabilizeCoachingEvaluation(rawEval, pose, anchor, now, 1000);
      anchor = stab.nextAnchor;

      expect(stab.stabilizedEval.primaryJointKey).toBe('index.pip');
      expect(stab.stabilizedEval.primaryDirective).toBe('Straighten your index finger completely.');
      expect(stab.stabilizedEval.secondaryJointKey).toBe('middle.pip');
      expect(stab.stabilizedEval.secondaryDirective).toBe('Extend your middle finger straight upward.');
    }

    // Immediate Release on Correction: student straightens Index (pip: 16° CORRECT)
    now += 33.3;
    const fixedIndexPose: typeof baseKinematics = {
      ...competingPoseA,
      index: { mcp: 18, pip: 16, dip: 12 }, // Index is now fixed!
      middle: { mcp: 16, pip: 55, dip: 10 }, // Middle is still bent
    };
    const rawFixedEval = evaluateMudraKinematics(fixedIndexPose, CANONICAL_MUDRAS.pathaka);
    const stabFixed = stabilizeCoachingEvaluation(rawFixedEval, fixedIndexPose, anchor, now, 1000);
    anchor = stabFixed.nextAnchor;

    // Anchor is immediately released without any delay, advancing to Middle!
    expect(stabFixed.stabilizedEval.primaryJointKey).toBe('middle.pip');
    expect(stabFixed.stabilizedEval.primaryDirective).toBe('Extend your middle finger straight upward.');

    // Contact Escalation: in a mudra requiring contact (e.g. Mudrakhyam), breaking contact escalates immediately
    const mudrakhyamPose = {
      ...baseKinematics,
      index: { mcp: 40, pip: 30, dip: 15 },
      tipDistances: { thumbIndex: 0.15, thumbMiddle: 0.8, thumbRing: 0.9, thumbPinky: 0.95 },
    };
    const mudrakhyamEval = evaluateMudraKinematics(mudrakhyamPose, CANONICAL_MUDRAS.mudrakhyam);
    const stabMudra = stabilizeCoachingEvaluation(mudrakhyamEval, mudrakhyamPose, null, now, 1000);
    const mudraAnchor = stabMudra.nextAnchor;

    // Break contact: thumb and index separate to 0.65 palmRatio
    now += 33.3;
    const brokenContactPose = {
      ...mudrakhyamPose,
      tipDistances: { ...mudrakhyamPose.tipDistances, thumbIndex: 0.65 },
    };
    const brokenContactEval = evaluateMudraKinematics(brokenContactPose, CANONICAL_MUDRAS.mudrakhyam);
    const stabBroken = stabilizeCoachingEvaluation(brokenContactEval, brokenContactPose, mudraAnchor, now, 1000);

    // Contact failure immediately preempts without waiting for dwell time
    expect(stabBroken.stabilizedEval.primaryJointKey).toBe('contact.thumbIndex');
    expect(stabBroken.stabilizedEval.primaryDirective).toContain(
      'Touch the tip of your index finger directly to the tip of your thumb'
    );

    // Direction Inversion Test (TOO_BENT -> TOO_STRAIGHT):
    // In Pathaka, ring.pip target is 58° ± 28° [30°..86°].
    // Frame 1: ring.pip is 96° (TOO_BENT by +38° > 28° tolerance)
    now += 33.3;
    const ringBentPose: typeof baseKinematics = {
      ...baseKinematics,
      ring: { mcp: 42, pip: 96, dip: 10 },
      middle: { mcp: 16, pip: 17, dip: 10 },
      index: { mcp: 18, pip: 16, dip: 12 },
      pinky: { mcp: 24, pip: 18, dip: 10 },
      thumb: { mcp: 20, pip: 16 },
    };
    const rawBentEval = evaluateMudraKinematics(ringBentPose, CANONICAL_MUDRAS.pathaka);
    const stabBent = stabilizeCoachingEvaluation(rawBentEval, ringBentPose, null, now, 1000);
    const bentAnchor = stabBent.nextAnchor;

    expect(stabBent.stabilizedEval.primaryJointKey).toBe('ring.pip');
    expect(stabBent.stabilizedEval.primaryDirective).toContain('too bent by ~38°');
    expect(bentAnchor?.primaryDirectionSign).toBe(1);

    // Frame 2: Student overshoots and straightens ring.pip to 15° (TOO_STRAIGHT by -43°)
    // The anchor MUST be invalidated immediately (0ms delay) to avoid retaining stale "too bent" wording!
    now += 33.3;
    const ringStraightPose: typeof baseKinematics = {
      ...ringBentPose,
      ring: { mcp: 42, pip: 15, dip: 10 },
    };
    const rawStraightEval = evaluateMudraKinematics(ringStraightPose, CANONICAL_MUDRAS.pathaka);
    const stabStraight = stabilizeCoachingEvaluation(
      rawStraightEval,
      ringStraightPose,
      bentAnchor,
      now,
      1000
    );

    expect(stabStraight.stabilizedEval.primaryJointKey).toBe('ring.pip');
    expect(stabStraight.stabilizedEval.primaryDirective).not.toContain('too bent');
    expect(stabStraight.stabilizedEval.primaryDirective).toContain(
      'In Kathakali Pathaka (#1), bend your ring finger forward at the middle joint'
    );
    expect(stabStraight.nextAnchor?.primaryDirectionSign).toBe(-1);

    // Completed-Hold Achievement vs Current-Pose Assessment Separation:
    // Once hold is mastered, hold achievement remains latched at 2000ms:
    const completedHoldState: HoldTimerState = {
      holdElapsedMs: 2000,
      dropoutElapsedMs: 0,
      isHoldMastered: true,
      hasValidAnchor: true,
    };

    // But current pose evaluation on an incorrect pose reflects the CURRENT error:
    const incorrectEval = evaluateMudraKinematics(ringStraightPose, CANONICAL_MUDRAS.pathaka);
    expect(incorrectEval.isMastered).toBe(false);
    expect(incorrectEval.matchScore).toBeLessThan(88);

    const postHoldTimer = advanceHoldTimerState(completedHoldState, incorrectEval, 33, 2000);
    // Achievement is preserved:
    expect(postHoldTimer.isHoldMastered).toBe(true);
    expect(postHoldTimer.holdElapsedMs).toBe(2000);
    // But current pose is honestly reported as non-mastered:
    expect(incorrectEval.isMastered).toBe(false);
    expect(incorrectEval.primaryDirective).toContain('bend your ring finger forward');
  });

  test('verifies that changing primaryDirective wording cannot alter timer behaviour or hold accumulation', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right')!;
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
    const passingEval = evaluateMudraKinematics(pathakaPose, CANONICAL_MUDRAS.pathaka);
    expect(passingEval.isMastered).toBe(true);
    expect(passingEval.poseStatus).toBe('ALL_CRITERIA_WITHIN_RANGE');

    const initialTimer: HoldTimerState = {
      holdElapsedMs: 1000,
      dropoutElapsedMs: 0,
      hasValidAnchor: true,
      isHoldMastered: false,
    };

    // Frame with original directive
    const timerOriginal = advanceHoldTimerState(initialTimer, passingEval, 100);

    // Frame with completely arbitrary, mutated primaryDirective string
    const mutatedEval: MudraEvaluationResult = {
      ...passingEval,
      primaryDirective: 'Completely different custom message with random text 98765!',
    };
    const timerMutated = advanceHoldTimerState(initialTimer, mutatedEval, 100);

    expect(timerMutated.holdElapsedMs).toBe(timerOriginal.holdElapsedMs);
    expect(timerMutated.hasValidAnchor).toBe(timerOriginal.hasValidAnchor);
    expect(timerMutated.isHoldMastered).toBe(timerOriginal.isHoldMastered);
    expect(timerMutated.dropoutElapsedMs).toBe(timerOriginal.dropoutElapsedMs);
  });

  test('verifies explicit poseStatus structured states distinguish all criteria within range, permitted deviations, boundary grace, and measurement unavailable', () => {
    // 1. Measurement unavailable
    const degenEval = evaluateMudraKinematics(null, CANONICAL_MUDRAS.pathaka);
    expect(degenEval.poseStatus).toBe('MEASUREMENT_UNAVAILABLE');

    // 2. All criteria within range (isFlawless === true)
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right')!;
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
    const flawlessEval = evaluateMudraKinematics(pathakaPose, CANONICAL_MUDRAS.pathaka);
    expect(flawlessEval.isFlawless).toBe(true);
    expect(flawlessEval.poseStatus).toBe('ALL_CRITERIA_WITHIN_RANGE');

    // 3. Passing with permitted deviations (isMastered === true, isValidHoldFrame === true, isFlawless === false)
    const minorKin: typeof pathakaPose = {
      ...pathakaPose,
      pinky: { ...pathakaPose.pinky, pip: 40 }, // non-signature deviation (target 18°±18°, 40° is 1.22x tolerance)
    };
    const minorEval = evaluateMudraKinematics(minorKin, CANONICAL_MUDRAS.pathaka);
    expect(minorEval.isMastered).toBe(true);
    expect(minorEval.isValidHoldFrame).toBe(true);
    expect(minorEval.isFlawless).toBe(false);
    expect(minorEval.poseStatus).toBe('PASSING_WITH_PERMITTED_DEVIATIONS');

    // 4. Boundary grace paused: evaluate via stabilizeCoachingEvaluation with exit hysteresis
    const anchor: CoachingAnchorState = {
      mudraId: 'pathaka',
      anchorVector: extractKinematicsFeatureVector(pathakaPose),
      primaryDirective: 'Within target ranges.',
      wasMastered: true,
      wasValidHoldFrame: true,
      wasFlawless: true,
      updatedAtMs: 1000,
    };
    const exitGraceEval: MudraEvaluationResult = {
      ...minorEval,
      matchScore: 86, // between PASS_EXIT_SCORE (85) and PASS_ENTRY_SCORE (88)
    };
    const stabGrace = stabilizeCoachingEvaluation(exitGraceEval, minorKin, anchor, 1050);
    expect(stabGrace.stabilizedEval.isMastered).toBe(true);
    expect(stabGrace.stabilizedEval.isValidHoldFrame).toBe(false);
    expect(stabGrace.stabilizedEval.poseStatus).toBe('BOUNDARY_GRACE_PAUSED');

    // 5. Actionable adjustment on failing pose
    const failingKin: typeof pathakaPose = {
      ...pathakaPose,
      index: { ...pathakaPose.index, pip: 80 }, // severe deviation on signature joint
    };
    const failingEval = evaluateMudraKinematics(failingKin, CANONICAL_MUDRAS.pathaka);
    expect(failingEval.isMastered).toBe(false);
    expect(failingEval.poseStatus).toBe('ACTIONABLE_ADJUSTMENT');
  });

  test('verifies generic evaluation emits feature-specific corrections for thumb placement without hardcoded gesture names', () => {
    const radialReq: ThumbPlacementReferenceRequirement = {
      feature: 'radialGapFromIndexMcp',
      label: 'Thumb Lateral Offset',
      targetPalmRatio: -0.1,
      tolerancePalmRatio: 0.25,
      maxAllowedPalmRatio: 0.15,
      weight: 3.0,
      directive: '', // no explicit gesture directive in configuration
    };
    const fallbackDir = formatFallbackThumbPlacementDirective(radialReq, 0.45);
    expect(fallbackDir).toBe('Tuck thumb inward closer to palm face (reduce lateral abduction).');
    expect(fallbackDir).not.toContain('Thripathaka');
    expect(fallbackDir).not.toContain('Kathakali');

    const tipReq: ThumbPlacementReferenceRequirement = {
      feature: 'tipToIndexMcp',
      label: 'Thumb-Index Distance',
      targetPalmRatio: 0.25,
      tolerancePalmRatio: 0.2,
      maxAllowedPalmRatio: 0.45,
      weight: 2.0,
      directive: '',
    };
    const tipFallback = formatFallbackThumbPlacementDirective(tipReq, 0.65);
    expect(tipFallback).toBe('Bring thumb tip closer to index knuckle.');
    expect(tipFallback).not.toContain('Thripathaka');
  });

  test('verifies Thripathaka canonical configuration matches Hastalakshana Deepika (#17): all four fingers straight (ring PIP target 18°±16°), not Bharatanatyam bent-ring form', () => {
    const { thripathaka } = CANONICAL_MUDRAS;
    expect(thripathaka.targets.ring.pip.targetDegrees).toBe(18);
    expect(thripathaka.targets.ring.pip.toleranceDegrees).toBe(16);
    expect(thripathaka.targets.index.pip.targetDegrees).toBe(16);
    expect(thripathaka.targets.middle.pip.targetDegrees).toBe(16);
    expect(thripathaka.targets.pinky.pip.targetDegrees).toBe(16);
    expect(thripathaka.description).toContain('all four fingers');
  });

  test('investigates and verifies Thripathaka live acceptance discrepancy: straight thumb vs inward-bent thumb', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right')!;
    const fourFingersStraight = {
      index: { mcp: 14, pip: 16, dip: 10 },
      middle: { mcp: 10, pip: 16, dip: 10 },
      ring: { mcp: 12, pip: 18, dip: 10 },
      pinky: { mcp: 15, pip: 15, dip: 10 },
      spreadIndexMiddle: 8,
      spreadMiddleRing: 8,
      spreadRingPinky: 10,
    };

    // Pose 1: User straightens thumb along with the fingers (adducted alongside index)
    // - Joint bend angles are within tolerance: MCP 14° (target 26°±18°), IP 22° (target 38°±20°)
    // - Thumb tip is adjacent to index MCP: tipToIndexMcp = 0.28 <= 0.45, radialGapFromIndexMcp = 0.10 <= 0.15
    const straightThumbPose: typeof baseKinematics = {
      ...baseKinematics,
      ...fourFingersStraight,
      thumb: { mcp: 14, pip: 22 },
      thumbPlacement: {
        ...baseKinematics.thumbPlacement!,
        radialGapFromIndexMcp: 0.1, // within maxAllowedPalmRatio: 0.15
        tipToIndexMcp: 0.28, // within maxAllowedPalmRatio: 0.45
      },
    };

    const evalStraight = evaluateMudraKinematics(straightThumbPose, CANONICAL_MUDRAS.thripathaka);
    expect(evalStraight.isMastered).toBe(true);
    expect(evalStraight.isValidHoldFrame).toBe(true);
    expect(evalStraight.matchScore).toBeGreaterThanOrEqual(88);
    const straightTimer = advanceHoldTimerState(
      { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false },
      evalStraight,
      33
    );
    expect(straightTimer.hasValidAnchor).toBe(true);

    // Pose 2: User bends thumb inward toward palm face
    // - Joint bend angles are at canonical target: MCP 26°, IP 38°
    // - Inward flexion moves thumb tip towards palm center away from index MCP: tipToIndexMcp = 0.52 > 0.45
    const inwardThumbPose: typeof baseKinematics = {
      ...baseKinematics,
      ...fourFingersStraight,
      thumb: { mcp: 26, pip: 38 },
      thumbPlacement: {
        ...baseKinematics.thumbPlacement!,
        radialGapFromIndexMcp: -0.15, // tucked inward past index MCP (passes <= 0.15)
        tipToIndexMcp: 0.52, // exceeds maxAllowedPalmRatio: 0.45
      },
    };

    const evalInward = evaluateMudraKinematics(inwardThumbPose, CANONICAL_MUDRAS.thripathaka);

    // 1. Root Cause Analysis: Capped at 65% and hold accumulation blocked
    expect(evalInward.isMastered).toBe(false);
    expect(evalInward.isValidHoldFrame).toBe(false);
    expect(evalInward.matchScore).toBe(65);
    expect(evalInward.poseStatus).toBe('ACTIONABLE_ADJUSTMENT');
    expect(evalInward.primaryDirective).toBe(
      'Keep your thumb tip tucked closely alongside the base of your fingers on the palm.'
    );

    // 2. Explains why the skeleton was drawn entirely green:
    // Joint flexion evaluations for thumb and fingers are all CORRECT
    const thumbMcpEval = evalInward.jointEvaluations.find((j) => j.jointKey === 'thumb.mcp')!;
    const thumbPipEval = evalInward.jointEvaluations.find((j) => j.jointKey === 'thumb.pip')!;
    expect(thumbMcpEval.status).toBe('CORRECT');
    expect(thumbPipEval.status).toBe('CORRECT');

    // Only the thumb placement requirement failed:
    const tipPlacementEval = evalInward.jointEvaluations.find(
      (j) => j.jointKey === 'thumbPlacement.tipToIndexMcp'
    )!;
    expect(tipPlacementEval.status).not.toBe('CORRECT');

    // 3. Hold timer does NOT accumulate time on failing inward pose
    const inwardTimer = advanceHoldTimerState(
      { holdElapsedMs: 0, dropoutElapsedMs: 0, isHoldMastered: false },
      evalInward,
      33
    );
    expect(inwardTimer.holdElapsedMs).toBe(0); // no hold progress credited
    expect(inwardTimer.hasValidAnchor).toBe(false);
    expect(inwardTimer.isHoldMastered).toBe(false);
  });

  test('verifies layout stability across wide (1280px) and narrow (375px) viewports and telemetry snapshot', async ({
    page,
  }) => {
    const verifyViewportStability = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.goto('/learn/mudras/practice/musti');

      await expect(
        page.getByRole('heading', { name: /MudraGuide: 3D Hand Pose Analysis/i })
      ).toBeVisible();

      const criteriaCard = page.locator('.ant-card', {
        hasText: 'Traditional Canonical Criteria',
      });
      await expect(criteriaCard).toBeVisible();

      const boxBefore = await criteriaCard.boundingBox();
      expect(boxBefore).not.toBeNull();

      // Switch mudra to trigger a different directive & secondary tip length
      await page.goto('/learn/mudras/practice/thripathaka');
      await expect(criteriaCard).toBeVisible();
      const boxAfter = await criteriaCard.boundingBox();
      expect(boxAfter).not.toBeNull();

      // Vertical position of the card below AI Coach Feedback must remain locked (Δy = 0px)
      expect(Math.abs((boxAfter?.y ?? 0) - (boxBefore?.y ?? 0))).toBe(0);

      // Verify feedback alert does not overflow its fixed-height container
      const coachAlert = page.getByTestId('coach-feedback-alert');
      await expect(coachAlert).toBeVisible();
      const alertOverflow = await coachAlert.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(alertOverflow.scrollHeight).toBeLessThanOrEqual(alertOverflow.clientHeight);
    };

    await verifyViewportStability(1280, 800);
    await verifyViewportStability(375, 667);

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
    await expect(snapshotPre).toContainText('"mudraId": "thripathaka"');
    await expect(snapshotPre).toContainText('"recentFrameTrace"');
  });
});
