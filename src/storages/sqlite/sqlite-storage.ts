import type { Database, RunResult } from 'better-sqlite3';
import type {
  ProjectId,
  UserId,
  UserGroupId,
  ISO8601Timestamp,
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
 * Options for configuring the SQLite storage provider.
 */
export interface SqliteStorageOptions {
  /**
   * File path to the SQLite database.
   * Use ':memory:' for in-memory database.
   * Defaults to './version-container.db'.
   */
  readonly filePath?: string;
  /**
   * Optional pre-configured database instance for dependency injection or testing.
   * When provided, connection management is the caller's responsibility.
   */
  readonly db?: Database;
  /**
   * Storage provider identifier. Defaults to 'sqlite'.
   */
  readonly id?: string;
}

const DEFAULT_FILE_PATH = './version-container.db';
const DEFAULT_ID = 'sqlite';
const DEFAULT_PAGE_SIZE = 50;
const CURRENT_ADAPTER_VERSION = 2;

/**
 * Database migration definition.
 */
interface Migration {
  readonly version: number;
  readonly description: string;
  readonly up: (db: Database) => void;
}

/**
 * Migration history for the SQLite adapter.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 2,
    description: 'Add owner and stats columns to snapshots table',
    up: (db: Database): void => {
      // Helper function to add column if it doesn't exist
      const addColumnIfNotExists = (tableName: string, columnName: string, columnDef: string): void => {
        const columns = db
          .prepare(`PRAGMA table_info(${tableName})`)
          .all() as Array<{ name: string }>;
        const columnNames = columns.map((c) => c.name);
        if (!columnNames.includes(columnName)) {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        }
      };

      addColumnIfNotExists('snapshots', 'owner_user_name', 'TEXT');
      addColumnIfNotExists('snapshots', 'owner_user_id', 'TEXT');
      addColumnIfNotExists('snapshots', 'owner_user_group_id', 'TEXT');
      addColumnIfNotExists('snapshots', 'parts_count', 'INTEGER DEFAULT 0');
      addColumnIfNotExists('snapshots', 'combos_count', 'INTEGER DEFAULT 0');

      // Create indexes - ignore errors if columns don't exist yet
      const tryCreateIndex = (sql: string): void => {
        try {
          db.exec(sql);
        } catch {
          // Index creation might fail if columns don't exist yet, that's ok
        }
      };

      tryCreateIndex('CREATE INDEX IF NOT EXISTS idx_snapshots_owner_user_id ON snapshots(owner_user_id)');
      tryCreateIndex('CREATE INDEX IF NOT EXISTS idx_snapshots_owner_user_group_id ON snapshots(owner_user_group_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at DESC)');
    },
  },
];

/**
 * SQLite storage provider for persisting project snapshots.
 *
 * This provider stores full project snapshots in a SQLite database.
 * Each snapshot is stored as a JSON document with indexed columns for efficient querying.
 *
 * The database schema includes:
 * - `project_id`: Primary key for direct lookups
 * - `name`: Indexed for name-based searches
 * - `created_at`, `updated_at`: Indexed for date filtering and sorting
 * - `owner_user_id`, `owner_user_group_id`: Indexed for owner filtering
 * - `parts_count`, `combos_count`: Computed statistics
 * - `data`: Full JSON document (source of truth)
 *
 * The adapter includes a migration system to handle schema evolution. The current
 * schema version is stored in the `_adapter_state` table.
 *
 * @example
 * ```typescript
 * import { SqliteStorageProvider } from 'version-container';
 *
 * const provider = new SqliteStorageProvider({
 *   filePath: './my-projects.db'
 * });
 *
 * await provider.saveSnapshot(snapshot);
 * const loaded = await provider.loadSnapshot(snapshot.project.id);
 * const result = await provider.listProjects({ ownerUserId: 'user-123' });
 * ```
 */
export class SqliteStorageProvider implements StorageProvider {
  readonly id: string;

  private db: Database | null = null;
  private readonly filePath: string;
  private ownsDb: boolean;
  private initialized: boolean = false;

  // Prepared statements for performance
  private loadStmt:
    | {
        get(projectId: string): { data: string } | undefined;
      }
    | null = null;
  private saveStmt:
    | {
        run(
          projectId: string,
          name: string,
          description: string | null,
          createdAt: string,
          updatedAt: string,
          ownerUserName: string | null,
          ownerUserId: string | null,
          ownerUserGroupId: string | null,
          partsCount: number,
          combosCount: number,
          data: string
        ): RunResult;
      }
    | null = null;
  private listStmt:
    | {
        all(): readonly {
          project_id: string;
          name: string;
          description: string | null;
          updated_at: string;
        }[];
      }
    | null = null;

  constructor(options: SqliteStorageOptions = {}) {
    this.id = options.id ?? DEFAULT_ID;
    this.filePath = options.filePath ?? DEFAULT_FILE_PATH;

    if (options.db) {
      this.db = options.db;
      this.ownsDb = false;
      this.initializeFromDb(options.db);
    } else {
      this.db = null;
      this.ownsDb = true;
    }
  }

  private initializeFromDb(db: Database): void {
    this.db = db;
    this.createSchema(db);
    this.runMigrations(db);
    this.prepareStatements(db);
    this.initialized = true;
  }

  /**
   * Runs pending migrations to bring the database schema up to current version.
   */
  private runMigrations(db: Database): void {
    // Create adapter state table if it doesn't exist
    const createStateTable = db.prepare(`
      CREATE TABLE IF NOT EXISTS _adapter_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    createStateTable.run();

    // Get current version
    const getVersionStmt = db.prepare(
      'SELECT value FROM _adapter_state WHERE key = ?'
    );
    const result = getVersionStmt.get('version') as { value: string } | undefined;
    const currentVersion = result ? parseInt(result.value, 10) : 1;

    // Run pending migrations
    for (const migration of MIGRATIONS) {
      if (migration.version > currentVersion) {
        migration.up(db);
      }
    }

    // Update version
    const setVersionStmt = db.prepare(
      'INSERT OR REPLACE INTO _adapter_state (key, value) VALUES (?, ?)'
    );
    setVersionStmt.run('version', CURRENT_ADAPTER_VERSION.toString());
  }

  private createSchema(db: Database): void {
    // Create main snapshots table with all columns (for fresh databases)
    // ALTER TABLE statements in migrations will add columns to existing databases
    const createTable = db.prepare(`
      CREATE TABLE IF NOT EXISTS snapshots (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        owner_user_name TEXT,
        owner_user_id TEXT,
        owner_user_group_id TEXT,
        parts_count INTEGER DEFAULT 0,
        combos_count INTEGER DEFAULT 0,
        data TEXT NOT NULL
      )
    `);
    createTable.run();

    const createNameIndex = db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_name ON snapshots(name)
    `);
    createNameIndex.run();

    const createUpdatedAtIndex = db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_updated_at ON snapshots(updated_at DESC)
    `);
    createUpdatedAtIndex.run();

    const createCreatedAtIndex = db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at DESC)
    `);
    createCreatedAtIndex.run();

    // Create indexes for owner filtering - only if columns exist
    // (for databases upgraded from version 1, columns will be added by migrations first)
    const columns = db
      .prepare(`PRAGMA table_info(snapshots)`)
      .all() as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);

    if (columnNames.includes('owner_user_id')) {
      const createOwnerUserIdIndex = db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_owner_user_id ON snapshots(owner_user_id)
      `);
      createOwnerUserIdIndex.run();
    }

    if (columnNames.includes('owner_user_group_id')) {
      const createOwnerUserGroupIdIndex = db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_owner_user_group_id ON snapshots(owner_user_group_id)
      `);
      createOwnerUserGroupIdIndex.run();
    }
  }

  private prepareStatements(db: Database): void {
    // Prepare load statement
    this.loadStmt = db.prepare(`
      SELECT data FROM snapshots WHERE project_id = ?
    `);

    // Prepare save statement with upsert semantics
    // Uses INSERT with ON CONFLICT for compatibility with SQLite versions that don't support MERGE
    this.saveStmt = db.prepare(`
      INSERT INTO snapshots (
        project_id, name, description, created_at, updated_at,
        owner_user_name, owner_user_id, owner_user_group_id,
        parts_count, combos_count, data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        owner_user_name = excluded.owner_user_name,
        owner_user_id = excluded.owner_user_id,
        owner_user_group_id = excluded.owner_user_group_id,
        parts_count = excluded.parts_count,
        combos_count = excluded.combos_count,
        data = excluded.data
    `);

    // Prepare list statement (sorted by updated_at descending)
    // Note: This doesn't include owner info - kept for backward compatibility
    this.listStmt = db.prepare(`
      SELECT project_id, name, description, updated_at
      FROM snapshots
      ORDER BY updated_at DESC
    `);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Lazy import and connection only when first used
    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.filePath);
    this.initializeFromDb(this.db);
  }

  /**
   * Loads a project snapshot by ID.
   *
   * @param projectId - The project ID to load
   * @returns The snapshot or undefined if not found
   * @throws Error if JSON parsing fails
   */
  async loadSnapshot(
    projectId: ProjectId
  ): Promise<ProjectSnapshot | undefined> {
    await this.ensureInitialized();

    const row = this.loadStmt!.get(projectId as string);
    if (!row || !row.data) {
      return undefined;
    }

    try {
      return JSON.parse(row.data) as ProjectSnapshot;
    } catch (error) {
      throw new Error(
        `Failed to parse snapshot data for project "${projectId}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Saves a project snapshot.
   * Uses upsert semantics: updates if exists, inserts if new.
   *
   * Extracts owner information and statistics to indexed columns for efficient querying.
   *
   * @param snapshot - The snapshot to save
   * @throws Error if serialization or database operation fails
   */
  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    await this.ensureInitialized();

    const { project } = snapshot;
    const serialized = JSON.stringify(snapshot);

    // Extract owner information for indexed columns
    const ownerUserName = project.owner?.userName ?? null;
    const ownerUserId = project.owner?.userId ?? null;
    const ownerUserGroupId = project.owner?.userGroupId ?? null;

    // Compute statistics
    const partsCount = snapshot.parts.length;
    const combosCount = snapshot.combos.length;

    try {
      this.saveStmt!.run(
        project.id as string,
        project.name,
        project.description ?? null,
        project.createdAt as string,
        project.updatedAt as string,
        ownerUserName,
        ownerUserId as string | null,
        ownerUserGroupId as string | null,
        partsCount,
        combosCount,
        serialized
      );
    } catch (error) {
      throw new Error(
        `Failed to save snapshot for project "${project.id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Lists all project summaries sorted by updatedAt descending.
   *
   * @returns Array of project summaries
   */
  async listSummaries(): Promise<readonly ProjectSummary[]> {
    await this.ensureInitialized();

    const rows = this.listStmt!.all();

    return rows.map(
      (row: {
        project_id: string;
        name: string;
        description: string | null;
        updated_at: string;
      }) => ({
        id: row.project_id as ProjectId,
        name: row.name,
        description: row.description ?? undefined,
        updatedAt: row.updated_at as ISO8601Timestamp,
      })
    );
  }

  /**
   * Lists projects with filtering, sorting, and pagination support.
   *
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of projects with metadata
   */
  async listProjects(query?: ProjectsQuery): Promise<ProjectListResult> {
    await this.ensureInitialized();

    const limit = query?.limit ?? DEFAULT_PAGE_SIZE;
    const page = query?.page ?? 1;
    const offset = (page - 1) * limit;

    // Build WHERE clauses dynamically based on query
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    if (query?.ownerUserId) {
      whereClauses.push('owner_user_id = ?');
      params.push(query.ownerUserId as string);
    }

    if (query?.ownerGroupId) {
      whereClauses.push('owner_user_group_id = ?');
      params.push(query.ownerGroupId as string);
    }

    if (query?.namePattern) {
      // Use COLLATE NOCASE for case-insensitive search
      whereClauses.push('name LIKE ? COLLATE NOCASE');
      params.push(`%${query.namePattern}%`);
    }

    if (query?.createdAfter) {
      whereClauses.push('created_at >= ?');
      params.push(query.createdAfter as string);
    }

    if (query?.createdBefore) {
      whereClauses.push('created_at <= ?');
      params.push(query.createdBefore as string);
    }

    if (query?.updatedAfter) {
      whereClauses.push('updated_at >= ?');
      params.push(query.updatedAfter as string);
    }

    if (query?.updatedBefore) {
      whereClauses.push('updated_at <= ?');
      params.push(query.updatedBefore as string);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM snapshots ${whereClause}`;
    const countStmt = this.db!.prepare(countSql);
    const countResult = countStmt.get(...params) as { count: number };
    const totalCount = countResult.count;

    // Get paginated results
    const dataSql = `
      SELECT
        project_id, name, description, created_at, updated_at,
        owner_user_name, owner_user_id, owner_user_group_id,
        parts_count, combos_count
      FROM snapshots
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const dataStmt = this.db!.prepare(dataSql);
    const rows = dataStmt.all(...params, limit, offset) as readonly {
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
    }[];

    const projects: ProjectListSummary[] = rows.map((row) => {
      const summary: ProjectListSummary = {
        id: row.project_id as ProjectId,
        name: row.name,
        description: row.description ?? undefined,
        createdAt: row.created_at as ISO8601Timestamp,
        updatedAt: row.updated_at as ISO8601Timestamp,
        partsCount: row.parts_count,
        combosCount: row.combos_count,
        ...(row.owner_user_id &&
          row.owner_user_name && {
            owner: {
              userName: row.owner_user_name,
              userId: row.owner_user_id as UserId,
              ...(row.owner_user_group_id && {
                userGroupId: row.owner_user_group_id as UserGroupId,
              }),
            },
          }),
      };

      return summary;
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
   * Closes the SQLite database connection.
   * Only closes the connection if this instance created the database.
   */
  async close(): Promise<void> {
    if (this.ownsDb && this.db) {
      this.db.close();
      this.db = null;
      this.loadStmt = null;
      this.saveStmt = null;
      this.listStmt = null;
      this.initialized = false;
    }
  }
}
