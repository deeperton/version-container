import type { StorageProvider } from '../models/adapter.js';
import { InMemoryStorageProvider } from './in-memory/in-memory-storage.js';
import { LocalStorageStorageProvider } from './local-storage/local-storage-storage.js';

// Re-export options types for consumers
import type { InMemoryStorageOptions } from './in-memory/in-memory-storage.js';
import type { LocalStorageStorageOptions } from './local-storage/local-storage-storage.js';

/**
 * Built-in storage type names for runtime selection.
 *
 * @example
 * ```ts
 * import { BuiltinStorageType, createStorageProvider, registerBuiltinStorageProviders } from 'version-container';
 *
 * registerBuiltinStorageProviders();
 * const storage = createStorageProvider(BuiltinStorageType.LOCAL_STORAGE);
 * ```
 */
export const BuiltinStorageType = {
  IN_MEMORY: 'in-memory',
  LOCAL_STORAGE: 'local-storage',
} as const;

export type BuiltinStorageTypeEnum = (typeof BuiltinStorageType)[keyof typeof BuiltinStorageType];

/**
 * Factory function type for creating storage providers.
 */
export type StorageFactory = () => StorageProvider;

/**
 * Options that can be passed when creating storage providers.
 * Re-exported for convenience.
 */
export type StorageOptions = InMemoryStorageOptions | LocalStorageStorageOptions;

// Internal registry entry type
type StorageRegistryEntry = {
  factory: StorageFactory;
  isBuiltin: boolean;
};

// Global registry for storage providers
const storageRegistry = new Map<string, StorageRegistryEntry>();

/**
 * Registers all built-in storage providers.
 * Must be called before using {@link createStorageProvider}.
 * Safe to call multiple times - will skip already-registered providers.
 *
 * @example
 * ```ts
 * import { registerBuiltinStorageProviders, createStorageProvider, BuiltinStorageType } from 'version-container';
 *
 * registerBuiltinStorageProviders();
 * const storage = createStorageProvider(BuiltinStorageType.LOCAL_STORAGE);
 * ```
 */
export function registerBuiltinStorageProviders(): void {
  registerStorageProvider(
    BuiltinStorageType.IN_MEMORY,
    () => new InMemoryStorageProvider(),
    true
  );
  registerStorageProvider(
    BuiltinStorageType.LOCAL_STORAGE,
    () => new LocalStorageStorageProvider(),
    true
  );
}

/**
 * Clears all registered storage providers.
 * Intended for test cleanup only.
 *
 * @internal
 */
export function __clearStorageRegistry__(): void {
  storageRegistry.clear();
}

/**
 * Registers a custom storage provider.
 *
 * @param name - Unique identifier for this storage provider
 * @param factory - Factory function that creates new instances
 * @param isBuiltin - Internal use only (marks built-in providers)
 * @throws Error if a provider with the same name is already registered
 *
 * @example
 * ```ts
 * import { registerStorageProvider, createStorageProvider } from 'version-container';
 *
 * class IndexedDBStorageProvider implements StorageProvider {
 *   readonly id = 'indexed-db';
 *   // ... implementation
 * }
 *
 * registerStorageProvider('indexed-db', () => new IndexedDBStorageProvider());
 * const storage = createStorageProvider('indexed-db');
 * ```
 */
export function registerStorageProvider(
  name: string,
  factory: StorageFactory,
  isBuiltin = false
): void {
  if (storageRegistry.has(name)) {
    // For built-in providers, silently skip if already registered
    // This allows registerBuiltinStorageProviders() to be called multiple times
    if (isBuiltin) {
      return;
    }
    throw new Error(`Storage provider "${name}" is already registered.`);
  }
  storageRegistry.set(name, { factory, isBuiltin });
}

/**
 * Unregisters a custom storage provider.
 *
 * @param name - Name of the provider to unregister
 * @returns `true` if the provider was removed, `false` if it didn't exist
 * @throws Error if trying to unregister a built-in provider
 *
 * @example
 * ```ts
 * import { registerStorageProvider, unregisterStorageProvider } from 'version-container';
 *
 * registerStorageProvider('custom', () => new CustomStorage());
 * unregisterStorageProvider('custom'); // true
 * ```
 */
export function unregisterStorageProvider(name: string): boolean {
  const entry = storageRegistry.get(name);
  if (!entry) return false;
  if (entry.isBuiltin) {
    throw new Error(`Cannot unregister built-in storage provider "${name}".`);
  }
  return storageRegistry.delete(name);
}

/**
 * Creates a storage provider instance by name.
 *
 * @param name - Registered storage provider name (e.g., 'in-memory', 'local-storage')
 * @returns A new StorageProvider instance
 * @throws Error if no provider with the given name is registered
 *
 * @example
 * ```ts
 * import { registerBuiltinStorageProviders, createStorageProvider, BuiltinStorageType } from 'version-container';
 *
 * registerBuiltinStorageProviders();
 *
 * // Select storage type at runtime
 * const storageType = process.env.STORAGE ?? BuiltinStorageType.IN_MEMORY;
 * const storage = createStorageProvider(storageType);
 * ```
 */
export function createStorageProvider(name: string): StorageProvider {
  const entry = storageRegistry.get(name);
  if (!entry) {
    const available = Array.from(storageRegistry.keys()).join(', ');
    throw new Error(
      `Unknown storage provider "${name}". Available providers: ${available}`
    );
  }
  return entry.factory();
}

/**
 * Returns a list of all registered storage provider names.
 *
 * @example
 * ```ts
 * import { registerBuiltinStorageProviders, listStorageProviders } from 'version-container';
 *
 * registerBuiltinStorageProviders();
 * console.log(listStorageProviders()); // ['in-memory', 'local-storage']
 * ```
 */
export function listStorageProviders(): readonly string[] {
  return Array.from(storageRegistry.keys());
}

/**
 * Checks if a storage provider is registered.
 *
 * @param name - Name of the provider to check
 * @returns `true` if the provider exists, `false` otherwise
 *
 * @example
 * ```ts
 * import { registerBuiltinStorageProviders, hasStorageProvider } from 'version-container';
 *
 * registerBuiltinStorageProviders();
 * hasStorageProvider('in-memory'); // true
 * hasStorageProvider('unknown'); // false
 * ```
 */
export function hasStorageProvider(name: string): boolean {
  return storageRegistry.has(name);
}
