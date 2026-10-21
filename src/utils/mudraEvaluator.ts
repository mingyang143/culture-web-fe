import {
  HandKinematics,
  CanonicalMudra,
  MudraEvaluationResult,
  JointEvaluation,
  CoachingAnchorState,
  HoldTimerState,
  TemporalFeatureStats,
} from 'types/mudra';
import { JOINT_TRIPLETS } from 'utils/mudraKinematics';

export const PASS_ENTRY_SCORE = 88;
export const PASS_EXIT_SCORE = 85;
export const STATUS_EXIT_HYSTERESIS_RATIO = 0.08;
export const HOLD_GRACE_WINDOW_MS = 350;
export const MAX_HOLD_FRAME_DT_MS = 250;
export const WITHIN_TARGET_RANGES_DIRECTIVE =
  'Within target ranges. Hold this posture steadily.';

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
  if (evaluation.unit === 'palmRatio' || evaluation.jointKey.startsWith('contact.')) {
    return `${evaluation.label} distance is ${evaluation.currentDegrees.toFixed(2)} palm widths (target ≤ ${evaluation.targetDegrees.toFixed(2)}). Bring fingertips closer together.`;
  }
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
 * Computes the tolerance-normalized error ratio for a JointEvaluation:
 * - Angular features ('deg'): |rawValue - targetDegrees| / toleranceDegrees
 * - Contact features ('palmRatio'): rawValue / maxAllowedDistance
 * A value <= 1.0 means the feature is strictly inside its configured accepted range.
 */
export function getNormalizedJointError(je: JointEvaluation): number {
  if (typeof je.normalizedError === 'number' && Number.isFinite(je.normalizedError)) {
    return je.normalizedError;
  }
  const raw = je.rawValue ?? je.currentDegrees;
  if (je.unit === 'palmRatio' || je.jointKey.startsWith('contact.')) {
    const maxAllowed = je.targetDegrees > 0 ? je.targetDegrees : 0.35;
    return raw / maxAllowed;
  }
  const tol = je.toleranceDegrees && je.toleranceDegrees > 0 ? je.toleranceDegrees : 15;
  return Math.abs(raw - je.targetDegrees) / tol;
}

/**
 * Extracts a 17-element numerical feature vector from 3D HandKinematics in native units:
 * - [0..9]:   10 core finger joint flexion angles (degrees)
 * - [10..12]: 3 inter-finger abduction spread angles (degrees)
 * - [13..16]: 4 palm-normalized fingertip contact distances (dimensionless palmRatio, 0..2)
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
    kinematics.tipDistances.thumbIndex,
    kinematics.tipDistances.thumbMiddle,
    kinematics.tipDistances.thumbRing,
    kinematics.tipDistances.thumbPinky,
  ];
}

/**
 * Compares two 17-element kinematics feature vectors using unit-aware thresholds:
 * - Flexion angles [0..9] (degrees): mean diff <= meanAngleThresholdDeg (5.0°) and max diff <= maxJointAngleThresholdDeg (10.0°)
 * - Spread angles [10..12] (degrees): max diff <= maxSpreadAngleThresholdDeg (7.0°)
 * - Contact distances [13..16] (palmRatio): max diff <= maxContactRatioDelta (0.06 palm widths)
 */
export function areKinematicsVectorsSimilar(
  vecA: number[],
  vecB: number[],
  meanAngleThresholdDeg = 5.0,
  maxJointAngleThresholdDeg = 10.0,
  maxContactRatioDelta = 0.06,
  maxSpreadAngleThresholdDeg = 7.0
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

  for (let i = 10; i < 13; i += 1) {
    if (Math.abs(vecA[i] - vecB[i]) > maxSpreadAngleThresholdDeg) {
      return false;
    }
  }

  for (let i = 13; i < 17; i += 1) {
    if (Math.abs(vecA[i] - vecB[i]) > maxContactRatioDelta) {
      return false;
    }
  }

  return true;
}

/**
 * Stabilizes live video coaching evaluations using:
 * 1. Mandatory Pass Criteria vs. Continuous Scoring Weights Policy:
 *    - Mandatory criteria for entry (`isMastered` / `isValidHoldFrame`):
 *      (a) `matchScore >= PASS_ENTRY_SCORE` (88),
 *      (b) zero features with `status === 'INCORRECT'` across all evaluated features,
 *      (c) all required fingertip contacts (`requiredContacts`) strictly in range (`normalizedError <= 1.0`),
 *      (d) all signature joints (`weight >= 2.0`) strictly in range (`normalizedError <= 1.0`).
 *    - Non-signature supporting features (`weight < 2.0`) contribute continuously to `matchScore` via
 *      their scoring weights; a slight deviation (`1.0 < normalizedError <= 1.8`, `MINOR_DEVIATION`) on a
 *      non-signature feature is permitted on a passing pose provided `matchScore >= 88`, and surfaces
 *      optional refinement coaching rather than `"Within target ranges"`.
 * 2. Tolerance-normalized per-feature status exit hysteresis (`STATUS_EXIT_HYSTERESIS_RATIO = 0.08`,
 *    i.e. 8% of each feature's tolerance in its native unit) bounded in time to `HOLD_GRACE_WINDOW_MS` (350ms).
 * 3. Explicit hold-validity separation: frames kept passing only via exit hysteresis have
 *    `isValidHoldFrame = false` and never earn hold time.
 * 4. Strict `isFlawless` ("Within target ranges") gating: `"Within target ranges..."` is strictly reserved
 *    for frames where `isValidHoldFrame` is true AND every evaluated target criterion is satisfied
 *    (`status === 'CORRECT'` and `normalizedError <= 1.0` across all features, regardless of weight).
 * 5. Fast cross-joint error switching: when a new joint becomes the primary error, coaching updates
 *    immediately on severe/signature/contact errors or after at most 250ms on minor non-signature ties.
 */
export function stabilizeCoachingEvaluation(
  currentEval: MudraEvaluationResult,
  currentKinematics: HandKinematics | null | undefined,
  anchorState: CoachingAnchorState | null,
  nowMs: number,
  minDwellMs = 250
): { stabilizedEval: MudraEvaluationResult; nextAnchor: CoachingAnchorState | null } {
  if (!currentKinematics || currentEval.measurementStatus === 'MEASUREMENT_UNAVAILABLE') {
    return { stabilizedEval: currentEval, nextAnchor: null };
  }

  const currentVector = extractKinematicsFeatureVector(currentKinematics);
  const isSameHand =
    !anchorState?.handedness ||
    anchorState.handedness === 'Unknown' ||
    !currentEval.handedness ||
    currentEval.handedness === 'Unknown' ||
    anchorState.handedness === currentEval.handedness;
  const isSameContext = Boolean(
    anchorState && anchorState.mudraId === currentEval.mudraId && isSameHand
  );

  const lastTimestamp =
    isSameContext && anchorState ? anchorState.lastFrameAtMs ?? anchorState.updatedAtMs : nowMs;
  const rawDtMs = nowMs - lastTimestamp;
  const frameDtMs = rawDtMs > 0 ? Math.min(250, rawDtMs) : 33.3;

  // Check whether the current frame strictly satisfies mandatory entry pass criteria without any hysteresis
  const rawContactFailed = currentEval.jointEvaluations.some(
    (e) =>
      (e.unit === 'palmRatio' || e.jointKey.startsWith('contact.')) &&
      (e.status !== 'CORRECT' || getNormalizedJointError(e) > 1.0)
  );
  const rawSevereDiscrepancy = currentEval.jointEvaluations.some((e) => e.status === 'INCORRECT');
  const rawSignatureDiscrepancy = currentEval.jointEvaluations.some(
    (e) =>
      e.unit !== 'palmRatio' &&
      !e.jointKey.startsWith('contact.') &&
      (e.weight ?? 1.0) >= 2.0 &&
      getNormalizedJointError(e) > 1.0
  );
  const strictEntryPass =
    currentEval.matchScore >= PASS_ENTRY_SCORE &&
    !rawContactFailed &&
    !rawSevereDiscrepancy &&
    !rawSignatureDiscrepancy;

  const wasMasteredPreviously = Boolean(isSameContext && anchorState?.wasMastered);
  const prevHysteresisMs = isSameContext ? anchorState?.hysteresisElapsedMs ?? 0 : 0;

  let nextHysteresisElapsedMs = 0;
  if (strictEntryPass) {
    // Decay accumulated hysteresis debt at 0.5x frame dt so repeated brief dips cannot reset debt on 1 frame
    nextHysteresisElapsedMs = Math.max(0, prevHysteresisMs - frameDtMs * 0.5);
  } else if (wasMasteredPreviously) {
    nextHysteresisElapsedMs = prevHysteresisMs + frameDtMs;
  }

  const allowExitHysteresis =
    wasMasteredPreviously && nextHysteresisElapsedMs <= HOLD_GRACE_WINDOW_MS;

  // 1. Apply tolerance-normalized per-feature status exit hysteresis (8% of feature tolerance)
  const prevJointStatuses = isSameContext ? anchorState?.jointStatuses : undefined;
  const nextJointStatuses: Record<string, JointEvaluation['status']> = {};

  const stabilizedJointEvaluations: JointEvaluation[] = currentEval.jointEvaluations.map((je) => {
    let stabilizedStatus = je.status;
    const prevStatus = prevJointStatuses?.[je.jointKey];
    const normErr = getNormalizedJointError(je);
    const isContact = je.unit === 'palmRatio' || je.jointKey.startsWith('contact.');

    if (prevStatus && allowExitHysteresis) {
      if (prevStatus === 'CORRECT' && je.status === 'MINOR_DEVIATION') {
        if (normErr <= 1.0 + STATUS_EXIT_HYSTERESIS_RATIO) {
          stabilizedStatus = 'CORRECT';
        }
      } else if (prevStatus === 'MINOR_DEVIATION' && je.status === 'INCORRECT') {
        const incorrectRatioLimit = (isContact ? 1.5 : 1.8) + STATUS_EXIT_HYSTERESIS_RATIO;
        if (normErr <= incorrectRatioLimit) {
          stabilizedStatus = 'MINOR_DEVIATION';
        }
      }
    }

    nextJointStatuses[je.jointKey] = stabilizedStatus;
    return stabilizedStatus === je.status ? je : { ...je, status: stabilizedStatus };
  });

  // 2. Derive coherent pass/fail (`isMastered`), `isValidHoldFrame`, and `isFlawless` states
  const contactFailed = stabilizedJointEvaluations.some(
    (e) => (e.unit === 'palmRatio' || e.jointKey.startsWith('contact.')) && e.status !== 'CORRECT'
  );
  const hasSevereDiscrepancy = stabilizedJointEvaluations.some((e) => e.status === 'INCORRECT');
  const hasMinorDiscrepancy = stabilizedJointEvaluations.some(
    (e) => e.status === 'MINOR_DEVIATION'
  );

  const signatureRatioLimit = allowExitHysteresis ? 1.0 + STATUS_EXIT_HYSTERESIS_RATIO : 1.0;
  const passScoreThreshold = allowExitHysteresis ? PASS_EXIT_SCORE : PASS_ENTRY_SCORE;

  const hasSignatureDiscrepancy = stabilizedJointEvaluations.some(
    (e) =>
      e.unit !== 'palmRatio' &&
      !e.jointKey.startsWith('contact.') &&
      (e.weight ?? 1.0) >= 2.0 &&
      getNormalizedJointError(e) > signatureRatioLimit
  );

  const isMastered =
    currentEval.matchScore >= passScoreThreshold &&
    !contactFailed &&
    !hasSevereDiscrepancy &&
    !hasSignatureDiscrepancy;
  const isValidHoldFrame = strictEntryPass;
  const allTargetsSatisfied =
    currentEval.jointEvaluations.length > 0 &&
    currentEval.jointEvaluations.every(
      (e) => e.status === 'CORRECT' && getNormalizedJointError(e) <= 1.0
    ) &&
    stabilizedJointEvaluations.every((e) => e.status === 'CORRECT');
  const isFlawless = isValidHoldFrame && allTargetsSatisfied && !hasMinorDiscrepancy;

  const createAnchor = (
    evalRes: MudraEvaluationResult,
    updatedAt = nowMs
  ): CoachingAnchorState => ({
    mudraId: evalRes.mudraId,
    handedness: evalRes.handedness,
    anchorVector: currentVector,
    primaryDirective: evalRes.primaryDirective,
    secondaryDirective: evalRes.secondaryDirective,
    primaryJointKey: evalRes.primaryJointKey,
    secondaryJointKey: evalRes.secondaryJointKey,
    wasMastered: evalRes.isMastered,
    wasValidHoldFrame: evalRes.isValidHoldFrame,
    wasFlawless: evalRes.isFlawless,
    hysteresisElapsedMs: evalRes.isMastered ? nextHysteresisElapsedMs : 0,
    lastFrameAtMs: nowMs,
    jointStatuses: nextJointStatuses,
    updatedAtMs: updatedAt,
  });

  // 3. Handle mastered state:
  //    - `isFlawless === true`: all evaluated target criteria are strictly satisfied -> "Within target ranges..."
  //    - `isFlawless === false`: either a permitted non-signature deviation (`isValidHoldFrame === true`)
  //      or a boundary-grace frame (`isValidHoldFrame === false`) -> accurate wording + refinement tip.
  if (isMastered) {
    if (isFlawless) {
      const withinTargetEval: MudraEvaluationResult = {
        ...currentEval,
        isMastered: true,
        isValidHoldFrame,
        isFlawless: true,
        primaryDirective: WITHIN_TARGET_RANGES_DIRECTIVE,
        secondaryDirective: undefined,
        primaryJointKey: undefined,
        secondaryJointKey: undefined,
        jointEvaluations: stabilizedJointEvaluations,
      };
      return {
        stabilizedEval: withinTargetEval,
        nextAnchor: createAnchor(withinTargetEval),
      };
    }

    // Passing (`isMastered = true`) with permitted deviation or boundary hysteresis grace:
    // Never claim "Within target ranges" when any evaluated feature exceeds its target range.
    const rawDeviating = currentEval.jointEvaluations
      .filter((e) => e.status !== 'CORRECT' || getNormalizedJointError(e) > 1.0)
      .sort((a, b) => (b.weightedPenalty ?? 0) - (a.weightedPenalty ?? 0));
    const topMinor =
      stabilizedJointEvaluations.find(
        (e) =>
          e.status === 'MINOR_DEVIATION' &&
          e.unit !== 'palmRatio' &&
          !e.jointKey.startsWith('contact.')
      ) ?? rawDeviating[0];

    let minorDirective = currentEval.primaryDirective;
    let minorJointKey = currentEval.primaryJointKey ?? topMinor?.jointKey;

    const stripRefinementPrefix = (text: string): string => {
      const prefixMatch = text.match(
        /^(?:Good Form — hold steady!|Good Form \(boundary grace, hold paused\) —) Optional refinement \([^)]+\): (.*)$/
      );
      return prefixMatch ? prefixMatch[1] : text;
    };

    if (topMinor) {
      const cleanedCurrent = stripRefinementPrefix(currentEval.primaryDirective);
      const baseRuleText =
        cleanedCurrent === WITHIN_TARGET_RANGES_DIRECTIVE
          ? formatFallbackDirective(topMinor)
          : cleanedCurrent;
      minorDirective = isValidHoldFrame
        ? `Good Form — hold steady! Optional refinement (${topMinor.label}): ${baseRuleText}`
        : `Good Form (boundary grace, hold paused) — Optional refinement (${topMinor.label}): ${baseRuleText}`;
      minorJointKey = topMinor.jointKey;
    } else {
      minorDirective = isValidHoldFrame
        ? 'Good Form — hold steady! Minor score deviation within permitted threshold.'
        : 'Good Form (boundary grace, hold paused) — hold steady to return within target ranges.';
      minorJointKey = undefined;
    }

    // Keep minor refinement text stable if already in the same passing sub-state with similar vector
    if (
      wasMasteredPreviously &&
      !anchorState?.wasFlawless &&
      anchorState?.wasValidHoldFrame === isValidHoldFrame &&
      anchorState?.primaryDirective &&
      areKinematicsVectorsSimilar(currentVector, anchorState.anchorVector)
    ) {
      minorDirective = anchorState.primaryDirective;
      minorJointKey = anchorState.primaryJointKey;
    }

    const passingMinorEval: MudraEvaluationResult = {
      ...currentEval,
      isMastered: true,
      isValidHoldFrame,
      isFlawless: false,
      primaryDirective: minorDirective,
      secondaryDirective: undefined,
      primaryJointKey: minorJointKey,
      secondaryJointKey: undefined,
      jointEvaluations: stabilizedJointEvaluations,
    };

    return {
      stabilizedEval: passingMinorEval,
      nextAnchor: createAnchor(
        passingMinorEval,
        wasMasteredPreviously && anchorState ? anchorState.updatedAtMs : nowMs
      ),
    };
  }

  // 4. Non-mastered state (`isMastered === false`):
  const baseNonMasteredEval: MudraEvaluationResult = {
    ...currentEval,
    isMastered: false,
    isValidHoldFrame: false,
    isFlawless: false,
    jointEvaluations: stabilizedJointEvaluations,
  };

  // Initialize anchor if none exists, if context changed, or if transitioning out of mastery
  if (!anchorState || !isSameContext || anchorState.wasMastered) {
    return {
      stabilizedEval: baseNonMasteredEval,
      nextAnchor: createAnchor(baseNonMasteredEval),
    };
  }

  // Check if the previously coached primary joint is now resolved (CORRECT)
  const lockedJointEval = anchorState.primaryJointKey
    ? stabilizedJointEvaluations.find((j) => j.jointKey === anchorState.primaryJointKey)
    : undefined;
  const isLockedJointResolved = Boolean(
    anchorState.primaryJointKey && (!lockedJointEval || lockedJointEval.status === 'CORRECT')
  );

  // Immediate release when the user fixes the joint they were coached on
  if (isLockedJointResolved) {
    return {
      stabilizedEval: baseNonMasteredEval,
      nextAnchor: createAnchor(baseNonMasteredEval),
    };
  }

  const isSamePrimaryJoint =
    Boolean(anchorState.primaryJointKey) &&
    baseNonMasteredEval.primaryJointKey === anchorState.primaryJointKey;

  // Check whether a new primary error is severe, a signature joint, or a broken contact
  const newPrimaryEval = baseNonMasteredEval.primaryJointKey
    ? stabilizedJointEvaluations.find((j) => j.jointKey === baseNonMasteredEval.primaryJointKey)
    : undefined;
  const isUrgentNewPrimary =
    !isSamePrimaryJoint &&
    Boolean(
      newPrimaryEval &&
        (newPrimaryEval.status === 'INCORRECT' ||
          (newPrimaryEval.weight ?? 1.0) >= 2.0 ||
          newPrimaryEval.unit === 'palmRatio' ||
          newPrimaryEval.jointKey.startsWith('contact.'))
    );

  if (isUrgentNewPrimary) {
    return {
      stabilizedEval: baseNonMasteredEval,
      nextAnchor: createAnchor(baseNonMasteredEval),
    };
  }

  // Gate 1: Anchor-Vector Similarity Gate — if the hand pose hasn't meaningfully changed
  // from when the advice was issued, keep the coaching text steady.
  if (areKinematicsVectorsSimilar(currentVector, anchorState.anchorVector)) {
    return {
      stabilizedEval: {
        ...baseNonMasteredEval,
        primaryDirective: anchorState.primaryDirective,
        secondaryDirective: anchorState.secondaryDirective,
        primaryJointKey: anchorState.primaryJointKey,
        secondaryJointKey: anchorState.secondaryJointKey,
      },
      nextAnchor: {
        ...anchorState,
        hysteresisElapsedMs: 0,
        lastFrameAtMs: nowMs,
        jointStatuses: nextJointStatuses,
      },
    };
  }

  // Gate 2: Same-joint mid-motion continuity or brief cross-joint tie debounce (default 250ms)
  const withinDwellWindow = nowMs - anchorState.updatedAtMs < minDwellMs;
  if (isSamePrimaryJoint || withinDwellWindow) {
    return {
      stabilizedEval: {
        ...baseNonMasteredEval,
        primaryDirective: anchorState.primaryDirective,
        secondaryDirective: anchorState.secondaryDirective,
        primaryJointKey: anchorState.primaryJointKey,
        secondaryJointKey: anchorState.secondaryJointKey,
      },
      nextAnchor: {
        ...anchorState,
        anchorVector: withinDwellWindow ? anchorState.anchorVector : currentVector,
        hysteresisElapsedMs: 0,
        lastFrameAtMs: nowMs,
        jointStatuses: nextJointStatuses,
      },
    };
  }

  return {
    stabilizedEval: baseNonMasteredEval,
    nextAnchor: createAnchor(baseNonMasteredEval),
  };
}

/**
 * Advances the 2.0-second accumulated valid-pose hold timer with a bounded dropout grace budget (350ms).
 *
 * Explicit Hold-Time Accounting Policy:
 * 1. Once `isHoldMastered` is true, the timer stays locked at `holdDurationMs`.
 * 2. If 3D measurement is unavailable, handedness switches, or `matchScore < 65`, the timer hard-resets to 0
 *    and clears `hasValidAnchor = false`.
 * 3. No hold credit before an observed elapsed interval: the first valid frame (`!prevState.hasValidAnchor`)
 *    establishes `hasValidAnchor = true` and earns `+0ms`. Only a subsequent strictly valid frame across an
 *    observed interval `0 < dtMs <= MAX_HOLD_FRAME_DT_MS` (250ms) earns `+dtMs`.
 * 4. No hold credit across tracking loss, stalled frames (`dtMs > 250ms` or `dtMs <= 0`), or background-tab gaps:
 *    stalled/non-positive intervals earn `+0ms` and only re-anchor if the current frame is strictly valid.
 * 5. Invalid frames (including exit-hysteresis frames where `isValidHoldFrame === false`, or `isMastered === false`)
 *    NEVER earn hold time (`+0ms`), clear `hasValidAnchor = false`, and can NEVER trigger completion (`isHoldMastered = false`).
 * 6. During an active hold (`holdElapsedMs > 0`), invalid frames consume from a cumulative per-attempt
 *    grace budget (`totalGraceUsedMs <= graceWindowMs = 350ms`) provided `matchScore >= 75` and no joint
 *    is `'INCORRECT'`. Once cumulative grace (`totalGraceUsedMs`) exceeds `graceWindowMs` (preventing
 *    repeated brief dips from accumulating indefinite grace), or if any joint is `'INCORRECT'`,
 *    `holdElapsedMs` decays at `0.75 * dtMs`.
 */
export function advanceHoldTimerState(
  prevState: HoldTimerState,
  evalRes: MudraEvaluationResult | null | undefined,
  dtMs: number,
  holdDurationMs = 2000,
  graceWindowMs = HOLD_GRACE_WINDOW_MS
): HoldTimerState {
  if (prevState.isHoldMastered) {
    return {
      holdElapsedMs: holdDurationMs,
      dropoutElapsedMs: 0,
      totalGraceUsedMs: prevState.totalGraceUsedMs ?? 0,
      hasValidAnchor: true,
      handedness: prevState.handedness,
      isHoldMastered: true,
    };
  }

  const handednessChanged = Boolean(
    prevState.handedness &&
      prevState.handedness !== 'Unknown' &&
      evalRes?.handedness &&
      evalRes.handedness !== 'Unknown' &&
      prevState.handedness !== evalRes.handedness
  );

  if (
    !evalRes ||
    evalRes.measurementStatus === 'MEASUREMENT_UNAVAILABLE' ||
    handednessChanged ||
    evalRes.matchScore < 65
  ) {
    return {
      holdElapsedMs: 0,
      dropoutElapsedMs: 0,
      totalGraceUsedMs: 0,
      hasValidAnchor: false,
      handedness: evalRes?.handedness,
      isHoldMastered: false,
    };
  }

  const isValidInterval =
    Number.isFinite(dtMs) && dtMs > 0 && dtMs <= MAX_HOLD_FRAME_DT_MS;
  const currentHandedness = evalRes.handedness ?? prevState.handedness;
  const isStrictlyValidFrame = evalRes.isMastered && (evalRes.isValidHoldFrame ?? true);

  if (isStrictlyValidFrame) {
    // Only credit elapsed time when transitioning from a previous valid anchor across a valid observed interval
    const earnedMs = prevState.hasValidAnchor && isValidInterval ? dtMs : 0;
    const holdElapsedMs = Math.min(holdDurationMs, prevState.holdElapsedMs + earnedMs);
    return {
      holdElapsedMs,
      dropoutElapsedMs: 0,
      totalGraceUsedMs: prevState.totalGraceUsedMs ?? 0,
      hasValidAnchor: true,
      handedness: currentHandedness,
      isHoldMastered: holdElapsedMs >= holdDurationMs,
    };
  }

  // Invalid frame: completion can NEVER occur on an invalid frame, and valid interval anchor is cleared
  const cappedPrevHold = Math.min( Math.max(0, holdDurationMs - 1), Math.max(0, prevState.holdElapsedMs) );
  if (cappedPrevHold <= 0) {
    return {
      holdElapsedMs: 0,
      dropoutElapsedMs: 0,
      totalGraceUsedMs: 0,
      hasValidAnchor: false,
      handedness: currentHandedness,
      isHoldMastered: false,
    };
  }

  const safeDt = isValidInterval ? dtMs : 0;
  const hasSevereDiscrepancy = evalRes.jointEvaluations.some((e) => e.status === 'INCORRECT');
  const nextDropout = prevState.dropoutElapsedMs + safeDt;
  const nextTotalGraceUsed = (prevState.totalGraceUsedMs ?? 0) + safeDt;

  if (
    evalRes.matchScore >= 75 &&
    !hasSevereDiscrepancy &&
    nextDropout <= graceWindowMs &&
    nextTotalGraceUsed <= graceWindowMs
  ) {
    // Pause hold timer during bounded grace window (+0ms earned, completion prohibited)
    return {
      holdElapsedMs: cappedPrevHold,
      dropoutElapsedMs: nextDropout,
      totalGraceUsedMs: nextTotalGraceUsed,
      hasValidAnchor: false,
      handedness: currentHandedness,
      isHoldMastered: false,
    };
  }

  const decayedHold = Math.max(0, cappedPrevHold - safeDt * 0.75);
  return {
    holdElapsedMs: decayedHold,
    dropoutElapsedMs: nextDropout,
    totalGraceUsedMs: decayedHold > 0 ? nextTotalGraceUsed : 0,
    hasValidAnchor: false,
    handedness: currentHandedness,
    isHoldMastered: false,
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
      isValidHoldFrame: false,
      isFlawless: false,
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
    const normalizedError = absDelta / tol;

    let status: JointEvaluation['status'] = 'CORRECT';
    if (normalizedError > 1.8) {
      status = 'INCORRECT';
    } else if (normalizedError > 1.0) {
      status = 'MINOR_DEVIATION';
    }

    // C0-continuous deadband-aware normalized squared penalty (no step cliff at absDelta === tol)
    let ratio = 0;
    if (normalizedError > 1.0) {
      // Exceeded tolerance: smooth ramp starting from 0.35 at absDelta === tol
      const excess = normalizedError - 1.0;
      ratio = 0.35 + excess * 1.45;
    } else {
      // Within tolerance (Green zone): mild linear ramp (0.0 to 0.35)
      ratio = normalizedError * 0.35;
    }

    const weightedPenalty = target.weight * Math.min(ratio * ratio, 9.0);
    totalWeightedPenalty += weightedPenalty;
    totalWeight += target.weight;

    evaluations.push({
      jointKey,
      label,
      unit: 'deg',
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
      normalizedError: Number(normalizedError.toFixed(3)),
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

  // Evaluate Physical Fingertip Contact Constraints in native palmRatio units (distance / palmScale)
  let contactFailed = false;
  let topContactDirective = '';
  let topContactJointKey: string | undefined;

  if (targetMudra.requiredContacts && kinematics.tipDistances) {
    targetMudra.requiredContacts.forEach((contact) => {
      const actualDist = kinematics.tipDistances[contact.pair];
      const maxAllowed = contact.maxDistance;
      const normalizedError = actualDist / maxAllowed;
      const isTouching = normalizedError <= 1.0;
      const delta = actualDist - maxAllowed;
      const jointKey = `contact.${contact.pair}`;

      let status: JointEvaluation['status'] = 'CORRECT';
      if (normalizedError > 1.5) {
        status = 'INCORRECT';
      } else if (!isTouching) {
        status = 'MINOR_DEVIATION';
      }

      let contactWeightedPenalty = 0;
      if (!isTouching) {
        contactFailed = true;
        // Severe penalty for breaking required physical contact
        const excess = normalizedError - 1.0;
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
        unit: 'palmRatio',
        triplet: JOINT_TRIPLETS[jointKey],
        rawValue: Number(actualDist.toFixed(3)),
        currentDegrees: Number(actualDist.toFixed(2)),
        targetDegrees: Number(maxAllowed.toFixed(2)),
        toleranceDegrees: Number(maxAllowed.toFixed(2)),
        acceptedRange: [0, Number(maxAllowed.toFixed(2))],
        deltaDegrees: Number(delta.toFixed(2)),
        normalizedError: Number(normalizedError.toFixed(3)),
        weight: 4.0,
        weightedPenalty: Number(contactWeightedPenalty.toFixed(3)),
        status,
      });
    });
  }

  // Calculate exponential decaying score
  const avgPenalty = totalWeight > 0 ? totalWeightedPenalty / totalWeight : 0;
  const rawScore = Math.exp(-0.5 * avgPenalty) * 100;
  let matchScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Signature joints (weight >= 2.0) must be within their configured accepted range (normalizedError <= 1.0)
  // to pass on entry. Beyond 1.0x tolerance, apply a smooth progressive score ceiling starting at 88%.
  let hasSignatureDiscrepancy = false;
  evaluations.forEach((e) => {
    if (e.unit !== 'palmRatio' && !e.jointKey.startsWith('contact.') && (e.weight ?? 1.0) >= 2.0) {
      const sigRatio = getNormalizedJointError(e);
      if (sigRatio > 1.0) {
        hasSignatureDiscrepancy = true;
        const progressiveCap = Math.round(88 - ((sigRatio - 1.0) / 0.1) * 3.5);
        matchScore = Math.min(matchScore, Math.max(0, progressiveCap));
      }
    }
  });

  // If a defining physical contact is failed, cap the score below the mastery threshold (max 65%)
  if (contactFailed) {
    matchScore = Math.min(matchScore, 65);
  }

  // Identify top angular discrepancies to form pedagogical advice (excluding contact entries),
  // prioritizing weighted penalty (signature joints first) with normalizedError as tiebreaker.
  const incorrectJoints = evaluations
    .filter(
      (e) => e.status !== 'CORRECT' && e.unit !== 'palmRatio' && !e.jointKey.startsWith('contact.')
    )
    .sort((a, b) => {
      const penaltyDiff = (b.weightedPenalty ?? 0) - (a.weightedPenalty ?? 0);
      if (Math.abs(penaltyDiff) > 1e-6) return penaltyDiff;
      return (b.weight ?? 1) * Math.abs(b.deltaDegrees) - (a.weight ?? 1) * Math.abs(a.deltaDegrees);
    });

  let primaryDirective = WITHIN_TARGET_RANGES_DIRECTIVE;
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
    if (primaryDirective !== topContactDirective && primaryJointKey) {
      secondaryDirective = primaryDirective;
      secondaryJointKey = primaryJointKey;
    } else {
      secondaryDirective = undefined;
      secondaryJointKey = undefined;
    }
    primaryDirective = topContactDirective;
    primaryJointKey = topContactJointKey;
  }

  // Mandatory Pass Criteria vs. Continuous Scoring Weights:
  // - Signature joints (weight >= 2.0) and requiredContacts are mandatory in-range criteria (normalizedError <= 1.0 on entry).
  // - Non-signature features (weight < 2.0) contribute to matchScore via continuous weights and may have MINOR_DEVIATION
  //   (1.0 < normalizedError <= 1.8) on a passing pose if matchScore >= 88 and no feature is INCORRECT.
  const hasSevereDiscrepancy = evaluations.some((e) => e.status === 'INCORRECT');
  const hasMinorDiscrepancy = evaluations.some((e) => e.status === 'MINOR_DEVIATION');
  const allTargetsSatisfied =
    evaluations.length > 0 &&
    evaluations.every((e) => e.status === 'CORRECT' && getNormalizedJointError(e) <= 1.0);
  const isMastered =
    matchScore >= PASS_ENTRY_SCORE &&
    !contactFailed &&
    !hasSevereDiscrepancy &&
    !hasSignatureDiscrepancy;
  const isValidHoldFrame = isMastered;
  const isFlawless = isMastered && allTargetsSatisfied && !hasMinorDiscrepancy;

  if (isFlawless) {
    primaryDirective = WITHIN_TARGET_RANGES_DIRECTIVE;
    secondaryDirective = undefined;
    primaryJointKey = undefined;
    secondaryJointKey = undefined;
  } else if (isMastered) {
    // Passing form with 1+ permitted non-signature MINOR_DEVIATION (orange) joints: never display "Within target ranges"
    if (incorrectJoints.length > 0) {
      const topMinor = incorrectJoints[0];
      primaryDirective = `Good Form — hold steady! Optional refinement (${topMinor.label}): ${resolveJointDirective(targetMudra, topMinor)}`;
      primaryJointKey = topMinor.jointKey;
    } else {
      primaryDirective =
        'Good Form — hold steady! Minor score deviation within permitted threshold.';
      primaryJointKey = undefined;
    }
    secondaryDirective = undefined;
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
    isValidHoldFrame,
    isFlawless,
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
