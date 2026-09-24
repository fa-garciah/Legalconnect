/**
 * 021 T022 (US2, 007 T046). A document read in place.
 *
 * The preview URL is requested when "Ver" is chosen — never ahead of time, since each preview is
 * one audited access (007/FR-020). `pdf` renders in an iframe, `image` in an img. `converted-pdf`
 * and `unsupported` both offer download instead: no converter exists, and the "converted" URL is
 * the original Office file, which a browser would download rather than show (Decision 3).
 *
 * The signed URL lives five minutes. It is refreshed every four while the pane is open, so a long
 * read never lands on an expired link. It is held in React Query's memory only — never in browser
 * storage (FR-011).
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { previewDocument, type DocumentSummary, type PreviewResponse } from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { RefusalNotice } from './RefusalNotice';
import { useDownload } from './useDownload';

const REFRESH_MS = 4 * 60_000;

export interface PreviewPaneProps {
  readonly caseId: string;
  readonly document: DocumentSummary | null;
  readonly mayDownload: boolean;
}

export function PreviewPane({ caseId, document, mayDownload }: PreviewPaneProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="preview-heading"
      className="flex min-h-[24rem] flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 id="preview-heading" className="font-display text-heading font-semibold">
        Vista previa
      </h2>
      {document ? (
        <PreviewBody key={document.id} caseId={caseId} document={document} mayDownload={mayDownload} />
      ) : (
        <p className="text-sm text-muted-foreground">Elige un documento y pulsa “Ver”.</p>
      )}
    </section>
  );
}

function PreviewBody({
  caseId,
  document,
  mayDownload,
}: {
  caseId: string;
  document: DocumentSummary;
  mayDownload: boolean;
}): React.JSX.Element {
  const download = useDownload(caseId);
  const preview = useQuery<PreviewResponse, FailedResponse | null>({
    queryKey: ['document-preview', caseId, document.id],
    queryFn: () => previewDocument(caseId, document.id),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    gcTime: 0,
  });

  if (preview.status === 'pending') {
    return <p className="text-sm text-muted-foreground">Cargando vista previa…</p>;
  }
  if (preview.status === 'error') {
    return <RefusalNotice refusal={preview.error} onRetry={() => void preview.refetch()} />;
  }

  const { renderAs, previewUrl } = preview.data;
  const downloadButton = mayDownload ? (
    <Button
      variant="outline"
      onClick={() => download.mutate(document.id)}
      disabled={download.isPending}
      aria-label={`Descargar ${document.originalFilename}`}
    >
      <Download aria-hidden className="mr-2 h-4 w-4" />
      Descargar
    </Button>
  ) : null;

  if ((renderAs === 'pdf' || renderAs === 'image') && previewUrl) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        {renderAs === 'pdf' ? (
          <iframe
            title={`Vista previa de ${document.originalFilename}`}
            src={previewUrl}
            className="min-h-[32rem] w-full flex-1 rounded-md border border-border bg-background"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL on the object store's origin; next/image would proxy and cache it.
          <img src={previewUrl} alt={document.originalFilename} className="max-h-[36rem] w-full rounded-md object-contain" />
        )}
        <div className="flex justify-end">{downloadButton}</div>
        {download.status === 'error' ? <RefusalNotice refusal={download.error} /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <FileText aria-hidden className="h-10 w-10 text-muted-foreground" />
      <p className="font-medium">{document.originalFilename}</p>
      <p className="text-sm text-muted-foreground">
        Este tipo de archivo no se puede previsualizar aquí. Descárgalo para abrirlo.
      </p>
      {downloadButton}
      {download.status === 'error' ? <RefusalNotice refusal={download.error} /> : null}
    </div>
  );
}
