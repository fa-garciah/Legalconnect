/**
 * 021 T022 (Decision 1). A matter's documents: list on one side, preview on the other (stacked on
 * a narrow screen), upload above, and — for MP/SA — the withdrawn documents in their own tab.
 *
 * The case is read once, for its file number and client (FR-002). A case the caller cannot reach
 * answers `404`, byte-identical to one that does not exist, and this page says the same thing for
 * both: "not available", never "not allowed" (007 contract §0).
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { can } from '@/authz/can';
import { readCase } from '@/cases/api';
import type { CaseDetail } from '@/cases/types';
import type { DocumentSummary } from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import type { Archetype } from '@/session/types';
import { DocumentList } from './DocumentList';
import { PreviewPane } from './PreviewPane';
import { RefusalNotice } from './RefusalNotice';
import { UploadDialog } from './UploadDialog';
import { WithdrawnList } from './WithdrawnList';

export interface DocumentsViewProps {
  readonly caseId: string;
  readonly archetype: Archetype;
}

export function DocumentsView({ caseId, archetype }: DocumentsViewProps): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState<DocumentSummary | null>(null);

  const caseQuery = useQuery<CaseDetail, FailedResponse | null>({
    queryKey: ['case', caseId],
    queryFn: () => readCase(caseId),
  });

  const back = (
    <Link href="/expedientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      Expedientes
    </Link>
  );

  if (caseQuery.status === 'error') {
    return (
      <section className="flex flex-col gap-3">
        {back}
        {caseQuery.error?.status === 404 ? (
          <p role="alert" className="text-body">
            Este expediente no está disponible.
          </p>
        ) : (
          <RefusalNotice refusal={caseQuery.error} onRetry={() => void caseQuery.refetch()} />
        )}
      </section>
    );
  }

  const mayUpload = can('document.upload', archetype);
  const mayDownload = can('document.download', archetype);
  const mayRestore = can('document.restore', archetype);

  const list = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <DocumentList
        caseId={caseId}
        archetype={archetype}
        previewingId={previewing?.id ?? null}
        onPreview={setPreviewing}
        onWithdrawn={(id) => setPreviewing((current) => (current?.id === id ? null : current))}
      />
      <PreviewPane caseId={caseId} document={previewing} mayDownload={mayDownload} />
    </div>
  );

  return (
    <section className="flex flex-col gap-6" aria-labelledby="documentos-heading">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 id="documentos-heading" className="font-display text-display font-semibold tracking-tight">
            Documentos · {caseQuery.data?.fileNumber ?? ''}
          </h1>
          {caseQuery.data ? <p className="text-muted-foreground">{caseQuery.data.client.legalName}</p> : null}
        </div>
        {mayUpload ? (
          <Button onClick={() => setUploading(true)}>
            <Upload aria-hidden className="mr-2 h-4 w-4" />
            Subir documento
          </Button>
        ) : null}
      </div>

      {mayRestore ? (
        <Tabs defaultValue="activos">
          <TabsList>
            <TabsTrigger value="activos">Documentos</TabsTrigger>
            <TabsTrigger value="retirados">Retirados</TabsTrigger>
          </TabsList>
          <TabsContent value="activos" className="mt-4">
            {list}
          </TabsContent>
          <TabsContent value="retirados" className="mt-4">
            <WithdrawnList caseId={caseId} />
          </TabsContent>
        </Tabs>
      ) : (
        list
      )}

      {mayUpload ? (
        <UploadDialog
          open={uploading}
          caseId={caseId}
          onClose={() => setUploading(false)}
          onUploaded={() => setUploading(false)}
        />
      ) : null}
    </section>
  );
}
