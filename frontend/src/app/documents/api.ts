/**
 * T044-T047 (007-document-management) — typed wrappers over `apiFetch` for the
 * document endpoints (`specs/007-document-management/contracts/document-api.md`).
 * `unwrap` gives every call the same contract `QueryBoundary` already expects
 * throughout `016a`: a rejected promise carrying either a `FailedResponse` (`{status,
 * body}`) or `null` for a network failure — never a thrown, wire-shape-losing `Error`
 * (`api-client.ts`'s own header comment).
 */
import { apiFetch, type ApiResult, type FailedResponse } from '../../lib/api-client';

export interface DocumentCategorySummary {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'retired';
  readonly retiredAt?: string | null;
}

export interface DocumentSummary {
  readonly id: string;
  readonly caseId?: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /** Present on list reads only (contract §2) — carries FR-012's "still resolvable, marked retired". */
  readonly categoryStatus?: 'active' | 'retired';
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedByMembershipId: string;
  readonly uploadedAt: string;
  readonly status?: 'active' | 'withdrawn';
  readonly withdrawnAt?: string | null;
}

export interface PreviewResponse {
  readonly previewUrl: string | null;
  readonly expiresAt?: string;
  readonly renderAs: 'pdf' | 'image' | 'converted-pdf' | 'unsupported';
  readonly downloadAvailable?: boolean;
}

export interface DownloadResponse {
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly filename: string;
}

export interface CategoryChangeResult {
  readonly id: string;
  readonly categoryId: string;
  readonly categoryName: string;
}

export interface WithdrawRestoreResult {
  readonly id: string;
  readonly status: 'active' | 'withdrawn';
  readonly withdrawnAt: string | null;
}

async function unwrap<T>(result: ApiResult<T>): Promise<T> {
  if (result.ok) return result.data;
  if (result.status === null || result.body === null) {
    return Promise.reject(null);
  }
  const failed: FailedResponse = { status: result.status, body: result.body };
  return Promise.reject(failed);
}

export function listDocuments(caseId: string): Promise<{ items: readonly DocumentSummary[] }> {
  return apiFetch<{ items: readonly DocumentSummary[] }>(`/tenant/cases/${caseId}/documents`).then(unwrap);
}

export function uploadDocument(caseId: string, file: File, categoryId?: string): Promise<DocumentSummary> {
  const form = new FormData();
  form.append('file', file);
  if (categoryId) form.append('categoryId', categoryId);
  return apiFetch<DocumentSummary>(`/tenant/cases/${caseId}/documents`, {
    method: 'POST',
    body: form,
  }).then(unwrap);
}

export function previewDocument(caseId: string, documentId: string): Promise<PreviewResponse> {
  return apiFetch<PreviewResponse>(`/tenant/cases/${caseId}/documents/${documentId}/preview`).then(unwrap);
}

export function downloadDocument(caseId: string, documentId: string): Promise<DownloadResponse> {
  return apiFetch<DownloadResponse>(`/tenant/cases/${caseId}/documents/${documentId}/download`).then(unwrap);
}

export function changeDocumentCategory(
  caseId: string,
  documentId: string,
  categoryId: string,
): Promise<CategoryChangeResult> {
  return apiFetch<CategoryChangeResult>(`/tenant/cases/${caseId}/documents/${documentId}/category`, {
    method: 'PATCH',
    body: JSON.stringify({ categoryId }),
  }).then(unwrap);
}

export function withdrawDocument(caseId: string, documentId: string): Promise<WithdrawRestoreResult> {
  return apiFetch<WithdrawRestoreResult>(`/tenant/cases/${caseId}/documents/${documentId}/withdraw`, {
    method: 'PATCH',
  }).then(unwrap);
}

export function restoreDocument(caseId: string, documentId: string): Promise<WithdrawRestoreResult> {
  return apiFetch<WithdrawRestoreResult>(`/tenant/cases/${caseId}/documents/${documentId}/restore`, {
    method: 'PATCH',
  }).then(unwrap);
}

export function listDocumentCategories(): Promise<{ items: readonly DocumentCategorySummary[] }> {
  return apiFetch<{ items: readonly DocumentCategorySummary[] }>('/tenant/document-categories').then(unwrap);
}

export function createDocumentCategory(name: string): Promise<DocumentCategorySummary> {
  return apiFetch<DocumentCategorySummary>('/tenant/document-categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then(unwrap);
}

export function retireDocumentCategory(categoryId: string): Promise<DocumentCategorySummary> {
  return apiFetch<DocumentCategorySummary>(`/tenant/document-categories/${categoryId}/retire`, {
    method: 'PATCH',
  }).then(unwrap);
}
