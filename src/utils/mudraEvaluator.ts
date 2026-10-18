import {
  HandKinematics,
  CanonicalMudra,
  MudraEvaluationResult,
  JointEvaluation,
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

  if (targetMudra.requiredContacts && kinematics.tipDistances) {
    targetMudra.requiredContacts.forEach((contact) => {
      const actualDist = kinematics.tipDistances[contact.pair];
      const maxAllowed = contact.maxDistance;
      const isTouching = actualDist <= maxAllowed;
      const delta = actualDist - maxAllowed;

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
        }
      }

      const jointKey = `contact.${contact.pair}`;
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
      e.weight >= 2.0 &&
      Math.abs(e.rawValue - e.targetDegrees) > e.toleranceDegrees * 1.2
  );

  // If a defining physical contact is failed, cap the score below the mastery threshold (max 65%);
  // if a signature joint (weight >= 2.0) exceeds 1.2x tolerance, cap below mastery (max 84%).
  if (contactFailed) {
    matchScore = Math.min(matchScore, 65);
  } else if (hasSignatureDiscrepancy) {
    matchScore = Math.min(matchScore, 84);
  }

  // Identify top angular discrepancies to form pedagogical advice (excluding contact pseudo-entries)
  const incorrectJoints = evaluations
    .filter((e) => e.status !== 'CORRECT' && !e.jointKey.startsWith('contact.'))
    .sort((a, b) => Math.abs(b.deltaDegrees) - Math.abs(a.deltaDegrees));

  let primaryDirective = 'Excellent! Your hand posture closely matches the canonical Mudra.';
  let secondaryDirective: string | undefined;

  if (incorrectJoints.length > 0) {
    const topError = incorrectJoints[0];
    primaryDirective = resolveJointDirective(targetMudra, topError);

    if (incorrectJoints.length > 1) {
      const secondError = incorrectJoints[1];
      secondaryDirective = resolveJointDirective(targetMudra, secondError);
    }
  }

  // If a physical contact failed, make that the primary guidance!
  if (contactFailed && topContactDirective) {
    secondaryDirective = primaryDirective !== topContactDirective ? primaryDirective : undefined;
    primaryDirective = topContactDirective;
  }

  const hasSevereDiscrepancy = evaluations.some((e) => e.status === 'INCORRECT');
  const isMastered =
    matchScore >= 88 && !contactFailed && !hasSevereDiscrepancy && !hasSignatureDiscrepancy;

  if (isMastered) {
    primaryDirective = 'Flawless Form! Position holds true to canonical Kathakali technique.';
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
    jointEvaluations: evaluations,
    totalWeight: Number(totalWeight.toFixed(2)),
    totalWeightedPenalty: Number(totalWeightedPenalty.toFixed(3)),
  };
}

export default evaluateMudraKinematics;
