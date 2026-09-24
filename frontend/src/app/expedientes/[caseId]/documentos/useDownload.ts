/**
 * 021 (FR-010). Download on click: ask for a signed URL, then go to it.
 *
 * Nothing is requested until the person asks — each download is one audited access
 * (`document.downloaded`, 007/FR-020), and a pre-fetched URL would record accesses nobody made.
 */
'use client';

import { useMutation } from '@tanstack/react-query';
import { downloadDocument, type DownloadResponse } from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { openDownload } from '@/documents/navigate';

export function useDownload(caseId: string) {
  return useMutation<DownloadResponse, FailedResponse | null, string>({
    mutationFn: (documentId) => downloadDocument(caseId, documentId),
    onSuccess: (result) => openDownload(result.downloadUrl),
  });
}
