import type { Database, RunResult } from 'better-sqlite3';
import type { ProjectId } from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type { ProjectSnapshot, ProjectSummary } from '../../models/project.js';
import type { ISO8601Timestamp } from '../../models/base.js';

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

/**
 * SQLite storage provider for persisting project snapshots.
 *
 * This provider stores full project snapshots in a SQLite database.
 * Each snapshot is stored as a JSON document with indexed columns for efficient querying.
 *
 * The database schema includes:
 * - `project_id`: Primary key for direct lookups
 * - `name`: Indexed for name-based searches
 * - `updated_at`: Indexed for chronological sorting
 * - `data`: Full JSON document
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
 * const summaries = await provider.listSummaries();
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
    this.prepareStatements(db);
    this.initialized = true;
  }

  private createSchema(db: Database): void {
    // Create main snapshots table
    const createTable = db.prepare(`
      CREATE TABLE IF NOT EXISTS snapshots (
        project_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `);
    createTable.run();

    // Create index for name searches
    const createNameIndex = db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_name ON snapshots(name)
    `);
    createNameIndex.run();

    // Create index for updated_at sorting (descending)
    const createUpdatedAtIndex = db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_updated_at ON snapshots(updated_at DESC)
    `);
    createUpdatedAtIndex.run();
  }

  private prepareStatements(db: Database): void {
    // Prepare load statement
    this.loadStmt = db.prepare(`
      SELECT data FROM snapshots WHERE project_id = ?
    `);

    // Prepare save statement with upsert semantics
    this.saveStmt = db.prepare(`
      INSERT INTO snapshots (project_id, name, description, created_at, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        data = excluded.data
    `);

    // Prepare list statement (sorted by updated_at descending)
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
  async loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined> {
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
   * @param snapshot - The snapshot to save
   * @throws Error if serialization or database operation fails
   */
  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    await this.ensureInitialized();

    const { project } = snapshot;
    const serialized = JSON.stringify(snapshot);

    try {
      this.saveStmt!.run(
        project.id as string,
        project.name,
        project.description ?? null,
        project.createdAt as string,
        project.updatedAt as string,
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
