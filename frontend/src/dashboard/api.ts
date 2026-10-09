/**
 * 024. The dashboard's one call, through `apiFetch` (the `/api/lc` proxy). Failures reject with
 * `{status, body}` or `null`, the contract `016a`'s classifier expects.
 */
import { apiFetch, type FailedResponse } from '../lib/api-client';
import type { Dashboard } from './types';

export async function getDashboard(): Promise<Dashboard> {
  const result = await apiFetch<Dashboard>('/tenant/dashboard');
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) return Promise.reject(null);
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}
