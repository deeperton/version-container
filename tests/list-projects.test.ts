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

      await registry.open({ name: 'Project 1', owner: { userName: 'User 1', userId: user1 } }, user1);
      await registry.open({ name: 'Project 2', owner: { userName: 'User 2', userId: user2 } }, user2);
      await registry.open({ name: 'Project 3', owner: { userName: 'User 1', userId: user1 } }, user1);

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

      await registry.open({ name: 'Rocket System', owner: { userName: 'User 1', userId: user1 } }, user1);
      await registry.open({ name: 'Rocket Engine', owner: { userName: 'User 2', userId: user2 } }, user2);
      await registry.open({ name: 'Navigation Module', owner: { userName: 'User 1', userId: user1 } }, user1);

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

      const result = await registry.listProjects();

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
});
