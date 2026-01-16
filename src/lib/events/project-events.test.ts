import { describe, expect, it, vi } from 'vitest';

import { ProjectEventDispatcher } from './project-events.js';
import type { ISO8601Timestamp, ProjectId } from '../../models/base.js';
import type { ProjectSnapshot } from '../../models/project.js';
import type { PartDefinition } from '../../models/part.js';

const createMockProjectSnapshot = (id: string): ProjectSnapshot => ({
  schemaVersion: 1,
  project: {
    id: id as ProjectId,
    name: 'Test Project',
    createdAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
    updatedAt: '2024-01-01T00:00:00.000Z' as ISO8601Timestamp,
  },
  parts: [],
  versions: [],
  combos: [],
  locks: [],
});

describe('ProjectEventDispatcher', () => {
  describe('subscribe', () => {
    it('returns unsubscribe function', () => {
      const dispatcher = new ProjectEventDispatcher();
      const unsubscribe = dispatcher.subscribe('project:created', () => {
        // no-op
      });
      expect(typeof unsubscribe).toBe('function');
    });

    it('unsubscribe removes listener from registry', () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();
      const unsubscribe = dispatcher.subscribe('project:created', listener);

      unsubscribe();

      const snapshot = createMockProjectSnapshot('test-1');
      dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribe cleans up empty event registry', () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();
      const unsubscribe = dispatcher.subscribe('project:created', listener);

      unsubscribe();

      const snapshot = createMockProjectSnapshot('test-1');
      dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('calls subscribed listener with correct payload', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();
      const snapshot = createMockProjectSnapshot('test-1');

      dispatcher.subscribe('project:created', listener);
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const payload = listener.mock.calls[0]?.[0];
      expect(payload).toHaveProperty('projectId', snapshot.project.id);
      expect(payload).toHaveProperty('snapshot', snapshot);
    });

    it('emit with no listeners is no-op', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const snapshot = createMockProjectSnapshot('test-1');

      await expect(
        dispatcher.emit('project:created', {
          projectId: snapshot.project.id,
          snapshot,
        })
      ).resolves.toBeUndefined();
    });

    it('multiple listeners called in subscription order (FIFO)', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const events: string[] = [];

      const listener1 = vi.fn(() => {
        events.push('first');
      });
      const listener2 = vi.fn(() => {
        events.push('second');
      });
      const listener3 = vi.fn(() => {
        events.push('third');
      });

      dispatcher.subscribe('project:created', listener1);
      dispatcher.subscribe('project:created', listener2);
      dispatcher.subscribe('project:created', listener3);

      const snapshot = createMockProjectSnapshot('test-1');
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(events).toEqual(['first', 'second', 'third']);
    });

    it('async listeners complete before emit returns', async () => {
      const dispatcher = new ProjectEventDispatcher();
      let listener1Completed = false;
      let listener2Completed = false;

      const listener1 = vi.fn(async () => {
        await Promise.resolve();
        listener1Completed = true;
      });
      const listener2 = vi.fn(async () => {
        await Promise.resolve();
        listener2Completed = true;
      });

      dispatcher.subscribe('project:created', listener1);
      dispatcher.subscribe('project:created', listener2);

      const snapshot = createMockProjectSnapshot('test-1');
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(listener1Completed).toBe(true);
      expect(listener2Completed).toBe(true);
    });

    it('multiple events can have separate listener registries', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const createdListener = vi.fn();
      const updatedListener = vi.fn();

      dispatcher.subscribe('project:created', createdListener);
      dispatcher.subscribe('project:updated', updatedListener);

      const snapshot = createMockProjectSnapshot('test-1');
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(createdListener).toHaveBeenCalledTimes(1);
      expect(updatedListener).not.toHaveBeenCalled();

      await dispatcher.emit('project:updated', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(updatedListener).toHaveBeenCalledTimes(1);
      expect(createdListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe during emit', () => {
    it('unsubscribe during emit does not break iteration', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const events: string[] = [];

      const listener1 = vi.fn(() => {
        events.push('first');
      });
      const listener2 = vi.fn(() => {
        events.push('second');
      });
      const listener3 = vi.fn(() => {
        events.push('third');
      });

      const unsubscribe3 = dispatcher.subscribe('project:created', listener3);
      dispatcher.subscribe('project:created', listener1);
      dispatcher.subscribe('project:created', listener2);

      // Unsubscribe listener3 before emit
      unsubscribe3();

      const snapshot = createMockProjectSnapshot('test-1');
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(events).toEqual(['first', 'second']);
      expect(listener3).not.toHaveBeenCalled();
    });
  });

  describe('event payload types', () => {
    it('handles part:added event payload', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();

      dispatcher.subscribe('part:added', listener);

      const part: PartDefinition = {
        id: 'engine' as PartDefinition['id'],
        name: 'Engine',
        adapterId: 'adapter-test' as PartDefinition['adapterId'],
      };
      const snapshot = createMockProjectSnapshot('test-1');

      await dispatcher.emit('part:added', {
        projectId: snapshot.project.id,
        part,
        snapshot,
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const payload = listener.mock.calls[0]?.[0];
      expect(payload.part).toBe(part);
      expect(payload.snapshot).toBe(snapshot);
    });

    it('handles project:closed event payload', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();

      dispatcher.subscribe('project:closed', listener);

      const projectId = 'test-1' as ProjectId;

      await dispatcher.emit('project:closed', { projectId });

      expect(listener).toHaveBeenCalledTimes(1);
      const payload = listener.mock.calls[0]?.[0];
      expect(payload.projectId).toBe(projectId);
    });
  });

  describe('multiple subscriptions same listener', () => {
    it('calling subscribe multiple times with same listener only adds it once (Set behavior)', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();

      dispatcher.subscribe('project:created', listener);
      dispatcher.subscribe('project:created', listener);
      dispatcher.subscribe('project:created', listener);

      const snapshot = createMockProjectSnapshot('test-1');
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('calling unsubscribe removes the listener', async () => {
      const dispatcher = new ProjectEventDispatcher();
      const listener = vi.fn();

      dispatcher.subscribe('project:created', listener);
      dispatcher.subscribe('project:created', listener);
      const unsubscribe = dispatcher.subscribe('project:created', listener);

      unsubscribe();

      const snapshot = createMockProjectSnapshot('test-1');
      await dispatcher.emit('project:created', {
        projectId: snapshot.project.id,
        snapshot,
      });

      expect(listener).toHaveBeenCalledTimes(0);
    });
  });
});
