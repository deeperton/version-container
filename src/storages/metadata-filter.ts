import type { MetadataRecord } from '../models/base.js';
import { InvalidMetadataFilterError } from '../lib/errors.js';

/**
 * Validates that all values in a metadata filter are primitives (string, number, boolean).
 * Throws InvalidMetadataFilterError if any value is a non-primitive type.
 *
 * @param metadata - The metadata filter to validate
 * @throws {InvalidMetadataFilterError} When a value is not a primitive
 */
export function validateMetadataFilter(metadata: MetadataRecord): void {
  for (const [key, value] of Object.entries(metadata)) {
    const type = typeof value;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : type;
      throw new InvalidMetadataFilterError(key, actualType);
    }
  }
}

/**
 * Checks whether a project's metadata satisfies a metadata filter (subset match).
 * All filter entries must exist and match (strict equality) in the target metadata.
 *
 * @param projectMetadata - The project's metadata (may be undefined)
 * @param filter - The filter entries to check
 * @param treatMissingAsFalse - If true, treats missing project metadata as `false` when filter value is `false`
 * @returns true if all filter entries match
 */
export function matchesMetadataFilter(
  projectMetadata: MetadataRecord | undefined,
  filter: MetadataRecord,
  treatMissingAsFalse?: boolean
): boolean {
  return Object.entries(filter).every(([key, value]) => {
    const projectValue = projectMetadata?.[key];
    
    // Support treating missing fields as false
    if (treatMissingAsFalse && value === false && projectValue === undefined) {
      return true;
    }
    
    return projectValue === value;
  });
}
