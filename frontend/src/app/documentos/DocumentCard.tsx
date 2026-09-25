/**
 * 023 — one document, seen from outside its matter. FR-009, FR-010, Decision 5.
 *
 * THE FILE NAME IS THE TITLE (Decision 5): it is what the person searched for, and a card
 * whose heading is not the thing you typed reads as the wrong card. The matter's file number
 * is the second line, because "which matter?" is the question this card exists to answer
 * second.
 *
 * `useDownload` IS `021`'s HOOK, UNCHANGED, called here with **this row's** case id. That is
 * the whole reason the row is a component rather than markup in a loop: every `021` module
 * takes one `caseId`, and a firm-wide page has one per row. Calling the hook at page level
 * would have downloaded the wrong document's bytes under the right document's name.
 */
'use client';

import { FileText, Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { can } from '@/authz/can';
import type { Archetype } from '@/session/types';
import type { FirmDocumentSummary } from '@/app/documents/api';
import { formatBytes, categoryLabel } from '@/documents/format';
import { formatDate } from '@/configuracion/format';
import { useDownload } from '@/app/expedientes/[caseId]/documentos/useDownload';

export interface DocumentCardProps {
  readonly item: FirmDocumentSummary;
  readonly archetype: Archetype;
  readonly onPreview: (item: FirmDocumentSummary) => void;
}

export function DocumentCard({ item, archetype, onPreview }: DocumentCardProps): React.JSX.Element {
  const download = useDownload(item.caseId);
  const mayDownload = can('document.download', archetype);

  return (
    <article
      data-testid={`document-card-${item.id}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <FileText aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          {/*
            `title` carries the full name for a pointer, and the truncated text stays the
            accessible name — a screen reader reads the whole thing either way, because the
            text node is complete and only its rendering is clipped.
          */}
          <h3 className="truncate font-medium" title={item.originalFilename}>
            {item.originalFilename}
          </h3>
          {/*
            Each field is its own element rather than one interpolated string. Visually it is
            the mockup's single "fecha · tipo" line; structurally it means the category and the
            date are addressable — by a test, and by a future style that wants to treat them
            differently. A merged text node is also unfindable: `getByText('Contrato')` does
            not match "20 sep 2026 · Contrato".
          */}
          <p className="text-small text-muted-foreground">
            <span className="tabular">{formatDate(item.uploadedAt)}</span>
            {' · '}
            <span>
              {categoryLabel(item.categoryName)}
              {item.categoryStatus === 'retired' ? ' (Retirada)' : ''}
            </span>
          </p>
        </div>
      </div>

      <p className="text-caption text-muted-foreground">
        <span className="tabular">{item.caseFileNumber}</span>
        {' · '}
        <span className="tabular">{formatBytes(item.sizeBytes)}</span>
      </p>

      <div className="flex gap-2">
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
    </article>
  );
}
