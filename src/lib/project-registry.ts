import type { PartAdapter, StorageProvider } from '../models/adapter.js';
import type { ProjectInit, ProjectSnapshot } from '../models/project.js';
import type { AdapterId, ProjectId } from '../models/base.js';
import { SystemClock, type Clock } from './clock.js';
import { buildProjectSnapshot } from './project-snapshot-builder.js';
import { ProjectHandle } from './project-handle.js';
import { createProjectId } from './ids.js';

interface ProjectRegistryOptions {
  readonly storage: StorageProvider;
  readonly adapters?: readonly PartAdapter[];
  readonly clock?: Clock;
}

/**
 * Coordinates the lifecycle of open projects and ensures exclusive access.
 */
export class ProjectRegistry {
  private readonly storage: StorageProvider;
  private readonly clock: Clock;
  private readonly adapters = new Map<AdapterId, PartAdapter>();
  private readonly handles = new Map<ProjectId, ProjectHandle>();

  constructor(options: ProjectRegistryOptions) {
    this.storage = options.storage;
    this.clock = options.clock ?? new SystemClock();

    for (const adapter of options.adapters ?? []) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  /**
   * Opens a new project based on the provided initialization data.
   * The initial snapshot is persisted immediately.
   */
  async open(init: ProjectInit): Promise<ProjectHandle> {
    const projectId = createProjectId(init.id);
    if (this.handles.has(projectId)) {
      throw new Error(`Project ${projectId as string} is already open.`);
    }

    const snapshot = buildProjectSnapshot({ ...init, id: projectId }, { clock: this.clock });

    // TODO(middleware): project:create hook opportunity before persistence.
    await this.storage.saveSnapshot(snapshot);

    const handle = this.createHandle(projectId, snapshot);
    this.handles.set(projectId, handle);
    return handle;
  }

  /**
   * Loads an existing project from storage or returns the already opened handle.
   */
  async load(projectId: ProjectId): Promise<ProjectHandle> {
    const existing = this.handles.get(projectId);
    if (existing) {
      return existing;
    }

    const snapshot = await this.storage.loadSnapshot(projectId);
    if (!snapshot) {
      throw new Error(`Project ${projectId as string} could not be found.`);
    }

    // TODO(middleware): project:load hook opportunity after snapshot retrieval.

    const handle = this.createHandle(projectId, snapshot);
    this.handles.set(projectId, handle);
    return handle;
  }

  /**
   * Closes the project handle and removes it from the registry.
   *
   * @param projectId - Identifier of the project to close.
   * @param options - Optional close behaviour configuration.
   */
  async close(projectId: ProjectId, options: { save?: boolean } = {}): Promise<void> {
    const handle = this.handles.get(projectId);
    if (!handle) {
      return;
    }

    await handle.close(options);
    this.handles.delete(projectId);
  }

  /**
   * Lists identifiers for all currently opened projects.
   */
  listOpenProjects(): readonly ProjectId[] {
    return Array.from(this.handles.keys());
  }

  /**
   * Returns the open handle without interacting with storage.
   */
  getOpenProject(projectId: ProjectId): ProjectHandle | undefined {
    return this.handles.get(projectId);
  }

  private createHandle(projectId: ProjectId, snapshot?: ProjectSnapshot): ProjectHandle {
    const adapters = Array.from(this.adapters.values());

    return new ProjectHandle({
      projectId,
      storage: this.storage,
      adapters,
      clock: this.clock,
      initialSnapshot: snapshot,
    });
  }
}
