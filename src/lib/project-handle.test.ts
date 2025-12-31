import { describe, expect, it, vi } from 'vitest';

import type {
  AdapterId,
  ComboId,
  ISO8601Timestamp,
  PartId,
  PartVersionId,
  ProjectId,
} from '../models/base.js';
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

  it('refresh when project does not exist throws error', async () => {
    const clock = new TestClock(initialTime);
    const storage = new InMemoryStorageProvider();
    const events = new ProjectEventDispatcher();

    const handle = new ProjectHandle({
      projectId: 'non-existent' as ProjectId,
      storage,
      adapters: [],
      clock,
      events,
    });

    await expect(handle.refresh()).rejects.toThrow(/does not exist in storage/);
  });

  it('updatePart attempting to change ID throws error', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle(
      {
        name: 'Update Part ID',
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

    await expect(
      handle.updatePart('engine' as PartId, (part) => ({
        ...part,
        id: 'new-id' as PartId,
      }))
    ).rejects.toThrow(/identifier cannot be changed/);
  });

  it('updatePartVersion attempting to change ID throws error', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle(
      {
        name: 'Update Version ID',
        parts: [
          {
            id: 'engine' as PartId,
            name: 'Engine Controller',
            adapterId: 'adapter-in-memory' as AdapterId,
            versions: [
              {
                id: 'v1' as PartVersionId,
                locator: { uri: 'memory://engine@1.0.0' },
              },
            ],
          },
        ],
      },
      clock
    );

    await expect(
      handle.updatePartVersion('v1' as PartVersionId, (version) => ({
        ...version,
        id: 'v2' as PartVersionId,
      }))
    ).rejects.toThrow(/identifier cannot be changed/);
  });

  it('updatePartVersion attempting to change partId throws error', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle(
      {
        name: 'Reassign Version',
        parts: [
          {
            id: 'engine' as PartId,
            name: 'Engine Controller',
            adapterId: 'adapter-in-memory' as AdapterId,
            versions: [
              {
                id: 'v1' as PartVersionId,
                locator: { uri: 'memory://engine@1.0.0' },
              },
            ],
          },
        ],
      },
      clock
    );

    await expect(
      handle.updatePartVersion('v1' as PartVersionId, (version) => ({
        ...version,
        partId: 'other-part' as PartId,
      }))
    ).rejects.toThrow(/cannot be reassigned to a different part/);
  });

  it('addPartVersion on non-existent part throws error', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'No Part' }, clock);

    await expect(
      handle.addPartVersion('non-existent' as PartId, {
        id: 'v1' as PartVersionId,
        locator: { uri: 'memory://test@1.0.0' },
      })
    ).rejects.toThrow(/does not exist/);
  });

  it('updatePart on non-existent part throws error', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'No Part' }, clock);

    await expect(
      handle.updatePart('non-existent' as PartId, (part) => part)
    ).rejects.toThrow(/does not exist/);
  });

  it('updatePartVersion on non-existent version throws error', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'No Version' }, clock);

    await expect(
      handle.updatePartVersion('non-existent' as PartVersionId, (version) => version)
    ).rejects.toThrow(/does not exist/);
  });

  it('close with save false does not persist', async () => {
    const clock = new TestClock(initialTime);
    const { handle, storage } = await createHandle({ name: 'No Save' }, clock);

    await handle.update((snapshot) => ({
      ...snapshot,
      project: { ...snapshot.project, description: 'Unsaved' },
    }));

    expect(handle.isDirty()).toBe(true);

    await handle.close({ save: false });

    const reloaded = await storage.loadSnapshot(handle.projectId);
    expect(reloaded?.project.description).toBeUndefined();
  });

  it('multiple concurrent close calls are safe', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'Close Race' }, clock);

    await Promise.all([handle.close(), handle.close()]);

    const closed = await handle.close();
    expect(closed).toBeUndefined();
  });

  it('isDirty returns false after save', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'Dirty Check' }, clock);

    expect(handle.isDirty()).toBe(false);

    await handle.update((snapshot) => ({
      ...snapshot,
      project: { ...snapshot.project, description: 'Updated' },
    }));

    expect(handle.isDirty()).toBe(true);

    await handle.save();

    expect(handle.isDirty()).toBe(false);
  });

  it('getAdapters returns the registered adapters', async () => {
    const clock = new TestClock(initialTime);
    const { handle } = await createHandle({ name: 'Adapters' }, clock);

    expect(handle.getAdapters()).toEqual([]);
  });

  describe('deleteCombo', () => {
    it('deletes existing combo successfully', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle(
        {
          name: 'Delete Combo',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
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
                  versionId: 'v1' as PartVersionId,
                },
              ],
            },
          ],
        },
        clock
      );

      const removed = await handle.deleteCombo('baseline' as ComboId);
      expect(removed.id).toBe('baseline' as ComboId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.combos).toHaveLength(0);
    });

    it('emits combo:removed event with correct payload', async () => {
      const clock = new TestClock(initialTime);
      const { handle, events } = await createHandle(
        {
          name: 'Delete Combo Events',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
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
                  versionId: 'v1' as PartVersionId,
                },
              ],
            },
          ],
        },
        clock
      );

      const listener = vi.fn();
      events.subscribe('combo:removed', listener);
      const updatedListener = vi.fn();
      events.subscribe('project:updated', updatedListener);

      await handle.deleteCombo('baseline' as ComboId);

      expect(listener).toHaveBeenCalledTimes(1);
      const [payload] = listener.mock.calls[0]!;
      expect(payload.removedCombo.id).toBe('baseline' as ComboId);
      expect(updatedListener).toHaveBeenCalledTimes(1);
    });

    it('throws error when combo does not exist', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle({ name: 'No Combo' }, clock);

      await expect(
        handle.deleteCombo('non-existent' as ComboId)
      ).rejects.toThrow(/does not exist/);
    });
  });

  describe('deletePartVersion', () => {
    it('deletes existing version successfully', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle(
        {
          name: 'Delete Version',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
                  locator: { uri: 'memory://engine@1.0.0' },
                },
                {
                  id: 'v2' as PartVersionId,
                  locator: { uri: 'memory://engine@2.0.0' },
                },
              ],
            },
          ],
        },
        clock
      );

      const removed = await handle.deletePartVersion('v1' as PartVersionId);
      expect(removed.id).toBe('v1' as PartVersionId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.versions).toHaveLength(1);
      expect(snapshot.versions[0]?.id).toBe('v2' as PartVersionId);
    });

    it('emits version:removed event with correct payload', async () => {
      const clock = new TestClock(initialTime);
      const { handle, events } = await createHandle(
        {
          name: 'Delete Version Events',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
                  locator: { uri: 'memory://engine@1.0.0' },
                },
              ],
            },
          ],
        },
        clock
      );

      const listener = vi.fn();
      events.subscribe('version:removed', listener);

      await handle.deletePartVersion('v1' as PartVersionId);

      expect(listener).toHaveBeenCalledTimes(1);
      const [payload] = listener.mock.calls[0]!;
      expect(payload.removedVersion.id).toBe('v1' as PartVersionId);
      expect(payload.partId).toBe('engine' as PartId);
    });

    it('throws error when version does not exist', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle({ name: 'No Version' }, clock);

      await expect(
        handle.deletePartVersion('non-existent' as PartVersionId)
      ).rejects.toThrow(/does not exist/);
    });

    it('throws error when version is referenced by combo', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle(
        {
          name: 'Version In Combo',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
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
                  versionId: 'v1' as PartVersionId,
                },
              ],
            },
          ],
        },
        clock
      );

      await expect(
        handle.deletePartVersion('v1' as PartVersionId)
      ).rejects.toThrow(/referenced by.*combo/);
    });
  });

  describe('deletePart', () => {
    it('deletes existing part successfully', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle(
        {
          name: 'Delete Part',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
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
        },
        clock
      );

      const removed = await handle.deletePart('engine' as PartId);
      expect(removed.id).toBe('engine' as PartId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.parts).toHaveLength(1);
      expect(snapshot.parts[0]?.id).toBe('wheels' as PartId);
      expect(snapshot.versions).toHaveLength(0);
    });

    it('cascades to delete all versions of the part', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle(
        {
          name: 'Cascade Versions',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
                  locator: { uri: 'memory://engine@1.0.0' },
                },
                {
                  id: 'v2' as PartVersionId,
                  locator: { uri: 'memory://engine@2.0.0' },
                },
                {
                  id: 'v3' as PartVersionId,
                  locator: { uri: 'memory://engine@3.0.0' },
                },
              ],
            },
            {
              id: 'wheels' as PartId,
              name: 'Wheels',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'w1' as PartVersionId,
                  locator: { uri: 'memory://wheels@1.0.0' },
                },
              ],
            },
          ],
        },
        clock
      );

      await handle.deletePart('engine' as PartId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.versions).toHaveLength(1);
      expect(snapshot.versions[0]?.id).toBe('w1' as PartVersionId);
    });

    it('emits part:removed event with correct payload', async () => {
      const clock = new TestClock(initialTime);
      const { handle, events } = await createHandle(
        {
          name: 'Delete Part Events',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
            },
          ],
        },
        clock
      );

      const listener = vi.fn();
      events.subscribe('part:removed', listener);

      await handle.deletePart('engine' as PartId);

      expect(listener).toHaveBeenCalledTimes(1);
      const [payload] = listener.mock.calls[0]!;
      expect(payload.removedPart.id).toBe('engine' as PartId);
      expect(payload.partId).toBe('engine' as PartId);
    });

    it('throws error when part does not exist', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle({ name: 'No Part' }, clock);

      await expect(
        handle.deletePart('non-existent' as PartId)
      ).rejects.toThrow(/does not exist/);
    });

    it('throws error when part is referenced by combo', async () => {
      const clock = new TestClock(initialTime);
      const { handle } = await createHandle(
        {
          name: 'Part In Combo',
          parts: [
            {
              id: 'engine' as PartId,
              name: 'Engine',
              adapterId: 'adapter' as AdapterId,
              versions: [
                {
                  id: 'v1' as PartVersionId,
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
                  versionId: 'v1' as PartVersionId,
                },
              ],
            },
          ],
        },
        clock
      );

      await expect(
        handle.deletePart('engine' as PartId)
      ).rejects.toThrow(/referenced by.*combo/);
    });
  });
});
