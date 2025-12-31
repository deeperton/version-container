import { describe, expect, it } from 'vitest';

import type { ProjectSnapshot } from '../../models/project.js';
import { InMemoryStorageProvider } from './in-memory-storage.js';
import { createProjectSnapshot } from './mocks/project-snapshot.js';

const mutateSnapshot = (snapshot: ProjectSnapshot, name: string): void => {
  (snapshot.project as { name: string }).name = name;
};

describe('InMemoryStorageProvider', () => {
  it('persists snapshots and returns clones on load', async () => {
    const storage = new InMemoryStorageProvider();
    const snapshot = createProjectSnapshot();

    await storage.saveSnapshot(snapshot);

    const loaded = await storage.loadSnapshot(snapshot.project.id);
    expect(loaded).toEqual(snapshot);
    expect(loaded).not.toBe(snapshot);

    if (!loaded) {
      throw new Error('Expected snapshot to be loaded');
    }

    mutateSnapshot(loaded, 'Mutated');

    const reloaded = await storage.loadSnapshot(snapshot.project.id);
    expect(reloaded?.project.name).toBe(snapshot.project.name);
  });

  it('returns undefined when loading missing snapshot', async () => {
    const storage = new InMemoryStorageProvider();
    const result = await storage.loadSnapshot('non-existent' as ProjectSnapshot['project']['id']);
    expect(result).toBeUndefined();
  });

  it('lists summaries in descending updated order', async () => {
    const first = createProjectSnapshot({
      project: {
        id: 'project-a' as ProjectSnapshot['project']['id'],
        name: 'First',
        updatedAt: '2023-05-01T00:00:00.000Z' as ProjectSnapshot['project']['updatedAt'],
      },
    });
    const second = createProjectSnapshot({
      project: {
        id: 'project-b' as ProjectSnapshot['project']['id'],
        name: 'Second',
        updatedAt: '2023-06-01T00:00:00.000Z' as ProjectSnapshot['project']['updatedAt'],
      },
    });

    const storage = new InMemoryStorageProvider({ initialSnapshots: [first] });
    await storage.saveSnapshot(second);

    const summaries = await storage.listSummaries();

    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.id).toBe(second.project.id);
    expect(summaries[1]?.id).toBe(first.project.id);

    const mutatedSummary = summaries[0];
    if (mutatedSummary) {
      (mutatedSummary as { name: string }).name = 'Mutated summary';
    }

    const requery = await storage.listSummaries();
    expect(requery[0]?.name).toBe(second.project.name);
  });

  it('constructor with custom id uses that ID', () => {
    const storage = new InMemoryStorageProvider({ id: 'custom-storage' });
    expect(storage.id).toBe('custom-storage');
  });

  it('constructor with default id uses in-memory', () => {
    const storage = new InMemoryStorageProvider();
    expect(storage.id).toBe('in-memory');
  });

  it('clear removes all snapshots', async () => {
    const snapshot = createProjectSnapshot();
    const storage = new InMemoryStorageProvider({ initialSnapshots: [snapshot] });

    const loaded = await storage.loadSnapshot(snapshot.project.id);
    expect(loaded).toBeDefined();

    storage.clear();

    const afterClear = await storage.loadSnapshot(snapshot.project.id);
    expect(afterClear).toBeUndefined();
  });

  it('clear then loadSnapshot returns undefined', async () => {
    const snapshot = createProjectSnapshot();
    const storage = new InMemoryStorageProvider({ initialSnapshots: [snapshot] });

    storage.clear();

    const result = await storage.loadSnapshot(snapshot.project.id);
    expect(result).toBeUndefined();
  });

  it('listSummaries on empty storage returns empty array', async () => {
    const storage = new InMemoryStorageProvider();
    const summaries = await storage.listSummaries();
    expect(summaries).toEqual([]);
  });

  it('listSummaries after clear returns empty array', async () => {
    const snapshot = createProjectSnapshot();
    const storage = new InMemoryStorageProvider({ initialSnapshots: [snapshot] });

    storage.clear();

    const summaries = await storage.listSummaries();
    expect(summaries).toEqual([]);
  });

  it('saving same project twice replaces previous version', async () => {
    const storage = new InMemoryStorageProvider();
    const snapshot = createProjectSnapshot({
      project: { name: 'Original Name' },
    });

    await storage.saveSnapshot(snapshot);

    const updated = createProjectSnapshot({
      project: {
        id: snapshot.project.id,
        name: 'Updated Name',
        updatedAt: '2024-01-02T00:00:00.000Z' as ProjectSnapshot['project']['updatedAt'],
      },
    });

    await storage.saveSnapshot(updated);

    const loaded = await storage.loadSnapshot(snapshot.project.id);
    expect(loaded?.project.name).toBe('Updated Name');
  });

  it('listSummaries returns summaries in descending updatedAt order', async () => {
    const oldest = createProjectSnapshot({
      project: {
        id: 'project-oldest' as ProjectSnapshot['project']['id'],
        name: 'Oldest',
        updatedAt: '2023-01-01T00:00:00.000Z' as ProjectSnapshot['project']['updatedAt'],
      },
    });
    const newest = createProjectSnapshot({
      project: {
        id: 'project-newest' as ProjectSnapshot['project']['id'],
        name: 'Newest',
        updatedAt: '2023-12-01T00:00:00.000Z' as ProjectSnapshot['project']['updatedAt'],
      },
    });
    const middle = createProjectSnapshot({
      project: {
        id: 'project-middle' as ProjectSnapshot['project']['id'],
        name: 'Middle',
        updatedAt: '2023-06-01T00:00:00.000Z' as ProjectSnapshot['project']['updatedAt'],
      },
    });

    const storage = new InMemoryStorageProvider({
      initialSnapshots: [oldest, middle, newest],
    });

    const summaries = await storage.listSummaries();

    expect(summaries).toHaveLength(3);
    expect(summaries[0]?.id).toBe('project-newest');
    expect(summaries[1]?.id).toBe('project-middle');
    expect(summaries[2]?.id).toBe('project-oldest');
  });
});
