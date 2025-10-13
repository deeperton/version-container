import type { ProjectId } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type { ProjectSnapshot, ProjectSummary } from '../../models/project.js';

interface InMemoryStorageOptions {
  readonly initialSnapshots?: readonly ProjectSnapshot[];
  readonly id?: string;
}

const clone = <Value>(value: Value): Value => {
  const cloner = (globalThis as { structuredClone?: <T>(input: T) => T }).structuredClone;
  if (typeof cloner === 'function') {
    return cloner(value);
  }

  return JSON.parse(JSON.stringify(value)) as Value;
};

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
        this.snapshots.set(snapshot.project.id, clone(snapshot));
      }
    }
  }

  async loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined> {
    const snapshot = this.snapshots.get(projectId);
    return snapshot ? clone(snapshot) : undefined;
  }

  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    this.snapshots.set(snapshot.project.id, clone(snapshot));
  }

  async listSummaries(): Promise<readonly ProjectSummary[]> {
    const summaries = Array.from(this.snapshots.values(), (snapshot) => {
      const { id, name, description, updatedAt } = snapshot.project;
      return { id, name, description, updatedAt };
    });

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return summaries.map((summary) => ({ ...summary }));
  }

  /**
   * Removes all stored snapshots. Intended for test cleanup only.
   */
  clear(): void {
    this.snapshots.clear();
  }
}
