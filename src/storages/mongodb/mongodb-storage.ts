import type { Collection, Db, MongoClient } from 'mongodb';
import type {
  ISO8601Timestamp,
  OwnerInfo,
  ProjectId,
  UserId,
  UserGroupId,
} from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type {
  ProjectListResult,
  ProjectListSummary,
  ProjectsQuery,
  ProjectSnapshot,
  ProjectSummary,
} from '../../models/project.js';

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
const DEFAULT_PAGE_SIZE = 50;

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

    // Create indexes for efficient querying
    // Run asynchronously without blocking - indexes will be created in the background
    // Check if createIndex exists (may not exist in test mocks)
    if (typeof this.snapshots.createIndex === 'function') {
      this.snapshots.createIndex({ 'project.owner.userId': 1 }).catch(() => {
        // Ignore index creation errors (may already exist)
      });
      this.snapshots.createIndex({ 'project.owner.userGroupId': 1 }).catch(() => {
        // Ignore index creation errors
      });
      this.snapshots.createIndex({ 'project.updatedBy.userId': 1 }).catch(() => {
        // Ignore index creation errors
      });
      this.snapshots.createIndex({ 'project.createdAt': -1 }).catch(() => {
        // Ignore index creation errors
      });
    }
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

    const snapshots = await this.snapshots!.find(
      {},
      {
        projection: {
          _id: 0,
          'project.id': 1,
          'project.name': 1,
          'project.description': 1,
          'project.updatedAt': 1,
        },
      }
    )
      .sort({ 'project.updatedAt': -1 })
      .toArray();

    return snapshots.map((snapshot) => {
      const { id, name, description, updatedAt } = snapshot.project;
      return { id, name, description, updatedAt };
    });
  }

  /**
   * Lists projects with filtering, sorting, and pagination support.
   *
   * Security behavior:
   * - If `includeAll` is true, returns all projects (privileged operation)
   * - If `ownerUserId` is provided, returns only projects owned by that user
   * - If `ownerGroupId` is provided, returns only projects owned by that group
   * - If neither is provided, returns only projects WITHOUT owner info
   *
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of projects with metadata
   */
  async listProjects(query?: ProjectsQuery): Promise<ProjectListResult> {
    await this.ensureInitialized();

    const limit = query?.limit ?? DEFAULT_PAGE_SIZE;
    const page = query?.page ?? 1;
    const skip = (page - 1) * limit;

    // Build filter object from query
    const filter: Record<string, unknown> = {};

    // Security: Apply ownership filtering unless includeAll is explicitly true
    if (!query?.includeAll) {
      if (query?.ownerUserId) {
        filter['project.owner.userId'] = query.ownerUserId;
      } else if (query?.ownerGroupId) {
        filter['project.owner.userGroupId'] = query.ownerGroupId;
      } else {
        // No owner specified - only return projects WITHOUT owner info
        filter['project.owner.userId'] = { $exists: false };
      }
    }

    if (query?.namePattern) {
      filter['project.name'] = { $regex: query.namePattern, $options: 'i' };
    }

    if (query?.createdAfter || query?.createdBefore) {
      filter['project.createdAt'] = {};
      if (query.createdAfter) {
        (filter['project.createdAt'] as Record<string, string>).$gte = query.createdAfter;
      }
      if (query.createdBefore) {
        (filter['project.createdAt'] as Record<string, string>).$lte = query.createdBefore;
      }
    }

    if (query?.updatedAfter || query?.updatedBefore) {
      filter['project.updatedAt'] = {};
      if (query.updatedAfter) {
        (filter['project.updatedAt'] as Record<string, string>).$gte = query.updatedAfter;
      }
      if (query.updatedBefore) {
        (filter['project.updatedAt'] as Record<string, string>).$lte = query.updatedBefore;
      }
    }

    // Count total matching documents
    const totalCount = await this.snapshots!.countDocuments(filter);

    // Aggregation pipeline to get paginated results with computed fields
    const pipeline = [
      { $match: filter },
      {
        $project: {
          _id: 0,
          'project.id': 1,
          'project.name': 1,
          'project.description': 1,
          'project.createdAt': 1,
          'project.updatedAt': 1,
          'project.owner': 1,
          'project.updatedBy': 1,
          partsCount: { $size: '$parts' },
          combosCount: { $size: '$combos' },
          // Compute combo latest update info using aggregation
          comboLatestUpdateAt: {
            $let: {
              var: 'combos',
              in: {
                $cond: {
                  if: { $gt: [{ $size: '$combos' }, 0] },
                  then: {
                    $reduce: {
                      input: '$combos',
                      initialValue: { updatedAt: '' },
                      in: {
                        $max: [
                          '$$value.updatedAt',
                          '$$this.updatedAt',
                        ],
                      },
                    },
                  },
                  else: null,
                },
              },
            },
          },
          comboLatestName: {
            $let: {
              var: 'combos',
              in: {
                $cond: {
                  if: { $gt: [{ $size: '$combos' }, 0] },
                  then: {
                    $reduce: {
                      input: '$combos',
                      initialValue: { updatedAt: '', name: '' },
                      in: {
                        $cond: {
                          if: { $gt: ['$$this.updatedAt', '$$value.updatedAt'] },
                          then: {
                            updatedAt: '$$this.updatedAt',
                            name: '$$this.name',
                            updatedBy: '$$this.updatedBy',
                          },
                          else: '$$value',
                        },
                      },
                    },
                  },
                  else: null,
                },
              },
            },
          },
          comboLatestUpdateBy: {
            $let: {
              var: 'combos',
              in: {
                $cond: {
                  if: { $gt: [{ $size: '$combos' }, 0] },
                  then: {
                    $reduce: {
                      input: '$combos',
                      initialValue: { updatedAt: '', updatedBy: null },
                      in: {
                        $cond: {
                          if: { $gt: ['$$this.updatedAt', '$$value.updatedAt'] },
                          then: {
                            updatedAt: '$$this.updatedAt',
                            updatedBy: '$$this.updatedBy',
                          },
                          else: '$$value',
                        },
                      },
                    },
                  },
                  else: null,
                },
              },
            },
          },
        },
      },
      { $sort: { 'project.updatedAt': -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const snapshots = await this.snapshots!.aggregate(pipeline).toArray();

    const projects: ProjectListSummary[] = snapshots.map((doc: unknown) => {
      const snapshot = doc as {
        project: {
          id: ProjectId;
          name: string;
          description?: string;
          createdAt: ISO8601Timestamp;
          updatedAt: ISO8601Timestamp;
          owner?: {
            userName: string;
            userId: UserId;
            userGroupId?: UserGroupId;
          };
          updatedBy?: {
            userName: string;
            userId: UserId;
            userGroupId?: UserGroupId;
            type?: 'user' | 'group';
          };
        };
        partsCount: number;
        combosCount: number;
        comboLatestUpdateAt: string | null;
        comboLatestName: { name: string } | null;
        comboLatestUpdateBy: { updatedBy: import('../../models/base.js').OwnerInfo } | null;
      };

      // Extract combo latest info from aggregation result
      const comboLatestInfo = {
        comboLatestUpdateAt: snapshot.comboLatestUpdateAt ?? undefined,
        comboLatestName: snapshot.comboLatestName?.name ?? undefined,
        comboLatestUpdateBy: snapshot.comboLatestUpdateBy?.updatedBy ?? undefined,
      };

      return {
        id: snapshot.project.id,
        name: snapshot.project.name,
        description: snapshot.project.description,
        owner: snapshot.project.owner as OwnerInfo | undefined,
        updatedBy: snapshot.project.updatedBy as OwnerInfo | undefined,
        createdAt: snapshot.project.createdAt,
        updatedAt: snapshot.project.updatedAt,
        partsCount: snapshot.partsCount,
        combosCount: snapshot.combosCount,
        ...comboLatestInfo,
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = page;
    const hasNext = currentPage < totalPages;
    const hasPrevious = currentPage > 1;

    return {
      projects,
      pagination: {
        currentPage,
        pageSize: limit,
        totalCount,
        totalPages,
        hasNext,
        hasPrevious,
      },
    };
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
