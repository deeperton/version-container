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

  it('clones primitive values', () => {
    expect(cloneValue(null)).toBe(null);
    expect(cloneValue(undefined)).toBe(undefined);
    expect(cloneValue(42)).toBe(42);
    expect(cloneValue('hello')).toBe('hello');
    expect(cloneValue(true)).toBe(true);
    expect(cloneValue(false)).toBe(false);
  });

  it('clones number primitives', () => {
    expect(cloneValue(0)).toBe(0);
    expect(cloneValue(-1)).toBe(-1);
    expect(cloneValue(3.14)).toBe(3.14);
    expect(cloneValue(Number.NaN)).toBe(Number.NaN);
    expect(cloneValue(Infinity)).toBe(Infinity);
  });

  it('clones Date objects', () => {
    const date = new Date('2024-01-15T12:30:45.123Z');
    const cloned = cloneValue(date);

    expect(cloned).toEqual(date);
    expect(cloned).not.toBe(date);
    expect(cloned.getTime()).toBe(date.getTime());
  });

  it('clones arrays with mixed content', () => {
    const original = [1, 'two', { three: 3 }, [4]];
    const cloned = cloneValue(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[2]).not.toBe(original[2]);
    expect(cloned[3]).not.toBe(original[3]);
  });

  it('clones empty objects and arrays', () => {
    expect(cloneValue({})).toEqual({});
    expect(cloneValue([])).toEqual([]);
    expect(cloneValue({})).not.toBe({});
    expect(cloneValue([])).not.toBe([]);
  });

  it('handles arrays with nested objects', () => {
    const original = [{ a: 1 }, { b: 2 }];
    const cloned = cloneValue(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[0]).not.toBe(original[0]);
    expect(cloned[1]).not.toBe(original[1]);

    cloned[0].a = 99;
    expect(original[0].a).toBe(1);
  });

  it('handles objects with special properties', () => {
    const original = Object.create(null);
    original.a = 1;
    original.b = 2;

    const cloned = cloneValue(original);

    expect(cloned).toEqual(original);
    expect(cloned.a).toBe(1);
    expect(cloned.b).toBe(2);
  });

  it('handles objects with getter and setter', () => {
    const original = {
      _value: 42,
      get value(): number {
        return this._value;
      },
      set value(v: number) {
        this._value = v;
      },
    };

    const cloned = cloneValue(original);

    expect(cloned.value).toBe(42);
    expect(cloned).not.toBe(original);
  });

  it('handles circular references gracefully', () => {
    const original: { name: string; self?: unknown } = { name: 'circular' };
    original.self = original;

    const cloned = cloneValue(original);

    expect(cloned.name).toBe('circular');
    expect(cloned).not.toBe(original);
  });
});
