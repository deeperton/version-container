import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DbType } from 'better-sqlite3';
import { SqliteStorageProvider } from '../../src/storages/sqlite/sqlite-storage.js';
import {
  ProjectRegistry,
  createPartId,
  createPartVersionId,
  createAdapterId,
  createUserId,
} from '../../src/index.js';
import type {
  AdapterId,
  ComboId,
  PartId,
  ProjectSnapshot,
  ProjectId,
  ISO8601Timestamp,
  UserId,
  UserGroupId,
  TagId,
} from '../../src/models/index.js';
import type { TagDefinition } from '../../src/models/tag.js';

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
  tags: [],
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
        tags: [],
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
        tags: [],
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
      expect(loaded?.project.description).toBe(
        'Description with emoji 🎉 and unicode characters café'
      );
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
      const v1 = createTestSnapshot(
        id,
        'Version 1',
        '2024-01-01T00:00:00.000Z' as ISO8601Timestamp
      );
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

  describe('migration system', () => {
    it('should create adapter state table on initialization', async () => {
      // Trigger initialization
      await provider.saveSnapshot(createTestSnapshot('init', 'Init'));

      // Verify state table exists by checking we can query it
      const externalDb = new Database(':memory:') as DbType;
      const p = new SqliteStorageProvider({ db: externalDb });
      await p.saveSnapshot(createTestSnapshot('test', 'Test'));

      const state = externalDb
        .prepare('SELECT value FROM _adapter_state WHERE key = ?')
        .get('version') as { value: string } | undefined;

      expect(state).toBeDefined();
      expect(state?.value).toBe('4'); // Current version

      await p.close();
      externalDb.close();
    });

    it('should run pending migrations on existing database', async () => {
      const externalDb = new Database(':memory:') as DbType;

      // Create old schema (version 1) - no _adapter_state table yet
      externalDb.exec(`
        CREATE TABLE IF NOT EXISTS snapshots (
          project_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_name ON snapshots(name);
        CREATE INDEX IF NOT EXISTS idx_snapshots_updated_at ON snapshots(updated_at DESC);
      `);

      // Create provider with old database - should migrate to version 2
      const p = new SqliteStorageProvider({ db: externalDb });

      // Verify new columns exist
      const columns = externalDb.prepare('PRAGMA table_info(snapshots)').all() as Array<{
        name: string;
      }>;

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('owner_user_name');
      expect(columnNames).toContain('owner_user_id');
      expect(columnNames).toContain('owner_user_group_id');
      expect(columnNames).toContain('parts_count');
      expect(columnNames).toContain('combos_count');

      // Verify version was updated
      const state = externalDb
        .prepare('SELECT value FROM _adapter_state WHERE key = ?')
        .get('version') as { value: string };
      expect(state?.value).toBe('4');

      await p.close();
      externalDb.close();
    });

    it('should extract owner info to columns on save', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'owner-test' as ProjectId,
          name: 'Owner Test',
          description: 'Testing owner extraction',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          owner: {
            userName: 'Test User',
            userId: 'user-123' as UserId,
            userGroupId: 'group-456' as UserGroupId,
          },
        },
        parts: [],
        versions: [],
        combos: [],
        locks: [],
      };

      await provider.saveSnapshot(snapshot);

      // Query the database to verify columns were populated
      const externalDb = new Database(':memory:') as DbType;
      const p = new SqliteStorageProvider({ db: externalDb });
      await p.saveSnapshot(snapshot);

      const row = externalDb
        .prepare(
          'SELECT owner_user_name, owner_user_id, owner_user_group_id FROM snapshots WHERE project_id = ?'
        )
        .get('owner-test') as
        | {
            owner_user_name: string | null;
            owner_user_id: string | null;
            owner_user_group_id: string | null;
          }
        | undefined;

      expect(row?.owner_user_name).toBe('Test User');
      expect(row?.owner_user_id).toBe('user-123');
      expect(row?.owner_user_group_id).toBe('group-456');

      await p.close();
      externalDb.close();
    });

    it('should extract stats to columns on save', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'stats-test' as ProjectId,
          name: 'Stats Test',
          description: 'Testing stats extraction',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [
          { id: 'part-1' as PartId, name: 'Part 1', adapterId: 'test' as AdapterId },
          { id: 'part-2' as PartId, name: 'Part 2', adapterId: 'test' as AdapterId },
          { id: 'part-3' as PartId, name: 'Part 3', adapterId: 'test' as AdapterId },
        ],
        versions: [],
        combos: [
          {
            id: 'combo-1' as ComboId,
            name: 'Combo 1',
            bindings: [],
            createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
            updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          },
          {
            id: 'combo-2' as ComboId,
            name: 'Combo 2',
            bindings: [],
            createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
            updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          },
        ],
        locks: [],
      };

      await provider.saveSnapshot(snapshot);

      const externalDb = new Database(':memory:') as DbType;
      const p = new SqliteStorageProvider({ db: externalDb });
      await p.saveSnapshot(snapshot);

      const row = externalDb
        .prepare('SELECT parts_count, combos_count FROM snapshots WHERE project_id = ?')
        .get('stats-test') as
        | {
            parts_count: number;
            combos_count: number;
          }
        | undefined;

      expect(row?.parts_count).toBe(3);
      expect(row?.combos_count).toBe(2);

      await p.close();
      externalDb.close();
    });

    it('should run migration v3 to create version_tags table', async () => {
      const externalDb = new Database(':memory:') as DbType;
      const p = new SqliteStorageProvider({ db: externalDb });

      // Trigger initialization
      await p.saveSnapshot(createTestSnapshot('test', 'Test'));

      // Verify version_tags table exists
      const tables = externalDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('version_tags');

      // Verify indexes exist
      const indexes = externalDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_version_tags%'"
        )
        .all() as Array<{ name: string }>;
      expect(indexes.length).toBeGreaterThanOrEqual(3);

      await p.close();
      externalDb.close();
    });

    it('should persist version tags across save/load', async () => {
      const stableTagId = 'tag-stable' as TagId;
      const productionTagId = 'tag-production' as TagId;
      const betaTagId = 'tag-beta' as TagId;

      const tags: TagDefinition[] = [
        {
          id: stableTagId,
          name: 'stable',
          type: 'version',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        {
          id: productionTagId,
          name: 'production',
          type: 'version',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        {
          id: betaTagId,
          name: 'beta',
          type: 'version',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
      ];

      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'tags-test' as ProjectId,
          name: 'Tags Test',
          description: 'Testing version tags',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
        },
        parts: [],
        versions: [
          {
            id: createPartVersionId('v1'),
            partId: createPartId('p1'),
            locator: { uri: 'npm://pkg@1.0.0' },
            tagIds: [stableTagId, productionTagId],
          },
          {
            id: createPartVersionId('v2'),
            partId: createPartId('p1'),
            locator: { uri: 'npm://pkg@2.0.0' },
            tagIds: [betaTagId],
          },
          {
            id: createPartVersionId('v3'),
            partId: createPartId('p1'),
            locator: { uri: 'npm://pkg@3.0.0' },
            // No tags
          },
        ],
        combos: [],
        locks: [],
        tags,
      };

      await provider.saveSnapshot(snapshot);
      const loaded = await provider.loadSnapshot(snapshot.project.id);

      // Check that tags were persisted
      expect(loaded?.tags).toHaveLength(3);
      expect(loaded?.tags.find((t) => t.name === 'stable')?.id).toBe(stableTagId);
      expect(loaded?.tags.find((t) => t.name === 'production')?.id).toBe(productionTagId);
      expect(loaded?.tags.find((t) => t.name === 'beta')?.id).toBe(betaTagId);

      // Check that version tag IDs were persisted
      expect(loaded?.versions[0]?.tagIds).toContain(stableTagId);
      expect(loaded?.versions[0]?.tagIds).toContain(productionTagId);
      expect(loaded?.versions[1]?.tagIds).toContain(betaTagId);
      expect(loaded?.versions[2]?.tagIds).toBeUndefined();
    });
  });

  describe('listProjects', () => {
    it('should list projects with pagination', async () => {
      // Create 15 projects
      for (let i = 1; i <= 15; i++) {
        await provider.saveSnapshot(createTestSnapshot(`proj-${i}`, `Project ${i}`));
      }

      const page1 = await provider.listProjects({ limit: 5, page: 1 });
      expect(page1.projects).toHaveLength(5);
      expect(page1.pagination.totalCount).toBe(15);
      expect(page1.pagination.totalPages).toBe(3);
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrevious).toBe(false);

      const page2 = await provider.listProjects({ limit: 5, page: 2 });
      expect(page2.projects).toHaveLength(5);
      expect(page2.pagination.hasNext).toBe(true);
      expect(page2.pagination.hasPrevious).toBe(true);
    });

    it('should filter by ownerUserId', async () => {
      const snapshot1: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'proj-1' as ProjectId,
          name: 'Project 1',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          owner: { userName: 'User 1', userId: 'user-1' as UserId },
        },
        parts: [],
        versions: [],
        combos: [],
      };

      const snapshot2: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'proj-2' as ProjectId,
          name: 'Project 2',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          owner: { userName: 'User 2', userId: 'user-2' as UserId },
        },
        parts: [],
        versions: [],
        combos: [],
      };

      await provider.saveSnapshot(snapshot1);
      await provider.saveSnapshot(snapshot2);

      const result = await provider.listProjects({ ownerUserId: 'user-1' as UserId });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].owner?.userId).toBe('user-1' as UserId);
    });

    it('should filter by name pattern case-insensitively', async () => {
      await provider.saveSnapshot(createTestSnapshot('proj-1', 'Rocket Guidance'));
      await provider.saveSnapshot(createTestSnapshot('proj-2', 'Propulsion System'));
      await provider.saveSnapshot(createTestSnapshot('proj-3', 'Navigation Module'));

      const result = await provider.listProjects({ namePattern: 'rocket' });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Rocket Guidance');

      const result2 = await provider.listProjects({ namePattern: 'SYSTEM' });
      expect(result2.projects).toHaveLength(1);
      expect(result2.projects[0].name).toBe('Propulsion System');
    });

    it('should include owner info and stats in results', async () => {
      const snapshot: ProjectSnapshot = {
        schemaVersion: 1,
        project: {
          id: 'full-test' as ProjectId,
          name: 'Full Test',
          description: 'Testing full data',
          createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          updatedAt: '2024-01-02T00:00:00.000Z' as ISO8601Timestamp,
          owner: {
            userName: 'Test Owner',
            userId: 'owner-123' as UserId,
            userGroupId: 'group-789' as UserGroupId,
          },
        },
        parts: [
          { id: 'part-1' as PartId, name: 'Part 1', adapterId: 'test' as AdapterId },
          { id: 'part-2' as PartId, name: 'Part 2', adapterId: 'test' as AdapterId },
        ],
        versions: [],
        combos: [
          {
            id: 'combo-1' as ComboId,
            name: 'Combo 1',
            bindings: [],
            createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
            updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
          },
        ],
        locks: [],
      };

      await provider.saveSnapshot(snapshot);

      // Use includeAll to see all projects (since this one has an owner)
      const result = await provider.listProjects({ includeAll: true });

      expect(result.projects).toHaveLength(1);
      const p = result.projects[0];
      expect(p.owner?.userName).toBe('Test Owner');
      expect(p.owner?.userId).toBe('owner-123' as UserId);
      expect(p.owner?.userGroupId).toBe('group-789' as UserGroupId);
      expect(p.partsCount).toBe(2);
      expect(p.combosCount).toBe(1);
      expect(p.createdAt).toBe('2024-01-01T00:00:00.000Z' as ISO8601Timestamp);
      expect(p.updatedAt).toBe('2024-01-02T00:00:00.000Z' as ISO8601Timestamp);
    });

    it('should return empty array when no projects match filter', async () => {
      await provider.saveSnapshot(createTestSnapshot('proj-1', 'Project 1'));

      const result = await provider.listProjects({ namePattern: 'nonexistent' });
      expect(result.projects).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(0);
    });
  });

  describe('white-box persistence verification', () => {
    it('should persist data correctly to database file with parts and versions', async () => {
      // Use a real file for this test (not in-memory)
      const testDbPath = `/tmp/test-persistence-${Date.now()}.db`;
      const fs = await import('node:fs');

      try {
        // Create provider and registry
        const storage = new SqliteStorageProvider({ filePath: testDbPath });
        const registry = new ProjectRegistry({ storage });

        // Create a project with owner
        const ownerUserId = createUserId('test-user');
        const handle = await registry.open(
          {
            name: 'Test Persistence Project',
            description: 'Testing white-box persistence',
            owner: {
              userName: 'Test User',
              userId: ownerUserId,
              userGroupId: 'engineering-team' as UserGroupId,
            },
          },
          ownerUserId
        );

        // Add parts with different adapters
        const frontendTagId = 'tag-frontend' as TagId;
        const reactTagId = 'tag-react' as TagId;
        const backendTagId = 'tag-backend' as TagId;
        const apiTagId = 'tag-api' as TagId;

        // First create the tags
        await handle.createTag({ id: frontendTagId, name: 'frontend', type: 'part' });
        await handle.createTag({ id: reactTagId, name: 'react', type: 'part' });
        await handle.createTag({ id: backendTagId, name: 'backend', type: 'part' });
        await handle.createTag({ id: apiTagId, name: 'api', type: 'part' });

        await registry.addPart(handle.projectId, {
          id: createPartId('ui-kit'),
          name: 'UI Kit',
          adapterId: createAdapterId('npm'),
          tagIds: [frontendTagId, reactTagId],
          metadata: { language: 'TypeScript' },
          owner: { userName: 'Test User', userId: ownerUserId },
        });

        await registry.addPart(handle.projectId, {
          id: createPartId('backend-api'),
          name: 'Backend API',
          adapterId: createAdapterId('git'),
          tagIds: [backendTagId, apiTagId],
          metadata: { language: 'Go' },
        });

        // Add versions to parts
        await registry.addPartVersion(handle.projectId, createPartId('ui-kit'), {
          id: createPartVersionId('v1.0.0'),
          label: '1.0.0',
          locator: { uri: 'npm://ui-kit@1.0.0' },
          metadata: { stable: true },
        });

        await registry.addPartVersion(handle.projectId, createPartId('ui-kit'), {
          id: createPartVersionId('v1.1.0'),
          label: '1.1.0',
          locator: { uri: 'npm://ui-kit@1.1.0' },
          metadata: { stable: false },
        });

        await registry.addPartVersion(handle.projectId, createPartId('backend-api'), {
          id: createPartVersionId('v2.0.0'),
          label: '2.0.0',
          locator: { uri: 'git://api.git@v2.0.0' },
        });

        // Close the registry to flush data
        await registry.close(handle.projectId, { save: true });
        await storage.close();

        // Now open the database file directly and verify the data
        const directDb = new Database(testDbPath) as DbType;

        // Verify the table exists and has the expected structure
        const tableInfo = directDb.prepare('PRAGMA table_info(snapshots)').all() as Array<{
          name: string;
          type: string;
        }>;
        const columnNames = tableInfo.map((c) => c.name);
        expect(columnNames).toContain('project_id');
        expect(columnNames).toContain('name');
        expect(columnNames).toContain('data');
        expect(columnNames).toContain('owner_user_id');
        expect(columnNames).toContain('parts_count');
        expect(columnNames).toContain('combos_count');

        // Verify indexed columns contain correct data
        const row = directDb
          .prepare(
            `
            SELECT
              project_id, name, description,
              created_at, updated_at,
              owner_user_name, owner_user_id, owner_user_group_id,
              parts_count, combos_count
            FROM snapshots
            WHERE project_id = ?
          `
          )
          .get(handle.projectId) as
          | {
              project_id: string;
              name: string;
              description: string | null;
              created_at: string;
              updated_at: string;
              owner_user_name: string | null;
              owner_user_id: string | null;
              owner_user_group_id: string | null;
              parts_count: number;
              combos_count: number;
            }
          | undefined;

        expect(row).toBeDefined();
        expect(row?.project_id).toBe(handle.projectId);
        expect(row?.name).toBe('Test Persistence Project');
        expect(row?.description).toBe('Testing white-box persistence');
        expect(row?.owner_user_name).toBe('Test User');
        expect(row?.owner_user_id).toBe('test-user');
        expect(row?.owner_user_group_id).toBe('engineering-team');
        expect(row?.parts_count).toBe(2); // Two parts
        expect(row?.combos_count).toBe(0); // No combos

        // Verify the full JSON data contains all parts and versions
        const dataRow = directDb
          .prepare('SELECT data FROM snapshots WHERE project_id = ?')
          .get(handle.projectId) as { data: string };

        expect(dataRow).toBeDefined();
        const snapshot = JSON.parse(dataRow.data) as ProjectSnapshot;

        // Verify project metadata
        expect(snapshot.project.id).toBe(handle.projectId);
        expect(snapshot.project.name).toBe('Test Persistence Project');
        expect(snapshot.project.owner?.userName).toBe('Test User');
        expect(snapshot.project.owner?.userId).toBe(ownerUserId);

        // Verify parts (order may vary, so find them by ID)
        expect(snapshot.parts).toHaveLength(2);
        const uiKitPart = snapshot.parts.find((p) => p.id === 'ui-kit');
        expect(uiKitPart).toBeDefined();
        expect(uiKitPart?.name).toBe('UI Kit');
        expect(uiKitPart?.adapterId).toBe('npm');
        expect(uiKitPart?.tagIds).toContain(frontendTagId);
        expect(uiKitPart?.tagIds).toContain(reactTagId);
        expect(uiKitPart?.metadata).toEqual({ language: 'TypeScript' });
        expect(uiKitPart?.owner?.userId).toBe(ownerUserId);

        const backendPart = snapshot.parts.find((p) => p.id === 'backend-api');
        expect(backendPart).toBeDefined();
        expect(backendPart?.name).toBe('Backend API');
        expect(backendPart?.adapterId).toBe('git');
        expect(backendPart?.tagIds).toContain(backendTagId);
        expect(backendPart?.tagIds).toContain(apiTagId);
        expect(backendPart?.metadata).toEqual({ language: 'Go' });

        // Verify versions
        expect(snapshot.versions).toHaveLength(3);
        const uiKitV1 = snapshot.versions.find((v) => v.id === 'v1.0.0');
        expect(uiKitV1).toBeDefined();
        expect(uiKitV1?.partId).toBe('ui-kit');
        expect(uiKitV1?.locator).toEqual({ uri: 'npm://ui-kit@1.0.0' });
        expect(uiKitV1?.label).toBe('1.0.0');

        const uiKitV2 = snapshot.versions.find((v) => v.id === 'v1.1.0');
        expect(uiKitV2).toBeDefined();
        expect(uiKitV2?.partId).toBe('ui-kit');
        expect(uiKitV2?.locator).toEqual({ uri: 'npm://ui-kit@1.1.0' });
        expect(uiKitV2?.label).toBe('1.1.0');

        const backendV2 = snapshot.versions.find((v) => v.id === 'v2.0.0');
        expect(backendV2).toBeDefined();
        expect(backendV2?.partId).toBe('backend-api');
        expect(backendV2?.locator).toEqual({ uri: 'git://api.git@v2.0.0' });
        expect(backendV2?.label).toBe('2.0.0');

        // Verify adapter state table exists and has version
        const stateRow = directDb
          .prepare('SELECT value FROM _adapter_state WHERE key = ?')
          .get('version') as { value: string } | undefined;
        expect(stateRow).toBeDefined();
        expect(stateRow?.value).toBe('4'); // Current adapter version

        directDb.close();
      } finally {
        // Clean up the test database file
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });

    it('should handle multiple projects in the same database file', async () => {
      const testDbPath = `/tmp/test-multi-project-${Date.now()}.db`;
      const fs = await import('node:fs');

      try {
        const storage = new SqliteStorageProvider({ filePath: testDbPath });
        const registry = new ProjectRegistry({ storage });

        // Create multiple projects
        const handle1 = await registry.open({ name: 'Project Alpha' });
        await registry.addPart(handle1.projectId, {
          id: createPartId('part-a'),
          name: 'Part A',
          adapterId: createAdapterId('npm'),
        });

        const handle2 = await registry.open({ name: 'Project Beta' });
        await registry.addPart(handle2.projectId, {
          id: createPartId('part-b'),
          name: 'Part B',
          adapterId: createAdapterId('git'),
        });
        await registry.addPartVersion(handle2.projectId, createPartId('part-b'), {
          id: createPartVersionId('v1'),
          label: '1.0',
          locator: { uri: 'git://part-b@v1' },
        });

        // Save and close
        await registry.close(handle1.projectId, { save: true });
        await registry.close(handle2.projectId, { save: true });
        await storage.close();

        // Verify directly from database
        const directDb = new Database(testDbPath) as DbType;

        const countRow = directDb.prepare('SELECT COUNT(*) as count FROM snapshots').get() as {
          count: number;
        };
        expect(countRow.count).toBe(2);

        const names = directDb.prepare('SELECT name FROM snapshots ORDER BY name').all() as Array<{
          name: string;
        }>;
        expect(names.map((n) => n.name)).toEqual(['Project Alpha', 'Project Beta']);

        // Verify parts_count for each project
        const partsCounts = directDb
          .prepare('SELECT name, parts_count FROM snapshots ORDER BY name')
          .all() as Array<{ name: string; parts_count: number }>;
        expect(partsCounts[0].parts_count).toBe(1); // Project Alpha has 1 part
        expect(partsCounts[1].parts_count).toBe(1); // Project Beta has 1 part

        directDb.close();
      } finally {
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });
  });
});
