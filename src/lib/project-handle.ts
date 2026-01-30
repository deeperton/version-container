import type { PartAdapter, StorageProvider } from '../models/adapter.js';
import type { PartDefinition, PartInit, PartVersion, PartVersionInit } from '../models/part.js';
import type { VersionBinding } from '../models/part.js';
import type { ProjectSnapshot } from '../models/project.js';
import type { ComboId, PartId, PartVersionId, ProjectId } from '../models/base.js';
import type { VersionCombo, VersionComboInit } from '../models/combo.js';
import type {
  ComboFilter,
  ComboSummary,
  PartFilter,
  PartSummary,
  VersionFilter,
  VersionSummary,
} from '../models/queries.js';
import {
  ComboAlreadyExistsError,
  ComboNotFoundError,
  DuplicateIdentifierError,
  IdentifierChangeError,
  PartAlreadyExistsError,
  PartNotFoundError,
  ProjectClosedError,
  ProjectNotInStorageError,
  UnknownPartReferenceError,
  UnknownVersionReferenceError,
  VersionAlreadyExistsError,
  VersionNotFoundError,
  VersionReassignmentError,
} from './errors.js';
import { cloneValue } from './utils/clone.js';
import type { Clock } from './clock.js';
import { AsyncMutex } from './utils/async-mutex.js';
import { sortById } from './utils/sort.js';
import {
  ProjectEventDispatcher,
  type ProjectEventMap,
  type ProjectEventName,
} from './events/project-events.js';
import { createComboId, createPartId, createPartVersionId } from './ids.js';
import { METADATA_DELETED_AT } from '../models/part.js';
import { METADATA_PARTS_ORDER } from '../models/project.js';

interface ProjectHandleOptions {
  readonly projectId: ProjectId;
  readonly storage: StorageProvider;
  readonly adapters: readonly PartAdapter[];
  readonly clock: Clock;
  readonly events: ProjectEventDispatcher;
  readonly initialSnapshot?: ProjectSnapshot;
  readonly loader?: () => Promise<ProjectSnapshot | undefined>;
}

type SnapshotMutator = (snapshot: ProjectSnapshot) => ProjectSnapshot;

type MutationEventFactory = (snapshot: ProjectSnapshot) => {
  readonly name: ProjectEventName;
  readonly payload: ProjectEventMap[ProjectEventName];
};

type MutationEvent = ReturnType<MutationEventFactory>;

interface MutationResult<Result> {
  readonly snapshot: ProjectSnapshot;
  readonly result: Result;
  readonly events?: readonly MutationEventFactory[];
}

/**
 * Manages the cached state and persistence lifecycle for a single project instance.
 */
export class ProjectHandle {
  readonly projectId: ProjectId;

  private readonly storage: StorageProvider;
  private readonly adapters: readonly PartAdapter[];
  private readonly clock: Clock;
  private readonly events: ProjectEventDispatcher;
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
    this.events = options.events;

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
   * Finds part IDs matching the given filter.
   * Returns all part IDs if no filter is provided.
   */
  findParts(filter?: PartFilter): readonly PartId[] {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return [];
    }

    return snapshot.parts
      .filter((part) => {
        // Exclude soft-deleted parts unless includeDeleted is true
        if (!filter?.includeDeleted && this.isPartDeleted(part)) {
          return false;
        }
        if (filter?.adapterId !== undefined && part.adapterId !== filter.adapterId) {
          return false;
        }
        if (filter?.tags && filter.tags.length > 0) {
          if (!part.tags || !filter.tags.some((tag) => part.tags!.includes(tag))) {
            return false;
          }
        }
        if (filter?.metadata) {
          if (!part.metadata) {
            return false;
          }
          for (const [key, value] of Object.entries(filter.metadata)) {
            if (part.metadata[key] !== value) {
              return false;
            }
          }
        }
        if (filter?.ownerUserId !== undefined) {
          if (!part.owner || part.owner.userId !== filter.ownerUserId) {
            return false;
          }
        }
        return true;
      })
      .map((part) => part.id);
  }

  /**
   * Finds version IDs matching the given filter.
   * Returns all version IDs if no filter is provided.
   */
  findVersions(filter?: VersionFilter): readonly PartVersionId[] {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return [];
    }

    return snapshot.versions
      .filter((version) => {
        // Exclude soft-deleted versions unless includeDeleted is true
        if (!filter?.includeDeleted && this.isVersionDeleted(version)) {
          return false;
        }
        if (filter?.partId !== undefined && version.partId !== filter.partId) {
          return false;
        }
        if (filter?.label !== undefined && version.label !== filter.label) {
          return false;
        }
        if (filter?.metadata) {
          if (!version.metadata) {
            return false;
          }
          for (const [key, value] of Object.entries(filter.metadata)) {
            if (version.metadata[key] !== value) {
              return false;
            }
          }
        }
        if (filter?.ownerUserId !== undefined) {
          if (!version.owner || version.owner.userId !== filter.ownerUserId) {
            return false;
          }
        }
        return true;
      })
      .map((version) => version.id);
  }

  /**
   * Finds combo IDs matching the given filter.
   * Returns all combo IDs if no filter is provided.
   */
  findCombos(filter?: ComboFilter): readonly ComboId[] {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return [];
    }

    return snapshot.combos
      .filter((combo) => {
        if (filter?.partId !== undefined) {
          if (!combo.bindings.some((b) => b.partId === filter.partId)) {
            return false;
          }
        }
        if (filter?.versionId !== undefined) {
          if (!combo.bindings.some((b) => b.versionId === filter.versionId)) {
            return false;
          }
        }
        if (filter?.metadata) {
          if (!combo.metadata) {
            return false;
          }
          for (const [key, value] of Object.entries(filter.metadata)) {
            if (combo.metadata[key] !== value) {
              return false;
            }
          }
        }
        if (filter?.ownerUserId !== undefined) {
          if (!combo.owner || combo.owner.userId !== filter.ownerUserId) {
            return false;
          }
        }
        return true;
      })
      .map((combo) => combo.id);
  }

  /**
   * Gets a part by ID, or undefined if not found.
   */
  getPartById(id: PartId, options?: { includeDeleted?: boolean }): PartDefinition | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const part = snapshot.parts.find((p) => p.id === id);
    if (!part) {
      return undefined;
    }
    // Return undefined for soft-deleted parts unless includeDeleted is true
    if (!options?.includeDeleted && this.isPartDeleted(part)) {
      return undefined;
    }
    return cloneValue(part);
  }

  /**
   * Gets a version by ID, or undefined if not found.
   */
  getVersionById(
    id: PartVersionId,
    options?: { includeDeleted?: boolean }
  ): PartVersion | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const version = snapshot.versions.find((v) => v.id === id);
    if (!version) {
      return undefined;
    }
    // Return undefined for soft-deleted versions unless includeDeleted is true
    if (!options?.includeDeleted && this.isVersionDeleted(version)) {
      return undefined;
    }
    return cloneValue(version);
  }

  /**
   * Gets a combo by ID, or undefined if not found.
   */
  getComboById(id: ComboId): VersionCombo | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const combo = snapshot.combos.find((c) => c.id === id);
    return combo ? cloneValue(combo) : undefined;
  }

  /**
   * Gets a lightweight part summary by ID.
   */
  getPartSummary(id: PartId): PartSummary | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const part = snapshot.parts.find((p) => p.id === id);
    if (!part) {
      return undefined;
    }
    return { id: part.id, name: part.name, description: part.description, owner: part.owner };
  }

  /**
   * Gets a lightweight version summary by ID.
   */
  getVersionSummary(id: PartVersionId): VersionSummary | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const version = snapshot.versions.find((v) => v.id === id);
    if (!version) {
      return undefined;
    }
    return { id: version.id, label: version.label, owner: version.owner };
  }

  /**
   * Gets a lightweight combo summary by ID.
   */
  getComboSummary(id: ComboId): ComboSummary | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const combo = snapshot.combos.find((c) => c.id === id);
    if (!combo) {
      return undefined;
    }
    return { id: combo.id, name: combo.name, description: combo.description, owner: combo.owner };
  }

  /**
   * Gets all version IDs for a given part.
   */
  getVersionsByPartId(partId: PartId): readonly PartVersionId[] {
    return this.findVersions({ partId });
  }

  /**
   * Gets all combo IDs that reference a given part.
   */
  getCombosByPartId(partId: PartId): readonly ComboId[] {
    return this.findCombos({ partId });
  }

  /**
   * Gets all combo IDs that reference a given version.
   */
  getCombosByVersionId(versionId: PartVersionId): readonly ComboId[] {
    return this.findCombos({ versionId });
  }

  /**
   * Checks if a part is soft-deleted by examining metadata.deletedAt
   */
  private isPartDeleted(part: PartDefinition): boolean {
    return part.metadata?.[METADATA_DELETED_AT] !== undefined;
  }

  /**
   * Checks if a version is soft-deleted by examining metadata.deletedAt
   */
  private isVersionDeleted(version: PartVersion): boolean {
    return version.metadata?.[METADATA_DELETED_AT] !== undefined;
  }

  /**
   * Gets the parts order from project metadata, or returns all part IDs if not set
   */
  private getPartsOrderFromSnapshot(snapshot: ProjectSnapshot): readonly PartId[] {
    const partsOrder = snapshot.project.metadata?.[METADATA_PARTS_ORDER];
    if (Array.isArray(partsOrder)) {
      return partsOrder as PartId[];
    }
    // Default: return all part IDs in sorted order
    return snapshot.parts.map((p) => p.id);
  }

  /**
   * Validates that all part IDs exist in the project and are not duplicates
   */
  private validatePartsOrder(partIds: readonly PartId[], snapshot: ProjectSnapshot): void {
    const existingIds = new Set(snapshot.parts.map((p) => p.id));
    const seen = new Set<PartId>();

    for (const partId of partIds) {
      if (!existingIds.has(partId)) {
        throw new PartNotFoundError(partId);
      }
      if (seen.has(partId)) {
        throw new DuplicateIdentifierError('part', partId as string);
      }
      seen.add(partId);
    }
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
        throw new ProjectNotInStorageError(this.projectId);
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
    return this.commitMutation<ProjectSnapshot>((snapshot) => {
      const next = mutator(cloneValue(snapshot));

      return {
        snapshot: next,
        result: next,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
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
   * Adds a new part definition (and optional seed versions) to the project.
   */
  async addPart(partInit: PartInit): Promise<PartDefinition> {
    const result = await this.commitMutation<PartDefinition>((snapshot) => {
      const partId = createPartId(partInit.id);
      if (snapshot.parts.some((existing) => existing.id === partId)) {
        throw new PartAlreadyExistsError(partId);
      }

      const part: PartDefinition = {
        id: partId,
        name: partInit.name,
        description: partInit.description,
        adapterId: partInit.adapterId,
        tags: partInit.tags,
        metadata: partInit.metadata,
        owner: partInit.owner,
      };

      const existingVersionIds = new Set(snapshot.versions.map((version) => version.id));
      const newVersions: PartVersion[] = [];

      for (const versionInit of partInit.versions ?? []) {
        const versionId = createPartVersionId(versionInit.id);
        if (existingVersionIds.has(versionId)) {
          throw new VersionAlreadyExistsError(versionId);
        }
        if (newVersions.some((version) => version.id === versionId)) {
          throw new VersionAlreadyExistsError(versionId);
        }

        newVersions.push({
          id: versionId,
          partId,
          label: versionInit.label,
          locator: versionInit.locator,
          metadata: versionInit.metadata,
        });
      }

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        parts: sortById([...snapshot.parts, part]),
        versions: sortById([...snapshot.versions, ...newVersions]),
      };

      return {
        snapshot: nextSnapshot,
        result: part,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'part:added',
            payload: {
              projectId: this.projectId,
              part,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Updates an existing part definition.
   */
  async updatePart(
    partId: PartId,
    mutator: (part: PartDefinition) => PartDefinition
  ): Promise<PartDefinition> {
    const result = await this.commitMutation<PartDefinition>((snapshot) => {
      const index = snapshot.parts.findIndex((part) => part.id === partId);
      if (index === -1) {
        throw new PartNotFoundError(partId);
      }

      const previous = snapshot.parts[index]!;
      const nextPart = mutator(previous);

      if (nextPart.id !== previous.id) {
        throw new IdentifierChangeError('Part');
      }

      const parts = [...snapshot.parts];
      parts[index] = nextPart;

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        parts: sortById(parts),
      };

      return {
        snapshot: nextSnapshot,
        result: nextPart,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'part:updated',
            payload: {
              projectId: this.projectId,
              part: nextPart,
              previous,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Adds a new version to an existing part.
   */
  async addPartVersion(partId: PartId, versionInit: PartVersionInit): Promise<PartVersion> {
    const result = await this.commitMutation<PartVersion>((snapshot) => {
      if (!snapshot.parts.some((part) => part.id === partId)) {
        throw new PartNotFoundError(partId);
      }

      const versionId = createPartVersionId(versionInit.id);
      if (snapshot.versions.some((version) => version.id === versionId)) {
        throw new VersionAlreadyExistsError(versionId);
      }

      const version: PartVersion = {
        id: versionId,
        partId,
        label: versionInit.label,
        locator: versionInit.locator,
        metadata: versionInit.metadata,
        owner: versionInit.owner,
      };

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        versions: sortById([...snapshot.versions, version]),
      };

      return {
        snapshot: nextSnapshot,
        result: version,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'version:added',
            payload: {
              projectId: this.projectId,
              partId,
              version,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Updates a version identified by its identifier.
   */
  async updatePartVersion(
    versionId: PartVersionId,
    mutator: (version: PartVersion) => PartVersion
  ): Promise<PartVersion> {
    const result = await this.commitMutation<PartVersion>((snapshot) => {
      const index = snapshot.versions.findIndex((version) => version.id === versionId);
      if (index === -1) {
        throw new VersionNotFoundError(versionId);
      }

      const previous = snapshot.versions[index]!;
      const nextVersion = mutator(previous);

      if (nextVersion.id !== previous.id) {
        throw new IdentifierChangeError('Version');
      }

      if (nextVersion.partId !== previous.partId) {
        throw new VersionReassignmentError(versionId, previous.partId, nextVersion.partId);
      }

      const versions = [...snapshot.versions];
      versions[index] = nextVersion;

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        versions: sortById(versions),
      };

      return {
        snapshot: nextSnapshot,
        result: nextVersion,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'version:updated',
            payload: {
              projectId: this.projectId,
              partId: nextVersion.partId,
              versionId: nextVersion.id,
              version: nextVersion,
              previous,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Deletes a combo from the project.
   */
  async deleteCombo(comboId: ComboId): Promise<VersionCombo> {
    const result = await this.commitMutation<VersionCombo>((snapshot) => {
      const index = snapshot.combos.findIndex((combo) => combo.id === comboId);
      if (index === -1) {
        throw new ComboNotFoundError(comboId);
      }

      const removedCombo = snapshot.combos[index]!;
      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        combos: sortById(snapshot.combos.filter((combo) => combo.id !== comboId)),
      };

      return {
        snapshot: nextSnapshot,
        result: removedCombo,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'combo:removed',
            payload: {
              projectId: this.projectId,
              comboId,
              removedCombo,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Deletes a version from the project.
   * Throws an error if the version is referenced by any combo.
   */
  async deletePartVersion(versionId: PartVersionId): Promise<PartVersion> {
    const result = await this.commitMutation<PartVersion>((snapshot) => {
      const index = snapshot.versions.findIndex((version) => version.id === versionId);
      if (index === -1) {
        throw new VersionNotFoundError(versionId);
      }

      const previous = snapshot.versions[index]!;

      // Check if already soft-deleted
      if (this.isVersionDeleted(previous)) {
        throw new Error(`Version ${versionId as string} is already deleted.`);
      }

      // Check if version is referenced by any combo
      const combosUsingVersion = snapshot.combos.filter((combo) =>
        combo.bindings.some((binding) => binding.versionId === versionId)
      );
      if (combosUsingVersion.length > 0) {
        throw new Error(
          `Cannot delete version ${versionId as string}: it is referenced by ${combosUsingVersion.length} combo(s).`
        );
      }

      // Soft delete by setting deletedAt in metadata
      const deletedVersion: PartVersion = {
        ...previous,
        metadata: {
          ...previous.metadata,
          [METADATA_DELETED_AT]: this.clock.now(),
        },
      };

      const versions = [...snapshot.versions];
      versions[index] = deletedVersion;

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        versions: sortById(versions),
      };

      return {
        snapshot: nextSnapshot,
        result: previous, // Return the state before deletion
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'version:removed',
            payload: {
              projectId: this.projectId,
              partId: deletedVersion.partId,
              versionId,
              removedVersion: deletedVersion,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Deletes a part and all its versions from the project.
   * Throws an error if the part is referenced by any combo.
   */
  async deletePart(partId: PartId): Promise<PartDefinition> {
    const result = await this.commitMutation<PartDefinition>((snapshot) => {
      const index = snapshot.parts.findIndex((part) => part.id === partId);
      if (index === -1) {
        throw new PartNotFoundError(partId);
      }

      const previous = snapshot.parts[index]!;

      // Check if already soft-deleted
      if (this.isPartDeleted(previous)) {
        throw new Error(`Part ${partId as string} is already deleted.`);
      }

      // Check if part is referenced by any combo
      const combosUsingPart = snapshot.combos.filter((combo) =>
        combo.bindings.some((binding) => binding.partId === partId)
      );
      if (combosUsingPart.length > 0) {
        throw new Error(
          `Cannot delete part ${partId as string}: it is referenced by ${combosUsingPart.length} combo(s).`
        );
      }

      // Soft delete by setting deletedAt in metadata
      const deletedPart: PartDefinition = {
        ...previous,
        metadata: {
          ...previous.metadata,
          [METADATA_DELETED_AT]: this.clock.now(),
        },
      };

      const parts = [...snapshot.parts];
      parts[index] = deletedPart;

      // Cascade: soft-delete all versions of this part
      const versions = snapshot.versions.map((version) =>
        version.partId === partId && !this.isVersionDeleted(version)
          ? {
              ...version,
              metadata: {
                ...version.metadata,
                [METADATA_DELETED_AT]: this.clock.now(),
              },
            }
          : version
      );

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        parts: sortById(parts),
        versions: sortById(versions),
      };

      return {
        snapshot: nextSnapshot,
        result: previous, // Return the state before deletion
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'part:removed',
            payload: {
              projectId: this.projectId,
              partId,
              removedPart: deletedPart,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Adds a new combo to the project.
   */
  async addCombo(comboInit: VersionComboInit): Promise<VersionCombo> {
    const result = await this.commitMutation<VersionCombo>((snapshot) => {
      const comboId = createComboId(comboInit.id);
      if (snapshot.combos.some((existing) => existing.id === comboId)) {
        throw new ComboAlreadyExistsError(comboId);
      }

      // Validate all bindings reference existing parts and versions
      this.validateBindings(comboInit.bindings, snapshot);

      const timestamp = this.clock.now();
      const combo: VersionCombo = {
        id: comboId,
        name: comboInit.name,
        description: comboInit.description,
        bindings: comboInit.bindings,
        createdAt: timestamp,
        updatedAt: timestamp,
        metadata: comboInit.metadata,
        owner: comboInit.owner,
      };

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        combos: sortById([...snapshot.combos, combo]),
      };

      return {
        snapshot: nextSnapshot,
        result: combo,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'combo:added',
            payload: {
              projectId: this.projectId,
              combo,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Updates an existing combo.
   */
  async updateCombo(
    comboId: ComboId,
    mutator: (combo: VersionCombo) => VersionCombo
  ): Promise<VersionCombo> {
    const result = await this.commitMutation<VersionCombo>((snapshot) => {
      const index = snapshot.combos.findIndex((combo) => combo.id === comboId);
      if (index === -1) {
        throw new ComboNotFoundError(comboId);
      }

      const previous = snapshot.combos[index]!;
      const nextCombo = mutator(previous);

      if (nextCombo.id !== previous.id) {
        throw new IdentifierChangeError('Combo');
      }

      // Validate all bindings reference existing parts and versions
      this.validateBindings(nextCombo.bindings, snapshot);

      const combo: VersionCombo = {
        ...nextCombo,
        updatedAt: this.clock.now(),
      };

      const combos = [...snapshot.combos];
      combos[index] = combo;

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        combos: sortById(combos),
      };

      return {
        snapshot: nextSnapshot,
        result: combo,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'combo:updated',
            payload: {
              projectId: this.projectId,
              combo,
              previous,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Gets the current parts order from project metadata.
   * Returns all part IDs if no custom order is defined.
   */
  getPartsOrder(): readonly PartId[] {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return [];
    }
    return this.getPartsOrderFromSnapshot(snapshot);
  }

  /**
   * Sets the parts order, replacing the entire order at once.
   * All part IDs must exist in the project and must be unique.
   */
  async setPartsOrder(partIds: readonly PartId[]): Promise<void> {
    await this.commitMutation<void>((snapshot) => {
      // Validate all part IDs exist and are unique
      this.validatePartsOrder(partIds, snapshot);

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        project: {
          ...snapshot.project,
          metadata: {
            ...snapshot.project.metadata,
            [METADATA_PARTS_ORDER]: partIds,
          },
        },
      };

      return {
        snapshot: nextSnapshot,
        result: undefined,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'partsOrder:updated',
            payload: {
              projectId: this.projectId,
              partsOrder: partIds,
              previousOrder: this.getPartsOrderFromSnapshot(snapshot),
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });
  }

  /**
   * Moves a single part to a new position in the order.
   * Creates a parts order if one doesn't exist.
   */
  async movePartOrder(partId: PartId, newPosition: number): Promise<void> {
    await this.commitMutation<void>((snapshot) => {
      // Verify part exists
      if (!snapshot.parts.some((p) => p.id === partId)) {
        throw new PartNotFoundError(partId);
      }

      const currentOrder = this.getPartsOrderFromSnapshot(snapshot);

      // If part is not in current order, we need to add it
      let workingOrder = [...currentOrder];
      const currentIndex = workingOrder.findIndex((id) => id === partId);

      if (currentIndex === -1) {
        // Part not in order - insert at new position
        workingOrder.splice(newPosition, 0, partId);
      } else {
        // Remove from current position and insert at new position
        workingOrder.splice(currentIndex, 1);
        workingOrder.splice(newPosition, 0, partId);
      }

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        project: {
          ...snapshot.project,
          metadata: {
            ...snapshot.project.metadata,
            [METADATA_PARTS_ORDER]: workingOrder,
          },
        },
      };

      return {
        snapshot: nextSnapshot,
        result: undefined,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'partsOrder:updated',
            payload: {
              projectId: this.projectId,
              partsOrder: workingOrder,
              previousOrder: currentOrder,
              snapshot: finalSnapshot,
            },
          }),
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });
  }

  /**
   * Permanently removes soft-deleted parts from the project.
   * Returns the removed parts.
   */
  async cleanDeletedParts(): Promise<readonly PartDefinition[]> {
    const result = await this.commitMutation<readonly PartDefinition[]>((snapshot) => {
      const deletedParts = snapshot.parts.filter((p) => this.isPartDeleted(p));

      if (deletedParts.length === 0) {
        return {
          snapshot,
          result: [],
          events: [],
        };
      }

      // Remove deleted parts from the array
      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        parts: sortById(snapshot.parts.filter((p) => !this.isPartDeleted(p))),
        // Also remove versions belonging to deleted parts
        versions: sortById(
          snapshot.versions.filter((v) => !deletedParts.some((p) => p.id === v.partId))
        ),
      };

      return {
        snapshot: nextSnapshot,
        result: deletedParts,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
  }

  /**
   * Permanently removes soft-deleted versions from the project.
   * Returns the removed versions.
   */
  async cleanDeletedVersions(): Promise<readonly PartVersion[]> {
    const result = await this.commitMutation<readonly PartVersion[]>((snapshot) => {
      const deletedVersions = snapshot.versions.filter((v) => this.isVersionDeleted(v));

      if (deletedVersions.length === 0) {
        return {
          snapshot,
          result: [],
          events: [],
        };
      }

      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        versions: sortById(snapshot.versions.filter((v) => !this.isVersionDeleted(v))),
      };

      return {
        snapshot: nextSnapshot,
        result: deletedVersions,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'project:updated',
            payload: { projectId: this.projectId, snapshot: finalSnapshot },
          }),
        ],
      };
    });

    return cloneValue(result);
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

      await this.events.emit('project:closed', { projectId: this.projectId });
    });
  }

  private async ensureSnapshot(): Promise<ProjectSnapshot> {
    this.assertOpen();
    if (this.snapshotCache) {
      return this.snapshotCache;
    }

    const snapshot = await this.loader();
    if (!snapshot) {
      throw new ProjectNotInStorageError(this.projectId);
    }

    this.snapshotCache = cloneValue(snapshot);
    return this.snapshotCache;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ProjectClosedError(this.projectId);
    }
  }

  private validateBindings(bindings: readonly VersionBinding[], snapshot: ProjectSnapshot): void {
    const partIds = new Set(snapshot.parts.map((p) => p.id));
    const versionToPart = new Map(snapshot.versions.map((v) => [v.id, v.partId]));

    for (const binding of bindings) {
      if (!partIds.has(binding.partId)) {
        throw new UnknownPartReferenceError(binding.partId);
      }
      const owningPartId = versionToPart.get(binding.versionId);
      if (!owningPartId) {
        throw new UnknownVersionReferenceError(binding.versionId);
      }
      if (owningPartId !== binding.partId) {
        throw new UnknownVersionReferenceError(binding.versionId);
      }
    }
  }

  private async persistIfDirty(): Promise<void> {
    if (!this.snapshotCache || !this.dirty) {
      return;
    }

    await this.storage.saveSnapshot(this.snapshotCache);
    this.dirty = false;
  }

  private async commitMutation<Result>(
    mutator: (snapshot: ProjectSnapshot) => MutationResult<Result>
  ): Promise<Result> {
    return this.mutex.runExclusive(async () => {
      this.assertOpen();
      const current = await this.ensureSnapshot();
      const draft = cloneValue(current);

      const { snapshot, result, events } = mutator(draft);
      const updatedAt = this.clock.now();

      const finalSnapshot: ProjectSnapshot = {
        ...snapshot,
        project: {
          ...snapshot.project,
          updatedAt,
        },
      };

      this.snapshotCache = cloneValue(finalSnapshot);
      this.dirty = true;

      if (events) {
        for (const factory of events) {
          const event = factory(finalSnapshot);
          await this.events.emit(event.name, event.payload);
        }
      }

      return cloneValue(result);
    });
  }
}
