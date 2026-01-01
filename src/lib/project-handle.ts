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

type MutationEventFactory = (
  snapshot: ProjectSnapshot
) => { readonly name: ProjectEventName; readonly payload: ProjectEventMap[ProjectEventName] };

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
        return true;
      })
      .map((combo) => combo.id);
  }

  /**
   * Gets a part by ID, or undefined if not found.
   */
  getPartById(id: PartId): PartDefinition | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const part = snapshot.parts.find((p) => p.id === id);
    return part ? cloneValue(part) : undefined;
  }

  /**
   * Gets a version by ID, or undefined if not found.
   */
  getVersionById(id: PartVersionId): PartVersion | undefined {
    const snapshot = this.snapshotCache;
    if (!snapshot) {
      return undefined;
    }
    const version = snapshot.versions.find((v) => v.id === id);
    return version ? cloneValue(version) : undefined;
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
    return { id: part.id, name: part.name, description: part.description };
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
    return { id: version.id, label: version.label };
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
    return { id: combo.id, name: combo.name, description: combo.description };
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
        throw new Error(`Part ${partId as string} already exists in project.`);
      }

      const part: PartDefinition = {
        id: partId,
        name: partInit.name,
        description: partInit.description,
        adapterId: partInit.adapterId,
        tags: partInit.tags,
        metadata: partInit.metadata,
      };

      const existingVersionIds = new Set(snapshot.versions.map((version) => version.id));
      const newVersions: PartVersion[] = [];

      for (const versionInit of partInit.versions ?? []) {
        const versionId = createPartVersionId(versionInit.id);
        if (existingVersionIds.has(versionId)) {
          throw new Error(`Version ${versionId as string} already exists in project.`);
        }
        if (newVersions.some((version) => version.id === versionId)) {
          throw new Error(`Duplicate version identifier ${versionId as string} in part seed data.`);
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
        throw new Error(`Part ${partId as string} does not exist.`);
      }

      const previous = snapshot.parts[index]!;
      const nextPart = mutator(previous);

      if (nextPart.id !== previous.id) {
        throw new Error('Part identifier cannot be changed during update.');
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
        throw new Error(`Cannot add version; part ${partId as string} does not exist.`);
      }

      const versionId = createPartVersionId(versionInit.id);
      if (snapshot.versions.some((version) => version.id === versionId)) {
        throw new Error(`Version ${versionId as string} already exists.`);
      }

      const version: PartVersion = {
        id: versionId,
        partId,
        label: versionInit.label,
        locator: versionInit.locator,
        metadata: versionInit.metadata,
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
        throw new Error(`Version ${versionId as string} does not exist.`);
      }

      const previous = snapshot.versions[index]!;
      const nextVersion = mutator(previous);

      if (nextVersion.id !== previous.id) {
        throw new Error('Version identifier cannot be changed during update.');
      }

      if (nextVersion.partId !== previous.partId) {
        throw new Error('Version cannot be reassigned to a different part.');
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
        throw new Error(`Combo ${comboId as string} does not exist.`);
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
        throw new Error(`Version ${versionId as string} does not exist.`);
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

      const removedVersion = snapshot.versions[index]!;
      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        versions: sortById(snapshot.versions.filter((v) => v.id !== versionId)),
      };

      return {
        snapshot: nextSnapshot,
        result: removedVersion,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'version:removed',
            payload: {
              projectId: this.projectId,
              partId: removedVersion.partId,
              versionId,
              removedVersion,
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
        throw new Error(`Part ${partId as string} does not exist.`);
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

      const removedPart = snapshot.parts[index]!;
      const nextSnapshot: ProjectSnapshot = {
        ...snapshot,
        parts: sortById(snapshot.parts.filter((part) => part.id !== partId)),
        versions: sortById(snapshot.versions.filter((version) => version.partId !== partId)),
      };

      return {
        snapshot: nextSnapshot,
        result: removedPart,
        events: [
          (finalSnapshot: ProjectSnapshot): MutationEvent => ({
            name: 'part:removed',
            payload: {
              projectId: this.projectId,
              partId,
              removedPart,
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
        throw new Error(`Combo ${comboId as string} already exists in project.`);
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
        throw new Error(`Combo ${comboId as string} does not exist.`);
      }

      const previous = snapshot.combos[index]!;
      const nextCombo = mutator(previous);

      if (nextCombo.id !== previous.id) {
        throw new Error('Combo identifier cannot be changed during update.');
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

  private validateBindings(bindings: readonly VersionBinding[], snapshot: ProjectSnapshot): void {
    const partIds = new Set(snapshot.parts.map((p) => p.id));
    const versionToPart = new Map(snapshot.versions.map((v) => [v.id, v.partId]));

    for (const binding of bindings) {
      if (!partIds.has(binding.partId)) {
        throw new Error(`Unknown part referenced: ${binding.partId as string}`);
      }
      const owningPartId = versionToPart.get(binding.versionId);
      if (!owningPartId) {
        throw new Error(`Unknown version referenced: ${binding.versionId as string}`);
      }
      if (owningPartId !== binding.partId) {
        throw new Error(
          `Version ${binding.versionId as string} does not belong to part ${binding.partId as string}`
        );
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
