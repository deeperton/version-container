import { describe, expect, it } from 'vitest';

import { AsyncMutex } from './async-mutex.js';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });

describe('AsyncMutex', () => {
  it('serializes concurrent tasks', async () => {
    const mutex = new AsyncMutex();
    const events: string[] = [];

    await Promise.all([
      mutex.runExclusive(async () => {
        events.push('A:start');
        await delay(20);
        events.push('A:end');
      }),
      mutex.runExclusive(async () => {
        events.push('B:start');
        await delay(5);
        events.push('B:end');
      }),
    ]);

    expect(events).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('handles multiple concurrent operations', async () => {
    const mutex = new AsyncMutex();
    const events: string[] = [];

    await Promise.all([
      mutex.runExclusive(async () => {
        events.push('A');
        await delay(5);
      }),
      mutex.runExclusive(async () => {
        events.push('B');
        await delay(5);
      }),
      mutex.runExclusive(async () => {
        events.push('C');
        await delay(5);
      }),
      mutex.runExclusive(async () => {
        events.push('D');
        await delay(5);
      }),
    ]);

    expect(events).toEqual(['A', 'B', 'C', 'D']);
  });

  it('exception in task does not break mutex', async () => {
    const mutex = new AsyncMutex();
    const results: string[] = [];

    await expect(
      Promise.all([
        mutex
          .runExclusive(async () => {
            results.push('first');
            throw new Error('Task failed');
          })
          .catch(() => {
            results.push('caught');
          }),
        mutex.runExclusive(async () => {
          results.push('second');
        }),
      ])
    ).resolves.toBeDefined();

    expect(results).toContain('first');
    expect(results).toContain('caught');
    expect(results).toContain('second');
  });

  it('sequential operations complete in order', async () => {
    const mutex = new AsyncMutex();
    const results: number[] = [];

    await mutex.runExclusive(async () => {
      results.push(1);
    });

    await mutex.runExclusive(async () => {
      results.push(2);
    });

    await mutex.runExclusive(async () => {
      results.push(3);
    });

    expect(results).toEqual([1, 2, 3]);
  });

  it('returns the result of the task', async () => {
    const mutex = new AsyncMutex();

    const result = await mutex.runExclusive(async () => {
      return 42;
    });

    expect(result).toBe(42);
  });

  it('handles synchronous tasks', async () => {
    const mutex = new AsyncMutex();
    const results: string[] = [];

    await Promise.all([
      mutex.runExclusive(() => {
        results.push('A');
        return Promise.resolve();
      }),
      mutex.runExclusive(() => {
        results.push('B');
        return Promise.resolve();
      }),
    ]);

    expect(results).toEqual(['A', 'B']);
  });
});
