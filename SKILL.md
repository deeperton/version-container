---
name: Using version-container library
description: dealing with a typescript library for managing projects composed of parts, versions, and version combos with pluggable storage backends
---

The library source code is available at https://github.com/deeperton/version-container

## Overview

**Version Container** provides type-safe building blocks for:
- Managing projects with parts, versions, and version combos
- Pluggable storage providers (in-memory, localStorage, SQLite, MongoDB)
- Deterministic snapshots with validation
- Lifecycle management with event emission
- Runtime storage selection via registry pattern

## Core Concepts

### Project Structure

```
Project
├── Parts (components/libraries)
│   └── Versions (specific iterations)
├── Combos (named sets of bound versions)
└── Locks (deterministic version snapshots)
```

### Key Types

| Type | Purpose | Example |
|------|---------|---------|
| `ProjectId` | Branded project identifier | `createProjectId('my-app')` |
| `PartId` | Branded part identifier | `createPartId('frontend')` |
| `PartVersionId` | Branded version identifier | `createPartVersionId('v1.0.0')` |
| `ComboId` | Branded combo identifier | `createComboId('baseline')` |
| `AdapterId` | Branded adapter identifier | `createAdapterId('git')` |
| `TagId` | Branded tag identifier | `createTagId('stable')` |
| `TagType` | Tag domain type | `'part'` or `'version'` |
| `UserId` | Branded user identifier | `createUserId('user-123')` |
| `UserGroupId` | Branded user group identifier | `createUserGroupId('team-alpha')` |
| `OwnerInfo` | Owner metadata | `{ userName, userId, userGroupId? }` |
| `ProjectSnapshot` | Complete project state | Full project with parts/versions/combos/tags |
| `ProjectSummary` | Lightweight project info | id, name, description, owner, updatedAt |
| `ProjectsQuery` | Query options for listProjects | `{ ownerUserId?, namePattern?, limit?, page?, includeAll? }` |
| `ProjectListResult` | Paginated list of projects | `{ projects[], pagination{} }` |

## Installation

```bash
npm install version-container
```

## Quick Start Pattern

```typescript
import {
  ProjectRegistry,
  InMemoryStorageProvider,
  createPartId,
  createPartVersionId,
  createComboId,
  createAdapterId,
  createTagId,
  createUserId,
  createUserGroupId,
} from 'version-container';

// 1. Set up storage
const storage = new InMemoryStorageProvider();
const registry = new ProjectRegistry({ storage, adapters: [] });

// 2. Create/open a project
const handle = await registry.open({
  name: 'My Application',
  description: 'Project description',
});

// 3. Add a part
const partId = createPartId('ui-kit');
await registry.addPart(handle.projectId, {
  id: partId,
  name: 'UI Kit',
  adapterId: createAdapterId('npm'),
});

// 4. Add versions to the part
await registry.addPartVersion(handle.projectId, partId, {
  id: createPartVersionId('1.0.0'),
  label: '1.0.0',
  locator: { uri: 'npm://ui-kit@1.0.0' },
});

// 5. Create a combo
await registry.addCombo(handle.projectId, {
  id: createComboId('baseline'),
  name: 'Baseline',
  bindings: [
    { partId, versionId: createPartVersionId('1.0.0') }
  ],
});

// 6. List projects (secure by default)
const myUserId = createUserId('user-123');
const result = await registry.listProjects({ ownerUserId: myUserId });
console.log(result.projects); // Array of your projects with stats
```

## Storage Provider Selection

### By Environment

```typescript
import {
  InMemoryStorageProvider,      // Testing, ephemeral data
  LocalStorageStorageProvider,  // Browser persistence
  SqliteStorageProvider,       // Node.js file persistence
  MongoDbStorageProvider,      // Scalable server persistence
} from 'version-container';

// Choose based on environment
const storage = process.env.NODE_ENV === 'test'
  ? new InMemoryStorageProvider()
  : typeof window !== 'undefined'
    ? new LocalStorageStorageProvider()
    : new SqliteStorageProvider({ filePath: './projects.db' });
```

### Runtime Selection (Registry Pattern)

```typescript
import {
  registerBuiltinStorageProviders,
  createStorageProvider,
  BuiltinStorageType,
} from 'version-container';

// Register all built-in providers
registerBuiltinStorageProviders();

// Select from config/env
const storageType = process.env.STORAGE ?? 'sqlite';
const storage = createStorageProvider(storageType);
```

### SQLite Configuration

```typescript
import { SqliteStorageProvider } from 'version-container';

// File-based persistence
const storage = new SqliteStorageProvider({
  filePath: './data/projects.db',
});

// In-memory for testing
const testStorage = new SqliteStorageProvider({
  filePath: ':memory:',
});

// With external database instance
import Database from 'better-sqlite3';
const db = new Database('./custom.db');
const storage = new SqliteStorageProvider({ db });
```

### MongoDB Configuration

```typescript
import { MongoDbStorageProvider } from 'version-container';

const storage = new MongoDbStorageProvider({
  connectionString: 'mongodb://localhost:27017',
  database: 'my-app',
  collection: 'projects',
});
```

## Common Workflows

### Creating a New Project

```typescript
const handle = await registry.open({
  name: 'Rocket Guidance System',
  description: 'Avionics control system',
  metadata: { owner: 'engineering-team' },
});
```

### Owner Tracking and Access Control

All domain entities (Projects, Parts, Versions, Combos) support optional owner tracking for audit trails and access control.

**Important**: Projects with owner information enforce access control - users must provide matching user ID when opening or loading.

```typescript
import type { OwnerInfo } from 'version-container';

const myUserId = createUserId('user-123');

// Define owner information
const owner: OwnerInfo = {
  userName: 'Jane Smith',
  userId: createUserId('user-123'),
  userGroupId: createUserGroupId('engineering-team'), // optional
};

// Create project with owner - must provide matching user ID
const handle = await registry.open(
  {
    name: 'Rocket Guidance System',
    owner,
  },
  myUserId // Must match owner.userId
);

// Auto-set owner when creating a project
const handle2 = await registry.open(
  {
    name: 'Another Project',
    // No owner specified
  },
  myUserId // User is automatically set as owner
);

// Load a project with owner - must provide matching user ID
const loaded = await registry.load(handle.projectId, myUserId);

// Load a project without owner - no user ID needed
const noOwnerProject = await registry.load(someOtherProjectId);

// Bypass ownership check (admin use case)
const adminHandle = await registry.load(
  projectId,
  undefined,
  { ignoreOwnership: true }
);

// Create part with owner (no access control for parts/versions)
await registry.addPart(handle.projectId, {
  id: createPartId('engine'),
  name: 'Engine Controller',
  adapterId: createAdapterId('git'),
  owner: {
    userName: 'John Doe',
    userId: createUserId('user-456'),
  },
});

// Create version with owner
await registry.addPartVersion(handle.projectId, partId, {
  id: createPartVersionId('v1.0.0'),
  label: '1.0.0',
  locator: { uri: 'git://engine.git@v1.0.0' },
  owner: {
    userName: 'John Doe',
    userId: createUserId('user-456'),
  },
});

// Create combo with owner
await registry.addCombo(handle.projectId, {
  name: 'Baseline',
  bindings: [{ partId, versionId }],
  owner: {
    userName: 'Jane Smith',
    userId: createUserId('user-123'),
  },
});
```

#### Query by Owner

```typescript
// Find all parts owned by a specific user
const partsByUser = await registry.findParts(projectId, {
  ownerUserId: createUserId('user-456'),
});

// Find all versions owned by a specific user
const versionsByUser = await registry.findVersions(projectId, {
  ownerUserId: createUserId('user-456'),
});

// Find all combos owned by a specific user
const combosByUser = await registry.findCombos(projectId, {
  ownerUserId: createUserId('user-456'),
});
```

#### Update Owner (Mutable)

```typescript
// Transfer ownership
await registry.updatePart(projectId, partId, (part) => ({
  ...part,
  owner: {
    userName: 'New Owner',
    userId: createUserId('user-789'),
  },
}));
```

#### Owner in Summaries

```typescript
// Lightweight summaries also include owner info
const summary = await registry.getPartSummary(projectId, partId);
console.log(summary?.owner?.userName); // "John Doe"
```

### Tag Management

The library provides a centralized tag management system with ID-based tags. Tags are scoped per project and typed (`part` or `version`).

#### Creating Tags

```typescript
// Create a version tag
const stableTag = await handle.createTag({
  name: 'stable',
  type: 'version',
  description: 'Production-ready versions',
});

// Create a part tag
const criticalTag = await handle.createTag({
  name: 'critical',
  type: 'part',
  description: 'Critical system components',
});
```

#### Assigning Tags to Parts and Versions

```typescript
// Assign tags when creating a version
await registry.addPartVersion(handle.projectId, partId, {
  id: createPartVersionId('v1.0.0'),
  label: '1.0.0',
  locator: { uri: 'npm://pkg@1.0.0' },
  tagIds: [stableTag.id],
});

// Add tags to an existing version
await registry.addVersionTagIds(handle.projectId, versionId, [
  stableTag.id,
  createTagId('production'),
]);

// Remove tags from a version
await registry.removeVersionTagIds(handle.projectId, versionId, [
  stableTag.id,
]);

// Replace all tags on a version
await registry.setVersionTagIds(handle.projectId, versionId, [
  stableTag.id,
]);

// Same operations for parts:
// addPartTagIds, removePartTagIds, setPartTagIds
```

#### Querying by Tags

```typescript
// Find versions with specific tags (OR logic)
const stableVersions = await registry.findVersions(handle.projectId, {
  tagsAny: ['stable', 'production'],
});

// Find versions with all specified tags (AND logic)
const stableProductionVersions = await registry.findVersions(handle.projectId, {
  tagsAll: ['stable', 'tested'],
});

// Combine with other filters
const recentStable = await registry.findVersions(handle.projectId, {
  partId: enginePartId,
  tagsAny: ['stable'],
});
```

#### Resolving Tag Names

```typescript
// Get tag IDs for a version
const tagIds = await registry.getVersionTagIds(handle.projectId, versionId);
console.log(tagIds); // [TagId, TagId, ...]

// Get resolved tag names for a version
const tagNames = await registry.getVersionTagNames(handle.projectId, versionId);
console.log(tagNames); // ['stable', 'production', ...]

// Same for parts
const partTagNames = await registry.getPartTagNames(handle.projectId, partId);
```

#### Tag Statistics

```typescript
// Get full statistics map (tag name -> count)
const stats = await handle.getVersionTagStats();
console.log(stats.get('stable')); // 5

// Get top N tags by usage
const topTags = await handle.getTopVersionTags(5);
console.log(topTags); // [['stable', 5], ['production', 3], ...]
```

#### Renaming and Deleting Tags

```typescript
// Rename a tag (atomic - all references update automatically)
await handle.renameTag(stableTag.id, 'release');

// Delete a tag (removes from all parts/versions that reference it)
await handle.deleteTag(criticalTag.id);
```

#### Listing and Finding Tags

```typescript
// List all tags in the project
const allTags = handle.listTags();

// List tags filtered by type
const versionTags = handle.listTags('version');
const partTags = handle.listTags('part');

// Find a tag by name and type
const tag = handle.findTagByName('stable', 'version');
console.log(tag?.id); // TagId

// Get a tag by ID
const tagById = handle.getTagById(stableTag.id);
```

#### Tag Validation Rules

- Tag names cannot contain spaces
- Tag names are case-sensitive (`URL` ≠ `url`)
- Tag names can contain special characters (`v1.0.0`, `release@final`, etc.)
- Duplicate tag names are not allowed within the same type (but `stable` can exist for both parts and versions)

### Adding Parts and Versions

```typescript
const enginePartId = createPartId('engine');
const v1Id = createPartVersionId('v1.0.0');
const v2Id = createPartVersionId('v1.1.0');

// Create tags first (scoped per project, typed as 'part' or 'version')
const criticalTag = await handle.createTag({
  name: 'critical',
  type: 'part',
  description: 'Critical system components',
});

const stableTag = await handle.createTag({
  name: 'stable',
  type: 'version',
  description: 'Production-ready versions',
});

// Add part with tag IDs
await registry.addPart(handle.projectId, {
  id: enginePartId,
  name: 'Engine Controller',
  adapterId: createAdapterId('git'),
  tagIds: [criticalTag.id],
});

// Add versions with tag IDs
await registry.addPartVersion(handle.projectId, enginePartId, {
  id: v1Id,
  label: '1.0.0',
  locator: { uri: 'git://engine.git@v1.0.0' },
  tagIds: [stableTag.id],
});

await registry.addPartVersion(handle.projectId, enginePartId, {
  id: v2Id,
  label: '1.1.0',
  locator: { uri: 'git://engine.git@v1.1.0' },
  tagIds: [stableTag.id],
});
```

### Creating and Managing Combos

```typescript
// Create a combo
const baselineId = createComboId('baseline');
await registry.addCombo(handle.projectId, {
  id: baselineId,
  name: 'Baseline Configuration',
  description: 'Initial stable configuration',
  bindings: [
    { partId: enginePartId, versionId: v1Id },
  ],
});

// Update combo bindings
await registry.updateCombo(handle.projectId, baselineId, (combo) => ({
  ...combo,
  name: 'Updated Baseline',
  bindings: [
    { partId: enginePartId, versionId: v2Id },  // Use newer version
  ],
}));

// Delete combo
await registry.deleteCombo(handle.projectId, baselineId);
```

### Querying and Filtering

```typescript
// Find parts by adapter
const gitParts = await registry.findParts(handle.projectId, {
  adapterId: createAdapterId('git'),
});

// Find parts by tag names (OR logic - any match)
const criticalParts = await registry.findParts(handle.projectId, {
  tagsAny: ['critical'],
});

// Find parts by tag names (AND logic - all must match)
const criticalAndHardware = await registry.findParts(handle.projectId, {
  tagsAll: ['critical', 'hardware'],
});

// Find parts by owner
const partsByUser = await registry.findParts(handle.projectId, {
  ownerUserId: createUserId('user-456'),
});

// Find versions for a specific part
const engineVersions = await registry.findVersions(handle.projectId, {
  partId: enginePartId,
});

// Find versions by tag names
const stableVersions = await registry.findVersions(handle.projectId, {
  tagsAny: ['stable'],
});

// Find versions by owner
const versionsByUser = await registry.findVersions(handle.projectId, {
  ownerUserId: createUserId('user-456'),
});

// Find combos using a specific version
const combosUsingV1 = await registry.findCombos(handle.projectId, {
  versionId: v1Id,
});

// Find combos by owner
const combosByUser = await registry.findCombos(handle.projectId, {
  ownerUserId: createUserId('user-456'),
});

// Get full entity by ID
const part = await registry.getPartById(handle.projectId, enginePartId);
const summary = await registry.getPartSummary(handle.projectId, enginePartId);
```

### Deleting Items (Soft Delete)

```typescript
// Soft delete a version (marks as deleted, keeps in snapshot)
await registry.deletePartVersion(handle.projectId, v1Id);

// Soft delete a part (cascades to all versions)
await registry.deletePart(handle.projectId, enginePartId);

// Query including deleted items
const allParts = await registry.findParts(handle.projectId, {
  includeDeleted: true,
});

// Permanently remove soft-deleted items
const removed = await registry.cleanDeletedVersions(handle.projectId);
```

### Managing Project Lifecycle

```typescript
// Load existing project
const handle = await registry.load(projectId);

// List open projects
const openProjects = registry.listOpenProjects();

// Close project (saves if dirty)
await registry.close(handle.projectId);

// Get current snapshot
const snapshot = await handle.getSnapshot();

// Update snapshot directly
await handle.update((s) => ({
  ...s,
  project: { ...s.project, metadata: { archived: true } },
}));

await handle.save();
```

### Listing Projects with Filtering and Pagination

The `listProjects()` API provides secure, paginated access to projects with filtering capabilities. This is essential for building project browsers, dashboards, and admin interfaces.

#### Security Behavior

**Important**: The API enforces access control by default:

- **No filters**: Returns only projects **without** owner info (public projects)
- **`ownerUserId`**: Returns only projects owned by that user
- **`ownerGroupId`**: Returns only projects owned by that group
- **`includeAll: true`**: Returns **all** projects (privileged operation - use with caution)

```typescript
import type { ProjectsQuery } from 'version-container';

// Default: only public projects (without owner)
const publicProjects = await registry.listProjects();
console.log(publicProjects.pagination); // { currentPage, pageSize, totalCount, totalPages, hasNext, hasPrevious }

// Filter by user: only that user's projects
const myProjects = await registry.listProjects({
  ownerUserId: createUserId('user-123'),
});

// Filter by group: only that group's projects
const teamProjects = await registry.listProjects({
  ownerGroupId: createUserGroupId('engineering-team'),
});

// Admin: all projects (privileged)
const allProjects = await registry.listProjects({
  includeAll: true,
});
```

#### Pagination

```typescript
// Navigate pages
const page1 = await registry.listProjects({ limit: 10, page: 1 });
if (page1.pagination.hasNext) {
  const page2 = await registry.listProjects({ limit: 10, page: 2 });
}
```

#### Combined Filters

```typescript
// Find engineering team's "rocket" projects updated recently
const results = await registry.listProjects({
  ownerGroupId: createUserGroupId('engineering-team'),
  namePattern: 'rocket',
  updatedAfter: '2024-06-01T00:00:00Z',
  limit: 20,
});
```

#### Project Summary with Stats

Each result includes owner info and statistics:

```typescript
const result = await registry.listProjects({ includeAll: true });

for (const project of result.projects) {
  console.log(project.id);          // Project ID
  console.log(project.name);        // Project name
  console.log(project.owner);       // OwnerInfo or undefined
  console.log(project.partsCount);  // Number of parts
  console.log(project.combosCount); // Number of combos
  console.log(project.createdAt);   // Creation timestamp
  console.log(project.updatedAt);   // Last update timestamp
}
```

## Event Subscription

```typescript
const events = registry.getEventDispatcher();

// Subscribe to events
const unsubscribe = events.subscribe('version:added', ({ projectId, version }) => {
  console.log(`Version ${version.id} added to project ${projectId}`);
});

// Unsubscribe when done
unsubscribe();
```

Available events: `project:created`, `project:loaded`, `project:updated`, `project:closed`, `part:added`, `part:updated`, `part:removed`, `version:added`, `version:updated`, `version:removed`, `combo:added`, `combo:updated`, `combo:removed`, `partsOrder:updated`, `tag:created`, `tag:renamed`, `tag:deleted`.

## Error Handling

```typescript
import {
  PartNotFoundError,
  VersionNotFoundError,
  ComboNotFoundError,
  ProjectAccessDeniedError,
  VersionContainerError,
} from 'version-container';

try {
  await registry.load(projectId, createUserId('user-999'));
} catch (error) {
  if (error instanceof ProjectAccessDeniedError) {
    console.log('Access denied for project:', error.projectId);
    console.log('Required owner:', error.requiredUserId);
  } else if (error instanceof PartNotFoundError) {
    console.log('Part not found:', error.partId);
  } else if (error instanceof VersionContainerError) {
    console.log('Container error:', error.code, error.entityId);
  } else {
    throw error;
  }
}
```

## Best Practices

1. **Always use branded ID creators** - Never use string literals for IDs
2. **Use owner tracking** for audit trails and access control on all entities
3. **Prefer registry methods** over direct `handle.update()` for structured changes
4. **Use soft delete** for data that might need recovery
5. **Subscribe to events** for reactive side effects
6. **Close projects** when done to release resources
7. **Use appropriate storage** for your environment
8. **Handle `VersionContainerError`** for type-safe error handling

## File Structure Reference

```
src/
├── models/          # Domain interfaces and types
├── lib/             # Core services (Registry, Handle, Events)
├── storages/        # Storage provider implementations
│   ├── in-memory/
│   ├── local-storage/
│   ├── mongodb/
│   └── sqlite/
└── index.ts         # Public API exports
```

## Testing Patterns

```typescript
import { InMemoryStorageProvider, SystemClock } from 'version-container';

// Use in-memory storage for tests
const testStorage = new InMemoryStorageProvider();

// Use deterministic clock for predictable timestamps
const clock = new TestClock('2024-01-01T00:00:00.000Z');

const registry = new ProjectRegistry({
  storage: testStorage,
  adapters: [],
  clock,
});
```

## Storage Comparison

| Provider | Environment | Use Case | Persistence | listProjects Support |
|----------|-------------|----------|-------------|---------------------|
| `InMemoryStorageProvider` | Any | Testing, caching | No | ✓ Full filtering & pagination |
| `LocalStorageStorageProvider` | Browser | Web apps | Yes (browser) | ✓ Full filtering & pagination |
| `SqliteStorageProvider` | Node.js | Desktop/server apps | Yes (file) | ✓ Indexed columns, migrations |
| `MongoDbStorageProvider` | Node.js | Distributed systems | Yes (remote) | ✓ Aggregation pipelines |
