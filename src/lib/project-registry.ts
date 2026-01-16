import type { PartAdapter, StorageProvider } from '../models/adapter.js';
import type { ProjectInit, ProjectSnapshot } from '../models/project.js';
import type { AdapterId, ComboId, PartId, PartVersionId, ProjectId } from '../models/base.js';
import type { PartDefinition, PartInit, PartVersion, PartVersionInit } from '../models/part.js';
import type { VersionCombo, VersionComboInit } from '../models/combo.js';
import type {
  ComboFilter,
  ComboSummary,
  PartFilter,
  PartSummary,
  VersionFilter,
  VersionSummary,
} from '../models/queries.js';
import { SystemClock, type Clock } from './clock.js';
import { buildProjectSnapshot } from './project-snapshot-builder.js';
import { ProjectHandle } from './project-handle.js';
import { createProjectId } from './ids.js';
import { ProjectEventDispatcher } from './events/project-events.js';
import { cloneValue } from './utils/clone.js';
import { ProjectAlreadyOpenError, ProjectNotFoundError } from './errors.js';

interface ProjectRegistryOptions {
  readonly storage: StorageProvider;
  readonly adapters?: readonly PartAdapter[];
  readonly clock?: Clock;
  readonly events?: ProjectEventDispatcher;
}

/**
 * Coordinates the lifecycle of open projects and ensures exclusive access.
 */
export class ProjectRegistry {
  private readonly storage: StorageProvider;
  private readonly clock: Clock;
  private readonly events: ProjectEventDispatcher;
  private readonly adapters = new Map<AdapterId, PartAdapter>();
  private readonly handles = new Map<ProjectId, ProjectHandle>();

  constructor(options: ProjectRegistryOptions) {
    this.storage = options.storage;
    this.clock = options.clock ?? new SystemClock();
    this.events = options.events ?? new ProjectEventDispatcher();

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
      throw new ProjectAlreadyOpenError(projectId);
    }

    const snapshot = buildProjectSnapshot({ ...init, id: projectId }, { clock: this.clock });

    // TODO(middleware): project:create hook opportunity before persistence.
    await this.storage.saveSnapshot(snapshot);

    const handle = this.createHandle(projectId, snapshot);
    this.handles.set(projectId, handle);

    await this.events.emit('project:created', {
      projectId,
      snapshot: cloneValue(snapshot),
    });

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
      throw new ProjectNotFoundError(projectId);
    }

    // TODO(middleware): project:load hook opportunity after snapshot retrieval.

    const handle = this.createHandle(projectId, snapshot);
    this.handles.set(projectId, handle);
    await this.events.emit('project:loaded', {
      projectId,
      snapshot: cloneValue(snapshot),
    });
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
   * Adds a new part to the specified project.
   */
  async addPart(projectId: ProjectId, partInit: PartInit): Promise<PartDefinition> {
    const handle = await this.load(projectId);
    return handle.addPart(partInit);
  }

  /**
   * Updates an existing part definition.
   */
  async updatePart(
    projectId: ProjectId,
    partId: PartId,
    mutator: (part: PartDefinition) => PartDefinition
  ): Promise<PartDefinition> {
    const handle = await this.load(projectId);
    return handle.updatePart(partId, mutator);
  }

  /**
   * Adds a new version to the given part.
   */
  async addPartVersion(
    projectId: ProjectId,
    partId: PartId,
    versionInit: PartVersionInit
  ): Promise<PartVersion> {
    const handle = await this.load(projectId);
    return handle.addPartVersion(partId, versionInit);
  }

  /**
   * Updates a version within a project.
   */
  async updatePartVersion(
    projectId: ProjectId,
    versionId: PartVersionId,
    mutator: (version: PartVersion) => PartVersion
  ): Promise<PartVersion> {
    const handle = await this.load(projectId);
    return handle.updatePartVersion(versionId, mutator);
  }

  /**
   * Lists identifiers for all currently opened projects.
   */
  listOpenProjects(): readonly ProjectId[] {
    return Array.from(this.handles.keys());
  }

  /**
   * Deletes a combo from the specified project.
   */
  async deleteCombo(projectId: ProjectId, comboId: ComboId): Promise<VersionCombo> {
    const handle = await this.load(projectId);
    return handle.deleteCombo(comboId);
  }

  /**
   * Deletes a version from the specified project.
   */
  async deletePartVersion(projectId: ProjectId, versionId: PartVersionId): Promise<PartVersion> {
    const handle = await this.load(projectId);
    return handle.deletePartVersion(versionId);
  }

  /**
   * Deletes a part (and all its versions) from the specified project.
   */
  async deletePart(projectId: ProjectId, partId: PartId): Promise<PartDefinition> {
    const handle = await this.load(projectId);
    return handle.deletePart(partId);
  }

  /**
   * Adds a new combo to the specified project.
   */
  async addCombo(projectId: ProjectId, comboInit: VersionComboInit): Promise<VersionCombo> {
    const handle = await this.load(projectId);
    return handle.addCombo(comboInit);
  }

  /**
   * Updates an existing combo in the specified project.
   */
  async updateCombo(
    projectId: ProjectId,
    comboId: ComboId,
    mutator: (combo: VersionCombo) => VersionCombo
  ): Promise<VersionCombo> {
    const handle = await this.load(projectId);
    return handle.updateCombo(comboId, mutator);
  }

  /**
   * Returns the open handle without interacting with storage.
   */
  getOpenProject(projectId: ProjectId): ProjectHandle | undefined {
    return this.handles.get(projectId);
  }

  /**
   * Exposes the shared event dispatcher.
   */
  getEventDispatcher(): ProjectEventDispatcher {
    return this.events;
  }

  /**
   * Finds part IDs matching the given filter.
   */
  async findParts(projectId: ProjectId, filter?: PartFilter): Promise<readonly PartId[]> {
    const handle = await this.load(projectId);
    return handle.findParts(filter);
  }

  /**
   * Finds version IDs matching the given filter.
   */
  async findVersions(
    projectId: ProjectId,
    filter?: VersionFilter
  ): Promise<readonly PartVersionId[]> {
    const handle = await this.load(projectId);
    return handle.findVersions(filter);
  }

  /**
   * Finds combo IDs matching the given filter.
   */
  async findCombos(projectId: ProjectId, filter?: ComboFilter): Promise<readonly ComboId[]> {
    const handle = await this.load(projectId);
    return handle.findCombos(filter);
  }

  /**
   * Gets a part by ID.
   */
  async getPartById(
    projectId: ProjectId,
    id: PartId,
    options?: { includeDeleted?: boolean }
  ): Promise<PartDefinition | undefined> {
    const handle = await this.load(projectId);
    return handle.getPartById(id, options);
  }

  /**
   * Gets a version by ID.
   */
  async getVersionById(
    projectId: ProjectId,
    id: PartVersionId,
    options?: { includeDeleted?: boolean }
  ): Promise<PartVersion | undefined> {
    const handle = await this.load(projectId);
    return handle.getVersionById(id, options);
  }

  /**
   * Gets a combo by ID.
   */
  async getComboById(projectId: ProjectId, id: ComboId): Promise<VersionCombo | undefined> {
    const handle = await this.load(projectId);
    return handle.getComboById(id);
  }

  /**
   * Gets a part summary by ID.
   */
  async getPartSummary(projectId: ProjectId, id: PartId): Promise<PartSummary | undefined> {
    const handle = await this.load(projectId);
    return handle.getPartSummary(id);
  }

  /**
   * Gets a version summary by ID.
   */
  async getVersionSummary(
    projectId: ProjectId,
    id: PartVersionId
  ): Promise<VersionSummary | undefined> {
    const handle = await this.load(projectId);
    return handle.getVersionSummary(id);
  }

  /**
   * Gets a combo summary by ID.
   */
  async getComboSummary(projectId: ProjectId, id: ComboId): Promise<ComboSummary | undefined> {
    const handle = await this.load(projectId);
    return handle.getComboSummary(id);
  }

  /**
   * Gets all version IDs for a given part.
   */
  async getVersionsByPartId(
    projectId: ProjectId,
    partId: PartId
  ): Promise<readonly PartVersionId[]> {
    const handle = await this.load(projectId);
    return handle.getVersionsByPartId(partId);
  }

  /**
   * Gets all combo IDs that reference a given part.
   */
  async getCombosByPartId(projectId: ProjectId, partId: PartId): Promise<readonly ComboId[]> {
    const handle = await this.load(projectId);
    return handle.getCombosByPartId(partId);
  }

  /**
   * Gets all combo IDs that reference a given version.
   */
  async getCombosByVersionId(
    projectId: ProjectId,
    versionId: PartVersionId
  ): Promise<readonly ComboId[]> {
    const handle = await this.load(projectId);
    return handle.getCombosByVersionId(versionId);
  }

  /**
   * Gets the current parts order for a project.
   */
  async getPartsOrder(projectId: ProjectId): Promise<readonly PartId[]> {
    const handle = await this.load(projectId);
    return handle.getPartsOrder();
  }

  /**
   * Sets the parts order for a project.
   */
  async setPartsOrder(projectId: ProjectId, partIds: readonly PartId[]): Promise<void> {
    const handle = await this.load(projectId);
    return handle.setPartsOrder(partIds);
  }

  /**
   * Moves a part to a new position in the order.
   */
  async movePartOrder(projectId: ProjectId, partId: PartId, newPosition: number): Promise<void> {
    const handle = await this.load(projectId);
    return handle.movePartOrder(partId, newPosition);
  }

  /**
   * Permanently removes deleted parts from a project.
   */
  async cleanDeletedParts(projectId: ProjectId): Promise<readonly PartDefinition[]> {
    const handle = await this.load(projectId);
    return handle.cleanDeletedParts();
  }

  /**
   * Permanently removes deleted versions from a project.
   */
  async cleanDeletedVersions(projectId: ProjectId): Promise<readonly PartVersion[]> {
    const handle = await this.load(projectId);
    return handle.cleanDeletedVersions();
  }

  private createHandle(projectId: ProjectId, snapshot?: ProjectSnapshot): ProjectHandle {
    const adapters = Array.from(this.adapters.values());

    return new ProjectHandle({
      projectId,
      storage: this.storage,
      adapters,
      clock: this.clock,
      initialSnapshot: snapshot,
      events: this.events,
    });
  }
}
