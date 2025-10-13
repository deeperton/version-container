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
