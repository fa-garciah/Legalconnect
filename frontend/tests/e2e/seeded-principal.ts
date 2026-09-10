/**
 * The seeded identity the e2e specs drive the API with.
 *
 * REPLACES `src/session/principal.fixture.json`, which slice 003 deleted. That
 * file was a PRODUCTION artefact — it shipped inside `src/` and `getPrincipal()`
 * imported it — and 016a/D5 always described it as the thing 003 would remove.
 * The e2e specs happened to import it too, for the unrelated reason that they
 * need a real identity to seed API state with before driving the browser.
 *
 * That second need did not go away, so it moves here: into `tests/`, where a
 * fixture belongs, and where no production code can reach it.
 *
 * Values come from the environment so a developer can point the specs at
 * whatever their seed produced. `npm run db:seed` in `backend/` prints them.
 */
export const SEEDED_IDENTITY_ID = process.env.E2E_IDENTITY_ID ?? '';
export const SEEDED_TENANT_ID = process.env.E2E_TENANT_ID ?? '';

/**
 * Headers for seeding API state directly, bypassing the browser.
 *
 * NOTE: these no longer authenticate anything. 003 removed `x-identity-id` from
 * every network-reachable surface (FR-041), so a spec that needs authenticated
 * API access must sign in for real and present a bearer token. Kept as one
 * export so the specs that still only need `x-tenant-id` keep working, and so
 * the ones that need more fail in one obvious place.
 */
export const SEED_HEADERS: Record<string, string> = {
  'x-tenant-id': SEEDED_TENANT_ID,
};
