import type { ISO8601Timestamp } from '../../models/base.js';
import type { Clock } from '../clock.js';

/**
 * Deterministic clock for unit tests.
 */
export class TestClock implements Clock {
  private current: ISO8601Timestamp;

  constructor(initial: ISO8601Timestamp) {
    this.current = initial;
  }

  now(): ISO8601Timestamp {
    return this.current;
  }

  advance(next: ISO8601Timestamp): void {
    this.current = next;
  }
}
