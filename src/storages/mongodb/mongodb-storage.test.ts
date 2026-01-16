import { describe, expect, it, beforeEach } from 'vitest';
import type { MongoClient } from 'mongodb';
import type { ProjectSnapshot } from '../../models/project.js';
import type { ProjectId, ISO8601Timestamp } from '../../models/base.js';
import { MongoDbStorageProvider } from './mongodb-storage.js';
import { createMockMongoClient } from './mocks/mongo-collection.js';

// Helper to create a test snapshot
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

describe('MongoDbStorageProvider', () => {
  let mockClient: ReturnType<typeof createMockMongoClient>['mockClient'];
  let mockCollection: ReturnType<typeof createMockMongoClient>['mockCollection'];
  let provider: MongoDbStorageProvider;

  beforeEach(() => {
    const mocks = createMockMongoClient();
    mockClient = mocks.mockClient;
    mockCollection = mocks.mockCollection;
    provider = new MongoDbStorageProvider({ client: mockClient as unknown as MongoClient });
  });

  describe('constructor', () => {
    it('should create with default id', () => {
      const p = new MongoDbStorageProvider({ client: mockClient as unknown as MongoClient });
      expect(p.id).toBe('mongodb');
    });

    it('should create with custom id', () => {
      const p = new MongoDbStorageProvider({
        id: 'custom-mongo',
        client: mockClient as unknown as MongoClient,
      });
      expect(p.id).toBe('custom-mongo');
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

    it('should update existing snapshot', async () => {
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
    });

    it('should call updateOne with upsert option', async () => {
      const snapshot = createTestSnapshot('proj-1', 'Test');

      await provider.saveSnapshot(snapshot);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { 'project.id': snapshot.project.id },
        { $set: snapshot },
        { upsert: true }
      );
    });

    it('should call findOne with correct filter and projection', async () => {
      const snapshot = createTestSnapshot('proj-1', 'Test');
      await provider.saveSnapshot(snapshot);

      await provider.loadSnapshot(snapshot.project.id);

      expect(mockCollection.findOne).toHaveBeenCalledWith(
        { 'project.id': snapshot.project.id },
        { projection: { _id: 0 } }
      );
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
        '2024-01-02T10:00:00.000Z' as ISO8601Timestamp
      );

      await provider.saveSnapshot(old);
      await provider.saveSnapshot(newer);

      const summaries = await provider.listSummaries();

      expect(summaries).toHaveLength(2);
      expect(summaries[0]?.id).toBe('proj-2');
      expect(summaries[1]?.id).toBe('proj-1');
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
  });

  describe('close', () => {
    it('should close the connection when provider owns the client', async () => {
      const p = new MongoDbStorageProvider({ connectionString: 'mongodb://localhost' });
      // Simulate connection being established
      (p as unknown as { client: Partial<MongoClient>; ownsClient: boolean }).client = mockClient;
      (p as unknown as { ownsClient: boolean }).ownsClient = true;

      await p.close();

      expect(mockClient.close).toHaveBeenCalled();
    });

    it('should not close externally provided client', async () => {
      await provider.close();

      expect(mockClient.close).not.toHaveBeenCalled();
    });
  });
});
