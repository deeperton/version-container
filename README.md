# version-container

Type-safe building blocks for managing projects composed of parts, versions, and version combos. The library focuses on deterministic snapshots, pluggable storage/adapters, and tooling-friendly lifecycle management.

## Features

- Strict TypeScript typings with branded identifiers for every domain entity.
- **In-memory, localStorage, and SQLite storage providers** for testing, browser, and server persistence.
- **Runtime storage selection** via a registry pattern for pluggable backends.
- `ProjectRegistry` and `ProjectHandle` abstractions to manage multiple open projects concurrently.
- Deterministic project snapshot builder with validation for duplicate or unknown parts/versions.
- Utility helpers for ID generation, cloning, and concurrency control.
- Ready-to-extend hooks for future middleware integrations (commented TODOs denote insertion points).

## Installation

```bash
npm install
```

The package ships both ESM and CommonJS bundles plus declaration files so it can be consumed from modern build tools or Node runtimes.

## Usage

The following walkthrough demonstrates the full lifecycle: creating a project, defining parts and versions, composing combos, and persisting updates.

### 1. Set up storage and registry

```ts
import {
  InMemoryStorageProvider,
  ProjectRegistry,
  createAdapterId,
  createComboId,
  createPartId,
  createPartVersionId,
} from 'version-container';

const storage = new InMemoryStorageProvider();
const registry = new ProjectRegistry({
  storage,
  adapters: [
    // register real adapters here (e.g. Git, HTTP). For now we rely on IDs only.
  ],
});
```

### 2. Create a project with parts, versions, and a combo

```ts
const enginePartId = createPartId('engine');
const engineV1Id = createPartVersionId('engine-v1');
const baselineComboId = createComboId('baseline');
const adapterId = createAdapterId('in-memory');

const handle = await registry.open({
  name: 'Rocket Guidance System',
  metadata: { owner: 'avionics-team' },
  combos: [
    {
      id: baselineComboId,
      name: 'Baseline',
      bindings: [
        {
          partId: enginePartId,
          versionId: engineV1Id,
        },
      ],
    },
  ],
});

await registry.addPart(handle.projectId, {
  id: enginePartId,
  name: 'Engine Controller',
  adapterId,
});

await registry.addPartVersion(handle.projectId, enginePartId, {
  id: engineV1Id,
  label: '1.0.0',
  locator: { uri: 'memory://engine@1.0.0' },
});

const snapshot = await handle.getSnapshot();
console.log(snapshot.project.name); // "Rocket Guidance System"
```

Behind the scenes `ProjectRegistry` converts your initialization data into a validated `ProjectSnapshot`, persists it via the chosen storage provider, and returns a `ProjectHandle` wired with adapters, a clock, and concurrency guards.

### 3. Mutate the project over time

Atomic helpers on the registry/handle let you add or refine parts and versions without re-sending the full snapshot.

```ts
const newVersionId = createPartVersionId('engine-v1.1.0');

await registry.addPartVersion(handle.projectId, enginePartId, {
  id: newVersionId,
  label: '1.1.0',
  locator: { uri: 'memory://engine@1.1.0' },
});

await registry.updatePartVersion(handle.projectId, newVersionId, (version) => ({
  ...version,
  metadata: { releaseNotes: 'Improved fuel mixture' },
}));
```

### 4. Manage combos after project creation

Combos can be created during initialization (as shown above), but you can also add and update combos after the project is created:

```ts
// Add a new combo
const stagingCombo = await registry.addCombo(handle.projectId, {
  name: 'Staging',
  description: 'Pre-production configuration',
  bindings: [
    {
      partId: enginePartId,
      versionId: newVersionId,
    },
  ],
});

// Update an existing combo's bindings
await registry.updateCombo(handle.projectId, stagingCombo.id, (combo) => ({
  ...combo,
  name: 'Staging v2',
  description: 'Updated staging configuration',
  bindings: [
    {
      partId: enginePartId,
      versionId: newVersionId,
    },
  ],
}));

// Delete a combo that's no longer needed
await registry.deleteCombo(handle.projectId, baselineComboId);
```

The `addCombo` and `updateCombo` methods validate that all referenced parts and versions exist, and that each version belongs to its corresponding part. The `updateCombo` method preserves the original `createdAt` timestamp while updating `updatedAt`.

### 5. Manage parts order

Projects can define a custom ordering for parts that persists independently of the array order. This is useful for UI display or when the logical order differs from the default ID-based sorting:

```ts
// Get the current parts order (returns all parts if no custom order is set)
const order = await registry.getPartsOrder(handle.projectId);
console.log(order); // ['part-1', 'part-2', ...]

// Set a complete custom order
await registry.setPartsOrder(handle.projectId, [
  createPartId('wheels'),
  createPartId('engine'),
  createPartId('chassis'),
]);

// Move a single part to a new position
await registry.movePartOrder(handle.projectId, createPartId('engine'), 0);
```

The parts order is stored in `project.metadata.partsOrder` and validates that all referenced part IDs exist in the project. Changes to the order emit a `partsOrder:updated` event.

### 6. Soft delete and clean operations

When deleting parts or versions, the library uses soft delete by default. Items are marked as deleted via `metadata.deletedAt` rather than being immediately removed:

```ts
// Soft delete a version (marks it as deleted but keeps it in the snapshot)
await registry.deletePartVersion(handle.projectId, engineV1Id);

// Soft delete a part (cascades to mark all its versions as deleted)
await registry.deletePart(handle.projectId, enginePartId);
```

Soft-deleted items are excluded from queries by default:

```ts
// findParts excludes soft-deleted parts
const activeParts = await registry.findParts(handle.projectId);
console.log(activeParts.length); // Does not include deleted parts

// Include soft-deleted items with the includeDeleted option
const allParts = await registry.findParts(handle.projectId, {
  includeDeleted: true,
});
console.log(allParts.length); // Includes deleted parts

// getPartById returns undefined for deleted items (default behavior)
const part = await registry.getPartById(handle.projectId, enginePartId);
console.log(part); // undefined

// Include deleted items when getting by ID
const deletedPart = await registry.getPartById(
  handle.projectId,
  enginePartId,
  { includeDeleted: true }
);
console.log(deletedPart?.metadata?.deletedAt); // ISO8601 timestamp
```

To permanently remove soft-deleted items, use the clean operations:

```ts
// Permanently remove all soft-deleted parts from the project
const removedParts = await registry.cleanDeletedParts(handle.projectId);
console.log(removedParts); // Array of removed part definitions

// Permanently remove all soft-deleted versions
const removedVersions = await registry.cleanDeletedVersions(handle.projectId);
console.log(removedVersions); // Array of removed version definitions
```

Clean operations permanently remove items from the snapshot. This is useful for reclaiming storage after soft-deleted items are no longer needed.

### 7. Delete obsolete parts and versions

When parts or versions are no longer needed, you can delete them. The library enforces referential integrity—parts and versions referenced by any combo cannot be deleted:

```ts
// This will fail if the version is referenced by a combo
await registry.deletePartVersion(handle.projectId, engineV1Id);

// First, update or remove combos that reference it
await registry.updateCombo(handle.projectId, baselineComboId, (combo) => ({
  ...combo,
  bindings: combo.bindings.map((b) =>
    b.versionId === engineV1Id
      ? { ...b, versionId: newVersionId }
      : b
  ),
}));

// Now the deletion succeeds (soft delete - marked as deleted)
await registry.deletePartVersion(handle.projectId, engineV1Id);

// Delete a part (cascades to mark all its versions as deleted)
await registry.deletePart(handle.projectId, enginePartId);
```

### 8. Use the low-level update API

For advanced scenarios, the handle still exposes `update` for direct snapshot manipulation:

```ts
await handle.update((snapshot) => ({
  ...snapshot,
  project: {
    ...snapshot.project,
    metadata: { ...snapshot.project.metadata, archived: true },
  },
}));

await handle.save(); // persists only if the snapshot changed
```

All updates automatically receive a fresh `updatedAt` timestamp. Because mutations occur inside a mutex, concurrent callers cannot corrupt the in-memory cache.

### 9. Work with multiple projects

`ProjectRegistry.load` rehydrates an existing project (or reuses the currently open handle). You can list or close open projects at any time:

```ts
const existingHandle = await registry.load(handle.projectId);
console.log(existingHandle === handle); // true, already open

console.log(registry.listOpenProjects()); // [handle.projectId]

await registry.close(handle.projectId); // closes and saves by default
```

When `close` executes it optionally flushes dirty snapshots and releases cached resources so the project can be loaded elsewhere.

### 10. Subscribe to lifecycle events

Every mutating operation emits typed events through a central dispatcher. Middleware and tooling can subscribe once and react to structural changes.

```ts
const events = registry.getEventDispatcher();

const unsubscribe = events.subscribe('version:updated', ({ projectId, version, snapshot }) => {
  console.log(`Version ${version.id} for project ${projectId} updated`, snapshot.project.updatedAt);
});

await registry.updatePartVersion(handle.projectId, newVersionId, (current) => ({
  ...current,
  label: '1.1.1',
}));

unsubscribe();
```

Available events today include `project:created`, `project:loaded`, `project:updated`, `project:closed`, `part:added`, `part:updated`, `part:removed`, `version:added`, `version:updated`, `version:removed`, `combo:added`, `combo:updated`, `combo:removed`, and `partsOrder:updated`. Future middleware hooks will piggy-back on the same dispatcher.

### 11. Query and filter parts, versions, and combos

The library provides synchronous query methods on `ProjectHandle` (and async delegations on `ProjectRegistry`) for finding entities by various criteria. Queries operate on the in-memory snapshot for fast lookups.

```ts
// Find parts by adapter, tags, or metadata
const gitParts = await registry.findParts(handle.projectId, {
  adapterId: createAdapterId('git'),
});

const taggedParts = await registry.findParts(handle.projectId, {
  tags: ['critical', 'production'],
});

// Find versions by part, label, or metadata
const engineVersions = await registry.findVersions(handle.projectId, {
  partId: enginePartId,
});

// Find combos that reference a specific part or version
const combosUsingEngine = await registry.findCombos(handle.projectId, {
  partId: enginePartId,
});

const combosUsingV1 = await registry.findCombos(handle.projectId, {
  versionId: engineV1Id,
});
```

The `find*` methods return arrays of entity IDs. Use the `get*ById` methods to retrieve full entities:

```ts
// Get full entity by ID
const part = await registry.getPartById(handle.projectId, enginePartId);
console.log(part?.name); // "Engine Controller"

// Get lightweight summary (id + name/description only)
const summary = await registry.getPartSummary(handle.projectId, enginePartId);
console.log(summary?.name); // "Engine Controller"
```

Convenience methods are available for common queries:

```ts
// Get all versions for a part
const versionIds = await registry.getVersionsByPartId(handle.projectId, enginePartId);

// Get all combos that reference a part
const comboIds = await registry.getCombosByPartId(handle.projectId, enginePartId);

// Get all combos that reference a specific version
const comboIds = await registry.getCombosByVersionId(handle.projectId, engineV1Id);
```

Filter behavior:
- **adapterId**: Exact match
- **tags**: Any match (returns entities that have at least one of the specified tags)
- **metadata**: Subset match (all filter key/values must exist in the target)
- **partId/versionId**: Exact match on the respective field
- **includeDeleted**: When true, includes soft-deleted items (default: false)

### 12. Error handling

All library errors extend from `VersionContainerError`, enabling type-safe error handling:

```ts
import {
  PartNotFoundError,
  VersionNotFoundError,
  VersionContainerError,
  type VersionContainerErrorCode,
} from 'version-container';

try {
  await registry.deletePart(projectId, partId);
} catch (error) {
  if (error instanceof PartNotFoundError) {
    // Handle missing part - error.partId is available
    console.error(`Part ${error.partId} not found`);
  } else if (error instanceof VersionContainerError) {
    // Catch-all for any version-container error
    console.error(`Error code: ${error.code}, entity: ${error.entityId}`);
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

#### Available error types

| Error | Code | When Thrown |
|-------|------|-------------|
| `PartNotFoundError` | `PART_NOT_FOUND` | Part doesn't exist |
| `VersionNotFoundError` | `VERSION_NOT_FOUND` | Version doesn't exist |
| `ComboNotFoundError` | `COMBO_NOT_FOUND` | Combo doesn't exist |
| `ProjectNotFoundError` | `PROJECT_NOT_FOUND` | Project not in storage |
| `PartAlreadyExistsError` | `PART_ALREADY_EXISTS` | Part already exists |
| `VersionAlreadyExistsError` | `VERSION_ALREADY_EXISTS` | Version already exists |
| `ComboAlreadyExistsError` | `COMBO_ALREADY_EXISTS` | Combo already exists |
| `ProjectAlreadyOpenError` | `PROJECT_ALREADY_OPEN` | Project already open |
| `UnknownVersionReferenceError` | `UNKNOWN_VERSION_REFERENCE` | Combo references unknown version |
| `UnknownPartReferenceError` | `UNKNOWN_PART_REFERENCE` | Combo references unknown part |
| `IdentifierChangeError` | `IDENTIFIER_CHANGE` | Attempting to change entity ID |
| `VersionReassignmentError` | `VERSION_REASSIGNMENT` | Moving version to different part |
| `ProjectClosedError` | `PROJECT_CLOSED` | Operating on closed project |
| `ProjectNotInStorageError` | `PROJECT_NOT_IN_STORAGE` | Project missing from storage |
| `DuplicateIdentifierError` | `DUPLICATE_IDENTIFIER` | Duplicate ID in snapshot build |
| `PartAlreadyDeletedError` | `PART_ALREADY_DELETED` | Part is already soft-deleted |
| `VersionAlreadyDeletedError` | `VERSION_ALREADY_DELETED` | Version is already soft-deleted |

All errors include a `code` property for programmatic handling and an `entityId` property with the relevant identifier.

### 13. Storage Providers

The library includes built-in storage providers for different environments:

#### In-Memory Storage

Fast, ephemeral storage ideal for testing and development:

```ts
import { InMemoryStorageProvider, ProjectRegistry } from 'version-container';

const storage = new InMemoryStorageProvider();
const registry = new ProjectRegistry({ storage });
```

You can optionally pre-populate the storage with initial snapshots:

```ts
const storage = new InMemoryStorageProvider({
  initialSnapshots: [existingSnapshot],
  id: 'test-storage',
});
```

#### LocalStorage Storage

Persists projects to browser localStorage for web applications:

```ts
import { LocalStorageStorageProvider, ProjectRegistry } from 'version-container';

const storage = new LocalStorageStorageProvider({
  keyPrefix: 'my-app:', // Optional: customize key prefix (default: 'version-container:')
});
const registry = new ProjectRegistry({ storage });
```

The localStorage provider handles:
- Automatic serialization/deserialization of snapshots
- Summary index for fast `listSummaries()` queries
- Index rebuild if corrupted
- Quota exceeded errors with descriptive messages

#### SQLite Storage

Server-side storage using SQLite with document-style storage and indexed search columns:

```ts
import { SqliteStorageProvider, ProjectRegistry } from 'version-container';

const storage = new SqliteStorageProvider({
  filePath: './projects.db', // Optional: defaults to './version-container.db'
});
const registry = new ProjectRegistry({ storage });
```

The SQLite provider stores full project snapshots as JSON documents while maintaining indexed columns for efficient queries:

```sql
CREATE TABLE snapshots (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data TEXT NOT NULL  -- Full JSON document
);

CREATE INDEX idx_snapshots_name ON snapshots(name);
CREATE INDEX idx_snapshots_updated_at ON snapshots(updated_at DESC);
```

Features include:
- **Document storage**: Complete snapshot stored as JSON in `data` column
- **Indexed search**: Fast lookups by `project_id`, `name`, and `updated_at`
- **Lazy initialization**: Database connection created on first use
- **Upsert semantics**: `INSERT ... ON CONFLICT DO UPDATE` for save operations
- **Optional dependency injection**: Pass an existing `Database` instance for testing
- **In-memory mode**: Use `filePath: ':memory:'` for testing

You can also use the provider with an external database instance:

```ts
import Database from 'better-sqlite3';
import { SqliteStorageProvider } from 'version-container';

const db = new Database('./my-app.db');
const storage = new SqliteStorageProvider({ db });

// When providing an external database, close() is a no-op
// You're responsible for closing the database yourself
await storage.close(); // Does nothing - you must call db.close()
```

#### MongoDB Storage

Server-side storage using MongoDB for scalable document persistence:

```ts
import { MongoDbStorageProvider, ProjectRegistry } from 'version-container';

const storage = new MongoDbStorageProvider({
  connectionString: 'mongodb://localhost:27017',
  database: 'my-app',      // Optional: defaults to 'version-container'
  collection: 'projects', // Optional: defaults to 'snapshots'
});
const registry = new ProjectRegistry({ storage });
```

The MongoDB provider stores full project snapshots as documents in a collection. Each snapshot is stored as a single document with the project ID as the query key for efficient lookups.

Features include:
- **Document storage**: Complete snapshot stored as a BSON document
- **Indexed queries**: Uses `project.id` field for direct lookups
- **Lazy initialization**: Connection created on first use
- **Upsert semantics**: `updateOne` with `upsert: true` for save operations
- **Optional dependency injection**: Pass an existing `MongoClient` instance for testing
- **Configurable connection**: Customize connection string, database, and collection names
- **Connection lifecycle**: `close()` method for cleanup (only closes internally-created clients)

You can also use the provider with an external MongoDB client:

```ts
import { MongoClient } from 'mongodb';
import { MongoDbStorageProvider } from 'version-container';

const client = new MongoClient('mongodb://localhost:27017');
const storage = new MongoDbStorageProvider({
  client,
  database: 'my-app'
});

// When providing an external client, close() is a no-op
// You're responsible for closing the client yourself
await storage.close(); // Does nothing - you must call client.close()
```

#### Runtime Storage Selection

Use the storage registry to select storage providers at runtime via string names:

```ts
import {
  registerBuiltinStorageProviders,
  createStorageProvider,
  BuiltinStorageType,
  ProjectRegistry,
} from 'version-container';

// Register built-in providers (in-memory, local-storage, mongodb, sqlite)
registerBuiltinStorageProviders();

// Select storage type at runtime (e.g., from config, environment, URL param)
const storageType = process.env.STORAGE_TYPE ?? BuiltinStorageType.SQLITE;
const storage = createStorageProvider(storageType);

const registry = new ProjectRegistry({ storage });
```

#### Custom Storage Providers

Register your own storage provider for IndexedDB, remote APIs, or other backends:

```ts
import { registerStorageProvider, createStorageProvider, type StorageProvider } from 'version-container';

class IndexedDBStorageProvider implements StorageProvider {
  readonly id = 'indexed-db';

  async loadSnapshot(projectId: ProjectId): Promise<ProjectSnapshot | undefined> {
    // ... IndexedDB implementation
  }

  async saveSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    // ... IndexedDB implementation
  }

  async listSummaries(): Promise<readonly ProjectSummary[]> {
    // ... IndexedDB implementation
  }
}

// Register the custom provider
registerStorageProvider('indexed-db', () => new IndexedDBStorageProvider());

// Use it
const storage = createStorageProvider('indexed-db');
```

#### Built-in Storage Type Constants

| Constant | Value | Class |
|----------|-------|-------|
| `BuiltinStorageType.IN_MEMORY` | `'in-memory'` | `InMemoryStorageProvider` |
| `BuiltinStorageType.LOCAL_STORAGE` | `'local-storage'` | `LocalStorageStorageProvider` |
| `BuiltinStorageType.MONGODB` | `'mongodb'` | `MongoDbStorageProvider` |
| `BuiltinStorageType.SQLITE` | `'sqlite'` | `SqliteStorageProvider` |

### Notes on middleware

Middleware hooks are not yet implemented, but TODO markers in the code indicate where lifecycle events (`project:create`, `project:load`, `project:save`, etc.) will be exposed. These placeholders make it straightforward to add logging, validation, or policy enforcement layers in future iterations.

## API Surface

Key exports available today:

- Domain models – `ProjectInit`, `PartDefinition`, `VersionCombo`, `VersionComboInit`, filter types (`PartFilter`, `VersionFilter`, `ComboFilter`), summary types (`PartSummary`, `VersionSummary`, `ComboSummary`), and related branded ID types (see `src/models`).
- Error types – `VersionContainerError` (base class) and 15 specific error classes (`PartNotFoundError`, `VersionNotFoundError`, etc.) for type-safe error handling.
- Utilities – `createPartId`, `createPartVersionId`, `createComboId`, `createAdapterId`, `cloneValue`, and the `AsyncMutex`.
- Runtime services – `ProjectRegistry`, `ProjectHandle`, `ProjectEventDispatcher`, `buildProjectSnapshot`, plus a `SystemClock` you can replace with a deterministic clock in tests.
- Storage providers – `InMemoryStorageProvider`, `LocalStorageStorageProvider` for browser persistence, `SqliteStorageProvider` and `MongoDbStorageProvider` for server persistence.
- Storage registry – `registerBuiltinStorageProviders`, `createStorageProvider`, `registerStorageProvider`, `BuiltinStorageType` for runtime storage selection.

### Registry Methods

| Method | Description |
|--------|-------------|
| **Project Lifecycle** | |
| `open(init)` | Create a new project |
| `load(projectId)` | Load an existing project |
| `close(projectId)` | Close a project |
| **Part Management** | |
| `addPart(projectId, init)` | Add a part to a project |
| `updatePart(projectId, id, mutator)` | Update a part |
| `deletePart(projectId, id)` | Soft delete a part (cascades to versions) |
| **Version Management** | |
| `addPartVersion(projectId, partId, init)` | Add a version to a part |
| `updatePartVersion(projectId, id, mutator)` | Update a version |
| `deletePartVersion(projectId, id)` | Soft delete a version |
| **Combo Management** | |
| `addCombo(projectId, init)` | Add a combo |
| `updateCombo(projectId, id, mutator)` | Update a combo |
| `deleteCombo(projectId, id)` | Delete a combo |
| **Parts Order** | |
| `getPartsOrder(projectId)` | Get current parts order |
| `setPartsOrder(projectId, partIds)` | Set complete parts order |
| `movePartOrder(projectId, partId, position)` | Move part to new position |
| **Clean Operations** | |
| `cleanDeletedParts(projectId)` | Permanently remove soft-deleted parts |
| `cleanDeletedVersions(projectId)` | Permanently remove soft-deleted versions |
| **Query Methods** | |
| `findParts(projectId, filter?)` | Find parts by adapter, tags, or metadata |
| `findVersions(projectId, filter?)` | Find versions by part, label, or metadata |
| `findCombos(projectId, filter?)` | Find combos by part/version reference or metadata |
| `getPartById(projectId, id, options?)` | Get full part entity by ID |
| `getVersionById(projectId, id, options?)` | Get full version entity by ID |
| `getComboById(projectId, id)` | Get full combo entity by ID |
| `getPartSummary(projectId, id)` | Get lightweight part summary |
| `getVersionSummary(projectId, id)` | Get lightweight version summary |
| `getComboSummary(projectId, id)` | Get lightweight combo summary |
| `getVersionsByPartId(projectId, partId)` | Get all version IDs for a part |
| `getCombosByPartId(projectId, partId)` | Get all combo IDs referencing a part |
| `getCombosByVersionId(projectId, versionId)` | Get all combo IDs referencing a version |
| **Utility** | |
| `listOpenProjects()` | List open projects |
| `getEventDispatcher()` | Get the event dispatcher |

Refer to the source modules for comprehensive type definitions and JSDoc comments.

## Project Structure

```
/src
  /lib                # Runtime services, utilities, and clocks
  /models             # Domain model interfaces and README
  /storages           # Storage providers (in-memory MVP)
  /index.ts           # Public barrel exports

/tests                # Legacy example-based tests
```

Each module ships with colocated unit tests (`*.test.ts`) and, where applicable, fixture/mocks directories.

## Development Scripts

```bash
npm run typecheck      # TypeScript compile without emit
npm run lint           # ESLint (flat config, TypeScript-aware)
npm run test           # Vitest in watch mode
npm run test:ui        # Vitest UI runner
npm run test:coverage  # Coverage report
npm run build          # Type declarations + Vite bundle
npm run format         # Prettier write
npm run format:check   # Prettier verify
```

## Contributing

Follow the architecture and testing principles documented in [CLAUDE.md](./CLAUDE.md). Contributions should include updated tests, strict types, and JSDoc for any new public APIs.

## License

ISC

# Plans

## Async project loading

In the next major release there is an idea to suppoort partial loading for projects.