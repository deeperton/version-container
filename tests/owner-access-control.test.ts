import { describe, expect, it } from 'vitest';
import {
  InMemoryStorageProvider,
  ProjectRegistry,
  ProjectAccessDeniedError,
  createUserId,
  createAdapterId,
  createPartId,
  type OwnerInfo,
  type UserId,
} from '../src/index';

describe('Project Access Control', () => {
  describe('open() method', () => {
    it('should auto-set caller as owner when asUser provided but no owner in init', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const myUserId = createUserId('user-123');

      const handle = await registry.open(
        {
          name: 'Test Project',
        },
        myUserId
      );

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toBeDefined();
      expect(snapshot.project.owner?.userId).toBe(myUserId);
      expect(snapshot.project.owner?.userName).toBe('Unknown');
    });

    it('should succeed when asUser matches init.owner.userId', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const myUserId = createUserId('user-123');
      const owner: OwnerInfo = {
        userName: 'John Doe',
        userId: myUserId,
      };

      const handle = await registry.open(
        {
          name: 'Test Project',
          owner,
        },
        myUserId
      );

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toEqual(owner);
    });

    it('should throw ProjectAccessDeniedError when asUser does not match init.owner.userId', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const otherUserId = createUserId('user-999');
      const owner: OwnerInfo = {
        userName: 'John Doe',
        userId: createUserId('user-123'),
      };

      await expect(
        registry.open(
          {
            name: 'Test Project',
            owner,
          },
          otherUserId
        )
      ).rejects.toThrow(ProjectAccessDeniedError);
    });

    it('should throw when project has owner but no asUser provided', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'John Doe',
        userId: createUserId('user-123'),
      };

      await expect(
        registry.open({
          name: 'Test Project',
          owner,
        })
      ).rejects.toThrow(ProjectAccessDeniedError);
    });

    it('should succeed with ignoreOwnership: true regardless of asUser', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const otherUserId = createUserId('user-999');
      const owner: OwnerInfo = {
        userName: 'John Doe',
        userId: createUserId('user-123'),
      };

      const handle = await registry.open(
        {
          name: 'Test Project',
          owner,
        },
        otherUserId,
        { ignoreOwnership: true }
      );

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toEqual(owner);
    });

    it('should succeed without asUser when project has no owner', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({
        name: 'Test Project',
      });

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toBeUndefined();
    });
  });

  describe('load() method', () => {
    it('should load project when asUser matches owner', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const myUserId = createUserId('user-123');

      // First, create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: myUserId },
        },
        myUserId
      );

      // Close the project
      await registry.close(handle.projectId);

      // Now load it - should succeed
      const loaded = await registry.load(handle.projectId, myUserId);
      expect(loaded).toBeDefined();
    });

    it('should load project when project has no owner', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      // First, create a project without owner
      const handle = await registry.open({
        name: 'Test Project',
      });

      // Close the project
      await registry.close(handle.projectId);

      // Now load it - should succeed without asUser
      const loaded = await registry.load(handle.projectId);
      expect(loaded).toBeDefined();
    });

    it('should throw ProjectAccessDeniedError when asUser does not match', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');
      const otherUserId = createUserId('user-999');

      // First, create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // Close the project
      await registry.close(handle.projectId);

      // Now try to load with different user - should fail
      await expect(registry.load(handle.projectId, otherUserId)).rejects.toThrow(
        ProjectAccessDeniedError
      );
    });

    it('should throw ProjectAccessDeniedError when project has owner but no asUser provided', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');

      // First, create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // Close the project
      await registry.close(handle.projectId);

      // Now try to load without asUser - should fail
      await expect(registry.load(handle.projectId)).rejects.toThrow(ProjectAccessDeniedError);
    });

    it('should load project when ignoreOwnership: true regardless of asUser', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');
      const otherUserId = createUserId('user-999');

      // First, create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // Close the project
      await registry.close(handle.projectId);

      // Now load with different user but ignoreOwnership - should succeed
      const loaded = await registry.load(handle.projectId, otherUserId, { ignoreOwnership: true });
      expect(loaded).toBeDefined();
    });
  });

  describe('Cache verification', () => {
    it('should verify ownership even when project is already cached', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');
      const otherUserId = createUserId('user-999');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // Project is now cached - try to load with same user, should work
      const loaded1 = await registry.load(handle.projectId, ownerUserId);
      expect(loaded1).toBe(handle);

      // Try to load with different user - should fail even though cached
      await expect(registry.load(handle.projectId, otherUserId)).rejects.toThrow(
        ProjectAccessDeniedError
      );
    });

    it('should allow internal calls without asUser when user is authenticated', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // Internal operations (which call load without asUser) should work
      // because the authenticated user is tracked
      const loaded = await registry.load(handle.projectId);
      expect(loaded).toBe(handle);
    });

    it('should throw on second load() with different user after first successful load', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');
      const otherUserId = createUserId('user-999');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // First successful load
      const loaded1 = await registry.load(handle.projectId, ownerUserId);
      expect(loaded1).toBeDefined();

      // Second load with different user should fail
      await expect(registry.load(handle.projectId, otherUserId)).rejects.toThrow(
        ProjectAccessDeniedError
      );
    });

    it('should allow re-loading with same user', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      // Multiple loads with same user should all work
      const loaded1 = await registry.load(handle.projectId, ownerUserId);
      const loaded2 = await registry.load(handle.projectId, ownerUserId);
      const loaded3 = await registry.load(handle.projectId, ownerUserId);

      expect(loaded1).toBe(handle);
      expect(loaded2).toBe(handle);
      expect(loaded3).toBe(handle);
    });
  });

  describe('Error properties', () => {
    it('should include projectId and requiredUserId properties in error', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');
      const otherUserId = createUserId('user-999');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      await registry.close(handle.projectId);

      // Try to load with wrong user
      try {
        await registry.load(handle.projectId, otherUserId);
        expect.fail('Should have thrown ProjectAccessDeniedError');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectAccessDeniedError);
        if (error instanceof ProjectAccessDeniedError) {
          expect(error.projectId).toBe(handle.projectId);
          expect(error.requiredUserId).toBe(ownerUserId);
          expect(error.code).toBe('PROJECT_ACCESS_DENIED');
        }
      }
    });

    it('should have error code PROJECT_ACCESS_DENIED', async () => {
      const ownerUserId = createUserId('user-123');
      const projectId = createUserId('project-id') as UserId & { __brand: 'ProjectId' };

      const error = new ProjectAccessDeniedError(projectId, ownerUserId);

      expect(error.code).toBe('PROJECT_ACCESS_DENIED');
    });
  });

  describe('Integration with other operations', () => {
    it('should allow operations on project after successful load with correct user', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const myUserId = createUserId('user-123');
      const adapterId = createAdapterId('test');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: myUserId },
        },
        myUserId
      );

      await registry.close(handle.projectId);

      // Load with correct user
      const loaded = await registry.load(handle.projectId, myUserId);

      // Should be able to add parts
      await registry.addPart(loaded.projectId, {
        id: createPartId('test-part'),
        name: 'Test Part',
        adapterId,
      });

      const snapshot = await loaded.getSnapshot();
      expect(snapshot.parts.length).toBe(1);
    });

    it('should block addPart when load fails access check', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const ownerUserId = createUserId('user-123');
      const adapterId = createAdapterId('test');

      // Create a project with owner
      const handle = await registry.open(
        {
          name: 'Test Project',
          owner: { userName: 'John Doe', userId: ownerUserId },
        },
        ownerUserId
      );

      await registry.close(handle.projectId);

      // Try to add part without user context - should fail on load
      await expect(
        registry.addPart(handle.projectId, {
          id: createPartId('test-part'),
          name: 'Test Part',
          adapterId,
        })
      ).rejects.toThrow(ProjectAccessDeniedError);
    });
  });
});
