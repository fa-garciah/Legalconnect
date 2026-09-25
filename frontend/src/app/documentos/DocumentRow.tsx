/**
 * 023 — the same document as a table row. FR-009, FR-011.
 *
 * The list view exists because a grid is good for recognising a document and bad for
 * comparing forty of them. Same fields, same actions, same per-row `useDownload(item.caseId)`
 * — only the layout differs, which is why this is a sibling of `DocumentCard` rather than a
 * mode inside it.
 */
'use client';

import { Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { can } from '@/authz/can';
import type { Archetype } from '@/session/types';
import type { FirmDocumentSummary } from '@/app/documents/api';
import { formatBytes, categoryLabel } from '@/documents/format';
import { formatDate } from '@/configuracion/format';
import { useDownload } from '@/app/expedientes/[caseId]/documentos/useDownload';

export interface DocumentRowProps {
  readonly item: FirmDocumentSummary;
  readonly archetype: Archetype;
  readonly onPreview: (item: FirmDocumentSummary) => void;
}

export function DocumentRow({ item, archetype, onPreview }: DocumentRowProps): React.JSX.Element {
  const download = useDownload(item.caseId);
  const mayDownload = can('document.download', archetype);

  return (
    <TableRow data-testid={`document-row-${item.id}`}>
      <TableCell className="max-w-[20rem] truncate font-medium" title={item.originalFilename}>
        {item.originalFilename}
      </TableCell>
      <TableCell className="tabular">{item.caseFileNumber}</TableCell>
      <TableCell>
        {categoryLabel(item.categoryName)}
        {item.categoryStatus === 'retired' ? ' (Retirada)' : ''}
      </TableCell>
      <TableCell className="tabular">{formatDate(item.uploadedAt)}</TableCell>
      <TableCell className="tabular">{formatBytes(item.sizeBytes)}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onPreview(item)}>
            <Eye aria-hidden className="mr-1.5 h-4 w-4" />
            Ver
          </Button>
          {mayDownload ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => download.mutate(item.id)}
              disabled={download.isPending}
            >
              <Download aria-hidden className="mr-1.5 h-4 w-4" />
              Descargar
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
