/**
 * T008 — the principal seam (research.md D5, FR-023). This slice performs no
 * authentication; `getPrincipal()` is backed by a fixture until slice 003 replaces this
 * one file wholesale. Every consumer — `Header`, `NavigationMenu`, `TenantSwitcher`,
 * `api-client.ts` — depends only on this function's shape, never on the fixture itself.
 */
import type { Principal } from './types';
import fixture from './principal.fixture.json';

export async function getPrincipal(): Promise<Principal> {
  return fixture as Principal;
}
