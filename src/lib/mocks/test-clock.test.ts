import { describe, expect, it } from 'vitest';

import { TestClock } from './test-clock.js';
import type { ISO8601Timestamp } from '../../models/base.js';

describe('TestClock', () => {
  const initialTime = '2024-01-15T12:30:45.123Z' as ISO8601Timestamp;
  const laterTime = '2024-01-15T13:00:00.000Z' as ISO8601Timestamp;
  const evenLaterTime = '2024-01-15T14:30:00.000Z' as ISO8601Timestamp;

  it('constructor sets initial time', () => {
    const clock = new TestClock(initialTime);
    expect(clock.now()).toBe(initialTime);
  });

  it('now() returns the initial time before advance', () => {
    const clock = new TestClock(initialTime);
    const result1 = clock.now();
    const result2 = clock.now();
    expect(result1).toBe(initialTime);
    expect(result2).toBe(initialTime);
  });

  it('advance() updates the current time', () => {
    const clock = new TestClock(initialTime);
    clock.advance(laterTime);
    expect(clock.now()).toBe(laterTime);
  });

  it('now() after advance() returns new time', () => {
    const clock = new TestClock(initialTime);
    expect(clock.now()).toBe(initialTime);
    clock.advance(laterTime);
    expect(clock.now()).toBe(laterTime);
  });

  it('multiple advance() calls progress time correctly', () => {
    const clock = new TestClock(initialTime);
    expect(clock.now()).toBe(initialTime);
    clock.advance(laterTime);
    expect(clock.now()).toBe(laterTime);
    clock.advance(evenLaterTime);
    expect(clock.now()).toBe(evenLaterTime);
  });

  it('can advance to earlier time (for testing edge cases)', () => {
    const clock = new TestClock(laterTime);
    expect(clock.now()).toBe(laterTime);
    clock.advance(initialTime);
    expect(clock.now()).toBe(initialTime);
  });

  it('returns ISO8601Timestamp type from now()', () => {
    const clock = new TestClock(initialTime);
    const timestamp = clock.now();
    const typeCheck: ISO8601Timestamp = timestamp;
    expect(typeCheck).toBe(timestamp);
  });
});
