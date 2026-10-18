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
} from 'utils/mudraEvaluator';
import { CANONICAL_MUDRAS } from 'data/canonicalMudras';

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

  test('handles missing or degenerate worldLandmarks and missing handedness without silent fallback', () => {
    expect(resolveHandedness(undefined)).toBe('Unknown');
    expect(resolveHandedness([])).toBe('Unknown');
    expect(resolveHandedness([{ categoryName: 'Left' }])).toBe('Left');
    expect(resolveHandedness([{ categoryName: 'Right' }])).toBe('Right');

    expect(hasValidWorldLandmarks(undefined)).toBe(false);
    expect(hasValidWorldLandmarks([])).toBe(false);
    expect(extractHandKinematics(null)).toBeNull();

    // Collapsed 21-point array must be rejected
    const collapsed = new Array(21).fill({ x: 0.5, y: 0.5, z: 0.5 });
    expect(hasValidWorldLandmarks(collapsed)).toBe(false);
    expect(extractHandKinematics(collapsed)).toBeNull();

    // Evaluator returns MEASUREMENT_UNAVAILABLE when kinematics is null
    const unavailableEval = evaluateMudraKinematics(null, CANONICAL_MUDRAS.musti);
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

    // Case 1: Both index.pip (+60° over 90° target) and pinky.pip (+50° over 72° target) are TOO_BENT in Musti.
    // Musti only has TOO_STRAIGHT rules in pedagogicalRules, so NEITHER primary nor secondary
    // may falsely match a TOO_STRAIGHT rule ("Curl your pinky tightly into your palm.").
    const overBentMusti: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 32, pip: 50 },
      index: { mcp: 62, pip: 150, dip: 80 },
      middle: { mcp: 62, pip: 92, dip: 80 },
      ring: { mcp: 73, pip: 88, dip: 80 },
      pinky: { mcp: 62, pip: 122, dip: 80 },
    };

    const resOverBent = evaluateMudraKinematics(overBentMusti, CANONICAL_MUDRAS.musti);
    expect(resOverBent.primaryDirective).toContain('Index Middle (PIP) is too bent by ~60°');
    expect(resOverBent.secondaryDirective).toBeDefined();
    expect(resOverBent.secondaryDirective).toContain('Pinky Knuckle (PIP) is too bent by ~50°');
    expect(resOverBent.secondaryDirective).not.toContain('Curl your pinky');

    // Case 2: Both index.pip (-70° under 90° target) and pinky.pip (-42° under 72° target) are TOO_STRAIGHT.
    // Both primary and secondary must match their configured TOO_STRAIGHT rules.
    const underBentMusti: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 32, pip: 50 },
      index: { mcp: 62, pip: 20, dip: 10 },
      middle: { mcp: 62, pip: 92, dip: 80 },
      ring: { mcp: 73, pip: 88, dip: 80 },
      pinky: { mcp: 62, pip: 30, dip: 10 },
    };

    const resUnderBent = evaluateMudraKinematics(underBentMusti, CANONICAL_MUDRAS.musti);
    expect(resUnderBent.primaryDirective).toBe('Curl your index finger tightly into your palm.');
    expect(resUnderBent.secondaryDirective).toBe('Curl your pinky tightly into your palm.');
  });

  test('evaluates all configured spread targets (spreadIndexMiddle, spreadMiddleRing, spreadRingPinky)', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    const wideRingPinkyPataka: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 18, pip: 16 },
      index: { mcp: 22, pip: 9, dip: 5 },
      middle: { mcp: 12, pip: 25, dip: 5 },
      ring: { mcp: 33, pip: 55, dip: 5 },
      pinky: { mcp: 21, pip: 23, dip: 5 },
      spreadIndexMiddle: 6,
      spreadMiddleRing: 51, // +22° above target 29° (tolerance 18°)
      spreadRingPinky: 58, // +30° above target 28° (tolerance 18°)
    };

    const evalPataka = evaluateMudraKinematics(wideRingPinkyPataka, CANONICAL_MUDRAS.pataka);
    const spreadKeys = evalPataka.jointEvaluations
      .filter((j) => j.jointKey.startsWith('spread'))
      .map((j) => j.jointKey);

    expect(spreadKeys).toEqual([
      'spreadIndexMiddle',
      'spreadMiddleRing',
      'spreadRingPinky',
    ]);
    expect(evalPataka.isMastered).toBe(false);
    expect(evalPataka.primaryDirective).toContain('Ring-Pinky Gap is too wide by ~30°');
    expect(evalPataka.secondaryDirective).toContain('Middle-Ring Gap is too wide by ~22°');
  });

  test('gates mastery via signature joints (weight >= 2.0) and validates empirical Musti 3D worldLandmarks targets', () => {
    const baseKinematics = extractHandKinematics(createSyntheticWorldHand(), 'Right');
    expect(baseKinematics).not.toBeNull();
    if (!baseKinematics) return;

    // 1. Empirical mean 3D worldLandmarks posture from KathakaliMudraDataset 4.mushti (n=37)
    const empiricalMusti: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 31.8, pip: 50.4 },
      index: { mcp: 61.2, pip: 89.7, dip: 70 },
      middle: { mcp: 62.1, pip: 93.6, dip: 72 },
      ring: { mcp: 73.1, pip: 89.2, dip: 70 },
      pinky: { mcp: 61.6, pip: 72.1, dip: 65 },
    };
    const mustiEval = evaluateMudraKinematics(empiricalMusti, CANONICAL_MUDRAS.musti);
    expect(mustiEval.isMastered).toBe(true);
    expect(mustiEval.matchScore).toBeGreaterThanOrEqual(95);

    // 2. Signature-joint gate: Pataka requires ring.pip ~55° ± 24° (weight 2.2).
    // If ring.pip is held straight at 16° (as in Tripataka) while all other joints match Pataka perfectly,
    // signature-joint gating must cap matchScore <= 84 and prevent false mastery.
    const straightRingInPataka: typeof baseKinematics = {
      ...baseKinematics,
      thumb: { mcp: 18, pip: 16 },
      index: { mcp: 22, pip: 9, dip: 5 },
      middle: { mcp: 12, pip: 25, dip: 5 },
      ring: { mcp: 33, pip: 16, dip: 5 }, // delta = -39° (> 24° * 1.2 = 28.8°)
      pinky: { mcp: 21, pip: 23, dip: 5 },
      spreadIndexMiddle: 6,
      spreadMiddleRing: 29,
      spreadRingPinky: 28,
    };
    const patakaSignatureFail = evaluateMudraKinematics(
      straightRingInPataka,
      CANONICAL_MUDRAS.pataka
    );
    expect(patakaSignatureFail.isMastered).toBe(false);
    expect(patakaSignatureFail.matchScore).toBeLessThanOrEqual(84);
    expect(patakaSignatureFail.primaryDirective).toContain(
      'Bend your ring finger inward toward the palm'
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

  test('renders updated tolerance legend and optional Developer Diagnostic View with calibration snapshot', async ({
    page,
  }) => {
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
    await expect(snapshotPre).toContainText('"mudraId": "musti"');
  });
});

