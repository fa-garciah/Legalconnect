/**
 * 021 T022/T025 (US2, US3, 007 T045). A matter's active documents, newest first.
 *
 * Each row: name, category (a retired one marked "Retirada", 007/FR-012), size, upload date, and
 * the actions the caller holds — "Ver", "Descargar", "Cambiar categoría" (row 39), "Retirar"
 * (row 40, confirmed first, and the confirmation says nothing is deleted: 007/FR-004).
 * The uploader is not shown: no slice stores a person's name (spec, gap 6).
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import { listDocuments, withdrawDocument, type DocumentSummary, type WithdrawRestoreResult } from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { formatDate } from '@/configuracion/format';
import { categoryLabel, formatBytes } from '@/documents/format';
import { isStaleRecord } from '@/documents/refusal-copy';
import type { Archetype } from '@/session/types';
import { ChangeCategoryControl } from './ChangeCategoryDialog';
import { RefusalNotice } from './RefusalNotice';
import { useDownload } from './useDownload';

export interface DocumentListProps {
  readonly caseId: string;
  readonly archetype: Archetype;
  readonly previewingId: string | null;
  readonly onPreview: (document: DocumentSummary) => void;
  readonly onWithdrawn: (documentId: string) => void;
}

export function DocumentList({ caseId, archetype, previewingId, onPreview, onWithdrawn }: DocumentListProps): React.JSX.Element {
  const [withdrawing, setWithdrawing] = useState<DocumentSummary | null>(null);
  const download = useDownload(caseId);
  const mayDownload = can('document.download', archetype);
  const mayWithdraw = can('document.withdraw', archetype);

  const query = useQuery<{ items: readonly DocumentSummary[] }, FailedResponse | null>({
    queryKey: ['documents', caseId],
    queryFn: () => listDocuments(caseId),
  });

  return (
    <>
      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        emptyGuidance="Este expediente aún no tiene documentos."
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Subido</TableHead>
                <TableHead className="sr-only">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.items]
                .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
                .map((document) => (
                  <TableRow key={document.id} data-state={previewingId === document.id ? 'selected' : undefined}>
                    <TableCell className="max-w-[16rem] truncate font-medium" title={document.originalFilename}>
                      {document.originalFilename}
                    </TableCell>
                    <TableCell>
                      <span>{categoryLabel(document.categoryName)}</span>
                      {document.categoryStatus === 'retired' ? (
                        <Badge variant="outline" className="ml-2">
                          Retirada
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatBytes(document.sizeBytes)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(document.uploadedAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant={previewingId === document.id ? 'default' : 'outline'}
                          size="sm"
                          aria-label={`Ver ${document.originalFilename}`}
                          onClick={() => onPreview(document)}
                        >
                          <Eye aria-hidden className="mr-1 h-4 w-4" />
                          Ver
                        </Button>
                        {mayDownload ? (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Descargar ${document.originalFilename}`}
                            disabled={download.isPending && download.variables === document.id}
                            onClick={() => download.mutate(document.id)}
                          >
                            Descargar
                          </Button>
                        ) : null}
                        <ChangeCategoryControl archetype={archetype} caseId={caseId} document={document} />
                        {mayWithdraw ? (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Retirar ${document.originalFilename}`}
                            onClick={() => setWithdrawing(document)}
                          >
                            Retirar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </QueryBoundary>

      {download.status === 'error' ? <RefusalNotice refusal={download.error} /> : null}

      {withdrawing ? (
        <WithdrawDialog
          caseId={caseId}
          document={withdrawing}
          onClose={() => setWithdrawing(null)}
          onDone={() => onWithdrawn(withdrawing.id)}
        />
      ) : null}
    </>
  );
}

function WithdrawDialog({
  caseId,
  document,
  onClose,
  onDone,
}: {
  caseId: string;
  document: DocumentSummary;
  onClose: () => void;
  onDone: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const withdraw = useMutation<WithdrawRestoreResult, FailedResponse | null, void>({
    mutationFn: () => withdrawDocument(caseId, document.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', caseId] });
      void queryClient.invalidateQueries({ queryKey: ['documents-withdrawn', caseId] });
      onDone();
      onClose();
    },
    onError: (failed) => {
      if (isStaleRecord(failed)) void queryClient.invalidateQueries({ queryKey: ['documents', caseId] });
    },
  });

  return (
    <AlertDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar {document.originalFilename}?</AlertDialogTitle>
          <AlertDialogDescription>
            Deja de aparecer en el expediente, pero no se borra: se conserva y un socio o el
            administrador puede restaurarlo desde “Retirados”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {withdraw.status === 'error' ? <RefusalNotice refusal={withdraw.error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={withdraw.isPending}
            onClick={(event) => {
              event.preventDefault();
              withdraw.mutate();
            }}
          >
            {withdraw.isPending ? 'Retirando…' : 'Retirar documento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
