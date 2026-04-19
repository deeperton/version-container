import type { ProjectId, ISO8601Timestamp, OwnerInfo } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type {
  ProjectListResult,
  ProjectListSummary,
  ProjectsQuery,
  ProjectSnapshot,
  ProjectSummary,
} from '../../models/project.js';
import type { VersionCombo } from '../../models/combo.js';

export interface LocalStorageStorageOptions {
  readonly id?: string;
  readonly keyPrefix?: string;
}

const DEFAULT_KEY_PREFIX = 'version-container:';
const SUMMARY_INDEX_KEY = 'version-container:__summaries';
const DEFAULT_PAGE_SIZE = 50;

/**
 * Computes the latest combo update information for a project.
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

/**
 * Storage provider that persists project snapshots to browser localStorage.
 *
 * @example
 * ```ts
 * const storage = new LocalStorageStorageProvider();
 * const registry = new ProjectRegistry({ storage });
 * ```
 */
export class LocalStorageStorageProvider implements StorageProvider {
  readonly id: string;
  private readonly keyPrefix: string;

  constructor(options: LocalStorageStorageOptions = {}) {
    this.id = options.id ?? 'local-storage';
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.assertAvailable();
  }

  async loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined> {
    const key = this.getProjectKey(projectId);
    const serialized = globalThis.localStorage.getItem(key);
    if (!serialized) return undefined;
    return JSON.parse(serialized) as ProjectSnapshot;
  }

  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    const key = this.getProjectKey(snapshot.project.id);
    const serialized = JSON.stringify(snapshot);

    try {
      globalThis.localStorage.setItem(key, serialized);
      this.updateSummaryIndex(snapshot);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new Error(
          `LocalStorage quota exceeded. Cannot save project "${snapshot.project.name}".`
        );
      }
      throw error;
    }
  }

  async listSummaries(): Promise<readonly ProjectSummary[]> {
    const summaries = this.loadSummaryIndex();
    return summaries.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

    // Load all snapshots (necessary for filtering by owner/stats)
    const snapshots = this.loadAllSnapshots();
    let filtered = snapshots;

    // Security: Apply ownership filtering unless includeAll is explicitly true
    if (!query?.includeAll) {
      if (query?.ownerUserId) {
        filtered = filtered.filter(
          (s: ProjectSnapshot) => s.project.owner?.userId === query.ownerUserId
        );
      } else if (query?.ownerGroupId) {
        filtered = filtered.filter(
          (s: ProjectSnapshot) => s.project.owner?.userGroupId === query.ownerGroupId
        );
      } else {
        // No owner specified - only return projects WITHOUT owner info
        filtered = filtered.filter((s: ProjectSnapshot) => !s.project.owner?.userId);
      }
    }

    if (query?.namePattern) {
      const pattern = query.namePattern.toLowerCase();
      filtered = filtered.filter((s: ProjectSnapshot) =>
        s.project.name.toLowerCase().includes(pattern)
      );
    }

    if (query?.createdAfter) {
      filtered = filtered.filter(
        (s: ProjectSnapshot) => s.project.createdAt >= (query.createdAfter as ISO8601Timestamp)
      );
    }

    if (query?.createdBefore) {
      filtered = filtered.filter(
        (s: ProjectSnapshot) => s.project.createdAt <= (query.createdBefore as ISO8601Timestamp)
      );
    }

    if (query?.updatedAfter) {
      filtered = filtered.filter(
        (s: ProjectSnapshot) => s.project.updatedAt >= (query.updatedAfter as ISO8601Timestamp)
      );
    }

    if (query?.updatedBefore) {
      filtered = filtered.filter(
        (s: ProjectSnapshot) => s.project.updatedAt <= (query.updatedBefore as ISO8601Timestamp)
      );
    }

    // Sort by updatedAt descending
    filtered.sort((a: ProjectSnapshot, b: ProjectSnapshot) =>
      b.project.updatedAt.localeCompare(a.project.updatedAt)
    );

    const totalCount = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    const projects: ProjectListSummary[] = paginated.map((snapshot: ProjectSnapshot) => {
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
    const summaries = this.loadSummaryIndex();
    for (const summary of summaries) {
      globalThis.localStorage.removeItem(this.getProjectKey(summary.id));
    }
    globalThis.localStorage.removeItem(SUMMARY_INDEX_KEY);
  }

  /**
   * Removes a single project from storage.
   */
  delete(projectId: ProjectId): void {
    globalThis.localStorage.removeItem(this.getProjectKey(projectId));
    this.removeFromSummaryIndex(projectId);
  }

  private getProjectKey(projectId: ProjectId): string {
    return `${this.keyPrefix}${projectId as string}`;
  }

  private updateSummaryIndex(snapshot: ProjectSnapshot): void {
    const summaries = this.loadSummaryIndex();
    const { id, name, description, owner, updatedBy, updatedAt } = snapshot.project;
    const summary: ProjectSummary = { id, name, description, owner, updatedBy, updatedAt };
    const index = summaries.findIndex((s) => s.id === id);

    if (index >= 0) {
      summaries[index] = summary;
    } else {
      summaries.push(summary);
    }

    globalThis.localStorage.setItem(SUMMARY_INDEX_KEY, JSON.stringify(summaries));
  }

  private loadSummaryIndex(): ProjectSummary[] {
    const serialized = globalThis.localStorage.getItem(SUMMARY_INDEX_KEY);
    if (!serialized) return [];
    try {
      return JSON.parse(serialized) as ProjectSummary[];
    } catch {
      return this.rebuildSummaryIndex();
    }
  }

  private removeFromSummaryIndex(projectId: ProjectId): void {
    const summaries = this.loadSummaryIndex();
    const filtered = summaries.filter((s) => s.id !== projectId);
    globalThis.localStorage.setItem(SUMMARY_INDEX_KEY, JSON.stringify(filtered));
  }

  /**
   * Loads all full snapshots from localStorage.
   * Used by listProjects when filtering is needed.
   */
  private loadAllSnapshots(): ProjectSnapshot[] {
    const snapshots: ProjectSnapshot[] = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const key = globalThis.localStorage.key(i);
      if (key?.startsWith(this.keyPrefix) && key !== SUMMARY_INDEX_KEY) {
        try {
          const serialized = globalThis.localStorage.getItem(key);
          if (serialized) {
            snapshots.push(JSON.parse(serialized) as ProjectSnapshot);
          }
        } catch {
          continue;
        }
      }
    }
    return snapshots;
  }

  private rebuildSummaryIndex(): ProjectSummary[] {
    const summaries: ProjectSummary[] = [];
    for (let i = 0; i < globalThis.localStorage.length; i++) {
      const key = globalThis.localStorage.key(i);
      if (key?.startsWith(this.keyPrefix) && key !== SUMMARY_INDEX_KEY) {
        try {
          const serialized = globalThis.localStorage.getItem(key);
          if (serialized) {
            const snapshot = JSON.parse(serialized) as ProjectSnapshot;
            summaries.push({
              id: snapshot.project.id,
              name: snapshot.project.name,
              description: snapshot.project.description,
              owner: snapshot.project.owner,
              updatedBy: snapshot.project.updatedBy,
              updatedAt: snapshot.project.updatedAt,
            });
          }
        } catch {
          continue;
        }
      }
    }
    globalThis.localStorage.setItem(SUMMARY_INDEX_KEY, JSON.stringify(summaries));
    return summaries;
  }

  private assertAvailable(): void {
    if (typeof globalThis.localStorage === 'undefined') {
      throw new Error(
        'localStorage is not available. LocalStorageStorageProvider requires a browser environment.'
      );
    }
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      (error as { code?: number }).code === 22 ||
      (error as { code?: number }).code === 1014)
  );
}
