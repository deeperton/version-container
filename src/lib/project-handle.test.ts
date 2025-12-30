import { describe, expect, it, vi } from 'vitest';

import type { AdapterId, ISO8601Timestamp, PartId, PartVersionId } from '../models/base.js';
import type { ProjectInit } from '../models/project.js';
import { InMemoryStorageProvider } from '../storages/in-memory/in-memory-storage.js';
import { buildProjectSnapshot } from './project-snapshot-builder.js';
import { ProjectHandle } from './project-handle.js';
import { TestClock } from './mocks/test-clock.js';
import { ProjectEventDispatcher } from './events/project-events.js';

const initialTime = '2024-02-01T12:00:00.000Z' as ISO8601Timestamp;

const createHandle = async (
  init: ProjectInit,
  clock: TestClock
): Promise<{
  handle: ProjectHandle;
  storage: InMemoryStorageProvider;
  events: ProjectEventDispatcher;
}> => {
  const storage = new InMemoryStorageProvider();
  const snapshot = buildProjectSnapshot(init, { clock });
  await storage.saveSnapshot(snapshot);

  const events = new ProjectEventDispatcher();
  const handle = new ProjectHandle({
    projectId: snapshot.project.id,
    storage,
    adapters: [],
    clock,
    events,
    initialSnapshot: snapshot,
  });

  return { handle, storage, events };
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

  it('adds a part and emits notifications', async () => {
    const clock = new TestClock(initialTime);
    const { handle, events } = await createHandle({ name: 'Parts' }, clock);

    const listener = vi.fn();
    events.subscribe('part:added', listener);

    const part = await handle.addPart({
      id: 'engine' as PartId,
      name: 'Engine Controller',
      adapterId: 'adapter-in-memory' as AdapterId,
      versions: [
        {
          id: 'engine-v1' as PartVersionId,
          locator: { uri: 'memory://engine@1.0.0' },
        },
      ],
    });

    expect(part.name).toBe('Engine Controller');
    expect(listener).toHaveBeenCalledTimes(1);
    const [payload] = listener.mock.calls[0]!;
    expect(payload.part.id).toBe(part.id);
    expect(payload.snapshot.parts).toHaveLength(1);

    const snapshot = await handle.getSnapshot();
    expect(snapshot.parts).toHaveLength(1);
    expect(snapshot.versions).toHaveLength(1);
  });

  it('updates a part and emits event', async () => {
    const clock = new TestClock(initialTime);
    const { handle, events } = await createHandle(
      {
        name: 'Update Part',
        parts: [
        {
          id: 'engine' as PartId,
          name: 'Engine Controller',
          adapterId: 'adapter-in-memory' as AdapterId,
        },
      ],
      },
      clock
    );

    const listener = vi.fn();
    events.subscribe('part:updated', listener);

    const updated = await handle.updatePart('engine' as PartId, (part) => ({
      ...part,
      description: 'Updated description',
    }));

    expect(updated.description).toBe('Updated description');
    expect(listener).toHaveBeenCalledTimes(1);
    const [payload] = listener.mock.calls[0]!;
    expect(payload.previous.description).toBeUndefined();
    expect(payload.part.description).toBe('Updated description');
  });

  it('adds and updates a part version with notifications', async () => {
    const clock = new TestClock(initialTime);
    const { handle, events } = await createHandle(
      {
        name: 'Versions',
        parts: [
        {
          id: 'engine' as PartId,
          name: 'Engine Controller',
          adapterId: 'adapter-in-memory' as AdapterId,
        },
      ],
      },
      clock
    );

    const added = vi.fn();
    events.subscribe('version:added', added);

    const version = await handle.addPartVersion('engine' as PartId, {
      id: 'engine-v1' as PartVersionId,
      locator: { uri: 'memory://engine@1.0.0' },
    });

    expect(version.partId).toBe('engine');
    expect(added).toHaveBeenCalledTimes(1);

    const updatedListener = vi.fn();
    events.subscribe('version:updated', updatedListener);

    const updated = await handle.updatePartVersion(version.id, (current) => ({
      ...current,
      label: '1.0.1',
    }));

    expect(updated.label).toBe('1.0.1');
    expect(updatedListener).toHaveBeenCalledTimes(1);
    const [payload] = updatedListener.mock.calls[0]!;
    expect(payload.version.label).toBe('1.0.1');
    expect(payload.previous.label).toBeUndefined();
  });
});
