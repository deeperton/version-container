import { describe, expect, it } from 'vitest';

import type { ISO8601Timestamp, ProjectId } from '../models/base.js';
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

    const handle = await registry.open({ name: 'Alpha' });
    expect(handle.getAdapters()[0]?.id).toBe(adapter.id);

    const stored = await storage.loadSnapshot(handle.projectId);
    expect(stored?.project.name).toBe('Alpha');
    expect(registry.listOpenProjects()).toContain(handle.projectId);
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

    const reopened = await registry.load(projectId);
    expect(reopened).not.toBe(opened);
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
});
