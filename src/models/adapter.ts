import type { AdapterId, ProjectId } from './base.js';
import type { PartDefinition, PartVersion, ResolvedPartVersion } from './part.js';
import type { ProjectListResult, ProjectsQuery, ProjectSnapshot, ProjectSummary } from './project.js';

/**
 * Contract for storage adapters used by Project instances.
 */
export interface StorageProvider {
  readonly id: string;
  loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined>;
  saveSnapshot(snapshot: ProjectSnapshot): Promise<void>;
  listSummaries?(): Promise<readonly ProjectSummary[]>;
  /**
   * Lists projects with filtering, sorting, and pagination support.
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of projects with metadata
   */
  listProjects?(query?: ProjectsQuery): Promise<ProjectListResult>;
}

/**
 * Context provided to part adapters when resolving versions.
 */
export interface AdapterContext {
  readonly projectId: ProjectId;
  readonly storage: StorageProvider;
  readonly signal?: AbortSignal;
}

/**
 * Contract for part adapters that can resolve external version sources.
 */
export interface PartAdapter {
  readonly id: AdapterId;
  readonly displayName: string;
  resolveVersion(
    context: AdapterContext,
    part: PartDefinition,
    version: PartVersion
  ): Promise<ResolvedPartVersion>;
  validatePart?(
    context: AdapterContext,
    part: PartDefinition
  ): Promise<readonly ValidationIssue[]> | readonly ValidationIssue[];
  listAvailableVersions?(
    context: AdapterContext,
    part: PartDefinition
  ): Promise<readonly PartVersion[]> | readonly PartVersion[];
}

/**
 * Issues discovered while validating project integrity.
 */
export type ValidationIssue =
  | {
      readonly type: 'duplicate-part';
      readonly partId: PartDefinition['id'];
      readonly message: string;
    }
  | {
      readonly type: 'duplicate-version';
      readonly partId: PartDefinition['id'];
      readonly versionId: PartVersion['id'];
      readonly message: string;
    }
  | {
      readonly type: 'unknown-part';
      readonly partId: PartDefinition['id'];
      readonly message: string;
    }
  | {
      readonly type: 'unknown-version';
      readonly partId: PartDefinition['id'];
      readonly versionId: PartVersion['id'];
      readonly message: string;
    }
  | {
      readonly type: 'adapter-error';
      readonly adapterId: AdapterId;
      readonly message: string;
      readonly details?: unknown;
    };
