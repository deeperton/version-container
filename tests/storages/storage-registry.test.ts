import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BuiltinStorageType,
  registerBuiltinStorageProviders,
  createStorageProvider,
  registerStorageProvider,
  unregisterStorageProvider,
  listStorageProviders,
  hasStorageProvider,
  __clearStorageRegistry__,
} from '../../src/storages/storage-registry.js';
import type { StorageProvider } from '../../src/models/adapter.js';

interface MockLocalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  length: number;
  key: (index: number) => string | null;
}

// Mock localStorage for LocalStorageStorageProvider
const mockLocalStorage = (): MockLocalStorage => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length(): number {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
};

describe('StorageRegistry', () => {
  beforeEach(() => {
    __clearStorageRegistry__();
    vi.stubGlobal('localStorage', mockLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('registerBuiltinStorageProviders', () => {
    it('should register in-memory and local-storage providers', () => {
      registerBuiltinStorageProviders();

      expect(hasStorageProvider(BuiltinStorageType.IN_MEMORY)).toBe(true);
      expect(hasStorageProvider(BuiltinStorageType.LOCAL_STORAGE)).toBe(true);
    });

    it('should allow creating built-in providers after registration', () => {
      registerBuiltinStorageProviders();

      const inMemory = createStorageProvider(BuiltinStorageType.IN_MEMORY);
      const localStorage = createStorageProvider(BuiltinStorageType.LOCAL_STORAGE);

      expect(inMemory).toBeDefined();
      expect(inMemory.id).toBe('in-memory');
      expect(localStorage).toBeDefined();
      expect(localStorage.id).toBe('local-storage');
    });
  });

  describe('createStorageProvider', () => {
    beforeEach(() => {
      registerBuiltinStorageProviders();
    });

    it('should create provider by name string', () => {
      const storage = createStorageProvider('in-memory');
      expect(storage.id).toBe('in-memory');
    });

    it('should create provider using BuiltinStorageType constant', () => {
      const storage = createStorageProvider(BuiltinStorageType.LOCAL_STORAGE);
      expect(storage.id).toBe('local-storage');
    });

    it('should throw for unknown provider name', () => {
      expect(() => createStorageProvider('unknown')).toThrow(
        'Unknown storage provider "unknown"'
      );
    });

    it('should list available providers in error message', () => {
      try {
        createStorageProvider('unknown');
        expect.fail('Should have thrown an error');
      } catch (e) {
        expect((e as Error).message).toContain('in-memory');
        expect((e as Error).message).toContain('local-storage');
      }
    });
  });

  describe('registerStorageProvider', () => {
    beforeEach(() => {
      registerBuiltinStorageProviders();
    });

    it('should register custom provider', () => {
      const customFactory = (): StorageProvider => ({ id: 'custom-storage' } as StorageProvider);
      registerStorageProvider('custom', customFactory);

      expect(hasStorageProvider('custom')).toBe(true);
      const storage = createStorageProvider('custom');
      expect(storage.id).toBe('custom-storage');
    });

    it('should throw on duplicate registration', () => {
      const factory = (): StorageProvider => ({ id: 'test' } as StorageProvider);
      registerStorageProvider('test', factory);

      expect(() => registerStorageProvider('test', factory)).toThrow(
        'Storage provider "test" is already registered'
      );
    });
  });

  describe('unregisterStorageProvider', () => {
    beforeEach(() => {
      registerBuiltinStorageProviders();
    });

    it('should unregister custom provider', () => {
      registerStorageProvider(
        'custom',
        (): StorageProvider => ({ id: 'test' } as StorageProvider)
      );
      expect(unregisterStorageProvider('custom')).toBe(true);
      expect(hasStorageProvider('custom')).toBe(false);
    });

    it('should return false for non-existent provider', () => {
      expect(unregisterStorageProvider('non-existent')).toBe(false);
    });

    it('should not allow unregistering built-in providers', () => {
      expect(() => unregisterStorageProvider(BuiltinStorageType.IN_MEMORY)).toThrow(
        'Cannot unregister built-in storage provider'
      );
    });
  });

  describe('listStorageProviders', () => {
    beforeEach(() => {
      registerBuiltinStorageProviders();
    });

    it('should list all registered providers', () => {
      const providers = listStorageProviders();

      expect(providers).toContain('in-memory');
      expect(providers).toContain('local-storage');
    });

    it('should include custom providers', () => {
      registerStorageProvider('custom', (): StorageProvider => ({ id: 'test' } as StorageProvider));

      const providers = listStorageProviders();
      expect(providers).toContain('custom');
    });
  });

  describe('hasStorageProvider', () => {
    beforeEach(() => {
      registerBuiltinStorageProviders();
    });

    it('should return true for built-in providers', () => {
      expect(hasStorageProvider('in-memory')).toBe(true);
      expect(hasStorageProvider('local-storage')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(hasStorageProvider('unknown')).toBe(false);
    });
  });
});
