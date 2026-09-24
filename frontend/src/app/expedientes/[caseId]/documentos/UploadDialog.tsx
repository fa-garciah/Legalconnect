/**
 * 021 T019 (US1, 007 T044). Attaching a file to a matter.
 *
 * The file is checked against `007`'s rules and the 25 MB cap before anything is sent — a refusal
 * the server would give anyway costs the person a wait for nothing. Only ACTIVE categories are
 * offered; choosing none files the document under the firm's default ("Sin clasificar",
 * 007/FR-010). The request is `FormData` through `apiFetch`, which leaves `content-type` to the
 * browser so the multipart boundary is right.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  listDocumentCategories,
  uploadDocument,
  type DocumentCategorySummary,
  type DocumentSummary,
} from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { categoryLabel, formatBytes } from '@/documents/format';
import { ACCEPT_ATTRIBUTE, ACCEPTED_TYPES_LABEL, checkUpload } from '@/documents/upload-rules';
import { RefusalNotice } from './RefusalNotice';

export interface UploadDialogProps {
  readonly open: boolean;
  readonly caseId: string;
  readonly onClose: () => void;
  readonly onUploaded: (document: DocumentSummary) => void;
}

const LOCAL_REFUSAL = {
  type: `Ese tipo de archivo no se admite. Sube ${ACCEPTED_TYPES_LABEL}.`,
  size: 'El archivo pasa de 25 MB, el máximo permitido. Reduce su tamaño o divídelo.',
  empty: 'El archivo está vacío.',
  missing: 'Elige el archivo que quieres subir.',
} as const;

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm';

export function UploadDialog({ open, caseId, onClose, onUploaded }: UploadDialogProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(open);
  const [file, setFile] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [localRefusal, setLocalRefusal] = useState<keyof typeof LOCAL_REFUSAL | null>(null);

  const categories = useQuery<{ items: readonly DocumentCategorySummary[] }, FailedResponse | null>({
    queryKey: ['document-categories'],
    queryFn: listDocumentCategories,
    enabled: open,
  });
  const active = (categories.data?.items ?? []).filter((c) => c.status === 'active');

  const upload = useMutation<DocumentSummary, FailedResponse | null, { file: File; categoryId: string }>({
    mutationFn: (input) => uploadDocument(caseId, input.file, input.categoryId || undefined),
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: ['documents', caseId] });
      setFile(null);
      setCategoryId('');
      onUploaded(document);
    },
    onError: (failed) => {
      if (failed?.body?.error?.code === 'catalog_entry_not_available') {
        void queryClient.invalidateQueries({ queryKey: ['document-categories'] });
      }
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    upload.reset();
    if (!file) {
      setLocalRefusal('missing');
      return;
    }
    const check = checkUpload(file);
    if (!check.ok) {
      setLocalRefusal(check.reason);
      return;
    }
    setLocalRefusal(null);
    upload.mutate({ file, categoryId });
  }

  function close() {
    setFile(null);
    setCategoryId('');
    setLocalRefusal(null);
    upload.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent {...anchor}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Subir documento</DialogTitle>
            <DialogDescription>
              PDF, imágenes, texto o archivos de Office, hasta 25 MB.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="document-file">Archivo</Label>
              <input
                id="document-file"
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setLocalRefusal(null);
                  upload.reset();
                }}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
              {file ? (
                <p className="text-sm text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="document-category">Categoría</Label>
              <select
                id="document-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Sin categoría (se archiva en “Sin clasificar”)</option>
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(c.name)}
                  </option>
                ))}
              </select>
            </div>

            {localRefusal ? (
              <p role="alert" className="text-sm text-destructive">
                {LOCAL_REFUSAL[localRefusal]}
              </p>
            ) : null}
            {upload.status === 'error' ? (
              <RefusalNotice refusal={upload.error} onRetry={() => file && upload.mutate({ file, categoryId })} />
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? 'Subiendo…' : 'Subir documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
