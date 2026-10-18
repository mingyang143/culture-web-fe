import { CanonicalMudra } from 'types/mudra';

/**
 * NOTE ON PROVENANCE & CALIBRATION STATUS:
 * All `targetDegrees`, `toleranceDegrees`, and `weight` values in `CANONICAL_MUDRAS`
 * are empirically calibrated from MediaPipe 3D `worldLandmarks` distributions (exterior bend
 * convention: 0° = straight chain, 180° = folded back) across the `user1`–`user6` training split
 * of the IIIT-Kottayam Hasta Mudra Dataset (`kavitharaju/KathakaliMudraDataset`, CC BY-SA 4.0)
 * following the Kathakali *Hastalakshana Deepika* treatise, and verified on held-out unseen
 * performers (`user7`–`user8`).
 */
export const CANONICAL_MUDRAS: Record<string, CanonicalMudra> = {
  pataka: {
    id: 'pataka',
    name: 'Pataka',
    malayalamName: 'പതാക',
    type: 'Asamyuta',
    description:
      'The Flag gesture (Hastalakshana Deepika #1). The index, middle, and pinky fingers are extended straight while the ring finger is bent toward the palm and the thumb is held straight along the side.',
    symbolism: ['Flag', 'Sun', 'King', 'Elephant', 'Lion', 'Bull', 'Peace'],
    referenceImageUrl: '/samples/pataka_sample.jpg',
    targets: {
      thumb: {
        mcp: { targetDegrees: 18, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 16, toleranceDegrees: 18, weight: 1.2 },
      },
      index: {
        mcp: { targetDegrees: 22, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 9, toleranceDegrees: 15, weight: 1.4 },
      },
      middle: {
        mcp: { targetDegrees: 12, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 25, toleranceDegrees: 16, weight: 1.2 },
      },
      ring: {
        mcp: { targetDegrees: 33, toleranceDegrees: 22, weight: 1.5 },
        pip: { targetDegrees: 55, toleranceDegrees: 24, weight: 2.2 },
      },
      pinky: {
        mcp: { targetDegrees: 21, toleranceDegrees: 18, weight: 1.2 },
        pip: { targetDegrees: 23, toleranceDegrees: 18, weight: 1.2 },
      },
      spreadIndexMiddle: { targetDegrees: 6, toleranceDegrees: 10, weight: 1.2 },
      spreadMiddleRing: { targetDegrees: 29, toleranceDegrees: 18, weight: 1.4 },
      spreadRingPinky: { targetDegrees: 28, toleranceDegrees: 18, weight: 1.4 },
    },
    pedagogicalRules: [
      {
        jointKey: 'ring.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your ring finger inward toward the palm (Hastalakshana Deepika Pataka).',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Relax your ring finger slightly to a moderate bend (~55°).',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Straighten your index finger completely.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger extended straight alongside the index finger.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky finger extended straight.',
      },
      {
        jointKey: 'spreadIndexMiddle',
        condition: 'TOO_WIDE',
        directive: 'Keep your index and middle fingers closely joined together.',
      },
    ],
  },

  mudrakhya: {
    id: 'mudrakhya',
    name: 'Mudrakhya',
    malayalamName: 'മുദ്രാഖ്യം',
    type: 'Asamyuta',
    description:
      'The Signet-Ring gesture (Hastalakshana Deepika #2). The tip of the thumb joins the tip of the index finger to form a circle, while the middle, ring, and pinky fingers remain extended straight.',
    symbolism: ['Growth', 'Movement', 'Heaven', 'Sea', 'Remembering', 'Meditation'],
    referenceImageUrl: '/samples/mudrakhya_sample.jpg',
    requiredContacts: [
      {
        pair: 'thumbIndex',
        label: 'Thumb-Index Contact',
        maxDistance: 0.38,
        directive: 'Touch the tip of your thumb to the tip of your index finger to form a closed ring.',
      },
    ],
    targets: {
      thumb: {
        mcp: { targetDegrees: 21, toleranceDegrees: 18, weight: 1.0 },
        pip: { targetDegrees: 27, toleranceDegrees: 20, weight: 1.2 },
      },
      index: {
        mcp: { targetDegrees: 33, toleranceDegrees: 20, weight: 1.5 },
        pip: { targetDegrees: 52, toleranceDegrees: 22, weight: 2.0 },
      },
      middle: {
        mcp: { targetDegrees: 12, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 24, toleranceDegrees: 16, weight: 1.2 },
      },
      ring: {
        mcp: { targetDegrees: 15, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 18, toleranceDegrees: 16, weight: 1.4 },
      },
      pinky: {
        mcp: { targetDegrees: 26, toleranceDegrees: 20, weight: 1.0 },
        pip: { targetDegrees: 17, toleranceDegrees: 16, weight: 1.2 },
      },
      spreadIndexMiddle: { targetDegrees: 42, toleranceDegrees: 18, weight: 1.5 },
    },
    pedagogicalRules: [
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your index finger inward to meet the tip of your thumb.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Round your index finger into an open circle rather than folding it flat.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger upright and extended straight.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your ring finger straight upward.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your pinky finger straight.',
      },
    ],
  },

  tripataka: {
    id: 'tripataka',
    name: 'Tripataka',
    malayalamName: 'ത്രിപതാക',
    type: 'Asamyuta',
    description:
      'Three parts of the flag (Hastalakshana Deepika #17). All four fingers (index, middle, ring, and pinky) are held straight and closely joined together, while the thumb is bent inward toward the palm.',
    symbolism: ['Invocation', 'Descent (Avahana)', 'Valour', 'Tilaka', 'Drinking'],
    referenceImageUrl: '/samples/tripataka_sample.jpg',
    targets: {
      thumb: {
        mcp: { targetDegrees: 24, toleranceDegrees: 16, weight: 1.4 },
        pip: { targetDegrees: 35, toleranceDegrees: 18, weight: 1.8 },
      },
      index: {
        mcp: { targetDegrees: 25, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 8, toleranceDegrees: 14, weight: 1.4 },
      },
      middle: {
        mcp: { targetDegrees: 11, toleranceDegrees: 15, weight: 1.2 },
        pip: { targetDegrees: 21, toleranceDegrees: 15, weight: 1.2 },
      },
      ring: {
        mcp: { targetDegrees: 12, toleranceDegrees: 16, weight: 1.6 },
        pip: { targetDegrees: 16, toleranceDegrees: 14, weight: 2.2 },
      },
      pinky: {
        mcp: { targetDegrees: 19, toleranceDegrees: 16, weight: 1.2 },
        pip: { targetDegrees: 19, toleranceDegrees: 15, weight: 1.2 },
      },
      spreadIndexMiddle: { targetDegrees: 7, toleranceDegrees: 10, weight: 1.2 },
      spreadMiddleRing: { targetDegrees: 6, toleranceDegrees: 10, weight: 2.0 },
      spreadRingPinky: { targetDegrees: 8, toleranceDegrees: 12, weight: 1.5 },
    },
    pedagogicalRules: [
      {
        jointKey: 'thumb.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your thumb inward toward the base of your index finger.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Straighten your ring finger to align tightly with your middle and pinky fingers.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your index finger extended straight.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger extended straight.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky finger extended straight.',
      },
      {
        jointKey: 'spreadMiddleRing',
        condition: 'TOO_WIDE',
        directive: 'Press all four extended fingers closely together without gaps.',
      },
    ],
  },

  katakamukha: {
    id: 'katakamukha',
    name: 'Kataka (Katakamukha)',
    malayalamName: 'കടക / കടകാമുഖം',
    type: 'Asamyuta',
    description:
      'The Bracelet gesture (Hastalakshana Deepika #3 Kataka). The tip of the index finger touches the tip of the thumb to form a ring while the middle finger bends toward the thumb base, and the ring and pinky fingers extend straight out.',
    symbolism: ['Vishnu', 'Krishna', 'Balabhadra', 'Arrow', 'Gold', 'Silver', 'Female'],
    referenceImageUrl: '/samples/katakamukha_sample.jpg',
    requiredContacts: [
      {
        pair: 'thumbIndex',
        label: 'Thumb-Index Contact',
        maxDistance: 0.58,
        directive: 'Bring your thumb and index fingertips together to form the upper ring.',
      },
    ],
    targets: {
      thumb: {
        mcp: { targetDegrees: 26, toleranceDegrees: 22, weight: 1.2 },
        pip: { targetDegrees: 32, toleranceDegrees: 25, weight: 1.2 },
      },
      index: {
        mcp: { targetDegrees: 39, toleranceDegrees: 25, weight: 1.4 },
        pip: { targetDegrees: 31, toleranceDegrees: 24, weight: 1.4 },
      },
      middle: {
        mcp: { targetDegrees: 67, toleranceDegrees: 25, weight: 1.8 },
        pip: { targetDegrees: 73, toleranceDegrees: 24, weight: 2.0 },
      },
      ring: {
        mcp: { targetDegrees: 55, toleranceDegrees: 25, weight: 1.4 },
        pip: { targetDegrees: 23, toleranceDegrees: 24, weight: 1.5 },
      },
      pinky: {
        mcp: { targetDegrees: 23, toleranceDegrees: 25, weight: 1.4 },
        pip: { targetDegrees: 21, toleranceDegrees: 24, weight: 1.5 },
      },
      spreadRingPinky: { targetDegrees: 55, toleranceDegrees: 24, weight: 2.0 },
    },
    pedagogicalRules: [
      {
        jointKey: 'middle.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your middle finger inward toward the base of your thumb.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curve your index finger inward to meet the tip of your thumb.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Extend your ring finger straight outward.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky extended straight.',
      },
      {
        jointKey: 'spreadRingPinky',
        condition: 'TOO_NARROW',
        directive: 'Spread your extended ring and pinky fingers apart.',
      },
    ],
  },

  musti: {
    id: 'musti',
    name: 'Musti',
    malayalamName: 'മുഷ്ടി',
    type: 'Asamyuta',
    description:
      'The Fist gesture (Hastalakshana Deepika #4 Mushti). All four fingers are curled tightly into the palm, with the thumb resting firmly over the bent fingers.',
    symbolism: ['Charioteer', 'Loveliness', 'Blessing', 'Steadiness', 'Grasping weapons', 'Strength'],
    referenceImageUrl: '/samples/musti_sample.jpg',
    targets: {
      thumb: {
        mcp: { targetDegrees: 32, toleranceDegrees: 24, weight: 1.2 },
        pip: { targetDegrees: 50, toleranceDegrees: 24, weight: 1.3 },
      },
      index: {
        mcp: { targetDegrees: 62, toleranceDegrees: 24, weight: 1.4 },
        pip: { targetDegrees: 90, toleranceDegrees: 22, weight: 1.8 },
      },
      middle: {
        mcp: { targetDegrees: 62, toleranceDegrees: 22, weight: 1.4 },
        pip: { targetDegrees: 92, toleranceDegrees: 22, weight: 2.0 },
      },
      ring: {
        mcp: { targetDegrees: 73, toleranceDegrees: 24, weight: 1.4 },
        pip: { targetDegrees: 88, toleranceDegrees: 24, weight: 1.8 },
      },
      pinky: {
        mcp: { targetDegrees: 62, toleranceDegrees: 28, weight: 1.2 },
        pip: { targetDegrees: 72, toleranceDegrees: 24, weight: 1.4 },
      },
    },
    pedagogicalRules: [
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your index finger tightly into your palm.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your middle finger into your palm.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your ring finger tightly into your palm.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Curl your pinky tightly into your palm.',
      },
      {
        jointKey: 'thumb.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Wrap your thumb firmly over your bent fingers.',
      },
    ],
  },
};

export const DEFAULT_MUDRA_ID = 'pataka';
