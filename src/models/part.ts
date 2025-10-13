import type { AdapterId, MetadataRecord, PartId, PartVersionId } from './base.js';

/**
 * Descriptor pointing to the physical location of a version artifact.
 */
export interface VersionLocator {
  readonly uri: string;
  readonly revision?: string;
  readonly metadata?: MetadataRecord;
}

/**
 * Minimal reference to a specific part version within the project.
 */
export interface VersionBinding {
  readonly partId: PartId;
  readonly versionId: PartVersionId;
}

/**
 * Initialization data for creating a part.
 */
export interface PartInit {
  readonly id?: PartId;
  readonly name: string;
  readonly description?: string;
  readonly adapterId: AdapterId;
  readonly tags?: readonly string[];
  readonly metadata?: MetadataRecord;
  readonly versions?: readonly PartVersionInit[];
}

/**
 * Persistent definition of a part within the project.
 */
export interface PartDefinition extends Omit<PartInit, 'id' | 'versions'> {
  readonly id: PartId;
}

/**
 * Initialization data for a new part version.
 */
export interface PartVersionInit {
  readonly id?: PartVersionId;
  readonly label?: string;
  readonly locator: VersionLocator;
  readonly metadata?: MetadataRecord;
}

/**
 * Persistent description of a part version.
 */
export interface PartVersion extends Omit<PartVersionInit, 'id'> {
  readonly id: PartVersionId;
  readonly partId: PartId;
}

/**
 * Resolved representation of a part version after adapter lookup.
 */
export interface ResolvedPartVersion
  extends VersionBinding,
    Pick<PartVersion, 'label' | 'locator' | 'metadata'> {
  readonly checksum?: string;
  readonly artifact?: unknown;
}
