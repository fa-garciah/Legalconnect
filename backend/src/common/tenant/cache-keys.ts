/**
 * T050 — tenant-prefixed cache keys that miss rather than fall back.
 *
 * A cache is the easiest place for isolation to leak quietly, because nothing about a
 * plain string key announces which firm it belongs to. The prefix is mandatory in the
 * type signature, so producing an unscoped key requires deliberately bypassing this
 * module rather than merely forgetting something.
 */
const PREFIX = 't';
const SEPARATOR = ':';

export function tenantCacheKey(tenantId: string, ...parts: readonly string[]): string {
  if (!tenantId) throw new Error('a tenant id is required to build a cache key');
  return [PREFIX, tenantId, ...parts].join(SEPARATOR);
}

export function parseTenantCacheKey(key: string): { tenantId: string; rest: string } | null {
  const segments = key.split(SEPARATOR);
  // Returns null rather than guessing. An unprefixed key is not "probably the current
  // tenant's" — it is a key that must not resolve.
  if (segments.length < 3 || segments[0] !== PREFIX) return null;
  return { tenantId: segments[1]!, rest: segments.slice(2).join(SEPARATOR) };
}

/**
 * An in-memory cache that can only be addressed through a tenant.
 *
 * Deliberately has no `get(key)` that takes a whole key: the only way in is with a
 * tenant. `rawGet` exists for tests to prove that reaching past the helper misses.
 */
export class TenantScopedCache<V = unknown> {
  private readonly entries = new Map<string, V>();

  get(tenantId: string, ...parts: readonly string[]): Promise<V | undefined> {
    return Promise.resolve(this.entries.get(tenantCacheKey(tenantId, ...parts)));
  }

  set(tenantId: string, part: string, value: V): Promise<void> {
    this.entries.set(tenantCacheKey(tenantId, part), value);
    return Promise.resolve();
  }

  /** Only a fully-formed prefixed key resolves. An unprefixed one misses. */
  rawGet(key: string): V | undefined {
    if (parseTenantCacheKey(key) === null) return undefined;
    return this.entries.get(key);
  }

  clearTenant(tenantId: string): Promise<void> {
    const prefix = `${PREFIX}${SEPARATOR}${tenantId}${SEPARATOR}`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
    return Promise.resolve();
  }

  get size(): number {
    return this.entries.size;
  }
}
