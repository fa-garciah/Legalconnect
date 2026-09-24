/**
 * 021 T025 (US3, Decision 2). A matter's withdrawn documents, for MP and SA — the only place one
 * can be found again. "Restaurar" needs no confirmation: it is the undo (`018`'s precedent for
 * restoring a client). A `409` means a colleague already restored it; the list re-reads.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import {
  listWithdrawnDocuments,
  restoreDocument,
  type DocumentSummary,
  type WithdrawRestoreResult,
} from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { formatDate } from '@/configuracion/format';
import { categoryLabel, formatBytes } from '@/documents/format';
import { isStaleRecord } from '@/documents/refusal-copy';
import { RefusalNotice } from './RefusalNotice';

export function WithdrawnList({ caseId }: { readonly caseId: string }): React.JSX.Element {
  const queryClient = useQueryClient();
  const query = useQuery<{ items: readonly DocumentSummary[] }, FailedResponse | null>({
    queryKey: ['documents-withdrawn', caseId],
    queryFn: () => listWithdrawnDocuments(caseId),
  });

  const restore = useMutation<WithdrawRestoreResult, FailedResponse | null, string>({
    mutationFn: (documentId) => restoreDocument(caseId, documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents-withdrawn', caseId] });
      void queryClient.invalidateQueries({ queryKey: ['documents', caseId] });
    },
    onError: (failed) => {
      if (isStaleRecord(failed)) {
        void queryClient.invalidateQueries({ queryKey: ['documents-withdrawn', caseId] });
        void queryClient.invalidateQueries({ queryKey: ['documents', caseId] });
      }
    },
  });

  return (
    <div className="flex flex-col gap-3">
      {restore.status === 'error' ? <RefusalNotice refusal={restore.error} /> : null}
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        emptyGuidance="No hay documentos retirados en este expediente."
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Retirado</TableHead>
                <TableHead className="sr-only">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((document) => (
                <TableRow key={document.id}>
                  <TableCell className="font-medium">{document.originalFilename}</TableCell>
                  <TableCell>{categoryLabel(document.categoryName)}</TableCell>
                  <TableCell>{formatBytes(document.sizeBytes)}</TableCell>
                  <TableCell>{document.withdrawnAt ? formatDate(document.withdrawnAt) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Restaurar ${document.originalFilename}`}
                      disabled={restore.isPending && restore.variables === document.id}
                      onClick={() => restore.mutate(document.id)}
                    >
                      Restaurar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryBoundary>
    </div>
  );
}
