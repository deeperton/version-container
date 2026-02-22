import type { Db, MongoClient } from 'mongodb';
import type { ProjectSnapshot } from '../../../models/project.js';
import type { ProjectId } from '../../../models/base.js';
import { vi } from 'vitest';

/**
 * Mock MongoDB collection methods for testing.
 */
export interface MockMongoCollection {
  findOne: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock MongoDB collection for testing.
 * Uses an in-memory Map to simulate storage behavior.
 */
export function createMockMongoCollection(): MockMongoCollection {
  const store = new Map<string, ProjectSnapshot>();

  const findOne = vi.fn((filter: { 'project.id'?: ProjectId }) => {
    const projectId = filter['project.id'];
    if (!projectId) {
      return Promise.resolve(null);
    }
    const doc = store.get(projectId);
    if (!doc) {
      return Promise.resolve(null);
    }
    // Mimic projection by excluding _id (we don't store it, but behave like MongoDB)
    return Promise.resolve(doc);
  });

  const updateOne = vi.fn(
    (filter: { 'project.id'?: ProjectId }, update: { $set?: ProjectSnapshot }) => {
      const projectId = filter['project.id'];
      const snapshot = update.$set;
      if (projectId && snapshot) {
        store.set(projectId, snapshot);
      }
      return Promise.resolve({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    }
  );

  const find = vi.fn((): { sort: ReturnType<typeof vi.fn> } => {
    const toArray = async (): Promise<ProjectSnapshot[]> => {
      const docs = Array.from(store.values());
      // Sort by updatedAt descending
      return docs.sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
    };

    const mockSort = vi.fn((): { toArray: typeof toArray } => ({ toArray }));
    return { sort: mockSort };
  });

  return { findOne, updateOne, find };
}

/**
 * Creates a mock MongoDB client, db, and collection for testing.
 */
export function createMockMongoClient(): {
  mockClient: Partial<MongoClient>;
  mockDb: Partial<Db>;
  mockCollection: MockMongoCollection;
} {
  const mockCollection = createMockMongoCollection();

  const mockDb: Partial<Db> = {
    collection: vi.fn(() => mockCollection) as unknown as Db['collection'],
  };

  const mockClient: Partial<MongoClient> = {
    db: vi.fn(() => mockDb) as unknown as MongoClient['db'],
    close: vi.fn(() => Promise.resolve()),
  };

  return { mockClient, mockDb, mockCollection };
}

/**
 * Creates a mock collection with pre-populated data.
 */
export function createMockCollectionWithData(
  snapshots: readonly ProjectSnapshot[]
): MockMongoCollection {
  const mockCollection = createMockMongoCollection();

  // Pre-populate the store
  for (const snapshot of snapshots) {
    void mockCollection.updateOne({ 'project.id': snapshot.project.id }, { $set: snapshot });
  }

  return mockCollection;
}
