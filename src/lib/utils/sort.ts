/**
 * Deterministically sorts entities by their string identifier.
 *
 * @param items - Collection to sort.
 * @returns A new sorted array.
 */
export const sortById = <Entity extends { id: string }>(items: readonly Entity[]): Entity[] =>
  [...items].sort((left, right) => left.id.localeCompare(right.id));
