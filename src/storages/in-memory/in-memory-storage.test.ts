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
});
