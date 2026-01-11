import { describe, expect, it } from 'vitest';

import type {
  AdapterId,
  ComboId,
  ISO8601Timestamp,
  PartId,
  PartVersionId,
  ProjectId,
} from '../models/base.js';
import type { ProjectInit } from '../models/project.js';
import {
  DuplicateIdentifierError,
  UnknownVersionReferenceError,
} from './errors.js';
import { buildProjectSnapshot } from './project-snapshot-builder.js';
import { TestClock } from './mocks/test-clock.js';

const fixedTime = '2024-01-01T00:00:00.000Z' as ISO8601Timestamp;

describe('buildProjectSnapshot', () => {
  it('produces deterministic snapshot with generated identifiers', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Demo',
      parts: [
        {
          id: 'engine' as PartId,
          name: 'Engine',
          adapterId: 'adapter-in-memory' as AdapterId,
          versions: [
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://engine@1.0.0' },
            },
          ],
        },
      ],
      combos: [
        {
          id: 'baseline' as ComboId,
          name: 'Baseline',
          bindings: [
            {
              partId: 'engine' as PartId,
              versionId: 'v1.0.0' as PartVersionId,
            },
          ],
        },
      ],
    };

    const snapshot = buildProjectSnapshot(init, { clock });

    expect(snapshot.project.name).toBe('Demo');
    expect(snapshot.project.createdAt).toBe(fixedTime);
    expect(snapshot.parts).toHaveLength(1);
    expect(snapshot.versions).toHaveLength(1);
    expect(snapshot.combos[0]?.bindings).toEqual([
      {
        partId: 'engine',
        versionId: 'v1.0.0',
      },
    ]);
  });

  it('throws when duplicate part identifiers are provided', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Duplicate Parts',
      parts: [
        {
          id: 'shared-id' as PartId,
          name: 'One',
          adapterId: 'adapter' as AdapterId,
        },
        {
          id: 'shared-id' as PartId,
          name: 'Two',
          adapterId: 'adapter' as AdapterId,
        },
      ],
    };

    expect(() => buildProjectSnapshot(init, { clock })).toThrow(/Duplicate part identifier/);
  });

  it('throws when combo references missing version', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      id: 'demo' as ProjectId,
      name: 'Missing Version',
      parts: [
        {
          id: 'engine' as PartId,
          name: 'Engine',
          adapterId: 'adapter' as unknown as never,
        },
      ],
      combos: [
        {
          id: 'combo-1' as ComboId,
          name: 'Broken',
          bindings: [
            {
              partId: 'engine' as PartId,
              versionId: 'missing' as PartVersionId,
            },
          ],
        },
      ],
    };

    expect(() => buildProjectSnapshot(init, { clock })).toThrow(/Unknown version referenced/);
  });

  it('empty parts and combos arrays produces valid snapshot', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Empty Project',
    };

    const snapshot = buildProjectSnapshot(init, { clock });

    expect(snapshot.project.name).toBe('Empty Project');
    expect(snapshot.parts).toEqual([]);
    expect(snapshot.versions).toEqual([]);
    expect(snapshot.combos).toEqual([]);
    expect(snapshot.locks).toEqual([]);
  });

  it('throws when duplicate version identifiers across different parts', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Duplicate Versions',
      parts: [
        {
          id: 'part-a' as PartId,
          name: 'Part A',
          adapterId: 'adapter' as AdapterId,
          versions: [
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://a@1.0.0' },
            },
          ],
        },
        {
          id: 'part-b' as PartId,
          name: 'Part B',
          adapterId: 'adapter' as AdapterId,
          versions: [
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://b@1.0.0' },
            },
          ],
        },
      ],
    };

    expect(() => buildProjectSnapshot(init, { clock })).toThrow(DuplicateIdentifierError);
  });

  it('throws when combo binding references non-existent part', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Missing Part',
      parts: [
        {
          id: 'engine' as PartId,
          name: 'Engine',
          adapterId: 'adapter' as AdapterId,
          versions: [
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://engine@1.0.0' },
            },
          ],
        },
      ],
      combos: [
        {
          id: 'combo-1' as ComboId,
          name: 'Broken',
          bindings: [
            {
              partId: 'non-existent-part' as PartId,
              versionId: 'v1.0.0' as PartVersionId,
            },
          ],
        },
      ],
    };

    expect(() => buildProjectSnapshot(init, { clock })).toThrow(/Unknown part referenced/);
  });

  it('throws when combo binding version belongs to different part', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Wrong Part',
      parts: [
        {
          id: 'engine' as PartId,
          name: 'Engine',
          adapterId: 'adapter' as AdapterId,
          versions: [
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://engine@1.0.0' },
            },
          ],
        },
        {
          id: 'wheels' as PartId,
          name: 'Wheels',
          adapterId: 'adapter' as AdapterId,
        },
      ],
      combos: [
        {
          id: 'combo-1' as ComboId,
          name: 'Broken',
          bindings: [
            {
              partId: 'wheels' as PartId,
              versionId: 'v1.0.0' as PartVersionId,
            },
          ],
        },
      ],
    };

    expect(() => buildProjectSnapshot(init, { clock })).toThrow(
      UnknownVersionReferenceError
    );
  });

  it('preserves custom schemaVersion in output', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Custom Schema',
    };

    const snapshot = buildProjectSnapshot(init, { clock, schemaVersion: 2 });

    expect(snapshot.schemaVersion).toBe(2);
  });

  it('uses default schemaVersion when not provided', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Default Schema',
    };

    const snapshot = buildProjectSnapshot(init, { clock });

    expect(snapshot.schemaVersion).toBe(1);
  });

  it('project without ID gets generated UUID', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Auto ID',
    };

    const snapshot = buildProjectSnapshot(init, { clock });
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(snapshot.project.id).toMatch(uuidRegex);
  });

  it('sorts parts by ID in output', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Sorted Parts',
      parts: [
        {
          id: 'zebra' as PartId,
          name: 'Zebra',
          adapterId: 'adapter' as AdapterId,
        },
        {
          id: 'apple' as PartId,
          name: 'Apple',
          adapterId: 'adapter' as AdapterId,
        },
      ],
    };

    const snapshot = buildProjectSnapshot(init, { clock });

    expect(snapshot.parts[0]?.id).toBe('apple');
    expect(snapshot.parts[1]?.id).toBe('zebra');
  });

  it('sorts versions by ID in output', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Sorted Versions',
      parts: [
        {
          id: 'part' as PartId,
          name: 'Part',
          adapterId: 'adapter' as AdapterId,
          versions: [
            {
              id: 'v3.0.0' as PartVersionId,
              locator: { uri: 'memory://@3.0.0' },
            },
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://@1.0.0' },
            },
          ],
        },
      ],
    };

    const snapshot = buildProjectSnapshot(init, { clock });

    expect(snapshot.versions[0]?.id).toBe('v1.0.0');
    expect(snapshot.versions[1]?.id).toBe('v3.0.0');
  });

  it('sorts combos by ID in output', () => {
    const clock = new TestClock(fixedTime);
    const init: ProjectInit = {
      name: 'Sorted Combos',
      parts: [
        {
          id: 'part' as PartId,
          name: 'Part',
          adapterId: 'adapter' as AdapterId,
          versions: [
            {
              id: 'v1.0.0' as PartVersionId,
              locator: { uri: 'memory://@1.0.0' },
            },
          ],
        },
      ],
      combos: [
        {
          id: 'zebra-combo' as ComboId,
          name: 'Zebra',
          bindings: [
            {
              partId: 'part' as PartId,
              versionId: 'v1.0.0' as PartVersionId,
            },
          ],
        },
        {
          id: 'apple-combo' as ComboId,
          name: 'Apple',
          bindings: [
            {
              partId: 'part' as PartId,
              versionId: 'v1.0.0' as PartVersionId,
            },
          ],
        },
      ],
    };

    const snapshot = buildProjectSnapshot(init, { clock });

    expect(snapshot.combos[0]?.id).toBe('apple-combo');
    expect(snapshot.combos[1]?.id).toBe('zebra-combo');
  });
});
