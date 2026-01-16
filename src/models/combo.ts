import type { ComboId, ISO8601Timestamp, LockfileDigest, MetadataRecord } from './base.js';
import type { ResolvedPartVersion, VersionBinding } from './part.js';

/**
 * Initializer for a version combo definition.
 */
export interface VersionComboInit {
  readonly id?: ComboId;
  readonly name: string;
  readonly description?: string;
  readonly bindings: readonly VersionBinding[];
  readonly metadata?: MetadataRecord;
}

/**
 * Persistent definition of a combo.
 */
export interface VersionCombo extends Omit<VersionComboInit, 'id'> {
  readonly id: ComboId;
  readonly createdAt: ISO8601Timestamp;
  readonly updatedAt: ISO8601Timestamp;
}

/**
 * Output of resolving a combo via the project API.
 */
export interface ResolvedCombo {
  readonly combo: VersionCombo;
  readonly parts: readonly ResolvedPartVersion[];
}

/**
 * Deterministic lock representation for a combo.
 */
export interface Lockfile {
  readonly comboId: ComboId;
  readonly digest: LockfileDigest;
  readonly createdAt: ISO8601Timestamp;
  readonly bindings: readonly VersionBinding[];
  readonly metadata?: MetadataRecord;
}
