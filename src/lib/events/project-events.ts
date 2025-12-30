import type { PartDefinition, PartVersion } from '../../models/part.js';
import type { ProjectSnapshot } from '../../models/project.js';
import type { PartId, PartVersionId, ProjectId } from '../../models/base.js';

/**
 * Typed project lifecycle events emitted by the registry and handles.
 */
export interface ProjectEventMap {
  readonly 'project:created': { readonly projectId: ProjectId; readonly snapshot: ProjectSnapshot };
  readonly 'project:loaded': { readonly projectId: ProjectId; readonly snapshot: ProjectSnapshot };
  readonly 'project:updated': { readonly projectId: ProjectId; readonly snapshot: ProjectSnapshot };
  readonly 'project:closed': { readonly projectId: ProjectId };
  readonly 'part:added': {
    readonly projectId: ProjectId;
    readonly part: PartDefinition;
    readonly snapshot: ProjectSnapshot;
  };
  readonly 'part:updated': {
    readonly projectId: ProjectId;
    readonly part: PartDefinition;
    readonly previous: PartDefinition;
    readonly snapshot: ProjectSnapshot;
  };
  readonly 'version:added': {
    readonly projectId: ProjectId;
    readonly partId: PartId;
    readonly version: PartVersion;
    readonly snapshot: ProjectSnapshot;
  };
  readonly 'version:updated': {
    readonly projectId: ProjectId;
    readonly partId: PartId;
    readonly versionId: PartVersionId;
    readonly version: PartVersion;
    readonly previous: PartVersion;
    readonly snapshot: ProjectSnapshot;
  };
}

export type ProjectEventName = keyof ProjectEventMap;
export type ProjectEventPayload<Name extends ProjectEventName> = ProjectEventMap[Name];

export type ProjectEventListener<Name extends ProjectEventName> = (
  payload: ProjectEventPayload<Name>
) => void | Promise<void>;

type AnyListener = ProjectEventListener<ProjectEventName>;

/**
 * Lightweight dispatcher that supports subscription and emission of project events.
 */
export class ProjectEventDispatcher {
  private readonly listeners = new Map<ProjectEventName, Set<AnyListener>>();

  /**
   * Registers a listener for the specified event.
   *
   * @returns A function that removes the listener when invoked.
   */
  subscribe<Name extends ProjectEventName>(
    name: Name,
    listener: ProjectEventListener<Name>
  ): () => void {
    const registry = this.listeners.get(name) ?? new Set<AnyListener>();
    this.listeners.set(name, registry);
    registry.add(listener as AnyListener);

    return () => {
      registry.delete(listener as AnyListener);
      if (registry.size === 0) {
        this.listeners.delete(name);
      }
    };
  }

  /**
   * Emits an event to all listeners in subscription order.
   */
  async emit<Name extends ProjectEventName>(
    name: Name,
    payload: ProjectEventPayload<Name>
  ): Promise<void> {
    const registry = this.listeners.get(name);
    if (!registry) {
      return;
    }

    for (const listener of registry) {
      await (listener as ProjectEventListener<Name>)(payload);
    }
  }
}
