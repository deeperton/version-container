import type { ProjectId } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type { ProjectSnapshot, ProjectSummary } from '../../models/project.js';
import { cloneValue } from '../../lib/utils/clone.js';

interface InMemoryStorageOptions {
  readonly initialSnapshots?: readonly ProjectSnapshot[];
  readonly id?: string;
}

/**
 * Simple in-memory storage provider for testing and local development scenarios.
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
      const { id, name, description, updatedAt } = snapshot.project;
      return { id, name, description, updatedAt };
    });

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return summaries.map((summary) => cloneValue(summary));
  }

  /**
   * Removes all stored snapshots. Intended for test cleanup only.
   */
  clear(): void {
    this.snapshots.clear();
  }
}
