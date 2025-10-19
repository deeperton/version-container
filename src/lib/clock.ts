import type { ISO8601Timestamp } from '../models/base.js';

/**
 * Provides timestamps for project operations.
 */
export interface Clock {
  /**
   * Returns the current time as an ISO-8601 string.
   */
  now(): ISO8601Timestamp;
}

/**
 * Default system clock implementation backed by `Date`.
 */
export class SystemClock implements Clock {
  now(): ISO8601Timestamp {
    return new Date().toISOString() as ISO8601Timestamp;
  }
}
