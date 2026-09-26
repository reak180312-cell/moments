/**
 * Colour identity for triggers and responses.
 *
 * Two rules this file keeps:
 *   1. A colour belongs to a thing, not to its position in a list. Filtering
 *      the list never repaints what survives.
 *   2. Colour is never the only channel - every chip, bar and tile that uses
 *      one also carries its name. Three of these hues sit below 3:1 against a
 *      light surface, so the visible label is not optional.
 *
 * Red is deliberately absent. Nothing a child does is an error state.
 */

/** Slot 0 is neutral; 1-5 and 7 are the trigger hues; 6 is reserved for
 *  "what helped", so a response never looks like another trigger. */
export type ColourSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const TRIGGER_HUES: ColourSlot[] = [1, 2, 3, 4, 5, 7];

/** The defaults are laid out by hand so the ones a family uses most differ. */
const KNOWN: Record<string, ColourSlot> = {
  homework: 1,
  school: 7,
  hunger: 4,
  tired: 3,
  noise: 2,
  'change of plans': 5,
  'screen time ending': 2,
  argument: 5,
  frustration: 4,
  waiting: 7,
  'social situation': 1,
  overwhelmed: 3,
  unknown: 0,
  other: 0,
};

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h);
}

export function triggerSlot(name: string): ColourSlot {
  const key = name.trim().toLowerCase();
  if (key in KNOWN) return KNOWN[key];
  return TRIGGER_HUES[hash(key) % TRIGGER_HUES.length];
}

/** Everything under "what helped" shares one hue, so the two lists read apart. */
export const HELPFUL_SLOT: ColourSlot = 6;

export function triggerClass(name: string): string {
  return `c-${triggerSlot(name)}`;
}

export const helpfulClass = `c-${HELPFUL_SLOT}`;

/** For chart marks, where a CSS class cannot reach. */
export const SLOT_VAR: Record<ColourSlot, string> = {
  0: 'var(--cat-0)',
  1: 'var(--cat-1)',
  2: 'var(--cat-2)',
  3: 'var(--cat-3)',
  4: 'var(--cat-4)',
  5: 'var(--cat-5)',
  6: 'var(--cat-6)',
  7: 'var(--cat-7)',
};

export function triggerColour(name: string): string {
  return SLOT_VAR[triggerSlot(name)];
}
