import { describe, expect, it, vi } from 'vitest';

import type {
  AdapterId,
  ComboId,
  ISO8601Timestamp,
  PartId,
  PartVersionId,
  ProjectId,
} from '../models/base.js';
import { InMemoryStorageProvider } from '../storages/in-memory/in-memory-storage.js';
import { ProjectRegistry } from './project-registry.js';
import { TestClock } from './mocks/test-clock.js';
import { FakeAdapter } from './mocks/fake-adapter.js';
import { ProjectEventDispatcher } from './events/project-events.js';

const initialTime = '2024-03-01T00:00:00.000Z' as ISO8601Timestamp;

describe('ProjectRegistry', () => {
  it('opens and persists new projects', async () => {
    const storage = new InMemoryStorageProvider();
    const clock = new TestClock(initialTime);
    const adapter = new FakeAdapter();
    const registry = new ProjectRegistry({ storage, clock, adapters: [adapter] });
    const created = vi.fn();
    registry.getEventDispatcher().subscribe('project:created', created);

    const handle = await registry.open({ name: 'Alpha' });
    expect(handle.getAdapters()[0]?.id).toBe(adapter.id);

    const stored = await storage.loadSnapshot(handle.projectId);
    expect(stored?.project.name).toBe('Alpha');
    expect(registry.listOpenProjects()).toContain(handle.projectId);
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('reuses handles for already opened projects', async () => {
    const storage = new InMemoryStorageProvider();
    const registry = new ProjectRegistry({ storage, clock: new TestClock(initialTime) });

    const handle = await registry.open({ name: 'Bravo' });
    const again = await registry.load(handle.projectId);
    expect(again).toBe(handle);
  });

  it('reloads handles from storage after close', async () => {
    const storage = new InMemoryStorageProvider();
    const clock = new TestClock(initialTime);
    const registry = new ProjectRegistry({ storage, clock });

    const opened = await registry.open({ name: 'Charlie' });
    const projectId = opened.projectId;

    await registry.close(projectId);
    expect(registry.getOpenProject(projectId)).toBeUndefined();

    const loadedListener = vi.fn();
    registry.getEventDispatcher().subscribe('project:loaded', loadedListener);

    const reopened = await registry.load(projectId);
    expect(reopened).not.toBe(opened);
    expect(loadedListener).toHaveBeenCalledTimes(1);
  });

  it('prevents opening a project that is already open', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });
    const handle = await registry.open({ name: 'Delta' });
    const projectId = handle.projectId;

    await expect(registry.open({ id: projectId as ProjectId, name: 'Duplicate' })).rejects.toThrow(
      /already open/
    );
  });

  it('supports granular part and version operations with events', async () => {
    const storage = new InMemoryStorageProvider();
    const clock = new TestClock(initialTime);
    const registry = new ProjectRegistry({ storage, clock });
    const events = registry.getEventDispatcher();

    const handle = await registry.open({ name: 'Granular' });
    const partAdded = vi.fn();
    events.subscribe('part:added', partAdded);

    const part = await registry.addPart(handle.projectId, {
      id: 'engine' as PartId,
      name: 'Engine Controller',
      adapterId: 'adapter-in-memory' as AdapterId,
    });

    expect(part.name).toBe('Engine Controller');
    expect(partAdded).toHaveBeenCalledTimes(1);

    const partUpdated = vi.fn();
    events.subscribe('part:updated', partUpdated);

    const updatedPart = await registry.updatePart(handle.projectId, part.id, (definition) => ({
      ...definition,
      metadata: { owner: 'team-a' },
    }));

    expect(updatedPart.metadata).toMatchObject({ owner: 'team-a' });
    expect(partUpdated).toHaveBeenCalledTimes(1);

    const versionAdded = vi.fn();
    events.subscribe('version:added', versionAdded);

    const version = await registry.addPartVersion(handle.projectId, part.id, {
      id: 'engine-v1' as PartVersionId,
      locator: { uri: 'memory://engine@1.0.0' },
    });

    expect(version.partId).toBe(part.id);
    expect(versionAdded).toHaveBeenCalledTimes(1);

    const versionUpdated = vi.fn();
    events.subscribe('version:updated', versionUpdated);

    const updatedVersion = await registry.updatePartVersion(
      handle.projectId,
      version.id,
      (current) => ({
        ...current,
        label: '1.0.1',
      })
    );

    expect(updatedVersion.label).toBe('1.0.1');
    expect(versionUpdated).toHaveBeenCalledTimes(1);

    const snapshot = await handle.getSnapshot();
    expect(snapshot.parts).toHaveLength(1);
    expect(snapshot.versions).toHaveLength(1);
    expect(snapshot.versions[0]?.label).toBe('1.0.1');
  });

  it('load with non-existent project ID throws error', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    await expect(
      registry.load('non-existent' as ProjectId)
    ).rejects.toThrow(/could not be found/);
  });

  it('close on non-existent project returns without error', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    await expect(
      registry.close('non-existent' as ProjectId)
    ).resolves.toBeUndefined();
  });

  it('close on already closed project is safe', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    const handle = await registry.open({ name: 'Close Test' });
    const projectId = handle.projectId;

    await registry.close(projectId);
    await expect(registry.close(projectId)).resolves.toBeUndefined();
  });

  it('addPart when part does not exist propagates error', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    const handle = await registry.open({ name: 'Add Part' });

    await expect(
      registry.addPart(handle.projectId, {
        id: 'first' as PartId,
        name: 'First',
        adapterId: 'adapter-test' as AdapterId,
      })
    ).resolves.toBeDefined();

    await expect(
      registry.addPart(handle.projectId, {
        id: 'first' as PartId,
        name: 'Duplicate',
        adapterId: 'adapter-test' as AdapterId,
      })
    ).rejects.toThrow(/already exists/);
  });

  it('updatePart when part does not exist propagates error', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    const handle = await registry.open({ name: 'Update Part' });

    await expect(
      registry.updatePart(handle.projectId, 'non-existent' as PartId, (part) => part)
    ).rejects.toThrow(/does not exist/);
  });

  it('updatePartVersion when version does not exist propagates error', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    const handle = await registry.open({ name: 'Update Version' });

    await expect(
      registry.updatePartVersion(handle.projectId, 'non-existent' as PartVersionId, (v) => v)
    ).rejects.toThrow(/does not exist/);
  });

  it('constructor with custom event dispatcher uses it', async () => {
    const storage = new InMemoryStorageProvider();
    const clock = new TestClock(initialTime);
    const events = new ProjectEventDispatcher();
    const listener = vi.fn();

    events.subscribe('project:created', listener);

    const registry = new ProjectRegistry({ storage, clock, events });
    await registry.open({ name: 'Custom Events' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('constructor with custom clock uses it', async () => {
    const storage = new InMemoryStorageProvider();
    const clock = new TestClock(initialTime);

    const registry = new ProjectRegistry({ storage, clock });
    const handle = await registry.open({ name: 'Custom Clock' });
    const snapshot = await handle.getSnapshot();

    expect(snapshot.project.createdAt).toBe(initialTime);
    expect(snapshot.project.updatedAt).toBe(initialTime);
  });

  it('getOpenProject returns undefined for non-open project', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    const project = registry.getOpenProject('non-existent' as ProjectId);
    expect(project).toBeUndefined();
  });

  it('getOpenProject returns handle for open project', async () => {
    const registry = new ProjectRegistry({
      storage: new InMemoryStorageProvider(),
      clock: new TestClock(initialTime),
    });

    const handle = await registry.open({ name: 'Get Open' });
    const retrieved = registry.getOpenProject(handle.projectId);

    expect(retrieved).toBe(handle);
  });

  describe('delete operations', () => {
    it('deleteCombo delegates to handle correctly', async () => {
      const registry = new ProjectRegistry({
        storage: new InMemoryStorageProvider(),
        clock: new TestClock(initialTime),
      });

      const handle = await registry.open({
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
      });

      const removed = await registry.deleteCombo(handle.projectId, 'baseline' as ComboId);
      expect(removed.id).toBe('baseline' as ComboId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.combos).toHaveLength(0);
    });

    it('deletePartVersion delegates to handle correctly', async () => {
      const registry = new ProjectRegistry({
        storage: new InMemoryStorageProvider(),
        clock: new TestClock(initialTime),
      });

      const handle = await registry.open({
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
            ],
          },
        ],
      });

      const removed = await registry.deletePartVersion(handle.projectId, 'v1' as PartVersionId);
      expect(removed.id).toBe('v1' as PartVersionId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.versions).toHaveLength(0);
    });

    it('deletePart delegates to handle correctly', async () => {
      const registry = new ProjectRegistry({
        storage: new InMemoryStorageProvider(),
        clock: new TestClock(initialTime),
      });

      const handle = await registry.open({
        name: 'Delete Part',
        parts: [
          {
            id: 'engine' as PartId,
            name: 'Engine',
            adapterId: 'adapter' as AdapterId,
          },
        ],
      });

      const removed = await registry.deletePart(handle.projectId, 'engine' as PartId);
      expect(removed.id).toBe('engine' as PartId);

      const snapshot = await handle.getSnapshot();
      expect(snapshot.parts).toHaveLength(0);
    });
  });

  describe('add and update combo operations', () => {
    it('addCombo delegates to handle correctly', async () => {
      const registry = new ProjectRegistry({
        storage: new InMemoryStorageProvider(),
        clock: new TestClock(initialTime),
      });

      const handle = await registry.open({
        name: 'Add Combo',
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
      });

      const combo = await registry.addCombo(handle.projectId, {
        name: 'Production',
        bindings: [
          {
            partId: 'engine' as PartId,
            versionId: 'v1' as PartVersionId,
          },
        ],
      });

      expect(combo.name).toBe('Production');

      const snapshot = await handle.getSnapshot();
      expect(snapshot.combos).toHaveLength(1);
    });

    it('updateCombo delegates to handle correctly', async () => {
      const registry = new ProjectRegistry({
        storage: new InMemoryStorageProvider(),
        clock: new TestClock(initialTime),
      });

      const handle = await registry.open({
        name: 'Update Combo',
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
      });

      const updated = await registry.updateCombo(handle.projectId, 'baseline' as ComboId, (combo) => ({
        ...combo,
        name: 'Updated Baseline',
      }));

      expect(updated.name).toBe('Updated Baseline');

      const snapshot = await handle.getSnapshot();
      expect(snapshot.combos[0]?.name).toBe('Updated Baseline');
    });
  });
});
