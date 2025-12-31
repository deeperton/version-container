import { describe, expect, it } from 'vitest';

import { SystemClock } from './clock.js';
import type { ISO8601Timestamp } from '../models/base.js';

describe('SystemClock', () => {
  it('returns valid ISO8601 format timestamp', () => {
    const clock = new SystemClock();
    const timestamp = clock.now();
    const iso8601Regex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(timestamp).toMatch(iso8601Regex);
  });

  it('timestamp includes T separator and Z suffix', () => {
    const clock = new SystemClock();
    const timestamp = clock.now();
    expect(timestamp).toContain('T');
    expect(timestamp).toContain('Z');
  });

  it('timestamp can be parsed by Date constructor', () => {
    const clock = new SystemClock();
    const timestamp = clock.now();
    const date = new Date(timestamp);
    expect(date.getTime()).toBeGreaterThan(0);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it('returns ISO8601Timestamp type', () => {
    const clock = new SystemClock();
    const timestamp = clock.now();
    const typeCheck: ISO8601Timestamp = timestamp;
    expect(typeCheck).toBe(timestamp);
  });

  it('consecutive calls return timestamps within reasonable time difference', () => {
    const clock = new SystemClock();
    const before = clock.now();
    const after = clock.now();
    const beforeDate = new Date(before);
    const afterDate = new Date(after);
    const diff = afterDate.getTime() - beforeDate.getTime();
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThan(1000);
  });
});
