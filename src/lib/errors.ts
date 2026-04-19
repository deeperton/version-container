import type { ComboId, PartId, PartVersionId, ProjectId, UserId } from '../models/base.js';

/**
 * Base error class for all version-container errors.
 * Provides a common type for catching any library-specific error.
 *
 * @example
 * ```ts
 * try {
 *   await registry.deletePart(projectId, partId);
 * } catch (error) {
 *   if (error instanceof VersionContainerError) {
 *     console.log(`Error code: ${error.code}, entity: ${error.entityId}`);
 *   }
 * }
 * ```
 */
export abstract class VersionContainerError extends Error {
  /**
   * Unique error code for programmatic error handling.
   */
  abstract readonly code: VersionContainerErrorCode;

  /**
   * The ID of the entity involved in the error, if applicable.
   */
  readonly entityId?: string;

  constructor(message: string, entityId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.entityId = entityId;
  }
}

/**
 * Type union of all possible error codes.
 * Useful for type-safe switch statements on error codes.
 */
export type VersionContainerErrorCode =
  | 'PART_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'COMBO_NOT_FOUND'
  | 'PROJECT_NOT_FOUND'
  | 'PART_ALREADY_EXISTS'
  | 'VERSION_ALREADY_EXISTS'
  | 'COMBO_ALREADY_EXISTS'
  | 'PROJECT_ALREADY_OPEN'
  | 'UNKNOWN_VERSION_REFERENCE'
  | 'UNKNOWN_PART_REFERENCE'
  | 'IDENTIFIER_CHANGE'
  | 'VERSION_REASSIGNMENT'
  | 'PROJECT_CLOSED'
  | 'PROJECT_NOT_IN_STORAGE'
  | 'DUPLICATE_IDENTIFIER'
  | 'PART_ALREADY_DELETED'
  | 'VERSION_ALREADY_DELETED'
  | 'PROJECT_ACCESS_DENIED'
  | 'REFERENCED_BY_COMBO'
  | 'INVALID_METADATA_FILTER';

// ============================================================================
// NotFoundError subclasses
// ============================================================================

/**
 * Thrown when a part operation is attempted on a non-existent part.
 */
export class PartNotFoundError extends VersionContainerError {
  readonly code = 'PART_NOT_FOUND' as const;
  readonly partId: PartId;

  constructor(partId: PartId) {
    super(`Part ${partId as string} does not exist.`, partId as string);
    this.partId = partId;
  }
}

/**
 * Thrown when a version operation is attempted on a non-existent version.
 */
export class VersionNotFoundError extends VersionContainerError {
  readonly code = 'VERSION_NOT_FOUND' as const;
  readonly versionId: PartVersionId;

  constructor(versionId: PartVersionId) {
    super(`Version ${versionId as string} does not exist.`, versionId as string);
    this.versionId = versionId;
  }
}

/**
 * Thrown when a combo operation is attempted on a non-existent combo.
 */
export class ComboNotFoundError extends VersionContainerError {
  readonly code = 'COMBO_NOT_FOUND' as const;
  readonly comboId: ComboId;

  constructor(comboId: ComboId) {
    super(`Combo ${comboId as string} does not exist.`, comboId as string);
    this.comboId = comboId;
  }
}

/**
 * Thrown when attempting to load a project that doesn't exist in storage.
 */
export class ProjectNotFoundError extends VersionContainerError {
  readonly code = 'PROJECT_NOT_FOUND' as const;
  readonly projectId: ProjectId;

  constructor(projectId: ProjectId) {
    super(`Project ${projectId as string} could not be found.`, projectId as string);
    this.projectId = projectId;
  }
}

// ============================================================================
// AlreadyExistsError subclasses
// ============================================================================

/**
 * Thrown when attempting to add a part that already exists.
 */
export class PartAlreadyExistsError extends VersionContainerError {
  readonly code = 'PART_ALREADY_EXISTS' as const;
  readonly partId: PartId;

  constructor(partId: PartId) {
    super(`Part ${partId as string} already exists in project.`, partId as string);
    this.partId = partId;
  }
}

/**
 * Thrown when attempting to add a version that already exists.
 */
export class VersionAlreadyExistsError extends VersionContainerError {
  readonly code = 'VERSION_ALREADY_EXISTS' as const;
  readonly versionId: PartVersionId;

  constructor(versionId: PartVersionId) {
    super(`Version ${versionId as string} already exists.`, versionId as string);
    this.versionId = versionId;
  }
}

/**
 * Thrown when attempting to add a combo that already exists.
 */
export class ComboAlreadyExistsError extends VersionContainerError {
  readonly code = 'COMBO_ALREADY_EXISTS' as const;
  readonly comboId: ComboId;

  constructor(comboId: ComboId) {
    super(`Combo ${comboId as string} already exists in project.`, comboId as string);
    this.comboId = comboId;
  }
}

/**
 * Thrown when attempting to open a project that is already open.
 */
export class ProjectAlreadyOpenError extends VersionContainerError {
  readonly code = 'PROJECT_ALREADY_OPEN' as const;
  readonly projectId: ProjectId;

  constructor(projectId: ProjectId) {
    super(`Project ${projectId as string} is already open.`, projectId as string);
    this.projectId = projectId;
  }
}

// ============================================================================
// InvalidReferenceError subclasses
// ============================================================================

/**
 * Thrown when a combo references a version that doesn't exist.
 */
export class UnknownVersionReferenceError extends VersionContainerError {
  readonly code = 'UNKNOWN_VERSION_REFERENCE' as const;
  readonly versionId: PartVersionId;

  constructor(versionId: PartVersionId) {
    super(`Unknown version referenced: ${versionId as string}`, versionId as string);
    this.versionId = versionId;
  }
}

/**
 * Thrown when a combo references a part that doesn't exist.
 */
export class UnknownPartReferenceError extends VersionContainerError {
  readonly code = 'UNKNOWN_PART_REFERENCE' as const;
  readonly partId: PartId;

  constructor(partId: PartId) {
    super(`Unknown part referenced: ${partId as string}`, partId as string);
    this.partId = partId;
  }
}

// ============================================================================
// ConstraintViolationError subclasses
// ============================================================================

/**
 * Thrown when attempting to change an entity's identifier during an update.
 */
export class IdentifierChangeError extends VersionContainerError {
  readonly code = 'IDENTIFIER_CHANGE' as const;

  constructor(entityType: 'Part' | 'Version' | 'Combo') {
    super(`${entityType} identifier cannot be changed during update.`);
  }
}

/**
 * Thrown when attempting to reassign a version to a different part.
 */
export class VersionReassignmentError extends VersionContainerError {
  readonly code = 'VERSION_REASSIGNMENT' as const;
  readonly versionId: PartVersionId;
  readonly currentPartId: PartId;
  readonly newPartId: PartId;

  constructor(versionId: PartVersionId, currentPartId: PartId, newPartId: PartId) {
    super(
      `Version cannot be reassigned from part ${currentPartId as string} to ${newPartId as string}.`,
      versionId as string
    );
    this.versionId = versionId;
    this.currentPartId = currentPartId;
    this.newPartId = newPartId;
  }
}

// ============================================================================
// InvalidStateError subclasses
// ============================================================================

/**
 * Thrown when attempting to operate on a project that has been closed.
 */
export class ProjectClosedError extends VersionContainerError {
  readonly code = 'PROJECT_CLOSED' as const;
  readonly projectId: ProjectId;

  constructor(projectId: ProjectId) {
    super(`Project ${projectId as string} has been closed.`, projectId as string);
    this.projectId = projectId;
  }
}

/**
 * Thrown when a project is expected to exist in storage but doesn't.
 */
export class ProjectNotInStorageError extends VersionContainerError {
  readonly code = 'PROJECT_NOT_IN_STORAGE' as const;
  readonly projectId: ProjectId;

  constructor(projectId: ProjectId) {
    super(`Project ${projectId as string} does not exist in storage.`, projectId as string);
    this.projectId = projectId;
  }
}

// ============================================================================
// Access Control Error subclasses
// ============================================================================

/**
 * Thrown when attempting to load or open a project without proper ownership credentials.
 */
export class ProjectAccessDeniedError extends VersionContainerError {
  readonly code = 'PROJECT_ACCESS_DENIED' as const;
  readonly projectId: ProjectId;
  readonly requiredUserId: UserId;

  constructor(projectId: ProjectId, requiredUserId: UserId) {
    super(
      `Access denied: project "${projectId as string}" requires owner authentication (user ID: ${requiredUserId as string}).`,
      projectId as string
    );
    this.projectId = projectId;
    this.requiredUserId = requiredUserId;
  }
}

// ============================================================================
// Other errors
// ============================================================================

/**
 * Thrown when a duplicate identifier is detected during snapshot building.
 */
export class DuplicateIdentifierError extends VersionContainerError {
  readonly code = 'DUPLICATE_IDENTIFIER' as const;
  readonly entityType: 'part' | 'version' | 'combo';
  readonly identifier: string;

  constructor(entityType: 'part' | 'version' | 'combo', identifier: string) {
    super(`Duplicate ${entityType} identifier detected: ${identifier}`, identifier);
    this.entityType = entityType;
    this.identifier = identifier;
  }
}

/**
 * Thrown when attempting to delete a part that is already soft-deleted.
 */
export class PartAlreadyDeletedError extends VersionContainerError {
  readonly code = 'PART_ALREADY_DELETED' as const;
  readonly partId: PartId;

  constructor(partId: PartId) {
    super(`Part ${partId as string} is already deleted.`, partId as string);
    this.partId = partId;
  }
}

/**
 * Thrown when attempting to delete a version that is already soft-deleted.
 */
export class VersionAlreadyDeletedError extends VersionContainerError {
  readonly code = 'VERSION_ALREADY_DELETED' as const;
  readonly versionId: PartVersionId;

  constructor(versionId: PartVersionId) {
    super(`Version ${versionId as string} is already deleted.`, versionId as string);
    this.versionId = versionId;
  }
}

/**
 * Thrown when attempting to delete a part or version that is referenced by one or more combos.
 */
export class ReferencedByComboError extends VersionContainerError {
  readonly code = 'REFERENCED_BY_COMBO' as const;
  readonly partId?: PartId;
  readonly versionId?: PartVersionId;
  readonly comboCount: number;
  readonly referencingCombos: readonly ComboId[];

  private constructor(
    entityId: { partId: PartId } | { versionId: PartVersionId },
    comboCount: number,
    referencingCombos: readonly ComboId[]
  ) {
    const isPart = 'partId' in entityId;
    const idString = isPart ? (entityId.partId as string) : (entityId.versionId as string);
    const entityType = isPart ? 'part' : 'version';
    super(
      `Cannot delete ${entityType} ${idString}: it is referenced by ${comboCount} combo(s).`,
      idString
    );

    if (isPart) {
      this.partId = entityId.partId;
    } else {
      this.versionId = entityId.versionId;
    }
    this.comboCount = comboCount;
    this.referencingCombos = referencingCombos;
  }

  /**
   * Creates an error for a part referenced by combos.
   */
  static forPart(
    partId: PartId,
    comboCount: number,
    referencingCombos: readonly ComboId[]
  ): ReferencedByComboError {
    return new ReferencedByComboError({ partId }, comboCount, referencingCombos);
  }

  /**
   * Creates an error for a version referenced by combos.
   */
  static forVersion(
    versionId: PartVersionId,
    comboCount: number,
    referencingCombos: readonly ComboId[]
  ): ReferencedByComboError {
    return new ReferencedByComboError({ versionId }, comboCount, referencingCombos);
  }
}

/**
 * Thrown when a metadata filter contains non-primitive values.
 * Only string, number, and boolean filter values are supported.
 */
export class InvalidMetadataFilterError extends VersionContainerError {
  readonly code = 'INVALID_METADATA_FILTER' as const;
  readonly key: string;
  readonly actualType: string;

  constructor(key: string, actualType: string) {
    super(
      `Metadata filter value for key "${key}" must be a primitive (string, number, or boolean), ` +
        `but received ${actualType}. Complex metadata values are not supported in queries.`
    );
    this.key = key;
    this.actualType = actualType;
  }
}
