import { CanonicalMudra } from '../types/mudra';

/**
 * Canonical 3D Kinematic Definitions for Kathakali Mudras (Hastalakshana Deepika tradition)
 *
 * Angle Convention (matches extractHandKinematics / calculateJointAngle):
 * - 0°   = Fully extended / straight joint (incoming and outgoing bone vectors collinear)
 * - 90°  = Right-angle flexion
 * - 180° = Fully folded back
 *
 * Provenance Note (2026-04-20 Calibration):
 * - Calibrated against MediaPipe HandLandmarker (float16) 3D `worldLandmarks` on the
 *   KathakaliMudraDataset (Pose2Gest, Hastalakshana Deepika 24 base mudras) and verified
 *   against the authoritative 24 Kathakali Mudras reference chart:
 *     1. Pathaka      (Dataset: 1.pataka)      — Ring finger bent forward; index, middle, pinky straight; thumb extended alongside palm
 *     2. Mudrakhyam   (Dataset: 2.mudrakhya)   — Thumb and index tips pinched together in a loop; middle, ring, pinky extended straight
 *     3. Katakam      (Dataset: 3.kataka)      — Index finger bent so its tip touches the upright thumb tip; middle finger folded completely down onto the center of the palm; ring and pinky fingers extended straight up (distinct from #24 Kadakamukham)
 *     4. Mushti       (Dataset: 4.mushti)      — All four fingers curled tightly into a fist with thumb resting across them
 *    17. Thripathaka  (Dataset: 17.tripataka)  — All four fingers extended straight and held together; thumb bent inward at its interphalangeal joint
 *
 * Measured worldLandmarks on public/samples/*_sample.jpg (MediaPipe float16):
 *   pataka_sample.jpg      -> thumb(19,14) index(18,16) middle(15,17) ring(38,53) pinky(26,18) spreadIM=8
 *   mudrakhya_sample.jpg   -> thumb(21,15) index(55,61) middle(19,20) ring(22,19) pinky(23,16) tipThumbIndex=0.31
 *   katakamukha_sample.jpg -> thumb(29,21) index(43,66) middle(67,67) ring(55,21) pinky(23,14) tipThumbIndex=0.41
 *   musti_sample.jpg       -> thumb(36,41) index(81,81) middle(80,91) ring(74,90) pinky(77,85) closure(0.51..0.64)
 *   tripataka_sample.jpg   -> thumb(28,39) index(10,16) middle(7,16) ring(8,19) pinky(11,16) spread(7,7,11)
 */
export const CANONICAL_MUDRAS: Record<string, CanonicalMudra> = {
  pathaka: {
    id: 'pathaka',
    name: 'Pathaka',
    malayalamName: 'പതാക',
    type: 'Asamyuta',
    description:
      'In Kathakali (Hastalakshana Deepika #1), Pathaka ("Flag") is formed by holding the index, middle, and pinky fingers straight while bending the ring finger forward toward the palm, with the thumb extended alongside the palm.',
    symbolism: [
      'Flag / Victory',
      'King / Crown',
      'Elephant',
      'Lion',
      'Bull',
      'Clouds',
      'Peace',
      'Daylight',
    ],
    referenceImageUrl: '/samples/pataka_sample.jpg',
    targets: {
      thumb: {
        mcp: { targetDegrees: 20, toleranceDegrees: 18, weight: 1.0 },
        pip: { targetDegrees: 16, toleranceDegrees: 18, weight: 1.0 },
      },
      index: {
        mcp: { targetDegrees: 18, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 16, toleranceDegrees: 18, weight: 1.5 },
      },
      middle: {
        mcp: { targetDegrees: 16, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 17, toleranceDegrees: 18, weight: 1.5 },
      },
      ring: {
        mcp: { targetDegrees: 42, toleranceDegrees: 24, weight: 1.8 },
        pip: { targetDegrees: 58, toleranceDegrees: 28, weight: 2.2 },
      },
      pinky: {
        mcp: { targetDegrees: 24, toleranceDegrees: 20, weight: 1.2 },
        pip: { targetDegrees: 18, toleranceDegrees: 18, weight: 1.5 },
      },
      spreadIndexMiddle: { targetDegrees: 10, toleranceDegrees: 15, weight: 0.8 },
    },
    pedagogicalRules: [
      {
        jointKey: 'ring.pip',
        condition: 'TOO_STRAIGHT',
        directive:
          'In Kathakali Pathaka (#1), bend your ring finger forward at the middle joint while keeping the other fingers straight.',
      },
      {
        jointKey: 'ring.mcp',
        condition: 'TOO_STRAIGHT',
        directive: 'Flex your ring finger forward from the knuckle toward your palm.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Straighten your index finger completely.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your middle finger straight upward.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky finger extended straight while the ring finger bends.',
      },
      {
        jointKey: 'spreadIndexMiddle',
        condition: 'TOO_WIDE',
        directive: 'Bring your straight index and middle fingers closer together.',
      },
    ],
  },

  mudrakhyam: {
    id: 'mudrakhyam',
    name: 'Mudrakhyam',
    malayalamName: 'മുദ്രാഖ്യം',
    type: 'Asamyuta',
    description:
      'In Kathakali (Hastalakshana Deepika #2), Mudrakhyam is formed by bringing the tips of the thumb and index finger together into a neat loop while extending the middle, ring, and pinky fingers straight upward.',
    symbolism: [
      'Increase / Growth',
      'Contemplation / Mind',
      'Sacred Thread',
      'Perfection',
      'Questioning',
    ],
    referenceImageUrl: '/samples/mudrakhya_sample.jpg',
    requiredContacts: [
      {
        pair: 'thumbIndex',
        label: 'Thumb & Index Fingertips',
        maxDistance: 0.45,
        directive:
          'Touch the tip of your index finger directly to the tip of your thumb to form a closed ring.',
      },
    ],
    targets: {
      thumb: {
        mcp: { targetDegrees: 22, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 18, toleranceDegrees: 18, weight: 1.2 },
      },
      index: {
        mcp: { targetDegrees: 55, toleranceDegrees: 24, weight: 1.5 },
        pip: { targetDegrees: 62, toleranceDegrees: 26, weight: 2.0 },
      },
      middle: {
        mcp: { targetDegrees: 18, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 20, toleranceDegrees: 18, weight: 1.5 },
      },
      ring: {
        mcp: { targetDegrees: 22, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 20, toleranceDegrees: 18, weight: 1.5 },
      },
      pinky: {
        mcp: { targetDegrees: 22, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 18, toleranceDegrees: 18, weight: 1.5 },
      },
    },
    pedagogicalRules: [
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your index finger down so its tip meets the tip of your thumb.',
      },
      {
        jointKey: 'index.mcp',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your index knuckle forward to form the circular pinch with your thumb.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger extended straight while pinching thumb and index.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your ring finger straight upward.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your pinky finger straight upward.',
      },
    ],
  },

  katakam: {
    id: 'katakam',
    name: 'Katakam',
    malayalamName: 'കടകം',
    type: 'Asamyuta',
    description:
      'In Kathakali (Hastalakshana Deepika #3), Katakam ("Bracelet / Link") is formed by bending the index finger so its tip touches the tip of the upright thumb, folding the middle finger completely down onto the center of the palm, and extending the ring and pinky fingers straight upward. (Distinct from #24 Kadakamukham.)',
    symbolism: [
      'Goddess Lakshmi',
      'Golden Bangle / Bracelet',
      'Canopy',
      'Plucking Flowers',
      'Holding a Necklace',
      'Valour',
    ],
    referenceImageUrl: '/samples/katakamukha_sample.jpg',
    requiredContacts: [
      {
        pair: 'thumbIndex',
        label: 'Thumb & Index Fingertips',
        maxDistance: 0.55,
        directive:
          'Touch the tip of your bent index finger to the tip of your upright thumb for Katakam.',
      },
    ],
    targets: {
      thumb: {
        mcp: { targetDegrees: 28, toleranceDegrees: 20, weight: 1.0 },
        pip: { targetDegrees: 22, toleranceDegrees: 20, weight: 1.0 },
      },
      index: {
        mcp: { targetDegrees: 45, toleranceDegrees: 25, weight: 1.2 },
        pip: { targetDegrees: 65, toleranceDegrees: 25, weight: 1.8 },
      },
      middle: {
        mcp: { targetDegrees: 68, toleranceDegrees: 26, weight: 1.8 },
        pip: { targetDegrees: 78, toleranceDegrees: 30, weight: 2.0 },
      },
      ring: {
        mcp: { targetDegrees: 32, toleranceDegrees: 26, weight: 0.8 },
        pip: { targetDegrees: 18, toleranceDegrees: 20, weight: 1.5 },
      },
      pinky: {
        mcp: { targetDegrees: 20, toleranceDegrees: 22, weight: 1.2 },
        pip: { targetDegrees: 16, toleranceDegrees: 20, weight: 1.5 },
      },
    },
    pedagogicalRules: [
      {
        jointKey: 'middle.pip',
        condition: 'TOO_STRAIGHT',
        directive:
          'Fold your middle finger completely down onto the center of your palm while keeping your ring and pinky fingers upright.',
      },
      {
        jointKey: 'middle.mcp',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your middle finger knuckle down toward the center of your palm.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your index finger forward so its tip touches the tip of your thumb.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your ring finger straight upward alongside your pinky finger.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky finger extended straight upward.',
      },
    ],
  },

  mushti: {
    id: 'mushti',
    name: 'Mushti',
    malayalamName: 'മുഷ്ടി',
    type: 'Asamyuta',
    description:
      'In Kathakali (Hastalakshana Deepika #4), Mushti ("Fist") is formed by curling all four fingers (index, middle, ring, and pinky) tightly into the palm and resting the thumb firmly across the curled fingers.',
    symbolism: [
      'Strength / Steadfastness',
      'Grasping Weapons',
      'Wrestling / Combat',
      'Courage',
      'Charioteer',
      'Blessing',
    ],
    referenceImageUrl: '/samples/musti_sample.jpg',
    targets: {
      thumb: {
        mcp: { targetDegrees: 35, toleranceDegrees: 25, weight: 1.0 },
        pip: { targetDegrees: 42, toleranceDegrees: 28, weight: 1.2 },
      },
      index: {
        mcp: { targetDegrees: 78, toleranceDegrees: 26, weight: 1.5 },
        pip: { targetDegrees: 95, toleranceDegrees: 35, weight: 2.0 },
      },
      middle: {
        mcp: { targetDegrees: 78, toleranceDegrees: 26, weight: 1.5 },
        pip: { targetDegrees: 95, toleranceDegrees: 35, weight: 2.0 },
      },
      ring: {
        mcp: { targetDegrees: 75, toleranceDegrees: 26, weight: 1.5 },
        pip: { targetDegrees: 95, toleranceDegrees: 35, weight: 2.0 },
      },
      pinky: {
        mcp: { targetDegrees: 75, toleranceDegrees: 26, weight: 1.5 },
        pip: { targetDegrees: 92, toleranceDegrees: 35, weight: 2.0 },
      },
    },
    pedagogicalRules: [
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your index finger tightly into your palm to form a closed fist.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Fold your middle finger firmly into your palm.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Tuck your ring finger completely into the fist.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your pinky finger tightly into your palm.',
      },
      {
        jointKey: 'thumb.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Fold your thumb across your curled fingers to lock the Mushti fist.',
      },
    ],
  },

  thripathaka: {
    id: 'thripathaka',
    name: 'Thripathaka',
    malayalamName: 'ത്രിപതാക',
    type: 'Asamyuta',
    description:
      'In Kathakali (Hastalakshana Deepika #17), Thripathaka ("Three Parts of a Flag") is formed by holding all four fingers (index, middle, ring, and pinky) straight and closely together while bending the thumb inward at its joint alongside the palm.',
    symbolism: [
      'Invocation / Crown',
      'Tree',
      'Vajra (Thunderbolt)',
      'Lord Indra',
      'Lamp / Flames',
      'Sacred Tilak Mark',
    ],
    referenceImageUrl: '/samples/tripataka_sample.jpg',
    targets: {
      thumb: {
        mcp: { targetDegrees: 26, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 38, toleranceDegrees: 20, weight: 1.8 },
      },
      index: {
        mcp: { targetDegrees: 12, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 16, toleranceDegrees: 16, weight: 1.5 },
      },
      middle: {
        mcp: { targetDegrees: 10, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 16, toleranceDegrees: 16, weight: 1.5 },
      },
      ring: {
        mcp: { targetDegrees: 12, toleranceDegrees: 16, weight: 1.5 },
        pip: { targetDegrees: 18, toleranceDegrees: 16, weight: 2.0 },
      },
      pinky: {
        mcp: { targetDegrees: 12, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 16, toleranceDegrees: 16, weight: 1.5 },
      },
      spreadIndexMiddle: { targetDegrees: 8, toleranceDegrees: 12, weight: 0.8 },
      spreadMiddleRing: { targetDegrees: 8, toleranceDegrees: 12, weight: 0.8 },
      spreadRingPinky: { targetDegrees: 10, toleranceDegrees: 12, weight: 0.8 },
    },
    pedagogicalRules: [
      {
        jointKey: 'thumb.pip',
        condition: 'TOO_STRAIGHT',
        directive:
          'In Kathakali Thripathaka (#17), bend your thumb inward at the joint while keeping all four fingers straight.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive:
          'Keep your ring finger completely straight for Kathakali Thripathaka (bending the ring finger forms Pathaka #1).',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your index finger completely straight.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger completely straight.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your pinky finger straight alongside your ring finger.',
      },
      {
        jointKey: 'spreadIndexMiddle',
        condition: 'TOO_WIDE',
        directive: 'Hold your four extended fingers closely together.',
      },
    ],
  },
};

export const DEFAULT_MUDRA_ID = 'pathaka';

/**
 * Legacy route / dataset slug aliases mapped to the canonical reference chart IDs.
 */
const MUDRA_ID_ALIASES: Record<string, string> = {
  pataka: 'pathaka',
  mudrakhya: 'mudrakhyam',
  kataka: 'katakam',
  katakamukha: 'katakam',
  musti: 'mushti',
  tripataka: 'thripathaka',
};

export function resolveCanonicalMudraId(rawId?: string): string {
  if (!rawId) return DEFAULT_MUDRA_ID;
  const normalized = rawId.trim().toLowerCase();
  if (CANONICAL_MUDRAS[normalized]) {
    return normalized;
  }
  const aliased = MUDRA_ID_ALIASES[normalized];
  if (aliased && CANONICAL_MUDRAS[aliased]) {
    return aliased;
  }
  return DEFAULT_MUDRA_ID;
}
