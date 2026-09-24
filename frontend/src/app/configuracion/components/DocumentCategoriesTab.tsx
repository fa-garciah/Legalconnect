/**
 * 021 T027 (US4, Decision 6). The firm's document categories — its own names for kinds of
 * documents (007). Same shape as `014`'s position catalog, next to which it sits.
 *
 * Retired categories stay listed: documents filed under one keep it (007/FR-012). Retiring is
 * confirmed but not step-up gated; it changes what is offered, not what anyone may do.
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { can } from '@/authz/can';
import {
  createDocumentCategory,
  listDocumentCategories,
  retireDocumentCategory,
  type DocumentCategorySummary,
} from '@/app/documents/api';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { documentCategoryNameSchema } from '@/configuracion/schema';
import { categoryLabel } from '@/documents/format';
import type { Archetype } from '@/session/types';
import { RefusalNotice } from '@/app/expedientes/[caseId]/documentos/RefusalNotice';

export function DocumentCategoriesTab({ archetype }: { readonly archetype: Archetype }): React.JSX.Element {
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<DocumentCategorySummary | null>(null);
  const mayManage = can('document.manage_catalog', archetype);

  const query = useQuery<{ items: readonly DocumentCategorySummary[] }, FailedResponse | null>({
    queryKey: ['document-categories'],
    queryFn: listDocumentCategories,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-heading font-semibold">Categorías de documentos</h2>
        {mayManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Nueva categoría
          </Button>
        ) : null}
      </div>

      <QueryBoundary
        query={query}
        isEmpty={(data) => data.items.length === 0}
        emptyGuidance="Tu despacho aún no define categorías de documentos."
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                {mayManage ? <TableHead className="sr-only">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{categoryLabel(category.name)}</TableCell>
                  <TableCell>
                    <Badge variant={category.status === 'active' ? 'secondary' : 'outline'}>
                      {category.status === 'active' ? 'Activa' : 'Retirada'}
                    </Badge>
                  </TableCell>
                  {mayManage ? (
                    <TableCell className="text-right">
                      {category.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Retirar la categoría ${categoryLabel(category.name)}`}
                          onClick={() => setRetiring(category)}
                        >
                          Retirar
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryBoundary>

      {creating ? <CreateDialog catalog={query.data?.items ?? []} onClose={() => setCreating(false)} /> : null}
      {retiring ? <RetireDialog category={retiring} onClose={() => setRetiring(null)} /> : null}
    </div>
  );
}

function CreateDialog({
  catalog,
  onClose,
}: {
  catalog: readonly DocumentCategorySummary[];
  onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation<DocumentCategorySummary, FailedResponse | null, string>({
    mutationFn: createDocumentCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-categories'] });
      onClose();
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = documentCategoryNameSchema(catalog).safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa el nombre de la categoría.');
      return;
    }
    setError(null);
    create.mutate(parsed.data);
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent {...anchor}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
            <DialogDescription>
              Cómo tu despacho agrupa sus documentos, por ejemplo “Poderes notariales”.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-2">
            <Label htmlFor="document-category-name">Nombre de la categoría</Label>
            <Input
              id="document-category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'document-category-name-error' : undefined}
            />
            {error ? (
              <p id="document-category-name-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {create.status === 'error' ? <RefusalNotice refusal={create.error} /> : null}
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear categoría'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetireDialog({
  category,
  onClose,
}: {
  category: DocumentCategorySummary;
  onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const retire = useMutation<DocumentCategorySummary, FailedResponse | null, void>({
    mutationFn: () => retireDocumentCategory(category.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['document-categories'] });
      onClose();
    },
  });

  return (
    <AlertDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar la categoría {categoryLabel(category.name)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Ya no se ofrecerá al subir o reclasificar. Los documentos que la tienen la conservan,
            marcada como retirada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {retire.status === 'error' ? <RefusalNotice refusal={retire.error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={retire.isPending}
            onClick={(event) => {
              event.preventDefault();
              retire.mutate();
            }}
          >
            {retire.isPending ? 'Retirando…' : 'Retirar categoría'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
