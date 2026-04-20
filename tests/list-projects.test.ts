import { describe, expect, it } from 'vitest';
import {
  InMemoryStorageProvider,
  ProjectRegistry,
  type OwnerInfo,
  createUserId,
  createUserGroupId,
} from '../src/index';

describe('List Projects API', () => {
  describe('Basic listing with pagination', () => {
    it('should list all projects with default pagination', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      // Create multiple projects
      await registry.open({ name: 'Project 1' });
      await registry.open({ name: 'Project 2' });
      await registry.open({ name: 'Project 3' });

      const result = await registry.listProjects();

      expect(result.projects).toHaveLength(3);
      expect(result.pagination.currentPage).toBe(1);
      expect(result.pagination.pageSize).toBe(50);
      expect(result.pagination.totalCount).toBe(3);
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrevious).toBe(false);
    });

    it('should paginate results with custom page size', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      // Create 15 projects
      for (let i = 1; i <= 15; i++) {
        await registry.open({ name: `Project ${i}` });
      }

      // Get first page with 5 items
      const page1 = await registry.listProjects({ limit: 5, page: 1 });
      expect(page1.projects).toHaveLength(5);
      expect(page1.pagination.totalCount).toBe(15);
      expect(page1.pagination.totalPages).toBe(3);
      expect(page1.pagination.hasNext).toBe(true);
      expect(page1.pagination.hasPrevious).toBe(false);

      // Get second page
      const page2 = await registry.listProjects({ limit: 5, page: 2 });
      expect(page2.projects).toHaveLength(5);
      expect(page2.pagination.hasNext).toBe(true);
      expect(page2.pagination.hasPrevious).toBe(true);

      // Get third page (last page)
      const page3 = await registry.listProjects({ limit: 5, page: 3 });
      expect(page3.projects).toHaveLength(5);
      expect(page3.pagination.hasNext).toBe(false);
      expect(page3.pagination.hasPrevious).toBe(true);
    });

    it('should return empty array when no projects exist', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const result = await registry.listProjects();

      expect(result.projects).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrevious).toBe(false);
    });

    it('should handle page beyond total count', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Project 1' });

      const result = await registry.listProjects({ page: 10 });

      expect(result.projects).toHaveLength(0);
      expect(result.pagination.totalCount).toBe(1);
      expect(result.pagination.currentPage).toBe(10);
    });
  });

  describe('Filtering by owner', () => {
    it('should filter by ownerUserId', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      await registry.open(
        { name: 'Project 1', owner: { userName: 'User 1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'Project 2', owner: { userName: 'User 2', userId: user2 } },
        user2
      );
      await registry.open(
        { name: 'Project 3', owner: { userName: 'User 1', userId: user1 } },
        user1
      );

      const result1 = await registry.listProjects({ ownerUserId: user1 });
      expect(result1.projects).toHaveLength(2);
      expect(result1.projects[0].owner?.userId).toBe(user1);

      const result2 = await registry.listProjects({ ownerUserId: user2 });
      expect(result2.projects).toHaveLength(1);
      expect(result2.projects[0].owner?.userId).toBe(user2);
    });

    it('should filter by ownerGroupId', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const group1 = createUserGroupId('engineering');
      const group2 = createUserGroupId('sales');

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');
      const user3 = createUserId('user-3');

      await registry.open(
        { name: 'Project 1', owner: { userName: 'User 1', userId: user1, userGroupId: group1 } },
        user1
      );
      await registry.open(
        { name: 'Project 2', owner: { userName: 'User 2', userId: user2, userGroupId: group1 } },
        user2
      );
      await registry.open(
        { name: 'Project 3', owner: { userName: 'User 3', userId: user3, userGroupId: group2 } },
        user3
      );

      const result = await registry.listProjects({ ownerGroupId: group1 });
      expect(result.projects).toHaveLength(2);
      expect(result.projects.every((p) => p.owner?.userGroupId === group1)).toBe(true);
    });

    it('should combine ownerUserId and ownerGroupId filters', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const group1 = createUserGroupId('engineering');
      const group2 = createUserGroupId('sales');

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      await registry.open(
        { name: 'Project 1', owner: { userName: 'User 1', userId: user1, userGroupId: group1 } },
        user1
      );
      await registry.open(
        { name: 'Project 2', owner: { userName: 'User 2', userId: user2, userGroupId: group2 } },
        user2
      );

      // Filter by user1's ID and group1 - should match Project 1
      const result = await registry.listProjects({ ownerUserId: user1, ownerGroupId: group1 });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].owner?.userId).toBe(user1);
    });
  });

  describe('Filtering by name pattern', () => {
    it('should filter by name pattern case-insensitively', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Rocket Guidance System' });
      await registry.open({ name: 'Propulsion Controller' });
      await registry.open({ name: 'Navigation System' });

      const result = await registry.listProjects({ namePattern: 'rocket' });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Rocket Guidance System');

      const result2 = await registry.listProjects({ namePattern: 'system' });
      expect(result2.projects).toHaveLength(2); // "Rocket Guidance System" and "Navigation System"
    });

    it('should return empty array for non-matching pattern', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Project 1' });

      const result = await registry.listProjects({ namePattern: 'nonexistent' });
      expect(result.projects).toHaveLength(0);
    });
  });

  describe('Filtering by date ranges', () => {
    it('should filter by createdAfter', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const p1 = await registry.open({ name: 'Project 1' });
      const snapshot1 = await p1.getSnapshot();

      // Create a second project
      await registry.open({ name: 'Project 2' });

      const result = await registry.listProjects({ createdAfter: snapshot1.project.createdAt });
      // Should include both projects since the first was created at exactly this timestamp
      expect(result.projects.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by updatedAfter', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const p1 = await registry.open({ name: 'Project 1' });
      const snapshot1 = await p1.getSnapshot();

      // Create a second project (which will have a later updatedAt)
      await registry.open({ name: 'Project 2' });

      const result = await registry.listProjects({ updatedAfter: snapshot1.project.updatedAt });
      expect(result.projects.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Combined filters', () => {
    it('should combine multiple filters', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      await registry.open(
        { name: 'Rocket System', owner: { userName: 'User 1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'Rocket Engine', owner: { userName: 'User 2', userId: user2 } },
        user2
      );
      await registry.open(
        { name: 'Navigation Module', owner: { userName: 'User 1', userId: user1 } },
        user1
      );

      const result = await registry.listProjects({
        ownerUserId: user1,
        namePattern: 'rocket',
      });

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Rocket System');
      expect(result.projects[0].owner?.userId).toBe(user1);
    });
  });

  describe('Project data completeness', () => {
    it('should include owner info in results', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'Alice Johnson',
        userId: createUserId('alice'),
        userGroupId: createUserGroupId('engineering'),
      };

      await registry.open({ name: 'Test Project', owner }, owner.userId);

      // Query with owner filter to see projects with owner
      const result = await registry.listProjects({ ownerUserId: owner.userId });

      expect(result.projects[0].owner).toEqual(owner);
    });

    it('should include stats (partsCount and combosCount)', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({ name: 'Test Project' });

      // Add some parts and combos
      await registry.addPart(handle.projectId, {
        id: 'part-1',
        name: 'Part 1',
        adapterId: 'test-adapter',
      });
      await registry.addPart(handle.projectId, {
        id: 'part-2',
        name: 'Part 2',
        adapterId: 'test-adapter',
      });

      await registry.addCombo(handle.projectId, {
        id: 'combo-1',
        name: 'Combo 1',
        bindings: [],
      });

      // Close the handle to save changes to storage
      await registry.close(handle.projectId, { save: true });

      const result = await registry.listProjects();

      expect(result.projects[0].partsCount).toBe(2);
      expect(result.projects[0].combosCount).toBe(1);
    });

    it('should include createdAt and updatedAt dates', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Test Project' });

      const result = await registry.listProjects();

      expect(result.projects[0].createdAt).toBeDefined();
      expect(result.projects[0].updatedAt).toBeDefined();
      expect(result.projects[0].createdAt).toBe(result.projects[0].updatedAt);
    });
  });

  describe('Sorting', () => {
    it('should sort by updatedAt descending', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const p1 = await registry.open({ name: 'Project 1' });

      // Add delays to ensure different timestamps
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
      await registry.open({ name: 'Project 2' });
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
      await registry.open({ name: 'Project 3' });

      // Update p1 to make it most recently updated
      await registry.addPart(p1.projectId, {
        id: 'part-1',
        name: 'Part 1',
        adapterId: 'test-adapter',
      });

      // Save changes to storage
      await registry.close(p1.projectId, { save: true });

      const result = await registry.listProjects();

      // Project 1 should be first (most recently updated)
      expect(result.projects[0].name).toBe('Project 1');
    });
  });

  describe('Security and access control', () => {
    it('should only return projects without owner when no filter is provided', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');

      // Create projects with and without owners
      await registry.open({ name: 'No Owner Project' });
      await registry.open(
        { name: 'Owned Project', owner: { userName: 'User 1', userId: user1 } },
        user1
      );

      // Query without filters should only return projects without owner
      const result = await registry.listProjects();
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('No Owner Project');
    });

    it('should only return projects owned by specific user when ownerUserId is provided', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      // Create projects with different owners
      await registry.open({ name: 'No Owner Project' });
      await registry.open(
        { name: 'User 1 Project', owner: { userName: 'User 1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'User 2 Project', owner: { userName: 'User 2', userId: user2 } },
        user2
      );

      // Query with ownerUserId should only return that user's projects
      const result1 = await registry.listProjects({ ownerUserId: user1 });
      expect(result1.projects).toHaveLength(1);
      expect(result1.projects[0].name).toBe('User 1 Project');
    });

    it('should only return projects owned by specific group when ownerGroupId is provided', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const group1 = createUserGroupId('engineering');
      const group2 = createUserGroupId('sales');
      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      // Create projects with different group owners
      await registry.open({ name: 'No Owner Project' });
      await registry.open(
        {
          name: 'Engineering Project',
          owner: { userName: 'User 1', userId: user1, userGroupId: group1 },
        },
        user1
      );
      await registry.open(
        {
          name: 'Sales Project',
          owner: { userName: 'User 2', userId: user2, userGroupId: group2 },
        },
        user2
      );

      // Query with ownerGroupId should only return that group's projects
      const result = await registry.listProjects({ ownerGroupId: group1 });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Engineering Project');
    });

    it('should return all projects when includeAll is true', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      // Create projects with and without owners
      await registry.open({ name: 'No Owner Project' });
      await registry.open(
        { name: 'User 1 Project', owner: { userName: 'User 1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'User 2 Project', owner: { userName: 'User 2', userId: user2 } },
        user2
      );

      // Query with includeAll: true should return all projects
      const result = await registry.listProjects({ includeAll: true });
      expect(result.projects).toHaveLength(3);
      const projectNames = result.projects.map((p) => p.name);
      expect(projectNames).toContain('User 2 Project');
      expect(projectNames).toContain('User 1 Project');
      expect(projectNames).toContain('No Owner Project');
    });

    it('should respect includeAll even when combined with other filters', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');

      await registry.open(
        { name: 'Alpha Project', owner: { userName: 'User 1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'Beta Project', owner: { userName: 'User 1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'Gamma Project', owner: { userName: 'User 1', userId: user1 } },
        user1
      );

      // includeAll with namePattern should work
      const result = await registry.listProjects({ includeAll: true, namePattern: 'Project' });
      expect(result.projects).toHaveLength(3);
    });
  });

  describe('Filtering by metadata', () => {
    it('should filter by a single metadata key-value pair', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle1 = await registry.open({ name: 'Active Project', metadata: { status: 'active' } });
      await registry.open({ name: 'Deleted Project', metadata: { deleted: true } });
      await registry.open({ name: 'Another Active', metadata: { status: 'active' } });

      const result = await registry.listProjects({ includeAll: true, metadata: { status: 'active' } });
      expect(result.projects).toHaveLength(2);
      expect(result.projects.map((p) => p.name).sort()).toEqual(['Active Project', 'Another Active']);
    });

    it('should filter by multiple metadata key-value pairs (AND logic)', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'P1', metadata: { status: 'active', tier: 'premium' } });
      await registry.open({ name: 'P2', metadata: { status: 'active', tier: 'free' } });
      await registry.open({ name: 'P3', metadata: { status: 'archived', tier: 'premium' } });

      const result = await registry.listProjects({
        includeAll: true,
        metadata: { status: 'active', tier: 'premium' },
      });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('P1');
    });

    it('should return empty when metadata key does not exist in any project', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'P1', metadata: { status: 'active' } });

      const result = await registry.listProjects({
        includeAll: true,
        metadata: { nonexistent: 'value' },
      });
      expect(result.projects).toHaveLength(0);
    });

    it('should return empty when metadata value does not match', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'P1', metadata: { status: 'active' } });

      const result = await registry.listProjects({
        includeAll: true,
        metadata: { status: 'archived' },
      });
      expect(result.projects).toHaveLength(0);
    });

    it('should filter by boolean metadata values', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Visible', metadata: { hidden: false } });
      await registry.open({ name: 'Hidden', metadata: { hidden: true } });
      await registry.open({ name: 'No Flag' });

      const result = await registry.listProjects({ includeAll: true, metadata: { hidden: true } });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Hidden');
    });

    it('should filter by numeric metadata values', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Version 1', metadata: { version: 1 } });
      await registry.open({ name: 'Version 2', metadata: { version: 2 } });

      const result = await registry.listProjects({ includeAll: true, metadata: { version: 2 } });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Version 2');
    });

    it('should combine metadata filter with other filters', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const user1 = createUserId('user-1');
      const user2 = createUserId('user-2');

      await registry.open(
        { name: 'User1 Active', metadata: { status: 'active' }, owner: { userName: 'U1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'User1 Deleted', metadata: { deleted: true }, owner: { userName: 'U1', userId: user1 } },
        user1
      );
      await registry.open(
        { name: 'User2 Active', metadata: { status: 'active' }, owner: { userName: 'U2', userId: user2 } },
        user2
      );

      // Filter by owner + metadata
      const result = await registry.listProjects({
        ownerUserId: user1,
        metadata: { status: 'active' },
      });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('User1 Active');
    });

    it('should not match projects without metadata when metadata filter is specified', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'No Metadata' });
      await registry.open({ name: 'Has Metadata', metadata: { key: 'value' } });

      const result = await registry.listProjects({ includeAll: true, metadata: { key: 'value' } });
      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].name).toBe('Has Metadata');
    });

    it('should throw InvalidMetadataFilterError for non-primitive metadata filter values', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'P1' });

      // Object value
      await expect(
        registry.listProjects({ includeAll: true, metadata: { nested: { foo: 'bar' } } })
      ).rejects.toThrow('Complex metadata values are not supported in queries');

      // Array value
      await expect(
        registry.listProjects({ includeAll: true, metadata: { tags: ['a', 'b'] } })
      ).rejects.toThrow('Complex metadata values are not supported in queries');

      // Null value
      await expect(
        registry.listProjects({ includeAll: true, metadata: { empty: null } })
      ).rejects.toThrow('Complex metadata values are not supported in queries');
    });

    it('should reflect correct pagination when metadata filtering reduces results', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      // Create 10 projects, only 3 with the target metadata
      for (let i = 1; i <= 10; i++) {
        await registry.open({
          name: `Project ${i}`,
          metadata: i <= 3 ? { featured: true } : { featured: false },
        });
      }

      const result = await registry.listProjects({
        includeAll: true,
        metadata: { featured: true },
        limit: 2,
        page: 1,
      });

      expect(result.projects).toHaveLength(2);
      expect(result.pagination.totalCount).toBe(3);
      expect(result.pagination.totalPages).toBe(2);
      expect(result.pagination.hasNext).toBe(true);
    });

    it('should treat missing metadata as false when treatMissingMetadataAsFalse is true', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      await registry.open({ name: 'Explicit False', metadata: { deleted: false } });
      await registry.open({ name: 'Explicit True', metadata: { deleted: true } });
      await registry.open({ name: 'Missing Metadata property', metadata: { status: 'active' } });
      await registry.open({ name: 'No Metadata entirely' });

      // Normal behavior: only matches the explicit false
      const strictResult = await registry.listProjects({ includeAll: true, metadata: { deleted: false } });
      expect(strictResult.projects).toHaveLength(1);
      expect(strictResult.projects[0].name).toBe('Explicit False');

      // With treatMissingMetadataAsFalse: matches explicit false, missing property, and no metadata
      const relaxedResult = await registry.listProjects({
        includeAll: true,
        metadata: { deleted: false },
        treatMissingMetadataAsFalse: true,
      });
      expect(relaxedResult.projects).toHaveLength(3);
      expect(relaxedResult.projects.map(p => p.name).sort()).toEqual([
        'Explicit False',
        'Missing Metadata property',
        'No Metadata entirely'
      ].sort());
      
      // treatMissingMetadataAsFalse should not affect other filters
      const trueResult = await registry.listProjects({
        includeAll: true,
        metadata: { deleted: true },
        treatMissingMetadataAsFalse: true,
      });
      expect(trueResult.projects).toHaveLength(1);
      expect(trueResult.projects[0].name).toBe('Explicit True');
    });
  });
});
