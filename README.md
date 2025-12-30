# version-container

Type-safe building blocks for managing projects composed of parts, versions, and version combos. The library focuses on deterministic snapshots, pluggable storage/adapters, and tooling-friendly lifecycle management.

## Features

- Strict TypeScript typings with branded identifiers for every domain entity.
- In-memory storage provider for fast testing and prototyping.
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

Atomic helpers on the registry/handle let you add or refine parts and versions without re-sending the full snapshot. The handle still exposes `update` for large structural edits (combos, metadata, etc.).

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

await handle.update((snapshot) => ({
  ...snapshot,
  combos: snapshot.combos.map((combo) =>
    combo.id === baselineComboId
      ? {
          ...combo,
          bindings: combo.bindings.map((binding) =>
            binding.partId === enginePartId ? { ...binding, versionId: newVersionId } : binding
          ),
        }
      : combo
  ),
}));

await handle.save(); // persists only if the snapshot changed
```

All updates automatically receive a fresh `updatedAt` timestamp. Because mutations occur inside a mutex, concurrent callers cannot corrupt the in-memory cache.

### 4. Work with multiple projects

`ProjectRegistry.load` rehydrates an existing project (or reuses the currently open handle). You can list or close open projects at any time:

```ts
const existingHandle = await registry.load(handle.projectId);
console.log(existingHandle === handle); // true, already open

console.log(registry.listOpenProjects()); // [handle.projectId]

await registry.close(handle.projectId); // closes and saves by default
```

When `close` executes it optionally flushes dirty snapshots and releases cached resources so the project can be loaded elsewhere.

### 5. Subscribe to lifecycle events

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

Available events today include `project:created`, `project:loaded`, `project:updated`, `project:closed`, `part:added`, `part:updated`, `version:added`, and `version:updated`. Future middleware hooks will piggy-back on the same dispatcher.

### Notes on middleware

Middleware hooks are not yet implemented, but TODO markers in the code indicate where lifecycle events (`project:create`, `project:load`, `project:save`, etc.) will be exposed. These placeholders make it straightforward to add logging, validation, or policy enforcement layers in future iterations.

## API Surface

Key exports available today:

- Domain models – `ProjectInit`, `PartDefinition`, `VersionCombo`, and related branded ID types (see `src/models`).
- Utilities – `createPartId`, `createPartVersionId`, `createComboId`, `createAdapterId`, `cloneValue`, and the `AsyncMutex`.
- Runtime services – `ProjectRegistry`, `ProjectHandle`, `ProjectEventDispatcher`, `buildProjectSnapshot`, plus a `SystemClock` you can replace with a deterministic clock in tests.
- Storage – `InMemoryStorageProvider` for persistence during development or unit testing.

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
