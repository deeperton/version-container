/**
 * Shared utilities and branded identifiers used across the domain model.
 */

/**
 * Utility type for creating nominal identifiers without runtime cost.
 */
export type Brand<Value, Identifier extends string> = Value & {
  readonly __brand: Identifier;
};

export type ProjectId = Brand<string, 'ProjectId'>;
export type PartId = Brand<string, 'PartId'>;
export type PartVersionId = Brand<string, 'PartVersionId'>;
export type ComboId = Brand<string, 'ComboId'>;
export type AdapterId = Brand<string, 'AdapterId'>;
export type LockfileDigest = Brand<string, 'LockfileDigest'>;
export type ISO8601Timestamp = Brand<string, 'ISO8601Timestamp'>;
export type UserId = Brand<string, 'UserId'>;
export type UserGroupId = Brand<string, 'UserGroupId'>;

/**
 * Owner information for domain entities.
 * Tracks the user who created or owns a project, part, version, or combo.
 */
export interface OwnerInfo {
  /** The display name of the user */
  readonly userName: string;
  /** The unique identifier of the user */
  readonly userId: UserId;
  /** The optional group identifier the user belongs to */
  readonly userGroupId?: UserGroupId;
}

/**
 * Optional metadata attached to domain entities.
 * Values must remain serializable for deterministic exports.
 */
export type MetadataRecord = Record<string, unknown>;

/**
 * Lightweight Result helper for functional-style error handling.
 */
export type Result<Success, Failure> =
  | { readonly ok: true; readonly value: Success }
  | { readonly ok: false; readonly error: Failure };
