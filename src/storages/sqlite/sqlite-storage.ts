import type { Database, RunResult } from 'better-sqlite3';
import type {
  ProjectId,
  UserId,
  UserGroupId,
  ISO8601Timestamp,
  TagType,
  TagId,
  OwnerInfo,
} from '../../models/base.js';
import type { StorageProvider } from '../../models/adapter.js';
import type {
  ProjectListResult,
  ProjectListSummary,
  ProjectsQuery,
  ProjectSnapshot,
  ProjectSummary,
} from '../../models/project.js';
import type { TagDefinition } from '../../models/tag.js';
import type { VersionCombo } from '../../models/combo.js';

/**
 * Options for configuring the SQLite storage provider.
 */

/**
 * Computes the latest combo update information for a project.
 */
function computeComboLatestInfo(combos: readonly VersionCombo[]): {
  comboLatestUpdateAt?: ISO8601Timestamp;
  comboLatestUpdateBy?: OwnerInfo;
  comboLatestName?: string;
} {
  if (combos.length === 0) {
    return {
      comboLatestUpdateAt: undefined,
      comboLatestUpdateBy: undefined,
      comboLatestName: undefined,
    };
  }

  const latestCombo = combos.reduce((latest, combo) =>
    combo.updatedAt > latest.updatedAt ? combo : latest
  );

  return {
    comboLatestUpdateAt: latestCombo.updatedAt,
    comboLatestUpdateBy: latestCombo.updatedBy,
    comboLatestName: latestCombo.name,
  };
}
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
const CURRENT_ADAPTER_VERSION = 5;

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
      const addColumnIfNotExists = (
        tableName: string,
        columnName: string,
        columnDef: string
      ): void => {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
          name: string;
        }>;
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

      tryCreateIndex(
        'CREATE INDEX IF NOT EXISTS idx_snapshots_owner_user_id ON snapshots(owner_user_id)'
      );
      tryCreateIndex(
        'CREATE INDEX IF NOT EXISTS idx_snapshots_owner_user_group_id ON snapshots(owner_user_group_id)'
      );
      db.exec('CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at DESC)');
    },
  },
  {
    version: 3,
    description: 'Add normalized version_tags table for efficient version tag filtering',
    up: (db: Database): void => {
      // Create version_tags table with proper indexes
      db.exec(`
        CREATE TABLE IF NOT EXISTS version_tags (
          project_id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (project_id, version_id, tag),
          FOREIGN KEY (project_id) REFERENCES snapshots(project_id) ON DELETE CASCADE
        ) WITHOUT ROWID;
      `);

      // Index for tag-based queries (e.g., find all versions with tag 'stable')
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_version_tags_tag
        ON version_tags(tag);
      `);

      // Index for version-based queries (e.g., get all tags for a version)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_version_tags_version_id
        ON version_tags(version_id);
      `);

      // Composite index for efficient project+tag queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_version_tags_project_tag
        ON version_tags(project_id, tag);
      `);
    },
  },
  {
    version: 4,
    description: 'Add normalized tags table for ID-based tag management with rename support',
    up: (db: Database): void => {
      // Create tags table
      db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
          project_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL,
          PRIMARY KEY (project_id, tag_id),
          FOREIGN KEY (project_id) REFERENCES snapshots(project_id) ON DELETE CASCADE
        ) WITHOUT ROWID;
      `);

      // Indexes for tag lookups
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tags_project_name
        ON tags(project_id, name);
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tags_project_type
        ON tags(project_id, type);
      `);

      // Create part_tag_ids table (replaces part tags in JSON)
      db.exec(`
        CREATE TABLE IF NOT EXISTS part_tag_ids (
          project_id TEXT NOT NULL,
          part_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (project_id, part_id, tag_id),
          FOREIGN KEY (project_id) REFERENCES snapshots(project_id) ON DELETE CASCADE
        ) WITHOUT ROWID;
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_part_tag_ids_tag_id
        ON part_tag_ids(tag_id);
      `);

      // Create version_tag_ids table
      db.exec(`
        CREATE TABLE IF NOT EXISTS version_tag_ids (
          project_id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (project_id, version_id, tag_id),
          FOREIGN KEY (project_id) REFERENCES snapshots(project_id) ON DELETE CASCADE
        ) WITHOUT ROWID;
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_version_tag_ids_tag_id
        ON version_tag_ids(tag_id);
      `);
    },
  },
  {
    version: 5,
    description: 'Add updatedBy columns for tracking last modifier',
    up: (db: Database): void => {
      // Helper function to add column if it doesn't exist
      const addColumnIfNotExists = (
        tableName: string,
        columnName: string,
        columnDef: string
      ): void => {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
          name: string;
        }>;
        const columnNames = columns.map((c) => c.name);
        if (!columnNames.includes(columnName)) {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        }
      };

      // Add updatedBy columns to snapshots table
      addColumnIfNotExists('snapshots', 'updatedBy_user_name', 'TEXT');
      addColumnIfNotExists('snapshots', 'updatedBy_user_id', 'TEXT');
      addColumnIfNotExists('snapshots', 'updatedBy_user_group_id', 'TEXT');

      // Migrate existing data: set updatedBy = owner for existing records
      db.exec(`
        UPDATE snapshots
        SET updatedBy_user_name = owner_user_name,
            updatedBy_user_id = owner_user_id,
            updatedBy_user_group_id = owner_user_group_id
        WHERE updatedBy_user_id IS NULL
      `);

      // Create index for updatedBy queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_snapshots_updatedBy_user_id
        ON snapshots(updatedBy_user_id);
      `);
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
  private loadStmt: {
    get(projectId: string): { data: string } | undefined;
  } | null = null;
  private saveStmt: {
    run(
      projectId: string,
      name: string,
      description: string | null,
      createdAt: string,
      updatedAt: string,
      ownerUserName: string | null,
      ownerUserId: string | null,
      ownerUserGroupId: string | null,
      updatedByUserName: string | null,
      updatedByUserId: string | null,
      updatedByUserGroupId: string | null,
      partsCount: number,
      combosCount: number,
      data: string
    ): RunResult;
  } | null = null;
  private listStmt: {
    all(): readonly {
      project_id: string;
      name: string;
      description: string | null;
      updated_at: string;
      owner_user_name: string | null;
      owner_user_id: string | null;
      owner_user_group_id: string | null;
      updatedBy_user_name: string | null;
      updatedBy_user_id: string | null;
      updatedBy_user_group_id: string | null;
    }[];
  } | null = null;

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
    const getVersionStmt = db.prepare('SELECT value FROM _adapter_state WHERE key = ?');
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
    const columns = db.prepare(`PRAGMA table_info(snapshots)`).all() as Array<{ name: string }>;
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
        updatedBy_user_name, updatedBy_user_id, updatedBy_user_group_id,
        parts_count, combos_count, data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        owner_user_name = excluded.owner_user_name,
        owner_user_id = excluded.owner_user_id,
        owner_user_group_id = excluded.owner_user_group_id,
        updatedBy_user_name = excluded.updatedBy_user_name,
        updatedBy_user_id = excluded.updatedBy_user_id,
        updatedBy_user_group_id = excluded.updatedBy_user_group_id,
        parts_count = excluded.parts_count,
        combos_count = excluded.combos_count,
        data = excluded.data
    `);

    // Prepare list statement (sorted by updated_at descending)
    this.listStmt = db.prepare(`
      SELECT
        project_id, name, description, updated_at,
        owner_user_name, owner_user_id, owner_user_group_id,
        updatedBy_user_name, updatedBy_user_id, updatedBy_user_group_id
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
      const snapshot = JSON.parse(row.data) as ProjectSnapshot;

      // Load tags from the normalized tables
      const tags = this.loadTags(this.db!, projectId as string);
      const partTagIds = this.loadPartTagIds(this.db!, projectId as string);
      const versionTagIds = this.loadVersionTagIds(this.db!, projectId as string);

      // Merge tag data into snapshot
      return {
        ...snapshot,
        tags,
        parts: snapshot.parts.map((p) => ({
          ...p,
          tagIds: partTagIds.get(p.id as string) as readonly TagId[] | undefined,
        })),
        versions: snapshot.versions.map((v) => ({
          ...v,
          tagIds: versionTagIds.get(v.id as string) as readonly TagId[] | undefined,
        })),
      };
    } catch (error) {
      throw new Error(
        `Failed to parse snapshot data for project "${projectId}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Loads tag definitions from the normalized tags table.
   * @param db - The database instance
   * @param projectId - The project ID
   * @returns Array of tag definitions
   */
  private loadTags(db: Database, projectId: string): TagDefinition[] {
    const rows = db
      .prepare(
        'SELECT tag_id, name, type, description, metadata, created_at FROM tags WHERE project_id = ?'
      )
      .all(projectId) as Array<{
        tag_id: string;
        name: string;
        type: TagType;
        description: string | null;
        metadata: string | null;
        created_at: string;
      }>;

    return rows.map((row) => ({
      id: row.tag_id as TagId,
      name: row.name,
      type: row.type,
      description: row.description ?? undefined,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
      createdAt: row.created_at as ISO8601Timestamp,
    }));
  }

  /**
   * Loads part tag associations from the normalized part_tag_ids table.
   * @param db - The database instance
   * @param projectId - The project ID
   * @returns Map of part ID to array of tag IDs
   */
  private loadPartTagIds(db: Database, projectId: string): Map<string, string[]> {
    const rows = db
      .prepare(
        'SELECT part_id, tag_id FROM part_tag_ids WHERE project_id = ? ORDER BY part_id, tag_id'
      )
      .all(projectId) as Array<{ part_id: string; tag_id: string }>;

    const tagIds = new Map<string, string[]>();
    for (const row of rows) {
      const tags = tagIds.get(row.part_id) ?? [];
      tags.push(row.tag_id);
      tagIds.set(row.part_id, tags);
    }
    return tagIds;
  }

  /**
   * Loads version tag associations from the normalized version_tag_ids table.
   * @param db - The database instance
   * @param projectId - The project ID
   * @returns Map of version ID to array of tag IDs
   */
  private loadVersionTagIds(db: Database, projectId: string): Map<string, string[]> {
    const rows = db
      .prepare(
        'SELECT version_id, tag_id FROM version_tag_ids WHERE project_id = ? ORDER BY version_id, tag_id'
      )
      .all(projectId) as Array<{ version_id: string; tag_id: string }>;

    const tagIds = new Map<string, string[]>();
    for (const row of rows) {
      const tags = tagIds.get(row.version_id) ?? [];
      tags.push(row.tag_id);
      tagIds.set(row.version_id, tags);
    }
    return tagIds;
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

    // Extract updatedBy information for indexed columns
    const updatedByUserName = project.updatedBy?.userName ?? null;
    const updatedByUserId = project.updatedBy?.userId ?? null;
    const updatedByUserGroupId = project.updatedBy?.userGroupId ?? null;

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
        updatedByUserName,
        updatedByUserId as string | null,
        updatedByUserGroupId as string | null,
        partsCount,
        combosCount,
        serialized
      );
    } catch (error) {
      throw new Error(
        `Failed to save snapshot for project "${project.id}": ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Save tags to normalized tables
    this.saveTags(this.db!, snapshot);
    this.savePartTagIds(this.db!, snapshot);
    this.saveVersionTagIds(this.db!, snapshot);
  }

  /**
   * Saves tag definitions to the normalized tags table.
   * @param db - The database instance
   * @param snapshot - The snapshot containing tags
   */
  private saveTags(db: Database, snapshot: ProjectSnapshot): void {
    const projectId = snapshot.project.id as string;

    // Delete existing tags for this project
    db.prepare('DELETE FROM tags WHERE project_id = ?').run(projectId);

    if (!snapshot.tags || snapshot.tags.length === 0) return;

    const insertTag = db.prepare(
      'INSERT INTO tags (project_id, tag_id, name, type, description, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    const insertMany = db.transaction((tags: readonly TagDefinition[]) => {
      for (const tag of tags) {
        insertTag.run(
          projectId,
          tag.id as string,
          tag.name,
          tag.type,
          tag.description ?? null,
          tag.metadata ? JSON.stringify(tag.metadata) : null,
          tag.createdAt as string
        );
      }
    });

    insertMany(snapshot.tags);
  }

  /**
   * Saves part tag associations to the normalized part_tag_ids table.
   * @param db - The database instance
   * @param snapshot - The snapshot containing parts
   */
  private savePartTagIds(db: Database, snapshot: ProjectSnapshot): void {
    const projectId = snapshot.project.id as string;

    // Delete existing associations for this project
    db.prepare('DELETE FROM part_tag_ids WHERE project_id = ?').run(projectId);

    const insert = db.prepare(
      'INSERT INTO part_tag_ids (project_id, part_id, tag_id) VALUES (?, ?, ?)'
    );

    const insertMany = db.transaction(
      (associations: Array<{ projectId: string; partId: string; tagId: string }>) => {
        for (const { projectId, partId, tagId } of associations) {
          insert.run(projectId, partId, tagId);
        }
      }
    );

    const all: Array<{ projectId: string; partId: string; tagId: string }> = [];
    for (const part of snapshot.parts) {
      if (part.tagIds) {
        for (const tagId of part.tagIds) {
          all.push({ projectId, partId: part.id as string, tagId: tagId as string });
        }
      }
    }

    if (all.length > 0) {
      insertMany(all);
    }
  }

  /**
   * Saves version tag associations to the normalized version_tag_ids table.
   * @param db - The database instance
   * @param snapshot - The snapshot containing versions
   */
  private saveVersionTagIds(db: Database, snapshot: ProjectSnapshot): void {
    const projectId = snapshot.project.id as string;

    // Delete existing associations for this project
    db.prepare('DELETE FROM version_tag_ids WHERE project_id = ?').run(projectId);

    const insert = db.prepare(
      'INSERT INTO version_tag_ids (project_id, version_id, tag_id) VALUES (?, ?, ?)'
    );

    const insertMany = db.transaction(
      (associations: Array<{ projectId: string; versionId: string; tagId: string }>) => {
        for (const { projectId, versionId, tagId } of associations) {
          insert.run(projectId, versionId, tagId);
        }
      }
    );

    const all: Array<{ projectId: string; versionId: string; tagId: string }> = [];
    for (const version of snapshot.versions) {
      if (version.tagIds) {
        for (const tagId of version.tagIds) {
          all.push({ projectId, versionId: version.id as string, tagId: tagId as string });
        }
      }
    }

    if (all.length > 0) {
      insertMany(all);
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
        owner_user_name: string | null;
        owner_user_id: string | null;
        owner_user_group_id: string | null;
        updatedBy_user_name: string | null;
        updatedBy_user_id: string | null;
        updatedBy_user_group_id: string | null;
      }) => ({
        id: row.project_id as ProjectId,
        name: row.name,
        description: row.description ?? undefined,
        owner: {
          userName: row.owner_user_name || 'Unknown',
          userId: (row.owner_user_id || 'unknown') as import('../../models/base.js').UserId,
          ...(row.owner_user_group_id && {
            userGroupId: row.owner_user_group_id as import('../../models/base.js').UserGroupId,
          }),
        },
        updatedBy: {
          userName: row.updatedBy_user_name || 'Unknown',
          userId: (row.updatedBy_user_id || 'unknown') as import('../../models/base.js').UserId,
          ...(row.updatedBy_user_group_id && {
            userGroupId: row.updatedBy_user_group_id as import('../../models/base.js').UserGroupId,
          }),
        },
        updatedAt: row.updated_at as ISO8601Timestamp,
      })
    );
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
    const offset = (page - 1) * limit;

    // Build WHERE clauses dynamically based on query
    const whereClauses: string[] = [];
    const params: (string | number)[] = [];

    // Security: Apply ownership filtering unless includeAll is explicitly true
    if (!query?.includeAll) {
      if (query?.ownerUserId) {
        whereClauses.push('owner_user_id = ?');
        params.push(query.ownerUserId as string);
      } else if (query?.ownerGroupId) {
        whereClauses.push('owner_user_group_id = ?');
        params.push(query.ownerGroupId as string);
      }
      // Note: Since owner is now required, we no longer filter for projects without owner info
      // When no owner filter is specified, all projects are returned (subject to other filters)
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

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

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
        updatedBy_user_name, updatedBy_user_id, updatedBy_user_group_id,
        parts_count, combos_count, data
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
      updatedBy_user_name: string | null;
      updatedBy_user_id: string | null;
      updatedBy_user_group_id: string | null;
      parts_count: number;
      combos_count: number;
      data: string;
    }[];

    const projects: ProjectListSummary[] = rows.map((row) => {
      // Parse full snapshot to compute combo latest info
      const snapshot = JSON.parse(row.data) as ProjectSnapshot;
      const comboLatestInfo = computeComboLatestInfo(snapshot.combos);

      const summary: ProjectListSummary = {
        id: row.project_id as ProjectId,
        name: row.name,
        description: row.description ?? undefined,
        createdAt: row.created_at as ISO8601Timestamp,
        updatedAt: row.updated_at as ISO8601Timestamp,
        partsCount: row.parts_count,
        combosCount: row.combos_count,
        owner: {
          userName: row.owner_user_name || 'Unknown',
          userId: (row.owner_user_id || 'unknown') as UserId,
          ...(row.owner_user_group_id && {
            userGroupId: row.owner_user_group_id as UserGroupId,
          }),
        },
        updatedBy: {
          userName: row.updatedBy_user_name || 'Unknown',
          userId: (row.updatedBy_user_id || 'unknown') as UserId,
          ...(row.updatedBy_user_group_id && {
            userGroupId: row.updatedBy_user_group_id as UserGroupId,
          }),
        },
        ...comboLatestInfo,
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
