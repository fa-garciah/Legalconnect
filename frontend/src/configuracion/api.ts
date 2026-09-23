/**
 * 014 T016. Every call `/configuracion` makes, through `apiFetch` only (contracts §0).
 *
 * `unwrap` is the same contract `src/clients/api.ts` uses: a failure rejects with `{status, body}`
 * so `016a`'s `classifyRefusal` can tell a permission refusal from a plan limit, or with `null`
 * when there was no response at all.
 *
 * The four step-up mutations take the token as an argument rather than asking for it: the
 * caller shows `StepUpDialog` immediately before the call, and the token lives only for it.
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../lib/api-client';
import { stepUpHeaders } from './step-up';
import type { Archetype } from '../session/types';
import type {
  DirectoryItem,
  IssuedInvitation,
  Member,
  MemberList,
  PendingInvitation,
  Position,
} from './types';

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) return Promise.reject(null);
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

/**
 * `GET /tenant/members`, falling back to `GET /tenant/directory` when it is refused or fails.
 *
 * The fallback is contracts §1.2's rule: the list must never render as bare UUIDs, and the
 * directory still names each person's role and position. A fallback that ALSO fails rejects
 * with the directory's own refusal, which is the one worth classifying.
 */
export async function listMembers(): Promise<MemberList> {
  const members = await apiFetch<{ items: readonly Member[] }>('/tenant/members');
  if (members.ok) return { items: members.data.items, withEmail: true };

  const directory = await unwrap(
    await apiFetch<{ items: readonly DirectoryItem[]; nextCursor: string | null }>(
      '/tenant/directory?limit=200',
    ),
  );
  return {
    withEmail: false,
    items: directory.items.map((item) => ({
      membershipId: item.membershipId,
      email: null,
      archetype: item.archetype,
      positionName: item.positionName,
    })),
  };
}

export async function listDirectory(): Promise<readonly DirectoryItem[]> {
  const page = await unwrap(
    await apiFetch<{ items: readonly DirectoryItem[] }>('/tenant/directory?limit=200'),
  );
  return page.items;
}

export async function listPendingInvitations(): Promise<readonly PendingInvitation[]> {
  const list = await unwrap(await apiFetch<{ items: readonly PendingInvitation[] }>('/tenant/invitations'));
  return list.items;
}

export async function issueInvitation(
  input: { readonly email: string; readonly targetArchetype: Archetype },
  stepUpToken: string,
): Promise<IssuedInvitation> {
  return unwrap(
    await apiFetch<IssuedInvitation>('/tenant/invitations', {
      method: 'POST',
      headers: stepUpHeaders(stepUpToken),
      body: JSON.stringify(input),
    }),
  );
}

export async function revokeInvitation(id: string, stepUpToken: string): Promise<void> {
  await unwrap(
    await apiFetch(`/tenant/invitations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      headers: stepUpHeaders(stepUpToken),
    }),
  );
}

export async function revokeMembership(membershipId: string, stepUpToken: string): Promise<void> {
  await unwrap(
    await apiFetch(`/tenant/memberships/${encodeURIComponent(membershipId)}/revoke`, {
      method: 'PATCH',
      headers: stepUpHeaders(stepUpToken),
    }),
  );
}

export async function changeArchetype(
  membershipId: string,
  archetype: Archetype,
  stepUpToken: string,
): Promise<void> {
  await unwrap(
    await apiFetch(`/tenant/memberships/${encodeURIComponent(membershipId)}/archetype`, {
      method: 'PATCH',
      headers: stepUpHeaders(stepUpToken),
      body: JSON.stringify({ archetype }),
    }),
  );
}

export async function listPositions(): Promise<readonly Position[]> {
  const list = await unwrap(await apiFetch<{ items: readonly Position[] }>('/tenant/directory/positions'));
  return list.items;
}

export async function createPosition(name: string): Promise<Position> {
  return unwrap(
    await apiFetch<Position>('/tenant/directory/positions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  );
}

export async function retirePosition(id: string): Promise<Position> {
  return unwrap(
    await apiFetch<Position>(`/tenant/directory/positions/${encodeURIComponent(id)}/retire`, {
      method: 'PATCH',
    }),
  );
}

export async function assignPosition(membershipId: string, positionId: string | null): Promise<void> {
  await unwrap(
    await apiFetch(`/tenant/directory/entries/${encodeURIComponent(membershipId)}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ positionId }),
    }),
  );
}
