import { JointEvaluation, ThumbPlacementReferenceRequirement } from 'types/mudra';

/**
 * Returns human-friendly finger and joint descriptions from a joint key.
 * Enforces "thumb IP joint" instead of "thumb PIP".
 */
export function getFriendlyFingerAndJoint(jointKey: string): { finger: string; joint: string } {
  const parts = jointKey.split('.');
  const fingerKey = parts[0];
  const jointPart = parts[1] || '';

  const fingerMap: Record<string, string> = {
    thumb: 'thumb',
    index: 'index finger',
    middle: 'middle finger',
    ring: 'ring finger',
    pinky: 'pinky finger',
  };

  const finger = fingerMap[fingerKey] || 'finger';

  let joint = 'joint';
  if (fingerKey === 'thumb') {
    if (jointPart === 'pip' || jointPart === 'ip') {
      joint = 'IP joint'; // User-friendly: "thumb IP joint", NOT "thumb PIP"
    } else if (jointPart === 'mcp') {
      joint = 'base knuckle (MCP)';
    }
  } else if (jointPart === 'pip') {
      joint = 'middle joint (PIP)';
    } else if (jointPart === 'mcp') {
      joint = 'base knuckle (MCP)';
    } else if (jointPart === 'dip') {
      joint = 'tip joint (DIP)';
    }

  return { finger, joint };
}

/**
 * Shared template for finger/thumb bending angles.
 * deltaDegrees < 0: TOO_STRAIGHT (needs to bend more).
 * deltaDegrees > 0: TOO_BENT (needs to straighten).
 */
export function formatJointBendingAdvice(
  jointKey: string,
  deltaDegrees: number,
  fallbackLabel: string
): string {
  const { finger, joint } = getFriendlyFingerAndJoint(jointKey);

  if (deltaDegrees < 0) {
    return `Bend your ${finger} slightly more at the ${joint}.`;
  }
  if (deltaDegrees > 0) {
    return `Straighten your ${finger} slightly at the ${joint}.`;
  }
  return `Hold your ${fallbackLabel} steady in position.`;
}

/**
 * Shared template for inter-finger abduction / spreading.
 * deltaDegrees > 0: TOO_WIDE (needs to bring fingers closer).
 * deltaDegrees < 0: TOO_NARROW (needs to spread fingers farther).
 */
export function formatSpreadAdvice(
  jointKey: string,
  deltaDegrees: number,
  fallbackLabel: string
): string {
  let fingerA = '';
  let fingerB = '';

  if (jointKey === 'spreadIndexMiddle') {
    fingerA = 'index finger';
    fingerB = 'middle finger';
  } else if (jointKey === 'spreadMiddleRing') {
    fingerA = 'middle finger';
    fingerB = 'ring finger';
  } else if (jointKey === 'spreadRingPinky') {
    fingerA = 'ring finger';
    fingerB = 'pinky finger';
  } else if (jointKey === 'spreadThumbIndex') {
    fingerA = 'thumb';
    fingerB = 'index finger';
  }

  if (fingerA && fingerB) {
    if (deltaDegrees > 0) {
      return `Bring your ${fingerA} and ${fingerB} closer together.`;
    }
    if (deltaDegrees < 0) {
      return `Spread your ${fingerA} and ${fingerB} farther apart.`;
    }
    return `Hold your ${fingerA} and ${fingerB} steady in position.`;
  }

  if (deltaDegrees > 0) {
    return `Bring fingers at ${fallbackLabel} closer together.`;
  }
  if (deltaDegrees < 0) {
    return `Spread fingers at ${fallbackLabel} farther apart.`;
  }
  return `Hold ${fallbackLabel} steady in position.`;
}

/**
 * Shared template for fingertip contact / proximity.
 * Never outputs degrees for palm-normalized distance measurements.
 */
export function formatContactAdvice(
  label: string,
  actualVal?: number,
  acceptedRange?: [number, number]
): string {
  if (typeof actualVal !== 'number' || !Number.isFinite(actualVal)) {
    return `Measurement unavailable for ${label} — keep hand fully visible in frame.`;
  }

  const cleanLabel = label.toLowerCase();
  // If a minimum separation was configured and violated (too close)
  if (
    acceptedRange &&
    acceptedRange[0] > 0 &&
    actualVal < acceptedRange[0]
  ) {
    return `Separate your ${cleanLabel} farther apart.`;
  }
  // Standard contact (too far apart)
  return `Bring your ${cleanLabel} closer together to touch.`;
}

/**
 * Shared template for palm-relative 3D thumb placement.
 * Respects two-sided bounds so advice reverses appropriately when past the inward limit.
 * Never prescribes a direction for unknown/unsupported feature semantics.
 */
export function formatThumbPlacementAdvice(
  feature: string,
  actualVal?: number,
  acceptedRange?: [number, number],
  fallbackLabel = 'Thumb Placement'
): string {
  if (typeof actualVal !== 'number' || !Number.isFinite(actualVal)) {
    return `Measurement unavailable for ${fallbackLabel} — keep hand fully visible in frame.`;
  }

  const minBound = acceptedRange ? acceptedRange[0] : undefined;
  const maxBound = acceptedRange ? acceptedRange[1] : undefined;

  switch (feature) {
    case 'radialGapFromIndexMcp':
      // Lateral palm axis: positive = abducted outward; negative = tucked inward across palm.
      if (maxBound !== undefined && actualVal > maxBound) {
        return 'Tuck your thumb inward closer to your palm face.';
      }
      if (minBound !== undefined && actualVal < minBound) {
        return 'Move your thumb slightly outward away from the center of your palm.';
      }
      return 'Hold your thumb position steady along your palm.';

    case 'tipToIndexMcp':
      // 3D Euclidean distance from thumb tip to index MCP knuckle
      if (maxBound !== undefined && actualVal > maxBound) {
        return 'Bring your thumb tip closer to the base of your fingers.';
      }
      if (minBound !== undefined && actualVal < minBound) {
        return 'Move your thumb tip slightly farther from the base of your fingers.';
      }
      return 'Keep your thumb tip positioned alongside the base of your fingers.';

    case 'tipToMiddleMcp':
      // 3D Euclidean distance from thumb tip to middle MCP knuckle
      if (maxBound !== undefined && actualVal > maxBound) {
        return 'Bring your thumb tip closer to the center of your palm.';
      }
      if (minBound !== undefined && actualVal < minBound) {
        return 'Move your thumb tip slightly farther from the center of your palm.';
      }
      return 'Keep your thumb tip positioned near the center of your palm.';

    case 'palmar':
      if (maxBound !== undefined && actualVal > maxBound) {
        return 'Flatten your thumb closer to your palm surface.';
      }
      if (minBound !== undefined && actualVal < minBound) {
        return 'Lift your thumb slightly away from your palm surface.';
      }
      return 'Maintain your thumb height steady relative to your palm.';

    case 'ipRadialGapFromIndexMcp':
      if (maxBound !== undefined && actualVal > maxBound) {
        return 'Keep your thumb joint tucked closer alongside your index finger.';
      }
      if (minBound !== undefined && actualVal < minBound) {
        return 'Align your thumb joint alongside the outer edge of your index finger.';
      }
      return 'Keep your thumb joint aligned along your index finger.';

    default:
      // Do not prescribe a direction for unknown/unsupported feature semantics
      return `Adjust ${fallbackLabel} to within target range.`;
  }
}

/**
 * Generates feature-specific structured correction for palm-relative thumb placement
 * without hardcoding gesture names. Respects two-sided bounds.
 */
export function formatFallbackThumbPlacementDirective(
  req: ThumbPlacementReferenceRequirement,
  actualVal?: number
): string {
  if (typeof actualVal !== 'number' || !Number.isFinite(actualVal)) {
    return `Measurement unavailable for ${req.label} — keep hand fully visible in frame.`;
  }
  const tol = req.tolerancePalmRatio > 0 ? req.tolerancePalmRatio : 0.2;
  const minBound = req.minAllowedPalmRatio ?? (req.targetPalmRatio - tol);
  const maxBound = req.maxAllowedPalmRatio ?? (req.targetPalmRatio + tol);

  // If two-sided lower bound is violated (e.g. thumb tucked too far inward across palm),
  // advice must reverse to move outward, even if a custom inward directive is configured!
  if (req.minAllowedPalmRatio !== undefined && actualVal < req.minAllowedPalmRatio) {
    return formatThumbPlacementAdvice(req.feature, actualVal, [minBound, maxBound], req.label);
  }

  // If a custom directive is configured and the upper/general bound is violated, use it
  if (req.directive) return req.directive;

  return formatThumbPlacementAdvice(req.feature, actualVal, [minBound, maxBound], req.label);
}

/**
 * Deterministically constructs corrective advice based on evaluated feature semantics,
 * signed deviation, and measurement validity without requiring LLM inference.
 */
export function formatFallbackDirective(evaluation: JointEvaluation): string {
  // 1. Missing or non-finite measurements: tracking guidance, NOT anatomical advice
  if (
    evaluation.rawValue === undefined ||
    !Number.isFinite(evaluation.rawValue) ||
    !Number.isFinite(evaluation.deltaDegrees)
  ) {
    return `Measurement unavailable for ${evaluation.label} — keep hand fully visible in frame.`;
  }

  // 2. Fingertip contact / proximity
  if (evaluation.unit === 'palmRatio' || evaluation.jointKey.startsWith('contact.')) {
    return formatContactAdvice(evaluation.label, evaluation.rawValue, evaluation.acceptedRange);
  }

  // 3. Palm-relative thumb placement
  if (evaluation.jointKey.startsWith('thumbPlacement.')) {
    const feature = evaluation.jointKey.replace('thumbPlacement.', '');
    return formatThumbPlacementAdvice(
      feature,
      evaluation.rawValue,
      evaluation.acceptedRange,
      evaluation.label
    );
  }

  // 4. Inter-finger spread / abduction
  if (evaluation.jointKey.startsWith('spread')) {
    return formatSpreadAdvice(evaluation.jointKey, evaluation.deltaDegrees, evaluation.label);
  }

  // 5. Core finger/thumb joint bending
  return formatJointBendingAdvice(evaluation.jointKey, evaluation.deltaDegrees, evaluation.label);
}

/**
 * Strips any existing "Good Form... Optional refinement (...): " wrapper prefix.
 * Handles nested or repeated wrappers idempotently without breaking on parenthesized labels.
 */
export function stripRefinementPrefix(text: string): string {
  if (!text) return '';
  return text.replace(/^(?:Good Form[^:]*:\s*)+/, '').trim();
}

/**
 * Builds the optional refinement or boundary-grace wrapper once at the presentation boundary.
 * Never feeds already-wrapped text back into another wrapper.
 */
export function formatRefinementDirective(
  coreAdvice: string,
  label: string,
  isHoldPaused: boolean
): string {
  const cleanCore = stripRefinementPrefix(coreAdvice);
  const prefix = isHoldPaused
    ? `Good Form (boundary grace, hold paused) — Optional refinement (${label}): `
    : `Good Form — hold steady! Optional refinement (${label}): `;
  return `${prefix}${cleanCore}`;
}
