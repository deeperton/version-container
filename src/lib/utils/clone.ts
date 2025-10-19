/**
 * Utility helpers for producing deep clones in a deterministic fashion.
 */

/**
 * Creates a structured clone of the provided value.
 * Falls back to JSON serialization when `structuredClone` is unavailable.
 *
 * @param value - The value to clone.
 * @returns A deep copy that can be safely mutated without affecting the original.
 */
export const cloneValue = <Value>(value: Value): Value => {
  const cloner = (globalThis as { structuredClone?: <T>(input: T) => T }).structuredClone;
  if (typeof cloner === 'function') {
    return cloner(value);
  }

  return JSON.parse(JSON.stringify(value)) as Value;
};
