/**
 * T050 — `getPrincipal()` reads real session state. FR-047, SC-024.
 *
 * `016a` shipped this function over a checked-in fixture and documented it as
 * replaceable wholesale by slice 003 (016a/research.md D5). This is the test of
 * whether that seam held: the SHAPE must be unchanged — an identity reference
 * plus live memberships — while the source of the answer changed completely.
 *
 * The shape matters more than it looks. Six slices and eighteen files now stand
 * on this function, and every one depends on its shape and none on where the
 * answer comes from. If this file had to change beyond its mocks, the seam
 * failed and those slices would need amending.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock('@/session/session-store', () => ({ readAccessToken: () => readAccessToken() }));

const MEMBERSHIPS = [
  { tenantId: '11111111-1111-4111-8111-111111111111', tenantName: 'Despacho Alfa, S.C.', archetype: 'MP' },
];

describe('getPrincipal (T050 — real session read)', () => {
  beforeEach(() => {
    readAccessToken.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function subject() {
    const principalModule = await import('@/session/principal');
    return principalModule.getPrincipal();
  }

  it('returns the identity and memberships the API reports', async () => {
    readAccessToken.mockResolvedValue('an-opaque-access-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ identityId: 'id-1', items: MEMBERSHIPS }),
    } as Response);

    const principal = await subject();
    expect(principal.identityId).toBe('id-1');
    expect(principal.memberships).toEqual(MEMBERSHIPS);
  });

  it('THE SHAPE IS UNCHANGED — identityId plus a memberships array (SC-024)', async () => {
    readAccessToken.mockResolvedValue('token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ identityId: 'id-2', items: MEMBERSHIPS }),
    } as Response);

    const principal = await subject();
    expect(Object.keys(principal).sort()).toEqual(['identityId', 'memberships']);
    expect(typeof principal.identityId).toBe('string');
    expect(Array.isArray(principal.memberships)).toBe(true);
    for (const membership of principal.memberships) {
      expect(typeof membership.tenantId).toBe('string');
      expect(typeof membership.tenantName).toBe('string');
      expect(typeof membership.archetype).toBe('string');
    }
  });

  it('presents the access token as a bearer credential, never a header stand-in', async () => {
    readAccessToken.mockResolvedValue('an-opaque-access-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ identityId: 'id-3', items: [] }),
    } as Response);

    await subject();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer an-opaque-access-token');
    expect(headers['x-identity-id']).toBeUndefined();
  });

  it('NEVER CACHES — a revoked membership must disappear on the next request', async () => {
    // The property that makes validating against session state worth anything.
    // A cached read would keep showing a firm somebody has been removed from
    // until the cache happened to expire.
    readAccessToken.mockResolvedValue('token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ identityId: 'id-4', items: [] }),
    } as Response);

    await subject();
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).cache).toBe('no-store');
  });

  it('returns an empty principal when nobody is signed in — it does not throw', async () => {
    // An unauthenticated visitor is an ordinary state on a public route. The
    // middleware decides whether that state is allowed here; this function
    // reports, it does not police.
    readAccessToken.mockResolvedValue(null);
    const principal = await subject();
    expect(principal).toEqual({ identityId: '', memberships: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an empty principal when the API refuses or the network fails', async () => {
    readAccessToken.mockResolvedValue('a-token-the-api-has-revoked');
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response);
    expect(await subject()).toEqual({ identityId: '', memberships: [] });

    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    expect(await subject()).toEqual({ identityId: '', memberships: [] });
  });
});
