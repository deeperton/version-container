# version-container

Type-safe building blocks for managing projects composed of parts, versions, and version combos. The library focuses on deterministic snapshots, pluggable storage/adapters, and tooling-friendly lifecycle management.

## Features

- Strict TypeScript typings with branded identifiers for every domain entity.
- **In-memory and localStorage storage providers** for testing and browser persistence.
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

### 5. Delete obsolete parts and versions

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

// Now the deletion succeeds
await registry.deletePartVersion(handle.projectId, engineV1Id);

// Delete a part (cascades to delete all its versions)
await registry.deletePart(handle.projectId, enginePartId);
```

### 6. Use the low-level update API

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

### 7. Work with multiple projects

`ProjectRegistry.load` rehydrates an existing project (or reuses the currently open handle). You can list or close open projects at any time:

```ts
const existingHandle = await registry.load(handle.projectId);
console.log(existingHandle === handle); // true, already open

console.log(registry.listOpenProjects()); // [handle.projectId]

await registry.close(handle.projectId); // closes and saves by default
```

When `close` executes it optionally flushes dirty snapshots and releases cached resources so the project can be loaded elsewhere.

### 8. Subscribe to lifecycle events

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

Available events today include `project:created`, `project:loaded`, `project:updated`, `project:closed`, `part:added`, `part:updated`, `part:removed`, `version:added`, `version:updated`, `version:removed`, `combo:added`, `combo:updated`, and `combo:removed`. Future middleware hooks will piggy-back on the same dispatcher.

### 9. Query and filter parts, versions, and combos

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

### 10. Error handling

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

All errors include a `code` property for programmatic handling and an `entityId` property with the relevant identifier.

### 11. Storage Providers

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

#### Runtime Storage Selection

Use the storage registry to select storage providers at runtime via string names:

```ts
import {
  registerBuiltinStorageProviders,
  createStorageProvider,
  BuiltinStorageType,
  ProjectRegistry,
} from 'version-container';

// Register built-in providers (in-memory, local-storage)
registerBuiltinStorageProviders();

// Select storage type at runtime (e.g., from config, environment, URL param)
const storageType = process.env.STORAGE_TYPE ?? BuiltinStorageType.LOCAL_STORAGE;
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

### Notes on middleware

Middleware hooks are not yet implemented, but TODO markers in the code indicate where lifecycle events (`project:create`, `project:load`, `project:save`, etc.) will be exposed. These placeholders make it straightforward to add logging, validation, or policy enforcement layers in future iterations.

## API Surface

Key exports available today:

- Domain models – `ProjectInit`, `PartDefinition`, `VersionCombo`, `VersionComboInit`, filter types (`PartFilter`, `VersionFilter`, `ComboFilter`), summary types (`PartSummary`, `VersionSummary`, `ComboSummary`), and related branded ID types (see `src/models`).
- Error types – `VersionContainerError` (base class) and 15 specific error classes (`PartNotFoundError`, `VersionNotFoundError`, etc.) for type-safe error handling.
- Utilities – `createPartId`, `createPartVersionId`, `createComboId`, `createAdapterId`, `cloneValue`, and the `AsyncMutex`.
- Runtime services – `ProjectRegistry`, `ProjectHandle`, `ProjectEventDispatcher`, `buildProjectSnapshot`, plus a `SystemClock` you can replace with a deterministic clock in tests.
- Storage providers – `InMemoryStorageProvider`, `LocalStorageStorageProvider` for browser persistence.
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
| `deletePart(projectId, id)` | Delete a part (cascades to versions) |
| **Version Management** | |
| `addPartVersion(projectId, partId, init)` | Add a version to a part |
| `updatePartVersion(projectId, id, mutator)` | Update a version |
| `deletePartVersion(projectId, id)` | Delete a version |
| **Combo Management** | |
| `addCombo(projectId, init)` | Add a combo |
| `updateCombo(projectId, id, mutator)` | Update a combo |
| `deleteCombo(projectId, id)` | Delete a combo |
| **Query Methods** | |
| `findParts(projectId, filter?)` | Find parts by adapter, tags, or metadata |
| `findVersions(projectId, filter?)` | Find versions by part, label, or metadata |
| `findCombos(projectId, filter?)` | Find combos by part/version reference or metadata |
| `getPartById(projectId, id)` | Get full part entity by ID |
| `getVersionById(projectId, id)` | Get full version entity by ID |
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