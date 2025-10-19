import { describe, expect, it } from 'vitest';

import type { ISO8601Timestamp } from '../models/base.js';
import type { ProjectInit } from '../models/project.js';
import { InMemoryStorageProvider } from '../storages/in-memory/in-memory-storage.js';
import { buildProjectSnapshot } from './project-snapshot-builder.js';
import { ProjectHandle } from './project-handle.js';
import { TestClock } from './mocks/test-clock.js';

const initialTime = '2024-02-01T12:00:00.000Z' as ISO8601Timestamp;

const createHandle = async (
  init: ProjectInit,
  clock: TestClock
): Promise<{ handle: ProjectHandle; storage: InMemoryStorageProvider }> => {
  const storage = new InMemoryStorageProvider();
  const snapshot = buildProjectSnapshot(init, { clock });
  await storage.saveSnapshot(snapshot);

  const handle = new ProjectHandle({
    projectId: snapshot.project.id,
    storage,
    adapters: [],
    clock,
    initialSnapshot: snapshot,
  });

  return { handle, storage };
};

describe('ProjectHandle', () => {
  it('returns cloned snapshots that can be mutated safely', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'Mutable' }, clock);

    const snapshot = await handle.getSnapshot();
    expect(snapshot.project.name).toBe('Mutable');

    (snapshot.project as { name: string }).name = 'Changed';
    const fresh = await handle.getSnapshot();
    expect(fresh.project.name).toBe('Mutable');
  });

  it('updates snapshot and saves changes to storage', async () => {
    const clock = new TestClock(initialTime);
    const { handle, storage } = await createHandle({ name: 'Persisted' }, clock);

    clock.advance('2024-02-02T12:00:00.000Z' as ISO8601Timestamp);
    await handle.update((snapshot) => ({
      ...snapshot,
      project: {
        ...snapshot.project,
        description: 'Updated',
      },
    }));

    expect(handle.isDirty()).toBe(true);

    await handle.save();
    expect(handle.isDirty()).toBe(false);

    const persisted = await handle.getSnapshot();
    expect(persisted.project.description).toBe('Updated');
    expect(persisted.project.updatedAt).toBe('2024-02-02T12:00:00.000Z');

    const stored = await storage.loadSnapshot(persisted.project.id);
    expect(stored?.project.description).toBe('Updated');
  });

  it('serializes concurrent updates', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'Concurrent' }, clock);

    const first = handle.update((snapshot) => ({
      ...snapshot,
      project: {
        ...snapshot.project,
        metadata: {
          ...snapshot.project.metadata,
          first: true,
        },
      },
    }));

    const second = handle.update((snapshot) => ({
      ...snapshot,
      project: {
        ...snapshot.project,
        metadata: {
          ...snapshot.project.metadata,
          second: true,
        },
      },
    }));

    await Promise.all([first, second]);

    const result = await handle.getSnapshot();
    expect(result.project.metadata).toMatchObject({ first: true, second: true });
  });

  it('prevents further operations after close', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'Closable' }, clock);

    await handle.close({ save: false });

    await expect(handle.getSnapshot()).rejects.toThrow(/has been closed/);
  });
});
