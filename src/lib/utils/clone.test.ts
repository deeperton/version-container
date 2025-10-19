import { describe, expect, it } from 'vitest';

import { cloneValue } from './clone.js';

describe('cloneValue', () => {
  it('produces independent copies for nested objects', () => {
    const original = { nested: { value: 1 }, array: [1, 2, 3] };
    const cloned = cloneValue(original);

    cloned.nested.value = 42;
    cloned.array.push(4);

    expect(original.nested.value).toBe(1);
    expect(original.array).toEqual([1, 2, 3]);
  });
});
