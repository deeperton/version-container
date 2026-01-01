import type {
  AdapterId,
  ComboId,
  MetadataRecord,
  PartId,
  PartVersionId,
} from './base.js';

/**
 * Filter criteria for finding parts.
 */
export interface PartFilter {
  readonly adapterId?: AdapterId;
  readonly tags?: readonly string[];
  readonly metadata?: MetadataRecord;
}

/**
 * Filter criteria for finding versions.
 */
export interface VersionFilter {
  readonly partId?: PartId;
  readonly label?: string;
  readonly metadata?: MetadataRecord;
}

/**
 * Filter criteria for finding combos.
 */
export interface ComboFilter {
  readonly partId?: PartId;
  readonly versionId?: PartVersionId;
  readonly metadata?: MetadataRecord;
}

/**
 * Lightweight summary of a part (no nested data).
 */
export interface PartSummary {
  readonly id: PartId;
  readonly name: string;
  readonly description?: string;
}

/**
 * Lightweight summary of a version (no nested data).
 */
export interface VersionSummary {
  readonly id: PartVersionId;
  readonly label?: string;
}

/**
 * Lightweight summary of a combo (no nested data).
 */
export interface ComboSummary {
  readonly id: ComboId;
  readonly name: string;
  readonly description?: string;
}
