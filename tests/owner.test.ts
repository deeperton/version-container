import { describe, expect, it } from 'vitest';
import {
  InMemoryStorageProvider,
  ProjectRegistry,
  type OwnerInfo,
  createUserId,
  createUserGroupId,
  createAdapterId,
  createPartId,
  createPartVersionId,
  createComboId,
} from '../src/index';

describe('Owner Functionality', () => {
  describe('Project Owner', () => {
    it('should create a project with owner information', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'John Doe',
        userId: createUserId('user-123'),
        userGroupId: createUserGroupId('team-avionics'),
      };

      const handle = await registry.open(
        {
          name: 'Rocket Guidance System',
          owner,
        },
        owner.userId // Must match owner
      );

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toEqual(owner);
      expect(snapshot.project.owner?.userName).toBe('John Doe');
      expect(snapshot.project.owner?.userId).toBe('user-123' as ReturnType<typeof createUserId>);
      expect(snapshot.project.owner?.userGroupId).toBe('team-avionics' as ReturnType<typeof createUserGroupId>);
    });

    it('should create a project with owner but no group', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'Jane Smith',
        userId: createUserId('user-456'),
      };

      const handle = await registry.open(
        {
          name: 'Propulsion System',
          owner,
        },
        owner.userId // Must match owner
      );

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toEqual(owner);
      expect(snapshot.project.owner?.userName).toBe('Jane Smith');
      expect(snapshot.project.owner?.userId).toBe('user-456' as ReturnType<typeof createUserId>);
      expect(snapshot.project.owner?.userGroupId).toBeUndefined();
    });

    it('should create a project without owner (backward compatibility)', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({
        name: 'Legacy Project',
      });

      const snapshot = await handle.getSnapshot();
      expect(snapshot.project.owner).toBeUndefined();
    });
  });

  describe('Part Owner', () => {
    it('should add a part with owner information', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({
        name: 'Test Project',
      });

      const owner: OwnerInfo = {
        userName: 'Alice Johnson',
        userId: createUserId('user-789'),
        userGroupId: createUserGroupId('engineering'),
      };

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine Controller',
        adapterId,
        owner,
      });

      const part = await registry.getPartById(handle.projectId, partId);
      expect(part?.owner).toEqual(owner);
      expect(part?.owner?.userName).toBe('Alice Johnson');
    });

    it('should update part owner information', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({
        name: 'Test Project',
      });

      const originalOwner: OwnerInfo = {
        userName: 'Alice Johnson',
        userId: createUserId('user-789'),
      };

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine Controller',
        adapterId,
        owner: originalOwner,
      });

      const newOwner: OwnerInfo = {
        userName: 'Bob Williams',
        userId: createUserId('user-999'),
        userGroupId: createUserGroupId('ops'),
      };

      await registry.updatePart(handle.projectId, partId, (part) => ({
        ...part,
        owner: newOwner,
      }));

      const part = await registry.getPartById(handle.projectId, partId);
      expect(part?.owner).toEqual(newOwner);
      expect(part?.owner?.userName).toBe('Bob Williams');
    });
  });

  describe('Version Owner', () => {
    it('should add a version with owner information', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({
        name: 'Test Project',
      });

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine Controller',
        adapterId,
      });

      const owner: OwnerInfo = {
        userName: 'Charlie Brown',
        userId: createUserId('user-111'),
      };

      const versionId = createPartVersionId('engine-v1');

      await registry.addPartVersion(handle.projectId, partId, {
        id: versionId,
        label: '1.0.0',
        locator: { uri: 'test://engine@1.0.0' },
        owner,
      });

      const version = await registry.getVersionById(handle.projectId, versionId);
      expect(version?.owner).toEqual(owner);
      expect(version?.owner?.userName).toBe('Charlie Brown');
    });

    it('should update version owner information', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const handle = await registry.open({
        name: 'Test Project',
      });

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine Controller',
        adapterId,
      });

      const originalOwner: OwnerInfo = {
        userName: 'Charlie Brown',
        userId: createUserId('user-111'),
      };

      const versionId = createPartVersionId('engine-v1');

      await registry.addPartVersion(handle.projectId, partId, {
        id: versionId,
        label: '1.0.0',
        locator: { uri: 'test://engine@1.0.0' },
        owner: originalOwner,
      });

      const newOwner: OwnerInfo = {
        userName: 'Diana Prince',
        userId: createUserId('user-222'),
        userGroupId: createUserGroupId('qa'),
      };

      await registry.updatePartVersion(handle.projectId, versionId, (version) => ({
        ...version,
        owner: newOwner,
      }));

      const version = await registry.getVersionById(handle.projectId, versionId);
      expect(version?.owner).toEqual(newOwner);
      expect(version?.owner?.userName).toBe('Diana Prince');
    });
  });

  describe('Combo Owner', () => {
    it('should add a combo with owner information', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');
      const versionId = createPartVersionId('engine-v1');
      const comboId = createComboId('baseline');

      const handle = await registry.open({
        name: 'Test Project',
      });

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine',
        adapterId,
      });

      await registry.addPartVersion(handle.projectId, partId, {
        id: versionId,
        label: '1.0.0',
        locator: { uri: 'test://engine@1.0.0' },
      });

      const owner: OwnerInfo = {
        userName: 'Eve Davis',
        userId: createUserId('user-333'),
        userGroupId: createUserGroupId('release'),
      };

      await registry.addCombo(handle.projectId, {
        id: comboId,
        name: 'Baseline',
        bindings: [{ partId, versionId }],
        owner,
      });

      const combo = await registry.getComboById(handle.projectId, comboId);
      expect(combo?.owner).toEqual(owner);
      expect(combo?.owner?.userName).toBe('Eve Davis');
    });
  });

  describe('Query by Owner', () => {
    it('should filter parts by ownerUserId', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const userId1 = createUserId('user-1');
      const userId2 = createUserId('user-2');

      const handle = await registry.open({
        name: 'Test Project',
      });

      const adapterId = createAdapterId('test-adapter');

      // Add parts with different owners
      await registry.addPart(handle.projectId, {
        id: createPartId('part1'),
        name: 'Part 1',
        adapterId,
        owner: { userName: 'User 1', userId: userId1 },
      });

      await registry.addPart(handle.projectId, {
        id: createPartId('part2'),
        name: 'Part 2',
        adapterId,
        owner: { userName: 'User 2', userId: userId2 },
      });

      await registry.addPart(handle.projectId, {
        id: createPartId('part3'),
        name: 'Part 3',
        adapterId,
        owner: { userName: 'User 1', userId: userId1 },
      });

      // Query by ownerUserId
      const user1Parts = await registry.findParts(handle.projectId, {
        ownerUserId: userId1,
      });

      expect(user1Parts).toHaveLength(2);
      expect(user1Parts).toContainEqual('part1' as ReturnType<typeof createPartId>);
      expect(user1Parts).toContainEqual('part3' as ReturnType<typeof createPartId>);
    });

    it('should filter versions by ownerUserId', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const userId1 = createUserId('user-1');
      const userId2 = createUserId('user-2');

      const handle = await registry.open({
        name: 'Test Project',
      });

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine',
        adapterId,
      });

      // Add versions with different owners
      await registry.addPartVersion(handle.projectId, partId, {
        id: createPartVersionId('v1'),
        label: '1.0.0',
        locator: { uri: 'test://v1' },
        owner: { userName: 'User 1', userId: userId1 },
      });

      await registry.addPartVersion(handle.projectId, partId, {
        id: createPartVersionId('v2'),
        label: '2.0.0',
        locator: { uri: 'test://v2' },
        owner: { userName: 'User 2', userId: userId2 },
      });

      // Query by ownerUserId
      const user1Versions = await registry.findVersions(handle.projectId, {
        ownerUserId: userId1,
      });

      expect(user1Versions).toHaveLength(1);
      expect(user1Versions[0]).toBe('v1' as ReturnType<typeof createPartVersionId>);
    });
  });

  describe('Summary Types Include Owner', () => {
    it('should include owner in part summary', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'Test User',
        userId: createUserId('user-test'),
      };

      const handle = await registry.open({
        name: 'Test Project',
      });

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine Controller',
        adapterId,
        owner,
      });

      const summary = await registry.getPartSummary(handle.projectId, partId);
      expect(summary?.owner).toEqual(owner);
    });

    it('should include owner in version summary', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'Test User',
        userId: createUserId('user-test'),
      };

      const handle = await registry.open({
        name: 'Test Project',
      });

      const partId = createPartId('engine');
      const adapterId = createAdapterId('test-adapter');

      await registry.addPart(handle.projectId, {
        id: partId,
        name: 'Engine',
        adapterId,
      });

      const versionId = createPartVersionId('v1');

      await registry.addPartVersion(handle.projectId, partId, {
        id: versionId,
        label: '1.0.0',
        locator: { uri: 'test://v1' },
        owner,
      });

      const summary = await registry.getVersionSummary(handle.projectId, versionId);
      expect(summary?.owner).toEqual(owner);
    });

    it('should include owner in combo summary', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'Test User',
        userId: createUserId('user-test'),
      };

      const comboId = createComboId('baseline');

      const handle = await registry.open({
        name: 'Test Project',
        combos: [
          {
            id: comboId,
            name: 'Baseline',
            bindings: [],
            owner,
          },
        ],
      });

      const summary = await registry.getComboSummary(handle.projectId, comboId);
      expect(summary?.owner).toEqual(owner);
    });
  });

  describe('Persistence', () => {
    it('should persist owner information across save/load', async () => {
      const storage = new InMemoryStorageProvider();
      const registry = new ProjectRegistry({ storage });

      const owner: OwnerInfo = {
        userName: 'Persistent User',
        userId: createUserId('user-persistent'),
        userGroupId: createUserGroupId('team-persistent'),
      };

      const handle = await registry.open(
        {
          name: 'Test Project',
          owner,
        },
        owner.userId // Must match owner
      );

      // Close the handle (saves to storage)
      await registry.close(handle.projectId);

      // Load the project again with the same user
      const reloaded = await registry.load(handle.projectId, owner.userId);
      const snapshot = await reloaded.getSnapshot();

      expect(snapshot.project.owner).toEqual(owner);
      expect(snapshot.project.owner?.userName).toBe('Persistent User');
    });
  });
});
