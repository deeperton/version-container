import type { Collection, Db, MongoClient } from 'mongodb';
import type { ProjectId } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type { ProjectSnapshot, ProjectSummary } from '../../models/project.js';

/**
 * Options for configuring the MongoDB storage provider.
 */
export interface MongoDbStorageOptions {
  /**
   * MongoDB connection string. Defaults to 'mongodb://localhost:27017'.
   */
  readonly connectionString?: string;
  /**
   * Database name. Defaults to 'version-container'.
   */
  readonly database?: string;
  /**
   * Collection name for snapshots. Defaults to 'snapshots'.
   */
  readonly collection?: string;
  /**
   * Optional pre-configured MongoDB client for dependency injection or testing.
   * When provided, connection management is the caller's responsibility.
   */
  readonly client?: MongoClient;
  /**
   * Storage provider identifier. Defaults to 'mongodb'.
   */
  readonly id?: string;
}

const DEFAULT_CONNECTION_STRING = 'mongodb://localhost:27017';
const DEFAULT_DATABASE = 'version-container';
const DEFAULT_COLLECTION = 'snapshots';
const DEFAULT_ID = 'mongodb';

/**
 * MongoDB storage provider for persisting project snapshots.
 *
 * This provider stores full project snapshots in a MongoDB collection.
 * Each snapshot is stored as a single document with the project ID as the query key.
 *
 * @example
 * ```typescript
 * import { MongoDbStorageProvider } from 'version-container';
 *
 * const provider = new MongoDbStorageProvider({
 *   connectionString: 'mongodb://localhost:27017',
 *   database: 'my-app'
 * });
 *
 * await provider.saveSnapshot(snapshot);
 * const loaded = await provider.loadSnapshot(snapshot.project.id);
 * ```
 */
export class MongoDbStorageProvider implements StorageProvider {
  readonly id: string;
  private client: MongoClient;
  private db: Db | null = null;
  private snapshots: Collection<ProjectSnapshot> | null = null;
  private readonly connectionString: string;
  private readonly databaseName: string;
  private readonly collectionName: string;
  private ownsClient: boolean;

  constructor(options: MongoDbStorageOptions = {}) {
    this.id = options.id ?? DEFAULT_ID;
    this.connectionString = options.connectionString ?? DEFAULT_CONNECTION_STRING;
    this.databaseName = options.database ?? DEFAULT_DATABASE;
    this.collectionName = options.collection ?? DEFAULT_COLLECTION;
    this.client = options.client ?? (null as unknown as MongoClient);
    this.ownsClient = !options.client;

    if (!this.ownsClient && this.client) {
      // Client provided externally, initialize immediately
      this.initializeFromClient(this.client);
    }
  }

  private initializeFromClient(client: MongoClient): void {
    this.client = client;
    this.db = client.db(this.databaseName);
    this.snapshots = this.db.collection<ProjectSnapshot>(this.collectionName);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.snapshots) {
      return;
    }

    // Lazy connect only when first used
    const { MongoClient } = await import('mongodb');
    this.client = new MongoClient(this.connectionString);
    await this.client.connect();
    this.initializeFromClient(this.client);
  }

  /**
   * Loads a project snapshot by ID.
   *
   * @param projectId - The project ID to load
   * @returns The snapshot or undefined if not found
   */
  async loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined> {
    await this.ensureInitialized();

    const doc = await this.snapshots!.findOne(
      { 'project.id': projectId },
      { projection: { _id: 0 } }
    );

    return doc ?? undefined;
  }

  /**
   * Saves a project snapshot.
   * Uses upsert semantics: updates if exists, inserts if new.
   *
   * @param snapshot - The snapshot to save
   */
  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    await this.ensureInitialized();

    await this.snapshots!.updateOne(
      { 'project.id': snapshot.project.id },
      { $set: snapshot },
      { upsert: true }
    );
  }

  /**
   * Lists all project summaries sorted by updatedAt descending.
   *
   * @returns Array of project summaries
   */
  async listSummaries(): Promise<readonly ProjectSummary[]> {
    await this.ensureInitialized();

    const snapshots = await this.snapshots!
      .find({}, { projection: { _id: 0, 'project.id': 1, 'project.name': 1, 'project.description': 1, 'project.updatedAt': 1 } })
      .sort({ 'project.updatedAt': -1 })
      .toArray();

    return snapshots.map((snapshot) => {
      const { id, name, description, updatedAt } = snapshot.project;
      return { id, name, description, updatedAt };
    });
  }

  /**
   * Closes the MongoDB connection.
   * Only closes the connection if this instance created the client.
   */
  async close(): Promise<void> {
    if (this.ownsClient && this.client) {
      await this.client.close();
      this.db = null;
      this.snapshots = null;
    }
  }
}
