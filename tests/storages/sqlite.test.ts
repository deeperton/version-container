import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DbType } from 'better-sqlite3';
import { SqliteStorageProvider } from '../../src/storages/sqlite/sqlite-storage.js';
import type { ProjectSnapshot, ProjectId, ISO8601Timestamp } from '../../src/models/index.js';

/**
 * Helper to create a test snapshot.
 */
const createTestSnapshot = (
  id: string,
  name: string,
  updatedAt: ISO8601Timestamp = '2024-01-01T00:00:00.000Z' as ISO8601Timestamp
): ProjectSnapshot => ({
  schemaVersion: 1,
  project: {
    id: id as ProjectId,
    name,
    description: `Test project ${name}`,
    createdAt: updatedAt,
    updatedAt,
  },
  parts: [],
  versions: [],
  combos: [],
  locks: [],
});

describe('SqliteStorageProvider', () => {
  let provider: SqliteStorageProvider;

  beforeEach(() => {
    // Use in-memory database for isolated tests
    provider = new SqliteStorageProvider({ filePath: ':memory:' });
  });

  afterEach(async () => {
    await provider.close();
  });

  describe('constructor', () => {
    it('should create with default id', () => {
      const p = new SqliteStorageProvider({ filePath: ':memory:' });
      expect(p.id).toBe('sqlite');
    });

    it('should create with custom id', () => {
      const p = new SqliteStorageProvider({
        id: 'custom-sqlite',
        filePath: ':memory:',
      });
      expect(p.id).toBe('custom-sqlite');
    });

    it('should accept external database instance', () => {
      const externalDb = new Database(':memory:') as DbType;

      const p = new SqliteStorageProvider({ db: externalDb });

      expect(p.id).toBe('sqlite');
      externalDb.close();
    });
  });

  describe('saveSnapshot & loadSnapshot', () => {
    it('should save and load a snapshot', async () => {
      const snapshot = createTestSnapshot('proj-1', 'Test Project');

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot(snapshot.project.id);

      expect(loaded).toEqual(snapshot);
    });

    it('should return undefined for non-existent project', async () => {
      const loaded = await provider.loadSnapshot('non-existent' as ProjectId);
      expect(loaded).toBeUndefined();
    });

    it('should update existing snapshot (upsert)', async () => {
      const snapshot1 = createTestSnapshot(
        'proj-1',
        'Original',
        '2024-01-01T00:00:00.000Z' as ISO8601Timestamp
      );
      const snapshot2 = createTestSnapshot(
        'proj-1',
        'Updated',
        '2024-01-02T00:00:00.000Z' as ISO8601Timestamp
      );

      await provider.saveSnapshot(snapshot1);
      await provider.saveSnapshot(snapshot2);

      const loaded = await provider.loadSnapshot(snapshot1.project.id);
      expect(loaded?.project.name).toBe('Updated');
      expect(loaded?.project.updatedAt).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should handle snapshot with null description', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'proj-1' as ProjectId,
          name: 'No Description',
          description: undefined,
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [],
        versions: [],
        combos: [],
      };

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot(snapshot.project.id);

      expect(loaded?.project.description).toBeUndefined();
    });

    it('should handle complex project data', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'complex' as ProjectId,
          name: 'Complex Project',
          description: 'With parts and versions',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [
          { id: 'part-1', name: 'Part 1', adapter: 'test' },
          { id: 'part-2', name: 'Part 2', adapter: 'test' },
        ],
        versions: [
          { id: 'v1', partId: 'part-1', locator: 'test:v1' },
          { id: 'v2', partId: 'part-1', locator: 'test:v2' },
        ],
        combos: [
          {
            id: 'combo-1',
            name: 'Combo 1',
            versions: [{ partId: 'part-1', versionId: 'v1' }],
          },
        ],
        locks: [
          {
            id: 'lock-1',
            name: 'Lock 1',
            versions: [{ partId: 'part-1', versionId: 'v1' }],
            createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          },
        ],
      };

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot('complex' as ProjectId);

      expect(loaded).toEqual(snapshot);
      expect(loaded?.parts).toHaveLength(2);
      expect(loaded?.versions).toHaveLength(2);
      expect(loaded?.combos).toHaveLength(1);
      expect(loaded?.locks).toHaveLength(1);
    });

    it('should handle malformed JSON gracefully', async () => {
      // Create provider with external db to inject bad data
      const externalDb = new Database(':memory:') as DbType;
      const p = new SqliteStorageProvider({ db: externalDb });

      // Initialize the provider
      await p.saveSnapshot(createTestSnapshot('init', 'Init'));

      // Inject invalid JSON directly
      externalDb
        .prepare(
          'INSERT INTO snapshots (project_id, name, description, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          'bad-json',
          'Bad',
          null,
          '2024-01-01T00:00:00.000Z',
          '2024-01-01T00:00:00.000Z',
          '{invalid json}'
        );

      await expect(p.loadSnapshot('bad-json' as ProjectId)).rejects.toThrow(
        /Failed to parse snapshot data/
      );

      await p.close();
      externalDb.close();
    });
  });

  describe('listSummaries', () => {
    it('should return empty array when no snapshots', async () => {
      const summaries = await provider.listSummaries();
      expect(summaries).toEqual([]);
    });

    it('should list all project summaries sorted by updatedAt descending', async () => {
      const old = createTestSnapshot(
        'proj-1',
        'Old',
        '2024-01-01T10:00:00.000Z' as ISO8601Timestamp
      );
      const newer = createTestSnapshot(
        'proj-2',
        'Newer',
        '2024-01-03T10:00:00.000Z' as ISO8601Timestamp
      );
      const middle = createTestSnapshot(
        'proj-3',
        'Middle',
        '2024-01-02T10:00:00.000Z' as ISO8601Timestamp
      );

      await provider.saveSnapshot(old);
      await provider.saveSnapshot(newer);
      await provider.saveSnapshot(middle);

      const summaries = await provider.listSummaries();

      expect(summaries).toHaveLength(3);
      expect(summaries[0]?.id).toBe('proj-2'); // Most recent
      expect(summaries[1]?.id).toBe('proj-3');
      expect(summaries[2]?.id).toBe('proj-1'); // Oldest
    });

    it('should extract summary fields from snapshots', async () => {
      const snapshot = createTestSnapshot(
        'proj-1',
        'Test Project',
        '2024-01-01T00:00:00.000Z' as ISO8601Timestamp
      );

      await provider.saveSnapshot(snapshot);
      const summaries = await provider.listSummaries();

      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toEqual({
        id: snapshot.project.id,
        name: snapshot.project.name,
        description: snapshot.project.description,
        updatedAt: snapshot.project.updatedAt,
      });
    });

    it('should handle snapshot without description', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'no-desc' as ProjectId,
          name: 'No Description',
          description: undefined,
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [],
        versions: [],
        combos: [],
      };

      await provider.saveSnapshot(snapshot);
      const summaries = await provider.listSummaries();

      expect(summaries[0]?.description).toBeUndefined();
    });
  });

  describe('close', () => {
    it('should close owned database', async () => {
      const p = new SqliteStorageProvider({ filePath: ':memory:' });
      await p.saveSnapshot(createTestSnapshot('p1', 'Test'));

      await p.close();

      // After close, operations can re-initialize with a new database
      await p.saveSnapshot(createTestSnapshot('p2', 'Test2'));
      const loaded = await p.loadSnapshot('p2' as ProjectId);
      expect(loaded?.project.name).toBe('Test2');

      await p.close();
    });

    it('should not close externally provided database', async () => {
      const externalDb = new Database(':memory:') as DbType;

      const p = new SqliteStorageProvider({ db: externalDb });
      await p.saveSnapshot(createTestSnapshot('p1', 'Test'));
      await p.close();

      // External db should still be usable
      expect(() => externalDb.prepare('SELECT 1').get()).toBeDefined();

      externalDb.close();
    });
  });

  describe('lazy initialization', () => {
    it('should initialize database on first operation', async () => {
      const p = new SqliteStorageProvider({ filePath: ':memory:' });

      // Database should not be created until first operation
      await p.saveSnapshot(createTestSnapshot('lazy', 'Lazy Init'));

      const loaded = await p.loadSnapshot('lazy' as ProjectId);
      expect(loaded?.project.name).toBe('Lazy Init');

      await p.close();
    });
  });

  describe('edge cases', () => {
    it('should handle empty parts array', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 2,
        project: {
          id: 'empty-parts' as ProjectId,
          name: 'Empty Parts',
          description: 'Project with no parts',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [],
        versions: [],
        combos: [],
        locks: [],
      };

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot('empty-parts' as ProjectId);

      expect(loaded).toEqual(snapshot);
      expect(loaded?.parts).toEqual([]);
      expect(loaded?.schemaVersion).toBe(2);
    });

    it('should handle special characters in project name and description', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'special-chars' as ProjectId,
          name: 'Project with "quotes" and \'apostrophes\'',
          description: 'Description with\nnewlines\tand\tslashes\\',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [],
        versions: [],
        combos: [],
      };

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot('special-chars' as ProjectId);

      expect(loaded?.project.name).toBe(snapshot.project.name);
      expect(loaded?.project.description).toBe(snapshot.project.description);
    });

    it('should handle Unicode characters', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'unicode' as ProjectId,
          name: '项目 名称 🚀',
          description: 'Description with emoji 🎉 and unicode characters café',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [],
        versions: [],
        combos: [],
      };

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot('unicode' as ProjectId);

      expect(loaded?.project.name).toBe('项目 名称 🚀');
      expect(loaded?.project.description).toBe('Description with emoji 🎉 and unicode characters café');
    });

    it('should handle multiple sequential saves and loads', async () => {
      const snapshots = [
        createTestSnapshot('seq-1', 'First'),
        createTestSnapshot('seq-2', 'Second'),
        createTestSnapshot('seq-3', 'Third'),
      ];

      // Save all
      for (const snapshot of snapshots) {
        await provider.saveSnapshot(snapshot);
      }

      // Load all in different order
      const loaded1 = await provider.loadSnapshot('seq-3' as ProjectId);
      const loaded2 = await provider.loadSnapshot('seq-1' as ProjectId);
      const loaded3 = await provider.loadSnapshot('seq-2' as ProjectId);

      expect(loaded1?.project.name).toBe('Third');
      expect(loaded2?.project.name).toBe('First');
      expect(loaded3?.project.name).toBe('Second');
    });

    it('should preserve data integrity across multiple upserts', async () => {
      const id = 'upsert-test' as ProjectId;

      // First save
      const v1 = createTestSnapshot(id, 'Version 1', '2024-01-01T00:00:00.000Z' as ISO8601Timestamp);
      await provider.saveSnapshot(v1);

      // Second save (update)
      const v2: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id,
          name: 'Version 2',
          description: 'Updated description',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-02T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [{ id: 'new-part', name: 'New Part', adapter: 'test' }],
        versions: [],
        combos: [],
      };
      await provider.saveSnapshot(v2);

      // Third save (another update)
      const v3: ProjectSnapshot = {
        schemaVersion: 2,
        project: {
          id,
          name: 'Version 3',
          description: 'Final description',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-03T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [
          { id: 'new-part', name: 'New Part', adapter: 'test' },
          { id: 'another-part', name: 'Another Part', adapter: 'test' },
        ],
        versions: [],
        combos: [],
        locks: [
          {
            id: 'lock-1',
            name: 'Lock 1',
            versions: [{ partId: 'new-part', versionId: 'v1' }],
            createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          },
        ],
      };
      await provider.saveSnapshot(v3);

      const loaded = await provider.loadSnapshot(id);

      expect(loaded?.project.name).toBe('Version 3');
      expect(loaded?.project.description).toBe('Final description');
      expect(loaded?.schemaVersion).toBe(2);
      expect(loaded?.parts).toHaveLength(2);
      expect(loaded?.locks).toHaveLength(1);
    });
  });

  describe('database persistence', () => {
    it('should persist data across provider instances with same file', async () => {
      // Use a temp file path
      const tempDbPath = `/tmp/test-sqlite-${Date.now()}.db`;

      // First provider - save data
      const provider1 = new SqliteStorageProvider({ filePath: tempDbPath });
      const snapshot = createTestSnapshot('persistent', 'Persistent Data');
      await provider1.saveSnapshot(snapshot);
      await provider1.close();

      // Second provider - load data
      const provider2 = new SqliteStorageProvider({ filePath: tempDbPath });
      const loaded = await provider2.loadSnapshot('persistent' as ProjectId);
      await provider2.close();

      expect(loaded).toEqual(snapshot);

      // Cleanup temp file
      const fs = await import('node:fs');
      fs.unlinkSync(tempDbPath);
    });
  });
});
