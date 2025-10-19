import type { AdapterContext, PartAdapter } from '../../models/adapter.js';
import type { PartDefinition, PartVersion, ResolvedPartVersion } from '../../models/part.js';

/**
 * Minimal adapter used in tests.
 */
export class FakeAdapter implements PartAdapter {
  readonly id = `adapter-${Math.random().toString(36).slice(2, 8)}` as PartAdapter['id'];
  readonly displayName = 'Fake Adapter';

  async resolveVersion(
    _context: AdapterContext,
    _part: PartDefinition,
    version: PartVersion
  ): Promise<ResolvedPartVersion> {
    return {
      partId: version.partId,
      versionId: version.id,
      locator: version.locator,
      label: version.label,
      metadata: version.metadata,
    };
  }
}
