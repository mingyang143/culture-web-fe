export interface Landmark3D {
  x: number;
  y: number;
  z: number;
}

export interface HandLandmarkResult {
  landmarks: Landmark3D[]; // 21 landmarks
  handedness: 'Left' | 'Right';
  score: number;
}

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export interface FingerJointAngles {
  mcp: number; // Knuckle / base joint angle in degrees (0 = fully extended/straight, >90 = bent)
  pip: number; // Middle joint angle in degrees
  dip?: number; // Outer joint angle in degrees
}

export interface HandKinematics {
  handedness: 'Left' | 'Right';
  // Flexion angles (0 = straight, 180 = fully curled)
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

  // Normalized Euclidean distance between fingertips relative to palm scale (wrist to middle MCP = 1.0)
  tipDistances: {
    thumbIndex: number;
    thumbMiddle: number;
    thumbRing: number;
    thumbPinky: number;
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
  toleranceDegrees: number; // Allowed variation (e.g. ±15°)
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
  currentDegrees: number;
  targetDegrees: number;
  deltaDegrees: number;
  status: 'CORRECT' | 'MINOR_DEVIATION' | 'INCORRECT';
}

export interface MudraEvaluationResult {
  mudraId: string;
  mudraName: string;
  matchScore: number; // 0 to 100
  isMastered: boolean;
  primaryDirective: string;
  secondaryDirective?: string;
  jointEvaluations: JointEvaluation[];
}
