import { CanonicalMudra } from 'types/mudra';

export const CANONICAL_MUDRAS: Record<string, CanonicalMudra> = {
  pataka: {
    id: 'pataka',
    name: 'Pataka',
    malayalamName: 'പതാക',
    type: 'Asamyuta',
    description: 'The Flag gesture. All four fingers are held straight and closely joined together, while the thumb is bent inward touching the base of the index finger.',
    symbolism: ['Flag', 'Sun', 'King', 'Elephant', 'Shield', 'Night'],
    referenceImageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=400&q=80',
    targets: {
      thumb: {
        mcp: { targetDegrees: 45, toleranceDegrees: 20, weight: 1.5 },
        pip: { targetDegrees: 30, toleranceDegrees: 20, weight: 1.0 },
      },
      index: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.2 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.2 },
      },
      middle: {
        mcp: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      ring: {
        mcp: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      pinky: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      spreadIndexMiddle: { targetDegrees: 6, toleranceDegrees: 10, weight: 1.2 },
      spreadMiddleRing: { targetDegrees: 6, toleranceDegrees: 10, weight: 1.0 },
      spreadRingPinky: { targetDegrees: 6, toleranceDegrees: 10, weight: 1.0 },
    },
    pedagogicalRules: [
      {
        jointKey: 'thumb.mcp',
        condition: 'TOO_STRAIGHT',
        directive: 'Tuck your thumb inward so it touches the base of your index finger.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Straighten your index finger completely.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger straight and aligned with the palm.',
      },
      {
        jointKey: 'ring.pip',
        condition: 'TOO_BENT',
        directive: 'Straighten your ring finger.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky finger extended straight.',
      },
      {
        jointKey: 'spreadIndexMiddle',
        condition: 'TOO_WIDE',
        directive: 'Press all four fingers tightly together without gaps.',
      },
    ],
  },

  mudrakhya: {
    id: 'mudrakhya',
    name: 'Mudrakhya',
    malayalamName: 'മുദ്രാഖ്യം',
    type: 'Asamyuta',
    description: 'The tip of the thumb joins the tip of the index finger to form a ring (circle). The middle, ring, and pinky fingers are kept extended straight.',
    symbolism: ['Growth', 'Movement', 'Desire', 'Remembering', 'Knowledge'],
    referenceImageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    targets: {
      thumb: {
        mcp: { targetDegrees: 40, toleranceDegrees: 20, weight: 1.3 },
        pip: { targetDegrees: 45, toleranceDegrees: 20, weight: 1.3 },
      },
      index: {
        mcp: { targetDegrees: 50, toleranceDegrees: 20, weight: 1.5 },
        pip: { targetDegrees: 65, toleranceDegrees: 20, weight: 1.5 },
      },
      middle: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      ring: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      pinky: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
    },
    pedagogicalRules: [
      {
        jointKey: 'index.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your index finger to meet the tip of your thumb.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger upright and straight.',
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
    description: 'Three parts of the flag. The ring finger is bent downward toward the palm, while index, middle, and pinky remain straight, and the thumb is bent.',
    symbolism: ['Crown', 'Tree', 'Vajra (Thunderbolt)', 'Arrow', 'Lighting'],
    referenceImageUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=400&q=80',
    targets: {
      thumb: {
        mcp: { targetDegrees: 45, toleranceDegrees: 20, weight: 1.2 },
        pip: { targetDegrees: 30, toleranceDegrees: 20, weight: 1.0 },
      },
      index: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      middle: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.0 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.0 },
      },
      ring: {
        mcp: { targetDegrees: 70, toleranceDegrees: 25, weight: 1.8 },
        pip: { targetDegrees: 80, toleranceDegrees: 25, weight: 1.8 },
      },
      pinky: {
        mcp: { targetDegrees: 10, toleranceDegrees: 15, weight: 1.2 },
        pip: { targetDegrees: 8, toleranceDegrees: 15, weight: 1.2 },
      },
    },
    pedagogicalRules: [
      {
        jointKey: 'ring.pip',
        condition: 'TOO_STRAIGHT',
        directive: 'Bend your ring finger downward toward your palm.',
      },
      {
        jointKey: 'index.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your index finger straight.',
      },
      {
        jointKey: 'middle.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your middle finger straight.',
      },
      {
        jointKey: 'pinky.pip',
        condition: 'TOO_BENT',
        directive: 'Keep your pinky finger extended straight.',
      },
    ],
  },
};

export const DEFAULT_MUDRA_ID = 'pataka';
