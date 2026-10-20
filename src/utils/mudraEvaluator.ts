import {
  HandKinematics,
  CanonicalMudra,
  MudraEvaluationResult,
  JointEvaluation,
  CoachingAnchorState,
  TemporalFeatureStats,
} from 'types/mudra';
import { JOINT_TRIPLETS } from 'utils/mudraKinematics';

/**
 * Checks whether a pedagogical rule matches the joint key and signed error direction
 */
export function matchesPedagogicalRule(
  rule: CanonicalMudra['pedagogicalRules'][number],
  evaluation: Pick<JointEvaluation, 'jointKey' | 'deltaDegrees'>
): boolean {
  if (rule.jointKey !== evaluation.jointKey) return false;
  if (rule.condition === 'TOO_BENT' && evaluation.deltaDegrees > 0) return true;
  if (rule.condition === 'TOO_STRAIGHT' && evaluation.deltaDegrees < 0) return true;
  if (rule.condition === 'TOO_WIDE' && evaluation.deltaDegrees > 0) return true;
  if (rule.condition === 'TOO_NARROW' && evaluation.deltaDegrees < 0) return true;
  return false;
}

/**
 * Generates direction-consistent fallback text when no explicit pedagogical rule matches
 */
export function formatFallbackDirective(evaluation: JointEvaluation): string {
  const isSpread = evaluation.jointKey.startsWith('spread');
  let direction = evaluation.deltaDegrees > 0 ? 'too bent' : 'too straight';
  if (isSpread) {
    direction = evaluation.deltaDegrees > 0 ? 'too wide' : 'too narrow';
  }
  return `Your ${evaluation.label} is ${direction} by ~${Math.abs(evaluation.deltaDegrees)}°. Adjust to ~${evaluation.targetDegrees}°.`;
}

/**
 * Resolves a joint discrepancy into a directive using identical condition-matching logic
 * for both primary and secondary coaching tips.
 */
export function resolveJointDirective(
  targetMudra: CanonicalMudra,
  evaluation: JointEvaluation
): string {
  const matchingRule = targetMudra.pedagogicalRules.find((rule) =>
    matchesPedagogicalRule(rule, evaluation)
  );
  return matchingRule ? matchingRule.directive : formatFallbackDirective(evaluation);
}

/**
 * Extracts a 17-element numerical feature vector from 3D HandKinematics:
 * - [0..9]:   10 core finger joint flexion angles (degrees)
 * - [10..12]: 3 inter-finger abduction spread angles (degrees)
 * - [13..16]: 4 palm-normalized fingertip contact distances (scaled x100)
 */
export function extractKinematicsFeatureVector(kinematics: HandKinematics): number[] {
  return [
    kinematics.thumb.mcp,
    kinematics.thumb.pip,
    kinematics.index.mcp,
    kinematics.index.pip,
    kinematics.middle.mcp,
    kinematics.middle.pip,
    kinematics.ring.mcp,
    kinematics.ring.pip,
    kinematics.pinky.mcp,
    kinematics.pinky.pip,
    kinematics.spreadIndexMiddle,
    kinematics.spreadMiddleRing,
    kinematics.spreadRingPinky,
    kinematics.tipDistances.thumbIndex * 100,
    kinematics.tipDistances.thumbMiddle * 100,
    kinematics.tipDistances.thumbRing * 100,
    kinematics.tipDistances.thumbPinky * 100,
  ];
}

/**
 * Compares two 17-element kinematics feature vectors to determine if the hand pose
 * is effectively unchanged (within MediaPipe / camera jitter deadband).
 *
 * Returns true when:
 * - Mean absolute difference across the 10 joint flexion angles <= meanAngleThresholdDeg (default 5.5°)
 * - Maximum single-joint flexion difference <= maxJointAngleThresholdDeg (default 12.0°)
 * - Maximum fingertip contact distance change <= maxContactDelta (default 10.0, i.e. 0.10 palm scale)
 */
export function areKinematicsVectorsSimilar(
  vecA: number[],
  vecB: number[],
  meanAngleThresholdDeg = 5.5,
  maxJointAngleThresholdDeg = 12.0,
  maxContactDelta = 10.0
): boolean {
  if (vecA.length < 17 || vecB.length < 17) return false;

  let angleDiffSum = 0;
  let maxAngleDiff = 0;
  for (let i = 0; i < 10; i += 1) {
    const diff = Math.abs(vecA[i] - vecB[i]);
    angleDiffSum += diff;
    if (diff > maxAngleDiff) {
      maxAngleDiff = diff;
    }
  }

  const meanAngleDiff = angleDiffSum / 10;
  if (meanAngleDiff > meanAngleThresholdDeg || maxAngleDiff > maxJointAngleThresholdDeg) {
    return false;
  }

  for (let i = 13; i < 17; i += 1) {
    if (Math.abs(vecA[i] - vecB[i]) > maxContactDelta) {
      return false;
    }
  }

  return true;
}

/**
 * Stabilizes live video coaching directives using Anchor-Vector Similarity Gating
 * combined with Sticky Target-Joint Completion:
 * 1. If the hand pose vector is similar to the anchor vector (when the current advice was issued)
 *    and the coached joint hasn't become CORRECT, keep the exact same coaching text.
 * 2. If the user is actively moving toward fixing the coached joint (still not CORRECT)
 *    within the minimum reading/reaction dwell window (default 1400ms), keep the directive locked
 *    on that joint so advice never swaps mid-movement.
 * 3. As soon as the coached joint becomes CORRECT (or the mudra is mastered), release immediately.
 */
export function stabilizeCoachingEvaluation(
  currentEval: MudraEvaluationResult,
  currentKinematics: HandKinematics | null | undefined,
  anchorState: CoachingAnchorState | null,
  nowMs: number,
  minDwellMs = 1400
): { stabilizedEval: MudraEvaluationResult; nextAnchor: CoachingAnchorState | null } {
  if (!currentKinematics || currentEval.measurementStatus === 'MEASUREMENT_UNAVAILABLE') {
    return { stabilizedEval: currentEval, nextAnchor: null };
  }

  const currentVector = extractKinematicsFeatureVector(currentKinematics);

  const createAnchor = (evalRes: MudraEvaluationResult): CoachingAnchorState => ({
    mudraId: evalRes.mudraId,
    anchorVector: currentVector,
    primaryDirective: evalRes.primaryDirective,
    secondaryDirective: evalRes.secondaryDirective,
    primaryJointKey: evalRes.primaryJointKey,
    secondaryJointKey: evalRes.secondaryJointKey,
    wasMastered: evalRes.isMastered,
    updatedAtMs: nowMs,
  });

  // Always surface mastery immediately
  if (currentEval.isMastered) {
    return {
      stabilizedEval: currentEval,
      nextAnchor: createAnchor(currentEval),
    };
  }

  // Initialize anchor if none exists, if target mudra changed, or if transitioning out of mastery
  if (
    !anchorState ||
    anchorState.mudraId !== currentEval.mudraId ||
    anchorState.wasMastered
  ) {
    return {
      stabilizedEval: currentEval,
      nextAnchor: createAnchor(currentEval),
    };
  }

  // Check if the previously coached primary joint is now resolved (CORRECT)
  const lockedJointEval = anchorState.primaryJointKey
    ? currentEval.jointEvaluations.find((j) => j.jointKey === anchorState.primaryJointKey)
    : undefined;
  const isLockedJointResolved = Boolean(
    anchorState.primaryJointKey && (!lockedJointEval || lockedJointEval.status === 'CORRECT')
  );

  // Immediate release when the user fixes the joint they were coached on
  if (isLockedJointResolved) {
    return {
      stabilizedEval: currentEval,
      nextAnchor: createAnchor(currentEval),
    };
  }

  // Gate 1: Anchor-Vector Similarity Gate — if the hand pose hasn't meaningfully changed
  // from when the advice was issued, freeze the coaching text (without drifting the anchor).
  if (areKinematicsVectorsSimilar(currentVector, anchorState.anchorVector)) {
    return {
      stabilizedEval: {
        ...currentEval,
        primaryDirective: anchorState.primaryDirective,
        secondaryDirective: anchorState.secondaryDirective,
        primaryJointKey: anchorState.primaryJointKey,
        secondaryJointKey: anchorState.secondaryJointKey,
      },
      nextAnchor: anchorState,
    };
  }

  // Gate 2: Mid-Motion Continuity — while the user is actively moving to fix the locked joint
  // (which is still not CORRECT), hold the directive during the minimum dwell window or while
  // the same joint remains the primary error so degree numbers don't flicker mid-motion.
  const newlyBrokeContact =
    currentEval.primaryJointKey?.startsWith('contact.') &&
    currentEval.primaryJointKey !== anchorState.primaryJointKey;
  const withinDwellWindow = nowMs - anchorState.updatedAtMs < minDwellMs;
  const isSamePrimaryJoint =
    Boolean(anchorState.primaryJointKey) &&
    currentEval.primaryJointKey === anchorState.primaryJointKey;

  if (!newlyBrokeContact && (withinDwellWindow || isSamePrimaryJoint)) {
    return {
      stabilizedEval: {
        ...currentEval,
        primaryDirective: anchorState.primaryDirective,
        secondaryDirective: anchorState.secondaryDirective,
        primaryJointKey: anchorState.primaryJointKey,
        secondaryJointKey: anchorState.secondaryJointKey,
      },
      nextAnchor: {
        ...anchorState,
        // Update anchor vector when remaining on the same primary joint after dwell
        anchorVector: withinDwellWindow ? anchorState.anchorVector : currentVector,
      },
    };
  }

  return {
    stabilizedEval: currentEval,
    nextAnchor: createAnchor(currentEval),
  };
}

/**
 * Computes rolling temporal summary statistics (mean, stdDev, min, max) for a feature series
 */
export function computeTemporalFeatureStats(samples: number[]): TemporalFeatureStats {
  const finiteSamples = samples.filter((val) => Number.isFinite(val));
  const sampleCount = finiteSamples.length;
  if (sampleCount === 0) {
    return { sampleCount: 0, mean: 0, stdDev: 0, min: 0, max: 0 };
  }

  let sum = 0;
  let min = finiteSamples[0];
  let max = finiteSamples[0];
  finiteSamples.forEach((v) => {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  });

  const mean = sum / sampleCount;
  const variance =
    finiteSamples.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / sampleCount;
  const stdDev = Math.sqrt(variance);

  return {
    sampleCount,
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
  };
}

/**
 * Evaluates student 3D world-landmark kinematics against a canonical mudra target.
 * If world-landmark kinematics are unavailable (null/undefined), returns a
 * MEASUREMENT_UNAVAILABLE result with 0 score and no stale evaluations.
 */
export function evaluateMudraKinematics(
  kinematics: HandKinematics | null | undefined,
  targetMudra: CanonicalMudra
): MudraEvaluationResult {
  if (!kinematics) {
    return {
      mudraId: targetMudra.id,
      mudraName: targetMudra.name,
      measurementStatus: 'MEASUREMENT_UNAVAILABLE',
      coordinateSource: 'unavailable',
      handedness: 'Unknown',
      matchScore: 0,
      isMastered: false,
      primaryDirective:
        'Measurement unavailable: 3D world landmarks were not returned for this frame. Ensure your full hand is clearly visible.',
      secondaryDirective: undefined,
      jointEvaluations: [],
      totalWeight: 0,
      totalWeightedPenalty: 0,
    };
  }

  const evaluations: JointEvaluation[] = [];
  let totalWeightedPenalty = 0;
  let totalWeight = 0;

  // Helper to evaluate a single joint or spread angle (in degrees)
  const checkJoint = (
    jointKey: string,
    label: string,
    actualVal: number,
    target: { targetDegrees: number; toleranceDegrees: number; weight: number }
  ) => {
    const delta = actualVal - target.targetDegrees;
    const absDelta = Math.abs(delta);
    const tol = target.toleranceDegrees;

    let status: JointEvaluation['status'] = 'CORRECT';
    if (absDelta > tol * 1.8) {
      status = 'INCORRECT';
    } else if (absDelta > tol) {
      status = 'MINOR_DEVIATION';
    }

    // Deadband-aware normalized squared penalty
    let ratio = 0;
    if (absDelta > tol) {
      // Exceeded tolerance: quadratic penalty starting from 1.0
      const excess = (absDelta - tol) / tol;
      ratio = 1.0 + excess;
    } else {
      // Within tolerance (Green zone): mild linear ramp (0.0 to 0.35)
      ratio = (absDelta / tol) * 0.35;
    }

    const weightedPenalty = target.weight * Math.min(ratio * ratio, 9.0);
    totalWeightedPenalty += weightedPenalty;
    totalWeight += target.weight;

    evaluations.push({
      jointKey,
      label,
      triplet: JOINT_TRIPLETS[jointKey],
      rawValue: Number(actualVal.toFixed(2)),
      currentDegrees: Math.round(actualVal),
      targetDegrees: target.targetDegrees,
      toleranceDegrees: tol,
      acceptedRange: [
        Math.max(0, target.targetDegrees - tol),
        Math.min(180, target.targetDegrees + tol),
      ],
      deltaDegrees: Math.round(delta),
      weight: target.weight,
      weightedPenalty: Number(weightedPenalty.toFixed(3)),
      status,
    });
  };

  const t = targetMudra.targets;

  // Evaluate Thumb
  checkJoint('thumb.mcp', 'Thumb Base (MCP)', kinematics.thumb.mcp, t.thumb.mcp);
  checkJoint('thumb.pip', 'Thumb Knuckle (PIP)', kinematics.thumb.pip, t.thumb.pip);

  // Evaluate Index
  checkJoint('index.mcp', 'Index Base (MCP)', kinematics.index.mcp, t.index.mcp);
  checkJoint('index.pip', 'Index Middle (PIP)', kinematics.index.pip, t.index.pip);

  // Evaluate Middle
  checkJoint('middle.mcp', 'Middle Base (MCP)', kinematics.middle.mcp, t.middle.mcp);
  checkJoint('middle.pip', 'Middle Knuckle (PIP)', kinematics.middle.pip, t.middle.pip);

  // Evaluate Ring
  checkJoint('ring.mcp', 'Ring Base (MCP)', kinematics.ring.mcp, t.ring.mcp);
  checkJoint('ring.pip', 'Ring Knuckle (PIP)', kinematics.ring.pip, t.ring.pip);

  // Evaluate Pinky
  checkJoint('pinky.mcp', 'Pinky Base (MCP)', kinematics.pinky.mcp, t.pinky.mcp);
  checkJoint('pinky.pip', 'Pinky Knuckle (PIP)', kinematics.pinky.pip, t.pinky.pip);

  // Evaluate all configured inter-finger spreads (in degrees)
  if (t.spreadIndexMiddle) {
    checkJoint(
      'spreadIndexMiddle',
      'Index-Middle Gap',
      kinematics.spreadIndexMiddle,
      t.spreadIndexMiddle
    );
  }
  if (t.spreadMiddleRing) {
    checkJoint(
      'spreadMiddleRing',
      'Middle-Ring Gap',
      kinematics.spreadMiddleRing,
      t.spreadMiddleRing
    );
  }
  if (t.spreadRingPinky) {
    checkJoint(
      'spreadRingPinky',
      'Ring-Pinky Gap',
      kinematics.spreadRingPinky,
      t.spreadRingPinky
    );
  }

  // Evaluate Physical Fingertip Contact Constraints (normalized by palmScale = distance(0, 9))
  let contactFailed = false;
  let topContactDirective = '';
  let topContactJointKey: string | undefined;

  if (targetMudra.requiredContacts && kinematics.tipDistances) {
    targetMudra.requiredContacts.forEach((contact) => {
      const actualDist = kinematics.tipDistances[contact.pair];
      const maxAllowed = contact.maxDistance;
      const isTouching = actualDist <= maxAllowed;
      const delta = actualDist - maxAllowed;
      const jointKey = `contact.${contact.pair}`;

      let status: JointEvaluation['status'] = 'CORRECT';
      if (actualDist > maxAllowed * 1.5) {
        status = 'INCORRECT';
      } else if (!isTouching) {
        status = 'MINOR_DEVIATION';
      }

      let contactWeightedPenalty = 0;
      if (!isTouching) {
        contactFailed = true;
        // Severe penalty for breaking required physical contact
        const excess = (actualDist - maxAllowed) / maxAllowed;
        const ratio = 1.5 + excess * 2.0;
        contactWeightedPenalty = 4.0 * (ratio * ratio);
        totalWeightedPenalty += contactWeightedPenalty;
        totalWeight += 4.0;

        if (!topContactDirective) {
          topContactDirective = contact.directive;
          topContactJointKey = jointKey;
        }
      }

      evaluations.push({
        jointKey,
        label: contact.label,
        triplet: JOINT_TRIPLETS[jointKey],
        rawValue: Number((actualDist * 100).toFixed(2)),
        currentDegrees: Math.round(actualDist * 100),
        targetDegrees: Math.round(maxAllowed * 100),
        toleranceDegrees: Math.round(maxAllowed * 100),
        acceptedRange: [0, Math.round(maxAllowed * 100)],
        deltaDegrees: Math.round(delta * 100),
        weight: 4.0,
        weightedPenalty: Number(contactWeightedPenalty.toFixed(3)),
        status,
      });
    });
  }

  // Calculate exponential decaying score
  const avgPenalty = totalWeight > 0 ? totalWeightedPenalty / totalWeight : 0;
  // avgPenalty = 1 means average error equals the tolerance threshold
  const rawScore = Math.exp(-0.5 * avgPenalty) * 100;
  let matchScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  const hasSignatureDiscrepancy = evaluations.some(
    (e) =>
      !e.jointKey.startsWith('contact.') &&
      (e.weight ?? 1.0) >= 2.0 &&
      Math.abs((e.rawValue ?? e.currentDegrees) - e.targetDegrees) >
        (e.toleranceDegrees ?? 15) * 1.2
  );

  // If a defining physical contact is failed, cap the score below the mastery threshold (max 65%);
  // if a signature joint (weight >= 2.0) exceeds 1.2x tolerance, cap below mastery (max 84%).
  if (contactFailed) {
    matchScore = Math.min(matchScore, 65);
  } else if (hasSignatureDiscrepancy) {
    matchScore = Math.min(matchScore, 84);
  }

  // Identify top angular discrepancies to form pedagogical advice (excluding contact pseudo-entries),
  // prioritizing weighted penalty (signature joints first) with raw angular delta as tiebreaker.
  const incorrectJoints = evaluations
    .filter((e) => e.status !== 'CORRECT' && !e.jointKey.startsWith('contact.'))
    .sort((a, b) => {
      const penaltyDiff = (b.weightedPenalty ?? 0) - (a.weightedPenalty ?? 0);
      if (Math.abs(penaltyDiff) > 0.25) return penaltyDiff;
      return Math.abs(b.deltaDegrees) - Math.abs(a.deltaDegrees);
    });

  let primaryDirective = 'Excellent! Your hand posture closely matches the canonical Mudra.';
  let secondaryDirective: string | undefined;
  let primaryJointKey: string | undefined;
  let secondaryJointKey: string | undefined;

  if (incorrectJoints.length > 0) {
    const topError = incorrectJoints[0];
    primaryDirective = resolveJointDirective(targetMudra, topError);
    primaryJointKey = topError.jointKey;

    if (incorrectJoints.length > 1) {
      const secondError = incorrectJoints[1];
      secondaryDirective = resolveJointDirective(targetMudra, secondError);
      secondaryJointKey = secondError.jointKey;
    }
  }

  // If a physical contact failed, make that the primary guidance!
  if (contactFailed && topContactDirective) {
    if (primaryDirective !== topContactDirective) {
      secondaryDirective = primaryDirective;
      secondaryJointKey = primaryJointKey;
    } else {
      secondaryDirective = undefined;
      secondaryJointKey = undefined;
    }
    primaryDirective = topContactDirective;
    primaryJointKey = topContactJointKey;
  }

  const hasSevereDiscrepancy = evaluations.some((e) => e.status === 'INCORRECT');
  const isMastered =
    matchScore >= 88 && !contactFailed && !hasSevereDiscrepancy && !hasSignatureDiscrepancy;

  if (isMastered) {
    primaryDirective = 'Flawless Form! Position holds true to canonical Kathakali technique.';
    primaryJointKey = undefined;
    secondaryJointKey = undefined;
  }

  return {
    mudraId: targetMudra.id,
    mudraName: targetMudra.name,
    measurementStatus: 'VALID',
    coordinateSource: kinematics.coordinateSource,
    handedness: kinematics.handedness,
    matchScore,
    isMastered,
    primaryDirective,
    secondaryDirective,
    primaryJointKey,
    secondaryJointKey,
    jointEvaluations: evaluations,
    totalWeight: Number(totalWeight.toFixed(2)),
    totalWeightedPenalty: Number(totalWeightedPenalty.toFixed(3)),
  };
}

export default evaluateMudraKinematics;
