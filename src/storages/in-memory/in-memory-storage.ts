import type { ISO8601Timestamp, OwnerInfo, ProjectId } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type {
  ProjectListResult,
  ProjectListSummary,
  ProjectsQuery,
  ProjectSnapshot,
  ProjectSummary,
} from '../../models/project.js';
import type { VersionCombo } from '../../models/combo.js';
import { cloneValue } from '../../lib/utils/clone.js';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Computes the latest combo update information for a project.
 * @param combos - Array of combos in the project
 * @returns Object with latest update info, or undefined if no combos exist
 */
function computeComboLatestInfo(combos: readonly VersionCombo[]): {
  comboLatestUpdateAt?: ISO8601Timestamp;
  comboLatestUpdateBy?: OwnerInfo;
  comboLatestName?: string;
} {
  if (combos.length === 0) {
    return {
      comboLatestUpdateAt: undefined,
      comboLatestUpdateBy: undefined,
      comboLatestName: undefined,
    };
  }

  const latestCombo = combos.reduce((latest, combo) =>
    combo.updatedAt > latest.updatedAt ? combo : latest
  );

  return {
    comboLatestUpdateAt: latestCombo.updatedAt,
    comboLatestUpdateBy: latestCombo.updatedBy,
    comboLatestName: latestCombo.name,
  };
}

export interface InMemoryStorageOptions {
  readonly initialSnapshots?: readonly ProjectSnapshot[];
  readonly id?: string;
}

/**
 * Simple in-memory storage provider for testing and local development scenarios.
 *
 * Supports filtering and pagination for consistent behavior with other storage providers.
 */
export class InMemoryStorageProvider implements StorageProvider {
  readonly id: string;

  private readonly snapshots = new Map<ProjectId, ProjectSnapshot>();

  constructor(options: InMemoryStorageOptions = {}) {
    this.id = options.id ?? 'in-memory';

    if (options.initialSnapshots) {
      for (const snapshot of options.initialSnapshots) {
        this.snapshots.set(snapshot.project.id, cloneValue(snapshot));
      }
    }
  }

  async loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined> {
    const snapshot = this.snapshots.get(projectId);
    return snapshot ? cloneValue(snapshot) : undefined;
  }

  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    this.snapshots.set(snapshot.project.id, cloneValue(snapshot));
  }

  async listSummaries(): Promise<readonly ProjectSummary[]> {
    const summaries = Array.from(this.snapshots.values(), (snapshot) => {
      const { id, name, description, owner, updatedBy, updatedAt } = snapshot.project;
      return { id, name, description, owner, updatedBy, updatedAt };
    });

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return summaries.map((summary) => cloneValue(summary));
  }

  /**
   * Lists projects with filtering, sorting, and pagination support.
   *
   * Security behavior:
   * - If `includeAll` is true, returns all projects (privileged operation)
   * - If `ownerUserId` is provided, returns only projects owned by that user
   * - If `ownerGroupId` is provided, returns only projects owned by that group
   * - If neither is provided, returns only projects WITHOUT owner info
   *
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of projects with metadata
   */
  async listProjects(query?: ProjectsQuery): Promise<ProjectListResult> {
    const limit = query?.limit ?? DEFAULT_PAGE_SIZE;
    const page = query?.page ?? 1;

    // Filter snapshots based on query
    let filtered = Array.from(this.snapshots.values());

    // Security: Apply ownership filtering unless includeAll is explicitly true
    if (!query?.includeAll) {
      if (query?.ownerUserId) {
        filtered = filtered.filter((s) => s.project.owner?.userId === query.ownerUserId);
      } else if (query?.ownerGroupId) {
        filtered = filtered.filter((s) => s.project.owner?.userGroupId === query.ownerGroupId);
      } else {
        // No owner specified - only return projects WITHOUT owner info
        filtered = filtered.filter((s) => !s.project.owner?.userId);
      }
    }

    if (query?.namePattern) {
      const pattern = query.namePattern.toLowerCase();
      filtered = filtered.filter((s) => s.project.name.toLowerCase().includes(pattern));
    }

    if (query?.createdAfter) {
      filtered = filtered.filter((s) => s.project.createdAt >= query.createdAfter!);
    }

    if (query?.createdBefore) {
      filtered = filtered.filter((s) => s.project.createdAt <= query.createdBefore!);
    }

    if (query?.updatedAfter) {
      filtered = filtered.filter((s) => s.project.updatedAt >= query.updatedAfter!);
    }

    if (query?.updatedBefore) {
      filtered = filtered.filter((s) => s.project.updatedAt <= query.updatedBefore!);
    }

    // Sort by updatedAt descending
    filtered.sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));

    // Get total count before pagination
    const totalCount = filtered.length;

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    // Map to ProjectListSummary
    const projects: ProjectListSummary[] = paginated.map((snapshot) => {
      const comboLatestInfo = computeComboLatestInfo(snapshot.combos);
      return {
        id: snapshot.project.id,
        name: snapshot.project.name,
        description: snapshot.project.description,
        owner: snapshot.project.owner,
        updatedBy: snapshot.project.updatedBy,
        createdAt: snapshot.project.createdAt,
        updatedAt: snapshot.project.updatedAt,
        partsCount: snapshot.parts.length,
        combosCount: snapshot.combos.length,
        ...comboLatestInfo,
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = page;
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    return {
      projects,
      pagination: {
        currentPage,
        pageSize: limit,
        totalCount,
        totalPages,
        hasNext,
        hasPrevious,
      },
    };
  }

  /**
   * Removes all stored snapshots. Intended for test cleanup only.
   */
  clear(): void {
    this.snapshots.clear();
  }
}
