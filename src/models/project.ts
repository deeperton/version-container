import type { ISO8601Timestamp, MetadataRecord, OwnerInfo, ProjectId } from './base.js';
import type { PartDefinition, PartInit, PartVersion } from './part.js';
import type { Lockfile, VersionCombo, VersionComboInit } from './combo.js';

/**
 * Metadata key for custom parts order.
 * Value type: PartId[]
 */
export const METADATA_PARTS_ORDER = 'partsOrder' as const;

/**
 * Parameters for creating a new project instance.
 */
export interface ProjectInit {
  readonly id?: ProjectId;
  readonly name: string;
  readonly description?: string;
  readonly metadata?: MetadataRecord;
  readonly owner?: OwnerInfo;
  readonly parts?: readonly PartInit[];
  readonly combos?: readonly VersionComboInit[];
}

/**
 * Snapshot of project-level metadata.
 */
export interface ProjectMetadata extends Omit<ProjectInit, 'id' | 'parts' | 'combos'> {
  readonly id: ProjectId;
  readonly owner?: OwnerInfo;
  readonly createdAt: ISO8601Timestamp;
  readonly updatedAt: ISO8601Timestamp;
}

/**
 * Serializable snapshot representing the full project state.
 */
export interface ProjectData {
  readonly project: ProjectMetadata;
  readonly parts: readonly PartDefinition[];
  readonly versions: readonly PartVersion[];
  readonly combos: readonly VersionCombo[];
  readonly locks?: readonly Lockfile[];
}

/**
 * Variant of ProjectData used for storage providers.
 */
export interface ProjectSnapshot extends ProjectData {
  readonly schemaVersion: number;
}

/**
 * Public summary for listing projects from storage.
 */
export interface ProjectSummary {
  readonly id: ProjectId;
  readonly name: string;
  readonly description?: string;
  readonly owner?: OwnerInfo;
  readonly updatedAt: ISO8601Timestamp;
}
