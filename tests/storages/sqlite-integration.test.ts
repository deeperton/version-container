/**
 * Integration tests for SQLite storage adapter.
 * These tests demonstrate real-world usage scenarios.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SqliteStorageProvider } from '../../src/storages/sqlite/sqlite-storage.js';
import { registerBuiltinStorageProviders } from '../../src/storages/storage-registry.js';
import { buildProjectSnapshot } from '../../src/lib/project-snapshot-builder.js';
import { SystemClock } from '../../src/lib/clock.js';
import type { ProjectId, ISO8601Timestamp } from '../../src/models/index.js';
import { unlinkSync, existsSync } from 'node:fs';

const clock = new SystemClock();

/**
 * Helper to get a unique temp db path for each test
 */
const getTempDbPath = (): string => `/tmp/test-sqlite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`;

/**
 * Helper to run a test with a temp db file and cleanup
 */
const withTempDb = async (
  testFn: (dbPath: string) => Promise<void> | void
): Promise<void> => {
  const dbPath = getTempDbPath();
  try {
    await testFn(dbPath);
  } finally {
    if (existsSync(dbPath)) {
      try {
        unlinkSync(dbPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
};

describe('SqliteStorageProvider Integration', () => {
  beforeAll(() => {
    registerBuiltinStorageProviders();
  });

  describe('Direct instantiation usage', () => {
    it('should complete a full CRUD workflow', async () => {
      await withTempDb(async (dbPath) => {
        const provider = new SqliteStorageProvider({ filePath: dbPath });

        // Create a project snapshot using the library
        const snapshot = buildProjectSnapshot(
          { name: 'My Application', description: 'A test application for SQLite storage' },
          { clock }
        );

        // Save to SQLite
        await provider.saveSnapshot(snapshot);

        // Load back
        const loaded = await provider.loadSnapshot(snapshot.project.id);
        expect(loaded).toEqual(snapshot);

        // List summaries
        const summaries = await provider.listSummaries();
        expect(summaries).toHaveLength(1);
        expect(summaries[0]?.name).toBe('My Application');

        // Cleanup
        await provider.close();
      });
    });

    it('should handle multiple projects', async () => {
      await withTempDb(async (dbPath) => {
        const provider = new SqliteStorageProvider({ filePath: dbPath });

        // Create multiple project snapshots
        const snapshots = [
          buildProjectSnapshot({ name: 'Project A' }, { clock }),
          buildProjectSnapshot({ name: 'Project B' }, { clock }),
          buildProjectSnapshot({ name: 'Project C' }, { clock }),
        ];

        // Save all
        for (const snapshot of snapshots) {
          await provider.saveSnapshot(snapshot);
        }

        // List all
        const summaries = await provider.listSummaries();
        expect(summaries).toHaveLength(3);

        // Verify we can load each
        for (const snapshot of snapshots) {
          const loaded = await provider.loadSnapshot(snapshot.project.id);
          expect(loaded).toBeDefined();
          expect(loaded?.project.name).toBe(snapshot.project.name);
        }

        await provider.close();
      });
    });
  });

  describe('Registry-based usage', () => {
    it('should create provider via registry', async () => {
      await withTempDb(async (dbPath) => {
        // Create using registry (for dynamic storage selection)
        const provider = new SqliteStorageProvider({ filePath: dbPath, id: 'sqlite' });

        expect(provider.id).toBe('sqlite');

        const snapshot = buildProjectSnapshot({ name: 'Registry Test' }, { clock });
        await provider.saveSnapshot(snapshot);

        const summaries = await provider.listSummaries();
        expect(summaries).toHaveLength(1);

        await provider.close();
      });
    });
  });

  describe('Real-world scenarios', () => {
    it('should support version history tracking', async () => {
      await withTempDb(async (dbPath) => {
        const provider = new SqliteStorageProvider({ filePath: dbPath });

        const projectId = 'version-history-demo' as ProjectId;
        const baseTime = '2024-01-01T00:00:00.000Z' as ISO8601Timestamp;

        // Simulate saving multiple versions of the same project
        const versions = [
          {
            name: 'v1.0.0',
            description: 'Initial release',
            updatedAt: baseTime,
          },
          {
            name: 'v1.1.0',
            description: 'Added new features',
            updatedAt: '2024-01-02T00:00:00.000Z' as ISO8601Timestamp,
          },
          {
            name: 'v1.2.0',
            description: 'Bug fixes and improvements',
            updatedAt: '2024-01-03T00:00:00.000Z' as ISO8601Timestamp,
          },
        ];

        for (const version of versions) {
          const snapshot = buildProjectSnapshot(
            {
              id: projectId,
              name: version.name,
              description: version.description,
            },
            { clock }
          );
          // Override updated_at for testing
          (snapshot as unknown as { project: { updatedAt: ISO8601Timestamp } }).project.updatedAt =
            version.updatedAt;
          await provider.saveSnapshot(snapshot);
        }

        // Load latest
        const latest = await provider.loadSnapshot(projectId);
        expect(latest?.project.name).toBe('v1.2.0');

        await provider.close();
      });
    });

    it('should handle concurrent access simulation', async () => {
      await withTempDb(async (dbPath) => {
        const provider = new SqliteStorageProvider({ filePath: dbPath });

        // Simulate multiple "users" saving different projects
        const savePromises = Array.from({ length: 10 }, (_, i) =>
          provider.saveSnapshot(
            buildProjectSnapshot(
              {
                name: `Concurrent Project ${i}`,
                description: `Project ${i} data`,
              },
              { clock }
            )
          )
        );

        await Promise.all(savePromises);

        // Verify all were saved
        const summaries = await provider.listSummaries();
        expect(summaries).toHaveLength(10);

        await provider.close();
      });
    });

    it('should handle large project data', async () => {
      await withTempDb(async (dbPath) => {
        const provider = new SqliteStorageProvider({ filePath: dbPath });

        // Create a base project
        const baseSnapshot = buildProjectSnapshot(
          {
            name: 'Large Project',
            description: 'Project with many components',
          },
          { clock }
        );

        // Add many parts and versions
        const largeSnapshot = {
          ...baseSnapshot,
          parts: Array.from({ length: 100 }, (_, i) => ({
            id: `part-${i}`,
            name: `Component ${i}`,
            adapter: 'test-adapter',
          })),
          versions: Array.from({ length: 500 }, (_, i) => ({
            id: `v${i}`,
            partId: `part-${i % 100}`,
            locator: `test-adapter:v${i}`,
          })),
        };

        await provider.saveSnapshot(largeSnapshot);

        const loaded = await provider.loadSnapshot(baseSnapshot.project.id);
        expect(loaded?.parts).toHaveLength(100);
        expect(loaded?.versions).toHaveLength(500);

        await provider.close();
      });
    });
  });

  describe('Search capabilities via indexed columns', () => {
    it('should support efficient listing sorted by date', async () => {
      await withTempDb(async (dbPath) => {
        const provider = new SqliteStorageProvider({ filePath: dbPath });

        // Save projects with specific timestamps
        const timestamps = [
          '2024-01-15T10:30:00.000Z',
          '2024-01-10T08:00:00.000Z',
          '2024-01-20T14:45:00.000Z',
          '2024-01-05T12:00:00.000Z',
        ] as const;

        for (let i = 0; i < timestamps.length; i++) {
          const snapshot = buildProjectSnapshot(
            { name: `Project ${String.fromCharCode(65 + i)}` }, // A, B, C, D
            { clock }
          );
          (snapshot as unknown as { project: { updatedAt: ISO8601Timestamp } }).project.updatedAt =
            timestamps[i] as ISO8601Timestamp;
          await provider.saveSnapshot(snapshot);
        }

        // Get summaries - should be sorted by updated_at DESC
        const summaries = await provider.listSummaries();

        // Verify order (most recent first)
        expect(summaries[0]?.name).toBe('Project C'); // 2024-01-20
        expect(summaries[1]?.name).toBe('Project A'); // 2024-01-15
        expect(summaries[2]?.name).toBe('Project B'); // 2024-01-10
        expect(summaries[3]?.name).toBe('Project D'); // 2024-01-05

        await provider.close();
      });
    });
  });

  describe('Database file operations', () => {
    it('should create database file if not exists', async () => {
      const tempPath = getTempDbPath();

      // Ensure file doesn't exist
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }

      const provider = new SqliteStorageProvider({ filePath: tempPath });

      // Save something to trigger creation
      await provider.saveSnapshot(buildProjectSnapshot({ name: 'Test' }, { clock }));

      // Verify file was created
      expect(existsSync(tempPath)).toBe(true);

      await provider.close();

      // Cleanup
      unlinkSync(tempPath);
    });

    it('should open existing database', async () => {
      const tempPath = getTempDbPath();

      // First session - create and save
      const provider1 = new SqliteStorageProvider({ filePath: tempPath });
      const snapshot = buildProjectSnapshot({ name: 'Persistent Project' }, { clock });
      await provider1.saveSnapshot(snapshot);
      await provider1.close();

      // Second session - open and read
      const provider2 = new SqliteStorageProvider({ filePath: tempPath });
      const loaded = await provider2.loadSnapshot(snapshot.project.id);
      expect(loaded?.project.name).toBe('Persistent Project');
      await provider2.close();

      // Cleanup
      unlinkSync(tempPath);
    });
  });
});
