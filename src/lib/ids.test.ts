import { describe, expect, it } from 'vitest';

import {
  createProjectId,
  createPartId,
  createPartVersionId,
  createComboId,
  createAdapterId,
  createUserId,
  createUserGroupId,
} from './ids.js';
import type { ProjectId, PartId, PartVersionId, ComboId, AdapterId, UserId, UserGroupId } from '../models/base.js';

describe('createProjectId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createProjectId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'my-custom-project-id' as ProjectId;
    const id = createProjectId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createProjectId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createProjectId();
    const id2 = createProjectId();
    expect(id1).not.toBe(id2);
  });

  it('returns ProjectId type', () => {
    const id = createProjectId();
    const typeCheck: ProjectId = id;
    expect(typeCheck).toBe(id);
  });
});

describe('createPartId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createPartId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'engine-part' as PartId;
    const id = createPartId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createPartId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createPartId();
    const id2 = createPartId();
    expect(id1).not.toBe(id2);
  });

  it('returns PartId type', () => {
    const id = createPartId();
    const typeCheck: PartId = id;
    expect(typeCheck).toBe(id);
  });
});

describe('createPartVersionId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createPartVersionId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'v1.0.0' as PartVersionId;
    const id = createPartVersionId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createPartVersionId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createPartVersionId();
    const id2 = createPartVersionId();
    expect(id1).not.toBe(id2);
  });

  it('returns PartVersionId type', () => {
    const id = createPartVersionId();
    const typeCheck: PartVersionId = id;
    expect(typeCheck).toBe(id);
  });
});

describe('createComboId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createComboId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'baseline-combo' as ComboId;
    const id = createComboId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createComboId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createComboId();
    const id2 = createComboId();
    expect(id1).not.toBe(id2);
  });

  it('returns ComboId type', () => {
    const id = createComboId();
    const typeCheck: ComboId = id;
    expect(typeCheck).toBe(id);
  });
});

describe('createAdapterId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createAdapterId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'git-adapter' as AdapterId;
    const id = createAdapterId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createAdapterId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createAdapterId();
    const id2 = createAdapterId();
    expect(id1).not.toBe(id2);
  });

  it('returns AdapterId type', () => {
    const id = createAdapterId();
    const typeCheck: AdapterId = id;
    expect(typeCheck).toBe(id);
  });
});

describe('createUserId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createUserId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'user-123' as UserId;
    const id = createUserId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createUserId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createUserId();
    const id2 = createUserId();
    expect(id1).not.toBe(id2);
  });

  it('returns UserId type', () => {
    const id = createUserId();
    const typeCheck: UserId = id;
    expect(typeCheck).toBe(id);
  });
});

describe('createUserGroupId', () => {
  it('generates valid UUID format when no argument provided', () => {
    const id = createUserGroupId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('returns branded custom string when provided', () => {
    const customId = 'team-avionics' as UserGroupId;
    const id = createUserGroupId(customId);
    expect(id).toBe(customId);
  });

  it('brands empty string', () => {
    const id = createUserGroupId('');
    expect(id).toBe('');
  });

  it('generates different values on multiple calls without argument', () => {
    const id1 = createUserGroupId();
    const id2 = createUserGroupId();
    expect(id1).not.toBe(id2);
  });

  it('returns UserGroupId type', () => {
    const id = createUserGroupId();
    const typeCheck: UserGroupId = id;
    expect(typeCheck).toBe(id);
  });
});
