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
});
