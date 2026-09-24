/**
 * 021 T025 (US3, 007 T047). Re-filing a document under another category — row 39, MP/CM/SA.
 *
 * Only ACTIVE categories other than the current one are offered. A `422` means a colleague retired
 * the chosen one meanwhile: the dialog says so and re-reads the catalog.
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
import { can } from '@/authz/can';
import {
  changeDocumentCategory,
  listDocumentCategories,
  type CategoryChangeResult,
  type DocumentCategorySummary,
  type DocumentSummary,
} from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { categoryLabel } from '@/documents/format';
import type { Archetype } from '@/session/types';
import { RefusalNotice } from './RefusalNotice';

export interface ChangeCategoryControlProps {
  readonly archetype: Archetype;
  readonly caseId: string;
  readonly document: DocumentSummary;
}

export function ChangeCategoryControl({ archetype, caseId, document }: ChangeCategoryControlProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!can('document.change_category', archetype)) return null;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Cambiar categoría de ${document.originalFilename}`}
        onClick={() => setOpen(true)}
      >
        Cambiar categoría
      </Button>
      {open ? <ChangeCategoryDialog caseId={caseId} document={document} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm';

function ChangeCategoryDialog({
  caseId,
  document,
  onClose,
}: {
  caseId: string;
  document: DocumentSummary;
  onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const [chosen, setChosen] = useState('');

  const categories = useQuery<{ items: readonly DocumentCategorySummary[] }, FailedResponse | null>({
    queryKey: ['document-categories'],
    queryFn: listDocumentCategories,
  });
  const options = (categories.data?.items ?? []).filter(
    (c) => c.status === 'active' && c.id !== document.categoryId,
  );

  const save = useMutation<CategoryChangeResult, FailedResponse | null, string>({
    mutationFn: (categoryId) => changeDocumentCategory(caseId, document.id, categoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', caseId] });
      onClose();
    },
    onError: (failed) => {
      if (failed?.body?.error?.code === 'catalog_entry_not_available') {
        setChosen('');
        void queryClient.invalidateQueries({ queryKey: ['document-categories'] });
      }
    },
  });

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent {...anchor}>
        <DialogHeader>
          <DialogTitle>Cambiar categoría</DialogTitle>
          <DialogDescription>
            {document.originalFilename} — hoy en “{categoryLabel(document.categoryName)}”.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={`category-${document.id}`}>Nueva categoría</Label>
          <select
            id={`category-${document.id}`}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Elige una categoría</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c.name)}
              </option>
            ))}
          </select>
        </div>

        {save.status === 'error' ? <RefusalNotice refusal={save.error} /> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={!chosen || save.isPending} onClick={() => save.mutate(chosen)}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
