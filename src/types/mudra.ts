export interface Landmark3D {
  x: number;
  y: number;
  z: number;
}

export type HandednessType = 'Left' | 'Right' | 'Unknown';

export type CoordinateSource = 'worldLandmarks' | 'unavailable';

export interface HandLandmarkResult {
  landmarks: Landmark3D[]; // 21 normalized image landmarks (overlay only)
  worldLandmarks?: Landmark3D[]; // 21 metric 3D world landmarks (geometric assessment)
  handedness: HandednessType;
  score: number;
}

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface FingerJointAngles {
  mcp: number; // Knuckle / base joint exterior bend angle in degrees (0 = straight, >90 = bent)
  pip: number; // Middle joint (or thumb IP joint) exterior bend angle in degrees
  dip?: number; // Outer joint exterior bend angle in degrees
}

export interface ThumbPalmPlacement {
  /** Signed radial offset of THUMB_TIP (4) outside INDEX_MCP (5) along the palm lateral axis (palmScale = 1.0). Positive = abducted outward past index radial border; Negative = tucked/crossed inward across the palm. */
  radialGapFromIndexMcp: number;
  /** Signed radial offset of THUMB_IP (3) outside INDEX_MCP (5) along the palm lateral axis (palmScale = 1.0). */
  ipRadialGapFromIndexMcp: number;
  /** Normalized 3D Euclidean distance from THUMB_TIP (4) to INDEX_MCP (5) (palmScale = 1.0). */
  tipToIndexMcp: number;
  /** Normalized 3D Euclidean distance from THUMB_TIP (4) to MIDDLE_MCP (9) (palmScale = 1.0). */
  tipToMiddleMcp: number;
  /** Projection of THUMB_TIP (4) along the palm longitudinal axis (WRIST 0 -> MIDDLE_MCP 9, palmScale = 1.0). */
  longitudinal: number;
  /** Signed projection of THUMB_TIP (4) along the palm radial->ulnar lateral axis (palmScale = 1.0). */
  lateral: number;
  /** Signed projection of THUMB_TIP (4) along the palm normal axis (palmScale = 1.0). */
  palmar: number;
}

export interface HandKinematics {
  coordinateSource: 'worldLandmarks';
  handedness: HandednessType;
  palmScaleMeters: number; // Euclidean distance(0, 9) in world meters
  palmWidthMeters: number; // Euclidean distance(5, 17) in world meters
  // Flexion exterior bend angles (0 = straight, 180 = fully folded back)
  thumb: FingerJointAngles;
  index: FingerJointAngles;
  middle: FingerJointAngles;
  ring: FingerJointAngles;
  pinky: FingerJointAngles;

  // Inter-finger spreads / abduction (in degrees)
  spreadThumbIndex: number;
  spreadIndexMiddle: number;
  spreadMiddleRing: number;
  spreadRingPinky: number;

  // Normalized Euclidean distance between fingertips relative to palm scale (wrist 0 to middle MCP 9 = 1.0)
  tipDistances: {
    thumbIndex: number;
    thumbMiddle: number;
    thumbRing: number;
    thumbPinky: number;
  };

  // Normalized tip-to-own-MCP closure distances relative to palm scale (0->9 = 1.0)
  fingerClosure: {
    index: number; // distance(8, 5) / palmScale
    middle: number; // distance(12, 9) / palmScale
    ring: number; // distance(16, 13) / palmScale
    pinky: number; // distance(20, 17) / palmScale
  };

  // Reusable palm-local thumb placement telemetry (distinguishes inward palmar placement vs outward radial abduction)
  thumbPlacement?: ThumbPalmPlacement;

  // Palm orientation normal vector
  palmNormal: Landmark3D;
}

export interface RequiredFingertipContact {
  pair: 'thumbIndex' | 'thumbMiddle' | 'thumbRing' | 'thumbPinky';
  label: string;
  maxDistance: number; // e.g. 0.35 in palm normalized scale
  directive?: string;
}

export type ThumbPlacementFeatureKey = keyof ThumbPalmPlacement;

/**
 * Reusable gesture-specific palm-relative thumb placement reference requirement.
 * Expressed in palm-scale units (WRIST 0 -> MIDDLE_MCP 9 = 1.0) in the orthonormal
 * palm coordinate frame so requirements remain invariant to camera distance, 2D rotation,
 * and left/right handedness.
 *
 * NOTE: Keep inactive / unattached on canonical mudras until the intended physical
 * form is verified with an authoritative reference or professor.
 */
export interface ThumbPlacementReferenceRequirement {
  feature: ThumbPlacementFeatureKey;
  label: string;
  targetPalmRatio: number;
  tolerancePalmRatio: number;
  /** Optional hard upper bound in palm-scale units (e.g. radialGapFromIndexMcp <= 0.12 for inward thumb). */
  maxAllowedPalmRatio?: number;
  /** Optional hard lower bound in palm-scale units (e.g. radialGapFromIndexMcp >= 0.14 for abducted thumb). */
  minAllowedPalmRatio?: number;
  weight: number;
  /** If true, acts as a mandatory pass gate (normalizedError <= 1.0 required for mastery). */
  isMandatoryGate?: boolean;
  directive?: string;
}

export interface JointTolerance {
  targetDegrees: number;
  toleranceDegrees: number; // Allowed variation (e.g. ±15° or ±25°)
  weight: number; // Salience weight in score calculation
}

export interface CanonicalMudra {
  id: string;
  name: string;
  malayalamName: string;
  type: 'Asamyuta' | 'Samyuta'; // Single hand vs Double hand
  description: string;
  symbolism: string[];
  referenceImageUrl: string;

  // Physical fingertip contact constraints (e.g. thumb and index touching for Mudrakhya)
  requiredContacts?: RequiredFingertipContact[];

  // Optional gesture-specific palm-relative thumb placement requirements (pending professor verification)
  thumbPlacementRequirements?: ThumbPlacementReferenceRequirement[];

  // Target joint kinematics
  targets: {
    thumb: {
      mcp: JointTolerance;
      pip: JointTolerance;
    };
    index: {
      mcp: JointTolerance;
      pip: JointTolerance;
    };
    middle: {
      mcp: JointTolerance;
      pip: JointTolerance;
    };
    ring: {
      mcp: JointTolerance;
      pip: JointTolerance;
    };
    pinky: {
      mcp: JointTolerance;
      pip: JointTolerance;
    };
    spreadIndexMiddle?: JointTolerance;
    spreadMiddleRing?: JointTolerance;
    spreadRingPinky?: JointTolerance;
  };

  // Human-readable guidance rules
  pedagogicalRules: {
    jointKey: string;
    condition: 'TOO_BENT' | 'TOO_STRAIGHT' | 'TOO_WIDE' | 'TOO_NARROW';
    directive: string;
  }[];
}

export interface JointEvaluation {
  jointKey: string;
  label: string;
  triplet?: string;
  unit?: 'deg' | 'palmRatio';
  rawValue?: number;
  currentDegrees: number;
  targetDegrees: number;
  toleranceDegrees?: number;
  acceptedRange?: [number, number];
  deltaDegrees: number;
  normalizedError?: number; // Dimensionless ratio: absDelta/tol (deg) or actualDist/maxAllowed (palmRatio)
  weight?: number;
  weightedPenalty?: number;
  status: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT';
}

export type MudraPoseStatus =
  | 'MEASUREMENT_UNAVAILABLE'
  | 'ALL_CRITERIA_WITHIN_RANGE'
  | 'PASSING_WITH_PERMITTED_DEVIATIONS'
  | 'BOUNDARY_GRACE_PAUSED'
  | 'ACTIONABLE_ADJUSTMENT';

export interface MudraEvaluationResult {
  mudraId: string;
  mudraName: string;
  measurementStatus?: 'VALID' | 'MEASUREMENT_UNAVAILABLE';
  poseStatus?: MudraPoseStatus;
  coordinateSource?: CoordinateSource;
  handedness?: HandednessType;
  matchScore: number; // 0 to 100
  isMastered: boolean;
  isValidHoldFrame?: boolean; // True only when strictly inside entry pass criteria (no hysteresis grace)
  isFlawless?: boolean; // True only when isValidHoldFrame AND all evaluated joints are 'CORRECT'
  primaryDirective: string;
  secondaryDirective?: string;
  primaryJointKey?: string;
  secondaryJointKey?: string;
  jointEvaluations: JointEvaluation[];
  totalWeight?: number;
  totalWeightedPenalty?: number;
}

export interface CoachingAnchorState {
  mudraId: string;
  handedness?: HandednessType;
  anchorVector: number[];
  primaryDirective: string;
  secondaryDirective?: string;
  primaryJointKey?: string;
  secondaryJointKey?: string;
  primaryDirectionSign?: number; // Signed error direction (Math.sign(deltaDegrees)) to detect overshooting/reversal
  wasMastered: boolean;
  wasValidHoldFrame?: boolean;
  wasFlawless?: boolean;
  wasPoseStatus?: MudraPoseStatus;
  hysteresisElapsedMs?: number;
  lastFrameAtMs?: number;
  jointStatuses?: Record<string, JointEvaluation['status']>;
  updatedAtMs: number;
}

export interface HoldTimerState {
  holdElapsedMs: number;
  dropoutElapsedMs: number;
  totalGraceUsedMs?: number;
  hasValidAnchor?: boolean;
  handedness?: HandednessType;
  isHoldMastered: boolean;
}

export interface DiagnosticFrameSample {
  timestampMs: number;
  dtMs: number;
  rawMatchScore: number;
  stabilizedMatchScore: number;
  rawIsMastered: boolean;
  stabilizedIsMastered: boolean;
  isValidHoldFrame?: boolean;
  isFlawless: boolean;
  holdElapsedMs: number;
  dropoutElapsedMs: number;
  primaryJointKey?: string;
  ringPipRawDeg?: number;
  ringPipSmoothedDeg?: number;
  ringPipPenalty?: number;
  ringPipStatus?: JointEvaluation['status'];
}

export interface TemporalFeatureStats {
  sampleCount: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}
