import type { MetadataRecord, ISO8601Timestamp, TagId, TagType } from './base.js';

/**
 * Initialization data for creating a tag.
 */
export interface TagInit {
  readonly id?: TagId;
  readonly name: string;
  readonly type: TagType;
  readonly description?: string;
  readonly metadata?: MetadataRecord;
}

/**
 * Persistent definition of a tag within a project.
 * Tags are project-scoped and identified by a unique TagId.
 * The tag name can be changed via rename operation without affecting references.
 */
export interface TagDefinition extends TagInit {
  readonly id: TagId;
  readonly createdAt: ISO8601Timestamp;
}
