import { describe, expect, it, vi } from 'vitest';

import type { AdapterId, ISO8601Timestamp, PartId, PartVersionId, ProjectId } from '../models/base.js';
import { InMemoryStorageProvider } from '../storages/in-memory/in-memory-storage.js';
import { ProjectRegistry } from './project-registry.js';
import { TestClock } from './mocks/test-clock.js';
import { FakeAdapter } from './mocks/fake-adapter.js';

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
});
