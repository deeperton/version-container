import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalStorageStorageProvider } from '../../src/storages/local-storage/local-storage-storage.js';
import type { ProjectSnapshot, ProjectId } from '../../src/models/base.js';

interface MockLocalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  length: number;
  key: (index: number) => string | null;
}

declare global {
  var localStorage: MockLocalStorage;
}

// Helper to create a mock snapshot
const createMockSnapshot = (
  id: string,
  name: string,
  updatedAt = '2024-01-01T00:00:00.000Z'
): ProjectSnapshot => ({
  project: {
    id,
    name,
    description: '',
    createdAt: updatedAt,
    updatedAt,
  },
  parts: [],
  versions: [],
  combos: [],
  locks: [],
});

// Helper to mock localStorage
const mockLocalStorage = (): MockLocalStorage => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length(): number {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
};

describe('LocalStorageStorageProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('should create with default id', () => {
      const provider = new LocalStorageStorageProvider();
      expect(provider.id).toBe('local-storage');
    });

    it('should create with custom id', () => {
      const provider = new LocalStorageStorageProvider({ id: 'custom' });
      expect(provider.id).toBe('custom');
    });

    it('should throw when localStorage is not available', () => {
      vi.unstubAllGlobals();
      expect(() => new LocalStorageStorageProvider()).toThrow(
        'localStorage is not available'
      );
    });
  });

  describe('saveSnapshot & loadSnapshot', () => {
    it('should save and load a snapshot', async () => {
      const provider = new LocalStorageStorageProvider();
      const snapshot = createMockSnapshot('proj-1', 'Test Project');

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot(snapshot.project.id);

      expect(loaded).toEqual(snapshot);
    });

    it('should return undefined for non-existent project', async () => {
      const provider = new LocalStorageStorageProvider();
      const loaded = await provider.loadSnapshot('non-existent' as ProjectId);
      expect(loaded).toBeUndefined();
    });

    it('should update existing snapshot', async () => {
      const provider = new LocalStorageStorageProvider();
      const snapshot1 = createMockSnapshot('proj-1', 'Original');
      const snapshot2 = createMockSnapshot('proj-1', 'Updated');

      await provider.saveSnapshot(snapshot1);
      await provider.saveSnapshot(snapshot2);

      const loaded = await provider.loadSnapshot(snapshot1.project.id);
      expect(loaded?.project.name).toBe('Updated');
    });

    it('should use custom key prefix', async () => {
      const provider = new LocalStorageStorageProvider({ keyPrefix: 'custom:' });
      const snapshot = createMockSnapshot('proj-1', 'Test');

      await provider.saveSnapshot(snapshot);

      expect(globalThis.localStorage.getItem('custom:proj-1')).toBeTruthy();
      expect(globalThis.localStorage.getItem('version-container:proj-1')).toBeFalsy();
    });
  });

  describe('listSummaries', () => {
    it('should return empty array when no snapshots', async () => {
      const provider = new LocalStorageStorageProvider();
      const summaries = await provider.listSummaries();
      expect(summaries).toEqual([]);
    });

    it('should list all project summaries sorted by updatedAt', async () => {
      const provider = new LocalStorageStorageProvider();
      const old = createMockSnapshot('proj-1', 'Old', '2024-01-01T10:00:00.000Z');
      const newer = createMockSnapshot('proj-2', 'Newer', '2024-01-02T10:00:00.000Z');

      await provider.saveSnapshot(old);
      await provider.saveSnapshot(newer);

      const summaries = await provider.listSummaries();
      expect(summaries).toHaveLength(2);
      expect(summaries[0].id).toBe('proj-2');
      expect(summaries[1].id).toBe('proj-1');
    });
  });

  describe('delete', () => {
    it('should remove a single project', async () => {
      const provider = new LocalStorageStorageProvider();
      const snapshot = createMockSnapshot('proj-1', 'Test');

      await provider.saveSnapshot(snapshot);
      provider.delete(snapshot.project.id);

      const loaded = await provider.loadSnapshot(snapshot.project.id);
      expect(loaded).toBeUndefined();

      const summaries = await provider.listSummaries();
      expect(summaries).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should remove all snapshots', async () => {
      const provider = new LocalStorageStorageProvider();
      await provider.saveSnapshot(createMockSnapshot('proj-1', 'A'));
      await provider.saveSnapshot(createMockSnapshot('proj-2', 'B'));

      provider.clear();

      const summaries = await provider.listSummaries();
      expect(summaries).toHaveLength(0);
    });
  });

  describe('summary index rebuild', () => {
    it('should rebuild index when corrupted', async () => {
      const provider = new LocalStorageStorageProvider();
      await provider.saveSnapshot(createMockSnapshot('proj-1', 'Test'));

      // Corrupt the index
      globalThis.localStorage.setItem('version-container:__summaries', 'invalid-json');

      const summaries = await provider.listSummaries();
      expect(summaries).toHaveLength(1); // Should rebuild from storage
    });
  });
});
