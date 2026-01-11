import type { PartAdapter } from '../models/adapter.js';
import type { ProjectInit, ProjectSnapshot } from '../models/project.js';
import type { PartDefinition, PartVersion } from '../models/part.js';
import type { PartId, PartVersionId } from '../models/base.js';
import type { VersionCombo } from '../models/combo.js';
import {
  DuplicateIdentifierError,
  UnknownPartReferenceError,
  UnknownVersionReferenceError,
} from './errors.js';
import type { Clock } from './clock.js';
import {
  createComboId,
  createPartId,
  createPartVersionId,
  createProjectId,
} from './ids.js';

interface BuildProjectSnapshotOptions {
  readonly clock: Clock;
  readonly schemaVersion?: number;
  readonly adapters?: readonly PartAdapter[];
}

const DEFAULT_SCHEMA_VERSION = 1;

const sortById = <Entity extends { id: string }>(items: Entity[]): Entity[] =>
  items.sort((left, right) => left.id.localeCompare(right.id));

/**
 * Builds a fully realised {@link ProjectSnapshot} from the provided initialization data.
 *
 * @param init - Initial project definition supplied by the caller.
 * @param options - Builder configuration.
 * @returns A snapshot ready to be persisted via a {@link StorageProvider}.
 */
export const buildProjectSnapshot = (
  init: ProjectInit,
  options: BuildProjectSnapshotOptions
): ProjectSnapshot => {
  const clock = options.clock;
  const timestamp = clock.now();
  const projectId = createProjectId(init.id);

  const partIdMap = new Map<string, PartId>();
  const versionIdMap = new Map<string, PartVersionId>();
  const versionToPart = new Map<PartVersionId, PartId>();

  const ensureUnique = (map: Map<string, string>, id: string | undefined, type: 'part' | 'version'): void => {
    if (!id) {
      return;
    }

    if (map.has(id)) {
      throw new DuplicateIdentifierError(type, id);
    }

    map.set(id, id);
  };

  const parts: PartDefinition[] = [];
  const versions: PartVersion[] = [];

  for (const partInit of init.parts ?? []) {
    ensureUnique(partIdMap, partInit.id, 'part');
    const partId = createPartId(partInit.id);
    partIdMap.set(partId, partId);

    const definition: PartDefinition = {
      id: partId,
      name: partInit.name,
      description: partInit.description,
      adapterId: partInit.adapterId,
      tags: partInit.tags,
      metadata: partInit.metadata,
    };
    parts.push(definition);

    for (const versionInit of partInit.versions ?? []) {
      ensureUnique(versionIdMap, versionInit.id, 'version');
      const versionId = createPartVersionId(versionInit.id);
      versionIdMap.set(versionId, versionId);
      versionToPart.set(versionId, partId);

      const version: PartVersion = {
        id: versionId,
        partId,
        label: versionInit.label,
        locator: versionInit.locator,
        metadata: versionInit.metadata,
      };
      versions.push(version);
    }
  }

  const versionExists = (binding: { partId: PartId; versionId: PartVersionId }): void => {
    const owningPartId = versionToPart.get(binding.versionId);
    if (!owningPartId) {
      throw new UnknownVersionReferenceError(binding.versionId);
    }

    if (owningPartId !== binding.partId) {
      throw new UnknownVersionReferenceError(binding.versionId);
    }
  };

  const combos: VersionCombo[] = [];
  for (const comboInit of init.combos ?? []) {
    const comboId = createComboId(comboInit.id);
    const definition: VersionCombo = {
      id: comboId,
      name: comboInit.name,
      description: comboInit.description,
      bindings: comboInit.bindings.map((binding) => {
        const partId = partIdMap.get(binding.partId as unknown as string) ?? binding.partId;
        if (!partIdMap.has(partId)) {
          throw new UnknownPartReferenceError(partId);
        }

        const versionId =
          versionIdMap.get(binding.versionId as unknown as string) ?? binding.versionId;

        versionExists({ partId, versionId });
        return {
          partId,
          versionId,
        };
      }),
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: comboInit.metadata,
    };
    combos.push(definition);
  }

  // TODO(middleware): project:create hook could observe initial snapshot before persistence.

  return {
    schemaVersion: options.schemaVersion ?? DEFAULT_SCHEMA_VERSION,
    project: {
      id: projectId,
      name: init.name,
      description: init.description,
      metadata: init.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    parts: sortById(parts),
    versions: sortById(versions),
    combos: sortById(combos),
    locks: [],
  };
};
