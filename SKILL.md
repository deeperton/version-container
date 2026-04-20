---
name: version-container
description: dealing with a typescript library for managing projects composed of parts, versions, and version combos with pluggable storage backends
---

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Installation](#installation)
- [Quick Start Pattern](#quick-start-pattern)
- [Storage Provider Selection](#storage-provider-selection)
- [Common Workflows](#common-workflows)
- [Event Subscription](#event-subscription)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [File Structure Reference](#file-structure-reference)
- [Testing Patterns](#testing-patterns)
- [Storage Comparison](#storage-comparison)

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
| `ProjectSummary` | Lightweight project info | id, name, description, owner, updatedBy, updatedAt |
| `ProjectListSummary` | Enriched project info | id, name, description, owner, updatedBy, createdAt, updatedAt, partsCount, combosCount, comboLatestUpdateAt, comboLatestUpdateBy, comboLatestName |
| `ProjectsQuery` | Query options for listProjects | `{ ownerUserId?, metadata?, namePattern?, limit?, page?, includeAll? }` |
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
  type OwnerInfo,
} from 'version-container';

// 1. Set up storage
const storage = new InMemoryStorageProvider();
const registry = new ProjectRegistry({ storage, adapters: [] });

// 2. Define user context
const myUser: OwnerInfo = {
  userName: 'John Doe',
  userId: createUserId('user-123'),
};

// 3. Create/open a project (owner and updatedBy are REQUIRED)
const handle = await registry.open({
  name: 'My Application',
  description: 'Project description',
  owner: myUser,           // REQUIRED
  updatedBy: myUser,       // REQUIRED
});

// 4. Add a part (with optional user tracking)
const partId = createPartId('ui-kit');
await registry.addPart(handle.projectId, {
  id: partId,
  name: 'UI Kit',
  adapterId: createAdapterId('npm'),
  owner: myUser,           // Track who created this part
}, myUser);              // Track who's adding this part

// 5. Add versions to the part
await registry.addPartVersion(handle.projectId, partId, {
  id: createPartVersionId('1.0.0'),
  label: '1.0.0',
  locator: { uri: 'npm://ui-kit@1.0.0' },
  owner: myUser,           // Track who created this version
}, myUser);              // Track who's adding this version

// 6. Create a combo (with user tracking)
await registry.addCombo(handle.projectId, {
  id: createComboId('baseline'),
  name: 'Baseline',
  bindings: [
    { partId, versionId: createPartVersionId('1.0.0') }
  ],
  owner: myUser,           // Track who created this combo
  updatedBy: myUser,       // Track who created this combo
}, myUser);              // Track who's adding this combo

// 7. List projects with enhanced activity tracking
const result = await registry.listProjects({ ownerUserId: myUser.id });
for (const project of result.projects) {
  console.log(`${project.name}: last updated by ${project.updatedBy.userName}`);
  if (project.comboLatestUpdateAt) {
    console.log(`  Latest combo: ${project.comboLatestName}`);
    console.log(`  Updated by: ${project.comboLatestUpdateBy?.userName}`);
    console.log(`  At: ${project.comboLatestUpdateAt}`);
  }
}
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

### User Context Tracking for Mutations

The library tracks which users make changes through an optional `user` parameter on mutation methods. This provides complete audit trails and activity visibility.

#### Adding User Context

```typescript
import type { OwnerInfo } from 'version-container';

const currentUser: OwnerInfo = {
  userName: 'Jane Smith',
  userId: createUserId('user-123'),
};

// Track who made the change
await registry.updateProjectMetadata(handle.projectId, (metadata) => ({
  ...metadata,
  description: 'Updated by Jane',
}), currentUser);

await registry.addCombo(handle.projectId, {
  name: 'New Combo',
  bindings: [{ partId, versionId }],
  owner: currentUser,    // Combo creator
  updatedBy: currentUser, // Combo updater
}, currentUser);  // Who's adding this combo

await registry.updateCombo(handle.projectId, comboId, (combo) => ({
  ...combo,
  name: 'Updated Combo',
}), currentUser);  // Who's updating
```

#### Supported Methods with User Tracking

All major mutation methods accept optional `user?: OwnerInfo`:
- Project: `updateProjectMetadata`
- Parts: `addPart`, `updatePart`, `deletePart`
- Versions: `addPartVersion`, `updatePartVersion`, `deletePartVersion`
- Combos: `addCombo`, `updateCombo`, `deleteCombo`
- Tags: `createTag`, `renameTag`, `deleteTag`

#### Combo Activity Tracking

Projects now include combo activity information in `listProjects()` results:

```typescript
const result = await registry.listProjects();

for (const project of result.projects) {
  console.log(`${project.name}: last updated by ${project.updatedBy.userName}`);
  
  // Latest combo update info
  if (project.comboLatestUpdateAt) {
    console.log(`  Latest combo: ${project.comboLatestName}`);
    console.log(`  Updated by: ${project.comboLatestUpdateBy?.userName}`);
    console.log(`  At: ${project.comboLatestUpdateAt}`);
  } else {
    console.log(`  No combos yet`);
  }
}
```

#### Breaking Change: Required Owner/updatedBy Fields

**This version introduces breaking changes:**
- `owner` and `updatedBy` are now **required** for all projects and combos
- All existing project/combo creation code must be updated

```typescript
// ❌ Old way (no longer works)
const handle = await registry.open({
  name: 'My Project',
});

// ✅ New way (required fields)
const handle = await registry.open({
  name: 'My Project',
  owner: {
    userName: 'User Name',
    userId: createUserId('user-123'),
  },
  updatedBy: {
    userName: 'User Name',
    userId: createUserId('user-123'),
  },
});

// Combos also require owner and updatedBy
await registry.addCombo(handle.projectId, {
  name: 'My Combo',
  bindings: [...],
  owner: { userName: 'User', userId: createUserId('user-123') },
  updatedBy: { userName: 'User', userId: createUserId('user-123') },
});
```

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

#### Force Deletion

By default, the library prevents deletion of parts/versions referenced by combos. Use `force: true` to bypass this check:

```typescript
// Force delete even if referenced by combos
await registry.deletePartVersion(handle.projectId, v1Id, { force: true });
await registry.deletePart(handle.projectId, enginePartId, { force: true });

// Useful for:
// - Deprecation workflows (keep historical combo records)
// - Cleanup operations (handle combo references separately)
// - Migration scenarios (need more control over deletion order)

// Warning: Combos may reference deleted items after force deletion
// Your application should filter or update combo bindings as needed
```

#### Handling Combo References During Deletion

**Option 1: Update combos before deletion (safe approach)**

```typescript
import { ReferencedByComboError } from 'version-container';

try {
  await registry.deletePartVersion(projectId, v1Id);
} catch (error) {
  if (error instanceof ReferencedByComboError) {
    // Find combos using this version
    const affectedCombos = error.referencingCombos;

    // Update each combo to use a different version
    for (const comboId of affectedCombos) {
      await registry.updateCombo(projectId, comboId, (combo) => ({
        ...combo,
        bindings: combo.bindings.map((binding) =>
          binding.versionId === v1Id
            ? { ...binding, versionId: v2Id } // Use newer version
            : binding
        ),
      }));
    }

    // Now deletion succeeds
    await registry.deletePartVersion(projectId, v1Id);
  }
}
```

**Option 2: Force delete and filter combos (flexible approach)**

```typescript
// Force delete for deprecation workflow
await registry.deletePartVersion(projectId, v1Id, { force: true });

// Combos still reference the deleted version
const combo = await registry.getComboById(projectId, comboId);
console.log(combo.bindings[0].versionId); // Still v1Id

// Filter out combos with deleted versions when displaying
const allCombos = await registry.findCombos(projectId);
const validCombos = allCombos.filter((comboId) => {
  const combo = registry.getComboById(projectId, comboId);
  return combo.bindings.every((binding) => {
    const version = registry.getVersionById(projectId, binding.versionId);
    return version !== undefined; // Exclude deleted versions
  });
});

// Or explicitly update combos later
await registry.updateCombo(projectId, comboId, (combo) => ({
  ...combo,
  bindings: combo.bindings.filter(
    (binding) => binding.versionId !== v1Id
  ),
}));
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


#### Metadata Filtering

Filter projects by their metadata key-value pairs (AND logic). Only primitive values (string, number, boolean) are supported.

```typescript
// Find active (non-deleted) projects
const activeProjects = await registry.listProjects({
  ownerUserId: myUserId,
  metadata: { deleted: false },
});

// Filter by multiple metadata fields
const premiumActive = await registry.listProjects({
  includeAll: true,
  metadata: { status: 'active', tier: 'premium' },
});

// Match `false` values or entirely missing metadata keys
const undeletedProjects = await registry.listProjects({
  ownerUserId: myUserId,
  metadata: { deleted: false },
  treatMissingMetadataAsFalse: true,
});
```

#### Project Summary with Stats and Activity Tracking

Each result includes owner info, update tracking, and combo activity:

```typescript
const result = await registry.listProjects({ includeAll: true });

for (const project of result.projects) {
  console.log(project.id);           // Project ID
  console.log(project.name);         // Project name
  console.log(project.owner);        // OwnerInfo (required)
  console.log(project.updatedBy);     // Who last updated (required)
  console.log(project.createdAt);    // Creation timestamp
  console.log(project.updatedAt);    // Last update timestamp
  console.log(project.partsCount);   // Number of parts
  console.log(project.combosCount);  // Number of combos
  
  // NEW: Combo activity tracking
  if (project.comboLatestUpdateAt) {
    console.log(`Latest combo: ${project.comboLatestName}`);
    console.log(`  Updated by: ${project.comboLatestUpdateBy?.userName}`);
    console.log(`  At: ${project.comboLatestUpdateAt}`);
  }
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

All library errors extend from `VersionContainerError` for type-safe error handling:

```typescript
import {
  PartNotFoundError,
  VersionNotFoundError,
  ComboNotFoundError,
  PartAlreadyDeletedError,
  VersionAlreadyDeletedError,
  ReferencedByComboError,
  ProjectAccessDeniedError,
  VersionContainerError,
} from 'version-container';

try {
  await registry.deletePart(projectId, partId);
} catch (error) {
  if (error instanceof ReferencedByComboError) {
    // Part/version is referenced by combos
    console.log(
      `Cannot delete: referenced by ${error.comboCount} combo(s)`,
      error.referencingCombos
    );
    // Handle combo references first, then retry with force: true
    await registry.deletePart(projectId, partId, { force: true });
  } else if (error instanceof PartAlreadyDeletedError) {
    console.log('Part is already soft-deleted:', error.partId);
  } else if (error instanceof VersionAlreadyDeletedError) {
    console.log('Version is already soft-deleted:', error.versionId);
  } else if (error instanceof ProjectAccessDeniedError) {
    console.log('Access denied for project:', error.projectId);
    console.log('Required owner:', error.requiredUserId);
  } else if (error instanceof PartNotFoundError) {
    console.log('Part not found:', error.partId);
  } else if (error instanceof VersionContainerError) {
    // Catch-all for any version-container error
    console.log('Container error:', error.code, error.entityId);
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

### Common Error Types

| Error | When Thrown | Key Properties |
|-------|------------|----------------|
| `PartNotFoundError` | Part doesn't exist | `partId` |
| `VersionNotFoundError` | Version doesn't exist | `versionId` |
| `ComboNotFoundError` | Combo doesn't exist | `comboId` |
| `PartAlreadyDeletedError` | Part is already soft-deleted | `partId` |
| `VersionAlreadyDeletedError` | Version is already soft-deleted | `versionId` |
| `ReferencedByComboError` | Part/version referenced by combos | `partId` \| `versionId`, `comboCount`, `referencingCombos[]` |
| `ProjectAccessDeniedError` | User doesn't match project owner | `projectId`, `requiredUserId` |
| `PartAlreadyExistsError` | Part already exists | `partId` |
| `VersionAlreadyExistsError` | Version already exists | `versionId` |
| `ComboAlreadyExistsError` | Combo already exists | `comboId` |
| `InvalidMetadataFilterError` | Non-primitive value passed to metadata filter | `key`, `actualType` |

## Best Practices

1. **Always use branded ID creators** - Never use string literals for IDs
2. **Use owner tracking** for audit trails and access control on all entities
3. **Prefer registry methods** over direct `handle.update()` for structured changes
4. **Use soft delete** for data that might need recovery
5. **Handle combo references explicitly** - Update or remove combos before deletion, or use `force: true` intentionally
6. **Subscribe to events** for reactive side effects
7. **Close projects** when done to release resources
8. **Use appropriate storage** for your environment
9. **Handle `VersionContainerError`** for type-safe error handling
10. **Use `force: true` judiciously** - Only when you understand the implications for combo references

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
