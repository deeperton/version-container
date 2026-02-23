import type {
  AdapterId,
  ComboId,
  ISO8601Timestamp,
  PartId,
  PartVersionId,
  ProjectId,
} from '../../../models/base.js';
import type { PartDefinition, PartVersion } from '../../../models/part.js';
import type { ProjectSnapshot } from '../../../models/project.js';
import type { VersionCombo } from '../../../models/combo.js';
import { cloneValue } from '../../../lib/utils/clone.js';

const toProjectId = (value: string): ProjectId => value as ProjectId;
const toPartId = (value: string): PartId => value as PartId;
const toPartVersionId = (value: string): PartVersionId => value as PartVersionId;
const toComboId = (value: string): ComboId => value as ComboId;
const toAdapterId = (value: string): AdapterId => value as AdapterId;
const toTimestamp = (value: string): ISO8601Timestamp => value as ISO8601Timestamp;

const baseParts: readonly PartDefinition[] = [
  {
    id: toPartId('part-1'),
    name: 'Engine',
    adapterId: toAdapterId('adapter-in-memory'),
  },
];

const baseVersions: readonly PartVersion[] = [
  {
    id: toPartVersionId('version-1'),
    partId: toPartId('part-1'),
    locator: {
      uri: 'memory://engine@1.0.0',
    },
  },
];

const baseCombos: readonly VersionCombo[] = [
  {
    id: toComboId('combo-1'),
    name: 'default',
    bindings: [
      {
        partId: toPartId('part-1'),
        versionId: toPartVersionId('version-1'),
      },
    ],
    createdAt: toTimestamp('2023-01-01T00:00:00.000Z'),
    updatedAt: toTimestamp('2023-01-01T00:00:00.000Z'),
  },
];

const baseSnapshot: ProjectSnapshot = {
  schemaVersion: 1,
  project: {
    id: toProjectId('project-1'),
    name: 'Demo Project',
    description: 'Initial project snapshot',
    metadata: { owner: 'demo' },
    createdAt: toTimestamp('2023-01-01T00:00:00.000Z'),
    updatedAt: toTimestamp('2023-01-01T00:00:00.000Z'),
  },
  parts: baseParts,
  versions: baseVersions,
  combos: baseCombos,
  locks: [],
  tags: [],
};

export type SnapshotOverrides = Partial<Omit<ProjectSnapshot, 'project'>> & {
  readonly project?: Partial<ProjectSnapshot['project']>;
};

export const createProjectSnapshot = (overrides: SnapshotOverrides = {}): ProjectSnapshot => {
  const snapshot = cloneValue(baseSnapshot);

  const project = { ...snapshot.project, ...overrides.project };

  return {
    ...snapshot,
    ...overrides,
    project,
    parts: overrides.parts ?? snapshot.parts,
    versions: overrides.versions ?? snapshot.versions,
    combos: overrides.combos ?? snapshot.combos,
    locks: overrides.locks ?? snapshot.locks,
    tags: overrides.tags ?? snapshot.tags,
  };
};
