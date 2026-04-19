# CLAUDE.md

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture Principles](#architecture-principles)
- [Domain Model](#domain-model)
- [File Structure](#file-structure)
- [Testing Guidelines](#testing-guidelines)
- [Development Workflow](#development-workflow)
- [Git Workflow & Best Practices](#git-workflow--best-practices)
- [Code Quality Checklist](#code-quality-checklist)
- [Adding New Features](#adding-new-features)
- [Best Practices](#best-practices)
- [Performance Considerations](#performance-considerations)
- [Security](#security)
- [Current Implementation Status](#current-implementation-status)
- [Common Patterns](#common-patterns)

---

## Project Overview

This is a TypeScript library project called **version-container** that provides type-safe building blocks for managing projects composed of parts, versions, and version combos. The library focuses on deterministic snapshots, pluggable storage/adapters, and tooling-friendly lifecycle management.

## Architecture Principles

### 1. **Strict Typing**
- Always use TypeScript's strict mode (`strict: true` in `tsconfig.json`)
- Avoid using `any` types; use `unknown` or proper type definitions instead
- Export all public types and interfaces for library consumers
- Use JSDoc comments for documentation alongside TypeScript types
- Use branded types (e.g., `PartId`, `VersionId`, `TagId`) for domain entities

### 2. **Modular Design**
- Keep modules small and focused on a single responsibility
- Use the barrel export pattern in `index.ts` to control the public API
- Separate concerns: utilities, core logic, types, and exports
- Follow the principle: "A module should do one thing and do it well"
- Domain models are in `/src/models` with individual files per domain entity

### 3. **ESM First**
- All code uses ESM modules (`import`/`export`)
- Package is configured with `"type": "module"` in `package.json`
- Build outputs both ESM and CommonJS formats for maximum compatibility

### 4. **Minimal Dependencies**
- Keep production dependencies to an absolute minimum
- Evaluate the necessity and maintenance status of any new dependency
- Prefer standard library solutions when possible
- Current key dependencies: Vite (build), Vitest (testing), better-sqlite3 (SQLite storage)

### 5. **Clean Code Standards**
- Use ESLint and Prettier for consistent code style
- Run linting and formatting before commits
- Keep functions small and readable
- Use descriptive variable and function names

## Domain Model

### Core Entities

1. **Project**: Container for parts, versions, combos, and tags
   - Has unique `ProjectId` (branded string)
   - Contains metadata and owner information
   - Access controlled by owner user ID

2. **Part**: Represents a component or dependency
   - Has unique `PartId` (branded string)
   - Associated with an `AdapterId` for fetching artifacts
   - Can have `tagIds` referencing version tags

3. **PartVersion**: A specific version of a part
   - Has unique `PartVersionId` (branded string)
   - Contains `locator` for artifact resolution
   - Can have `tagIds` referencing version tags

4. **VersionCombo**: A named set of part-version bindings
   - Has unique `ComboId` (branded string)
   - References parts and versions via bindings
   - Used for reproducible configurations

5. **Tag**: Centralized tag definitions with ID-based references
   - Has unique `TagId` (branded string)
   - Typed as `'part'` or `'version'`
   - Supports atomic rename operations

### Key Design Patterns

- **Branded Types**: All domain IDs use branded string types for type safety
- **Snapshot-based State**: Projects are represented as immutable `ProjectSnapshot` objects
- **Soft Delete**: Parts and versions are soft-deleted via `metadata.deletedAt`
- **Event System**: Typed events for all mutations (created, updated, removed, etc.)
- **Storage Abstraction**: Pluggable storage providers (in-memory, localStorage, SQLite, MongoDB)

## File Structure

```
/src
  /lib                          # Runtime services and utilities
    /project-handle.ts          # Main project management API
    /project-registry.ts        # Multi-project registry
    /project-snapshot-builder.ts # Snapshot construction with validation
    /errors.ts                   # Domain-specific error classes
    /ids.ts                     # ID generation utilities
    /clock.ts                   # Time abstraction for testing
    /utils/                     # Utility modules
      /clone.ts                # Deep cloning
      /async-mutex.ts          # Concurrency control
      /sort.ts                 # Sorting utilities
    /events/                    # Event system
      /project-events.ts       # Typed event definitions
    /mocks/                     # Test utilities
      /test-clock.ts           # Deterministic clock
  /models                       # Domain model interfaces
    /base.ts                    # Branded ID types and common types
    /project.ts                 # Project snapshot and init types
    /part.ts                    # Part and version definitions
    /combo.ts                   # Combo definitions
    /tag.ts                     # Tag definitions
    /adapter.ts                 # Adapter interface
    /queries.ts                 # Filter types for queries
    /index.ts                   # Model barrel exports
  /storages                     # Storage provider implementations
    /storage-registry.ts        # Storage provider registry
    /in-memory/                 # In-memory storage (testing)
      /in-memory-storage.ts
      /mocks/
    /local-storage/             # Browser localStorage
      /local-storage-storage.ts
    /sqlite/                    # SQLite storage (server)
      /sqlite-storage.ts        # With migration system
    /mongodb/                   # MongoDB storage (server)
      /mongodb-storage.ts
  /index.ts                     # Public barrel exports

/tests                            # Unit tests (mirrors src structure)
  /lib/                          # Tests for lib modules
  /models/                       # Tests for models
  /storages/                     # Tests for storage providers
  *.test.ts                      # Integration tests
```

## Testing Guidelines

### 1. **Test Coverage**
- Aim for high test coverage (80%+) but focus on meaningful tests
- Every public function should have unit tests
- Test edge cases and error conditions, not just happy paths
- Current test count: 400+ tests across 21 test files

### 2. **Test Structure**
- Use `describe` blocks to group related tests
- Use descriptive test names that explain what is being tested
- Follow the Arrange-Act-Assert (AAA) pattern:
  ```typescript
  it('should do something', () => {
    // Arrange: Set up test data
    const input = 'test';

    // Act: Execute the code under test
    const result = myFunction(input);

    // Assert: Verify the result
    expect(result).toBe('expected');
  });
  ```

### 3. **Test Independence**
- Each test should be independent and not rely on others
- Avoid shared state between tests
- Use `beforeEach`/`afterEach` for setup/cleanup when needed

### 4. **Test Organization**
- Place test files alongside source files with `.test.ts` extension
- Mirror the source structure in `/tests` directory
- Use mock objects and factories for test data creation
- Example: `src/storages/in-memory/mocks/project-snapshot.ts`

### 5. **Domain-Specific Testing Patterns**

#### Testing Tag Operations
```typescript
it('should create a new version tag', async () => {
  const tag = await handle.createTag({
    name: 'stable',
    type: 'version',
  });
  expect(tag.name).toBe('stable');
  expect(tag.type).toBe('version');
});
```

#### Testing Query Filters
```typescript
it('should filter by tagsAny (OR logic)', async () => {
  const stableTag = await handle.createTag({ name: 'stable', type: 'version' });
  await handle.addVersionTagIds(versionId, [stableTag.id]);

  const results = handle.findVersions({ tagsAny: ['stable'] });
  expect(results).toContain(versionId);
});
```

#### Testing Soft Delete
```typescript
it('should soft delete a version', async () => {
  await registry.deletePartVersion(projectId, versionId);

  // Default: deleted items excluded
  const active = await registry.findVersions(projectId);
  expect(active).not.toContain(versionId);

  // Include deleted items
  const all = await registry.findVersions(projectId, { includeDeleted: true });
  expect(all).toContain(versionId);
});
```

## Development Workflow

### 1. **Setting Up**
```bash
npm install              # Install dependencies
npm run typecheck        # Type check without emitting files
npm run lint             # Run linter
npm run format:check     # Check code formatting
```

### 2. **Development**
```bash
npm test                 # Run tests in watch mode
npm run test:ui          # Run tests with UI
npm run test:coverage    # Generate coverage report
```

### 3. **Before Commit**
```bash
npm run typecheck        # Ensure no type errors
npm run lint:fix         # Fix linting issues
npm run format           # Format code
npm test                 # Run all tests
```

### 4. **Building**
```bash
npm run build            # Build for production
```

## Git Workflow & Best Practices

### Context-Aware Branching
- Check current state before starting work
- Stay on existing feature/fix branches if they match the current task
- Create new branches: `feature/description` or `fix/description`
- Keep history linear using rebasing

### Atomic Commits
- Each commit should be atomic (single logical change)
- Don't mix refactoring with new feature code
- Run `git status` separately before commits to verify staging area
- Use imperative mood in commit messages
- Add body to commit messages explaining "why" when change isn't self-explanatory

### File Preservation
- Never delete uncommitted project files
- If removing a file: `git add` → `git commit` → `git rm` (in separate commits)
- Never delete branches (`git branch -d` or `-D`)

## Code Quality Checklist

Before submitting code, ensure:
- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] New functionality has tests
- [ ] Public APIs have JSDoc comments
- [ ] No console.log or debug code remains
- [ ] Types are exported for library consumers
- [ ] Tag-related operations use TagId (not string-based tags)

## Adding New Features

### 1. Domain Model Changes
- Add/edit interfaces in appropriate `/src/models/*.ts` file
- Export new types from `/src/models/index.ts`
- Update `/src/index.ts` if public API changes
- Add branded ID types to `/src/models/base.ts` if needed

### 2. Service Logic
- Add methods to `ProjectHandle` or `ProjectRegistry`
- Follow existing patterns for mutation operations
- Emit appropriate events for observable changes
- Use `commitMutation<T>()` for state changes

### 3. Storage Provider Updates
- Update all storage providers for persistence
- Add migration for SQLite schema changes
- Update `InMemoryStorageProvider` for contract testing
- Ensure `loadSnapshot`/`saveSnapshot` handle new fields

### 4. Testing
- Add unit tests for new functionality
- Test edge cases and error conditions
- Add integration tests for storage providers
- Update test fixtures as needed

## Best Practices

### TypeScript
- Use `const` by default, `let` only when reassignment is needed
- Leverage type inference when types are obvious
- Define explicit return types for public functions
- Use branded types for domain identifiers

### Error Handling
- Use custom error classes from `./errors.ts`
- Always type error boundaries
- Validate inputs for public APIs
- Provide helpful error messages with entity context

### Event System
- Emit events after state mutations complete
- Include relevant entity IDs and snapshot in event payloads
- Use typed event names from `ProjectEventName`
- Events are synchronous - use `await` for async listeners

### Storage Abstraction
- Storage providers must implement `StorageProvider` interface
- Use document-style storage (full snapshots) with indexed search columns
- Support lazy initialization
- Handle migration for schema evolution

### Tag System
- Always use `TagId` for references, never raw strings
- Create tags before assigning to parts/versions
- Use `tagsAny` for OR filtering, `tagsAll` for AND filtering
- Tag names are case-sensitive and cannot contain spaces

## Performance Considerations
- Avoid premature optimization
- Profile before optimizing
- Consider memory implications of data structures
- Be mindful of bundle size
- Use in-memory snapshots for fast queries
- Lazy-load projects in registry

## Security
- Never commit secrets or API keys
- Validate and sanitize external inputs
- Keep dependencies updated
- Review dependency security advisories
- Implement access control for project ownership

## Current Implementation Status

### Completed Features
- ✅ Project lifecycle (create, load, close)
- ✅ Part management (add, update, delete, soft delete)
- ✅ Version management (add, update, delete, soft delete)
- ✅ Combo management (add, update, delete)
- ✅ Tag management (create, rename, delete, query)
- ✅ ID-based tag system with atomic rename
- ✅ Soft delete with clean operations
- ✅ Parts order management
- ✅ Owner tracking and access control
- ✅ Query filters (adapter, tags, metadata, owner)
- ✅ Event system with typed events
- ✅ Multiple storage providers (in-memory, localStorage, SQLite, MongoDB)
- ✅ Storage registry for runtime provider selection
- ✅ Project listing with pagination and filtering
- ✅ **NEW: User context tracking with `updatedBy` field**
- ✅ **NEW: Combo activity tracking in project listings**
- ✅ **NEW: Required `owner` and `updatedBy` fields (breaking change)**

### Recent Breaking Changes
- **Required owner/updatedBy**: Projects and combos now require `owner` and `updatedBy` fields
- **Mutation user tracking**: All major mutation methods accept optional `user?: OwnerInfo` parameter
- **Enhanced project listings**: `ProjectListSummary` now includes combo activity tracking fields

### Storage Provider Migration System
- SQLite uses automatic schema migrations
- Current schema version: 5 (upgraded from v4)
- Migrations tracked in `_adapter_state` table
- Supports indexed columns for efficient queries
- **Migration v5**: Added `updatedBy` columns for tracking last modifier

## Common Patterns

### Mutation Pattern
```typescript
async updateEntity(id: EntityId, mutator: (current: Entity) => Entity): Promise<Entity> {
  return this.commitMutation<Entity>((snapshot) => {
    const entity = snapshot.entities.find(e => e.id === id);
    if (!entity) throw new EntityNotFoundError(id, this.projectId);

    const updated = mutator(entity);
    // Validate updated entity...

    return {
      snapshot: { ...snapshot, entities: [...] },
      result: updated,
      events: [/* event builders */],
    };
  });
}
```

### Tag Assignment Pattern
```typescript
// Create tag first
const tag = await handle.createTag({ name: 'stable', type: 'version' });

// Assign to entity by ID
await handle.addVersionTagIds(versionId, [tag.id]);

// Query by tag name (resolved internally)
const results = handle.findVersions({ tagsAny: ['stable'] });
```

---

**Remember:** This is an incremental library. Start small, build solid foundations, and grow the codebase organically based on real needs.
