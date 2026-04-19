import type {
  ISO8601Timestamp,
  MetadataRecord,
  OwnerInfo,
  ProjectId,
  UserId,
  UserGroupId,
} from './base.js';
import type { PartDefinition, PartInit, PartVersion } from './part.js';
import type { TagDefinition, TagInit } from './tag.js';
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
  readonly owner: OwnerInfo;
  readonly updatedBy: OwnerInfo;
  readonly parts?: readonly PartInit[];
  readonly combos?: readonly VersionComboInit[];
  readonly tags?: readonly TagInit[];
}

/**
 * Snapshot of project-level metadata.
 */
export interface ProjectMetadata extends Omit<ProjectInit, 'id' | 'parts' | 'combos' | 'tags'> {
  readonly id: ProjectId;
  readonly owner: OwnerInfo;
  readonly updatedBy: OwnerInfo;
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
  readonly tags: readonly TagDefinition[];
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
  readonly owner: OwnerInfo;
  readonly updatedBy: OwnerInfo;
  readonly updatedAt: ISO8601Timestamp;
  readonly comboLatestUpdateAt?: ISO8601Timestamp;
  readonly comboLatestUpdateBy?: OwnerInfo;
  readonly comboLatestName?: string;
}

/**
 * Query options for listing projects with filtering and pagination.
 */
export interface ProjectsQuery {
  /**
   * Maximum number of results per page.
   * @default 50
   */
  readonly limit?: number;
  /**
   * Page number (1-indexed).
   * @default 1
   */
  readonly page?: number;
  /**
   * Filter by owner user ID.
   */
  readonly ownerUserId?: UserId;
  /**
   * Filter by owner group ID.
   */
  readonly ownerGroupId?: UserGroupId;
  /**
   * Case-insensitive substring search in project name.
   */
  readonly namePattern?: string;
  /**
   * Filter by creation date (inclusive lower bound).
   */
  readonly createdAfter?: ISO8601Timestamp;
  /**
   * Filter by creation date (inclusive upper bound).
   */
  readonly createdBefore?: ISO8601Timestamp;
  /**
   * Filter by update date (inclusive lower bound).
   */
  readonly updatedAfter?: ISO8601Timestamp;
  /**
   * Filter by update date (inclusive upper bound).
   */
  readonly updatedBefore?: ISO8601Timestamp;
  /**
   * When true, bypasses ownership filtering to list all projects.
   * This is a privileged operation that should only be used in special cases (e.g., admin dashboards).
   * @default false
   */
  readonly includeAll?: boolean;
}

/**
 * Enriched project summary for listing with statistics.
 */
export interface ProjectListSummary {
  readonly id: ProjectId;
  readonly name: string;
  readonly description?: string;
  readonly owner: OwnerInfo;
  readonly updatedBy: OwnerInfo;
  readonly createdAt: ISO8601Timestamp;
  readonly updatedAt: ISO8601Timestamp;
  readonly partsCount: number;
  readonly combosCount: number;
  readonly comboLatestUpdateAt?: ISO8601Timestamp;
  readonly comboLatestUpdateBy?: OwnerInfo;
  readonly comboLatestName?: string;
}

/**
 * Pagination information for project list results.
 */
export type ProjectListPagination = {
  /**
   * Current page number (1-indexed).
   */
  readonly currentPage: number;
  /**
   * Number of items per page.
   */
  readonly pageSize: number;
  /**
   * Total number of items matching the query.
   */
  readonly totalCount: number;
  /**
   * Total number of pages.
   */
  readonly totalPages: number;
  /**
   * Whether there is a next page.
   */
  readonly hasNext: boolean;
  /**
   * Whether there is a previous page.
   */
  readonly hasPrevious: boolean;
};

/**
 * Result of a listProjects query with pagination info.
 */
export type ProjectListResult = {
  /**
   * The list of projects for the current page.
   */
  readonly projects: readonly ProjectListSummary[];
  /**
   * Pagination metadata.
   */
  readonly pagination: ProjectListPagination;
};
