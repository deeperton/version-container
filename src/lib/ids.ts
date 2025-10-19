import { randomUUID } from 'node:crypto';

import type { AdapterId, ComboId, PartId, PartVersionId, ProjectId } from '../models/base.js';

/**
 * Helper methods for creating branded identifiers in a consistent way.
 */

const createId = <IdType>(value: string | undefined, producer: () => string): IdType =>
  (value ?? producer()) as IdType;

/**
 * Generates or brands a `ProjectId`.
 */
export const createProjectId = (value?: string): ProjectId => createId<ProjectId>(value, randomUUID);

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
export const createAdapterId = (value?: string): AdapterId => createId<AdapterId>(value, randomUUID);
