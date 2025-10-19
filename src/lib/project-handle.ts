import type { PartAdapter, StorageProvider } from '../models/adapter.js';
import type { ProjectSnapshot } from '../models/project.js';
import type { ProjectId } from '../models/base.js';
import { cloneValue } from './utils/clone.js';
import type { Clock } from './clock.js';
import { AsyncMutex } from './utils/async-mutex.js';

interface ProjectHandleOptions {
  readonly projectId: ProjectId;
  readonly storage: StorageProvider;
  readonly adapters: readonly PartAdapter[];
  readonly clock: Clock;
  readonly initialSnapshot?: ProjectSnapshot;
  readonly loader?: () => Promise<ProjectSnapshot | undefined>;
}

type SnapshotMutator = (snapshot: ProjectSnapshot) => ProjectSnapshot;

/**
 * Manages the cached state and persistence lifecycle for a single project instance.
 */
export class ProjectHandle {
  readonly projectId: ProjectId;

  private readonly storage: StorageProvider;
  private readonly adapters: readonly PartAdapter[];
  private readonly clock: Clock;
  private readonly loader: () => Promise<ProjectSnapshot | undefined>;
  private readonly mutex = new AsyncMutex();

  private snapshotCache?: ProjectSnapshot;
  private dirty = false;
  private closed = false;

  constructor(options: ProjectHandleOptions) {
    this.projectId = options.projectId;
    this.storage = options.storage;
    this.adapters = options.adapters;
    this.clock = options.clock;
    const defaultLoader = (): Promise<ProjectSnapshot | undefined> =>
      this.storage.loadSnapshot(this.projectId);

    this.loader = options.loader ?? defaultLoader;

    if (options.initialSnapshot) {
      this.snapshotCache = cloneValue(options.initialSnapshot);
    }
  }

  /**
   * Returns true when the in-memory snapshot diverges from persisted storage.
   */
  isDirty(): boolean {
    return this.dirty;
  }

  /**
   * Provides the adapters registered for this project.
   */
  getAdapters(): readonly PartAdapter[] {
    return this.adapters;
  }

  /**
   * Retrieves the cached snapshot, loading it from storage if needed.
   */
  async getSnapshot(): Promise<ProjectSnapshot> {
    return this.mutex.runExclusive(async () => {
      const snapshot = await this.ensureSnapshot();
      return cloneValue(snapshot);
    });
  }

  /**
   * Forces a reload from storage, replacing the cached snapshot.
   */
  async refresh(): Promise<ProjectSnapshot> {
    return this.mutex.runExclusive(async () => {
      this.assertOpen();
      const latest = await this.loader();
      if (!latest) {
        throw new Error(`Project ${this.projectId as string} does not exist in storage.`);
      }

      this.snapshotCache = cloneValue(latest);
      this.dirty = false;
      return cloneValue(this.snapshotCache);
    });
  }

  /**
   * Applies the provided mutation function and schedules the project for persistence.
   *
   * @param mutator - Function that receives the current snapshot and returns the new state.
   */
  async update(mutator: SnapshotMutator): Promise<ProjectSnapshot> {
    return this.mutex.runExclusive(async () => {
      this.assertOpen();
      const current = await this.ensureSnapshot();
      const next = mutator(cloneValue(current));

      const updatedSnapshot: ProjectSnapshot = {
        ...next,
        project: {
          ...next.project,
          updatedAt: this.clock.now(),
        },
      };

      this.snapshotCache = cloneValue(updatedSnapshot);
      this.dirty = true;

      // TODO(middleware): project:save hook could observe pending snapshot before persistence.

      return cloneValue(this.snapshotCache);
    });
  }

  /**
   * Persists the snapshot when changes are pending.
   */
  async save(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.assertOpen();
      await this.persistIfDirty();
    });
  }

  /**
   * Closes the handle, optionally flushing pending changes to storage.
   */
  async close(options: { save?: boolean } = {}): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.closed) {
        return;
      }

      if (options.save ?? true) {
        await this.persistIfDirty();
      }

      this.closed = true;
      this.snapshotCache = undefined;
      this.dirty = false;
    });
  }

  private async ensureSnapshot(): Promise<ProjectSnapshot> {
    this.assertOpen();
    if (this.snapshotCache) {
      return this.snapshotCache;
    }

    const snapshot = await this.loader();
    if (!snapshot) {
      throw new Error(`Project ${this.projectId as string} does not exist in storage.`);
    }

    this.snapshotCache = cloneValue(snapshot);
    return this.snapshotCache;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error(`Project ${this.projectId as string} has been closed.`);
    }
  }

  private async persistIfDirty(): Promise<void> {
    if (!this.snapshotCache || !this.dirty) {
      return;
    }

    await this.storage.saveSnapshot(this.snapshotCache);
    this.dirty = false;
  }
}
