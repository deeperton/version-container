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
});
