# Models Overview

This directory houses the domain model for the version-container library. Each module focuses on one slice of the domain yet re-exports through `index.ts` so consumers can pull from a single place.

- `base.ts` — Fundamental building blocks shared across the model. It defines branded identifier types (`ProjectId`, `PartId`, etc.), structured metadata via `MetadataRecord`, and the generic `Result` helper. These types avoid accidental mixing of ids and ensure deterministic metadata handling.

- `part.ts` — Describes the lifecycle of parts and their versions. `PartInit`/`PartDefinition` and `PartVersionInit`/`PartVersion` pairs share shapes by inheritance: init variants accept optional ids and timestamps, while the persisted forms extend them with required identifiers and relationships. `VersionLocator`, `VersionBinding`, and `ResolvedPartVersion` capture how parts link to artifacts and how adapters resolve them.

- `combo.ts` — Models version combinations. `VersionComboInit` feeds into `VersionCombo`, which adds timestamps and a required id. `ResolvedCombo` bundles the combo definition with the resolved part versions, and `Lockfile` specifies the deterministic snapshot used for hashing and serialization.

- `project.ts` — Coordinates project-level state. `ProjectInit` describes input for creating a project; `ProjectMetadata` extends it with stable identifiers and timestamps. `ProjectData` and `ProjectSnapshot` wrap the full project graph for serialization or storage, and `ProjectSummary` offers a lightweight listing view.

- `adapter.ts` — Defines extension points. `StorageProvider` handles persistence, `AdapterContext` gives adapters the contextual tools they need, and `PartAdapter` outlines resolution/validation responsibilities. `ValidationIssue` enumerates the error categories surfaced during project integrity checks.

Relations flow from base types outward: projects manage parts, parts own versions, combos bind specific versions, adapters operate on parts and versions, and snapshots tie everything together for storage and locks. The init-versus-persisted structure gives a clean separation between user-supplied input and the library’s validated state.
