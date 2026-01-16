import { describe, expect, it } from 'vitest';

import { sortById } from './sort.js';

describe('sortById', () => {
  it('returns empty array when input is empty', () => {
    const result = sortById([]);
    expect(result).toEqual([]);
  });

  it('returns single item array unchanged', () => {
    const item = { id: 'only-item' };
    const result = sortById([item]);
    expect(result).toEqual([item]);
  });

  it('sorts items alphabetically by ID', () => {
    const items = [{ id: 'zebra' }, { id: 'apple' }, { id: 'banana' }];
    const result = sortById(items);
    expect(result).toEqual([{ id: 'apple' }, { id: 'banana' }, { id: 'zebra' }]);
  });

  it('does not mutate original array', () => {
    const items = [{ id: 'charlie' }, { id: 'alpha' }, { id: 'bravo' }];
    const originalOrder = [...items];
    sortById(items);
    expect(items).toEqual(originalOrder);
  });

  it('sorts numeric string IDs correctly', () => {
    const items = [{ id: '3' }, { id: '1' }, { id: '2' }, { id: '10' }];
    const result = sortById(items);
    expect(result).toEqual([{ id: '1' }, { id: '10' }, { id: '2' }, { id: '3' }]);
  });

  it('sorts UUID-like IDs correctly', () => {
    const items = [
      { id: 'zzzz-zzzz-zzzz-zzzz' },
      { id: 'aaaa-aaaa-aaaa-aaaa' },
      { id: 'mmmm-mmmm-mmmm-mmmm' },
    ];
    const result = sortById(items);
    expect(result).toEqual([
      { id: 'aaaa-aaaa-aaaa-aaaa' },
      { id: 'mmmm-mmmm-mmmm-mmmm' },
      { id: 'zzzz-zzzz-zzzz-zzzz' },
    ]);
  });

  it('preserves objects with additional properties', () => {
    const items = [
      { id: 'banana', value: 2 },
      { id: 'apple', value: 1 },
    ];
    const result = sortById(items);
    expect(result).toEqual([
      { id: 'apple', value: 1 },
      { id: 'banana', value: 2 },
    ]);
  });

  it('handles duplicate IDs (maintains stable sort)', () => {
    const itemA = { id: 'same', data: 'A' };
    const itemB = { id: 'same', data: 'B' };
    const items = [itemA, itemB];
    const result = sortById(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(itemA);
    expect(result[1]).toBe(itemB);
  });
});
