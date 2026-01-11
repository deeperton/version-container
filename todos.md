
# Backlog

3. Adapter Resolution Not Implemented
PartAdapter interface defines resolveVersion() (adapter.ts:30-34)
ResolvedPartVersion type exists but is never produced
Adapters are stored but not used during snapshot building or version resolution
4. Limited Lockfile Generation
Lockfile type exists (combo.ts:40-46)
ProjectSnapshot.locks is always initialized to empty array (project-snapshot-builder.ts:148)
No lockfile generation or resolution logic

6. Storage Provider Gaps
InMemoryStorageProvider.listSummaries() is optional in interface but implemented (in-memory-storage.ts)
No other storage providers (filesystem, database, cloud)
No migration path between schema versions

8. Unused Public Exports
sortById is exported (lib/utils/sort.ts) but also duplicated internally in project-snapshot-builder.ts:22-23
ID creation helpers exported but may not need to be public API

# DONE

1. Missing Combo Management Operations
The VersionCombo model exists (combo.ts:23-27)
Combos can be created during initialization (project-snapshot-builder.ts:105-131)
But there are no methods to add/update/delete combos after project creation in project-handle.ts or project-registry.ts
2. No Delete Operations
Cannot delete parts, versions, or combos
No way to clean up obsolete versions
5. No Query/Filter Methods
Cannot easily find parts by tags, metadata, or adapter
No way to query versions by part, label range, etc.
Missing search capabilities
7. Error Handling Inconsistencies
Some methods throw generic Error objects
No custom error types for domain-specific failures
Makes programmatic error handling difficult