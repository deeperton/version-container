import type { ProjectId } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type { ProjectSnapshot, ProjectSummary } from '../../models/project.js';

export interface LocalStorageStorageOptions {
  readonly id?: string;
  readonly keyPrefix?: string;
}

const DEFAULT_KEY_PREFIX = 'version-container:';
const SUMMARY_INDEX_KEY = 'version-container:__summaries';

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
    const { id, name, description, updatedAt } = snapshot.project;
    const summary: ProjectSummary = { id, name, description, updatedAt };
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
