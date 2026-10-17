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
  pip: number; // Middle joint exterior bend angle in degrees
  dip?: number; // Outer joint exterior bend angle in degrees
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

  // Palm orientation normal vector
  palmNormal: Landmark3D;
}

export interface RequiredFingertipContact {
  pair: 'thumbIndex' | 'thumbMiddle' | 'thumbRing' | 'thumbPinky';
  label: string;
  maxDistance: number; // e.g. 0.35 in palm normalized scale
  directive: string;
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

  // Target joint kinematics (currently heuristic prototypes pending world-landmark calibration)
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
  rawValue?: number;
  currentDegrees: number;
  targetDegrees: number;
  toleranceDegrees?: number;
  acceptedRange?: [number, number];
  deltaDegrees: number;
  weight?: number;
  weightedPenalty?: number;
  status: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT';
}

export interface MudraEvaluationResult {
  mudraId: string;
  mudraName: string;
  measurementStatus?: 'VALID' | 'MEASUREMENT_UNAVAILABLE';
  coordinateSource?: CoordinateSource;
  handedness?: HandednessType;
  matchScore: number; // 0 to 100
  isMastered: boolean;
  primaryDirective: string;
  secondaryDirective?: string;
  jointEvaluations: JointEvaluation[];
  totalWeight?: number;
  totalWeightedPenalty?: number;
}

export interface TemporalFeatureStats {
  sampleCount: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}
