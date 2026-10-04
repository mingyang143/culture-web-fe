import {
  HandKinematics,
  CanonicalMudra,
  MudraEvaluationResult,
  JointEvaluation,
} from 'types/mudra';

/**
 * Evaluates student kinematics against a canonical mudra target
 */
export function evaluateMudraKinematics(
  kinematics: HandKinematics,
  targetMudra: CanonicalMudra
): MudraEvaluationResult {
  const evaluations: JointEvaluation[] = [];
  let totalWeightedPenalty = 0;
  let totalWeight = 0;

  // Helper to evaluate a single joint
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

    evaluations.push({
      jointKey,
      label,
      currentDegrees: Math.round(actualVal),
      targetDegrees: target.targetDegrees,
      deltaDegrees: Math.round(delta),
      status,
    });

    // Normalized squared penalty
    const ratio = absDelta / tol;
    totalWeightedPenalty += target.weight * Math.min(ratio * ratio, 9.0);
    totalWeight += target.weight;
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

  // Spreads if present
  if (t.spreadIndexMiddle) {
    checkJoint(
      'spreadIndexMiddle',
      'Index-Middle Gap',
      kinematics.spreadIndexMiddle,
      t.spreadIndexMiddle
    );
  }

  // Calculate exponential decaying score
  const avgPenalty = totalWeight > 0 ? totalWeightedPenalty / totalWeight : 0;
  // avgPenalty = 1 means average error equals the tolerance threshold
  const rawScore = Math.exp(-0.5 * avgPenalty) * 100;
  const matchScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Identify top discrepancy to form pedagogical advice
  const incorrectJoints = evaluations
    .filter((e) => e.status !== 'CORRECT')
    .sort((a, b) => Math.abs(b.deltaDegrees) - Math.abs(a.deltaDegrees));

  let primaryDirective = 'Excellent! Your hand posture closely matches the canonical Mudra.';
  let secondaryDirective: string | undefined;

  if (incorrectJoints.length > 0) {
    const topError = incorrectJoints[0];
    const matchingRule = targetMudra.pedagogicalRules.find((rule) => {
      if (rule.jointKey !== topError.jointKey) return false;
      if (rule.condition === 'TOO_BENT' && topError.deltaDegrees > 0) return true;
      if (rule.condition === 'TOO_STRAIGHT' && topError.deltaDegrees < 0) return true;
      if (rule.condition === 'TOO_WIDE' && topError.deltaDegrees > 0) return true;
      if (rule.condition === 'TOO_NARROW' && topError.deltaDegrees < 0) return true;
      return false;
    });

    if (matchingRule) {
      primaryDirective = matchingRule.directive;
    } else {
      const direction = topError.deltaDegrees > 0 ? 'too bent' : 'too straight';
      primaryDirective = `Your ${topError.label} is ${direction} by ~${Math.abs(topError.deltaDegrees)}°. Adjust to ~${topError.targetDegrees}°.`;
    }

    if (incorrectJoints.length > 1) {
      const secondError = incorrectJoints[1];
      const secondRule = targetMudra.pedagogicalRules.find((r) => r.jointKey === secondError.jointKey);
      if (secondRule) {
        secondaryDirective = secondRule.directive;
      }
    }
  }

  return {
    mudraId: targetMudra.id,
    mudraName: targetMudra.name,
    matchScore,
    isMastered: matchScore >= 85,
    primaryDirective,
    secondaryDirective,
    jointEvaluations: evaluations,
  };
}
