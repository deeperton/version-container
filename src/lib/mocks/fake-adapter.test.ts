import { describe, expect, it } from 'vitest';

import { FakeAdapter } from './fake-adapter.js';
import type { AdapterContext, StorageProvider } from '../../models/adapter.js';
import type { PartDefinition, PartVersion, ResolvedPartVersion } from '../../models/part.js';
import type { AdapterId, ProjectId } from '../../models/base.js';

describe('FakeAdapter', () => {
  const createMockContext = (): AdapterContext => ({
    projectId: 'test-project' as ProjectId,
    storage: {} as StorageProvider,
  });

  const createMockPart = (): PartDefinition => ({
    id: 'test-part' as PartDefinition['id'],
    name: 'Test Part',
    adapterId: 'adapter-test' as AdapterId,
  });

  const createMockVersion = (overrides?: Partial<PartVersion>): PartVersion => ({
    id: 'v1.0.0' as PartVersion['id'],
    partId: 'test-part' as PartDefinition['id'],
    locator: { uri: 'memory://test@v1.0.0' },
    label: '1.0.0',
    metadata: { source: 'test' },
    ...overrides,
  });

  it('constructor generates ID with correct format', () => {
    const adapter = new FakeAdapter();
    expect(adapter.id).toMatch(/^adapter-[a-z0-9]{6}$/);
  });

  it('generates different IDs for each instance', () => {
    const adapter1 = new FakeAdapter();
    const adapter2 = new FakeAdapter();
    expect(adapter1.id).not.toBe(adapter2.id);
  });

  it('displayName is "Fake Adapter"', () => {
    const adapter = new FakeAdapter();
    expect(adapter.displayName).toBe('Fake Adapter');
  });

  it('resolveVersion returns correct ResolvedPartVersion structure', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const version = createMockVersion();

    const result = await adapter.resolveVersion(context, part, version);

    expect(result).toHaveProperty('partId');
    expect(result).toHaveProperty('versionId');
    expect(result).toHaveProperty('locator');
    expect(result).toHaveProperty('label');
    expect(result).toHaveProperty('metadata');
  });

  it('resolveVersion preserves metadata from input version', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const metadata = { source: 'test', custom: 'value' };
    const version = createMockVersion({ metadata });

    const result = await adapter.resolveVersion(context, part, version);

    expect(result.metadata).toEqual(metadata);
  });

  it('resolveVersion preserves label from input version', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const label = '2.5.0-beta';
    const version = createMockVersion({ label });

    const result = await adapter.resolveVersion(context, part, version);

    expect(result.label).toBe(label);
  });

  it('resolveVersion returns correct partId', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const version = createMockVersion();

    const result = await adapter.resolveVersion(context, part, version);

    expect(result.partId).toBe(part.id);
  });

  it('resolveVersion returns correct versionId', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const versionId = 'v3.0.0' as PartVersion['id'];
    const version = createMockVersion({ id: versionId });

    const result = await adapter.resolveVersion(context, part, version);

    expect(result.versionId).toBe(versionId);
  });

  it('resolveVersion returns ResolvedPartVersion type', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const version = createMockVersion();

    const result = await adapter.resolveVersion(context, part, version);
    const typeCheck: ResolvedPartVersion = result;
    expect(typeCheck).toBe(result);
  });

  it('resolveVersion handles version with undefined metadata', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const version = createMockVersion({ metadata: undefined });

    const result = await adapter.resolveVersion(context, part, version);

    expect(result.metadata).toBeUndefined();
  });

  it('resolveVersion handles version with undefined label', async () => {
    const adapter = new FakeAdapter();
    const context = createMockContext();
    const part = createMockPart();
    const version = createMockVersion({ label: undefined });

    const result = await adapter.resolveVersion(context, part, version);

    expect(result.label).toBeUndefined();
  });
});
