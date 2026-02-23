import type {
  AdapterId,
  ComboId,
  PartId,
  PartVersionId,
  ProjectId,
  TagId,
  UserId,
  UserGroupId,
} from '../models/base.js';

/**
 * Helper methods for creating branded identifiers in a consistent way.
 */

// Declare global crypto for TypeScript (available in modern browsers and Node.js 15.6.0+)
declare global {
  var crypto: { randomUUID: () => string } | undefined;
}

/**
 * Cross-platform UUID v4 generator.
 * Uses the Web Crypto API in browsers and Node.js, with a fallback for older environments.
 */
const randomUUID = (): string => {
  // Prefer the modern crypto.randomUUID() available in:
  // - Node.js 15.6.0+
  // - Chrome 92+, Safari 15.4+, Firefox 95+
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback for older environments using Math.random
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const d = c === '0' ? r : (r & (0x3 >> Number(c))) | (0x8 << Number(c));
    return d.toString(16);
  });
};

const createId = <IdType>(value: string | undefined, producer: () => string): IdType =>
  (value ?? producer()) as IdType;

/**
 * Generates or brands a `ProjectId`.
 */
export const createProjectId = (value?: string): ProjectId =>
  createId<ProjectId>(value, randomUUID);

/**
 * Generates or brands a `PartId`.
 */
export const createPartId = (value?: string): PartId => createId<PartId>(value, randomUUID);

/**
 * Generates or brands a `PartVersionId`.
 */
export const createPartVersionId = (value?: string): PartVersionId =>
  createId<PartVersionId>(value, randomUUID);

/**
 * Generates or brands a `ComboId`.
 */
export const createComboId = (value?: string): ComboId => createId<ComboId>(value, randomUUID);

/**
 * Generates or brands an `AdapterId`.
 */
export const createAdapterId = (value?: string): AdapterId =>
  createId<AdapterId>(value, randomUUID);

/**
 * Generates or brands a `UserId`.
 * Used for tracking the owner of projects, parts, versions, and combos.
 */
export const createUserId = (value?: string): UserId => createId<UserId>(value, randomUUID);

/**
 * Generates or brands a `UserGroupId`.
 * Used for tracking the group membership of entity owners.
 */
export const createUserGroupId = (value?: string): UserGroupId =>
  createId<UserGroupId>(value, randomUUID);

/**
 * Generates or brands a `TagId`.
 * Used for identifying tags within a project.
 */
export const createTagId = (value?: string): TagId => createId<TagId>(value, randomUUID);
