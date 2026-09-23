/**
 * 014 T023 (US2). The firm's position catalog — its own names for its own ranks (017).
 *
 * Retired positions stay listed: they still name what people were, and retiring is how a name
 * is freed for reuse (017 research D6). Retiring is confirmed but not step-up gated; it changes
 * a label, not what anyone may do.
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
import { ErrorState } from '@/feedback/ErrorState';
import { QueryBoundary } from '@/feedback/QueryBoundary';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { can } from '@/authz/can';
import type { FailedResponse } from '@/lib/api-client';
import { useDialogAnchor } from '@/lib/use-dialog-anchor';
import { createPosition, listPositions, retirePosition } from '@/configuracion/api';
import { positionNameSchema } from '@/configuracion/schema';
import type { Position } from '@/configuracion/types';
import type { Archetype } from '@/session/types';

export interface PositionCatalogTableProps {
  readonly archetype: Archetype;
}

export function PositionCatalogTable({ archetype }: PositionCatalogTableProps): React.JSX.Element {
  const [creating, setCreating] = useState(false);
  const [retiring, setRetiring] = useState<Position | null>(null);
  const mayManage = can('directory.manage_catalog', archetype);

  const query = useQuery<readonly Position[], FailedResponse | null>({
    queryKey: ['positions'],
    queryFn: listPositions,
  });

  return (
    <div className="flex flex-col gap-3">
      {mayManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="mr-2 h-4 w-4" />
            Nuevo cargo
          </Button>
        </div>
      ) : null}

      <QueryBoundary
        query={query}
        isEmpty={(items) => items.length === 0}
        emptyGuidance="Tu despacho aún no define cargos."
      >
        {(items) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cargo</TableHead>
                <TableHead>Estado</TableHead>
                {mayManage ? <TableHead className="sr-only">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((position) => (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">{position.name}</TableCell>
                  <TableCell>
                    <Badge variant={position.status === 'active' ? 'secondary' : 'outline'}>
                      {position.status === 'active' ? 'Activo' : 'Retirado'}
                    </Badge>
                  </TableCell>
                  {mayManage ? (
                    <TableCell className="text-right">
                      {position.status === 'active' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Retirar el cargo ${position.name}`}
                          onClick={() => setRetiring(position)}
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

      {creating ? (
        <CreatePositionDialog catalog={query.data ?? []} onClose={() => setCreating(false)} />
      ) : null}
      {retiring ? <RetirePositionDialog position={retiring} onClose={() => setRetiring(null)} /> : null}
    </div>
  );
}

function CreatePositionDialog({
  catalog,
  onClose,
}: {
  catalog: readonly Position[];
  onClose: () => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation<Position, FailedResponse | null, string>({
    mutationFn: createPosition,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      onClose();
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = positionNameSchema(catalog).safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa el nombre del cargo.');
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
            <DialogTitle>Nuevo cargo</DialogTitle>
            <DialogDescription>
              El nombre con el que tu despacho identifica este puesto, por ejemplo “Asociado Senior”.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-2">
            <Label htmlFor="position-name">Nombre del cargo</Label>
            <Input
              id="position-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'position-name-error' : undefined}
            />
            {error ? (
              <p id="position-name-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {create.status === 'error' ? (
              <ErrorState refusal={classifyRefusal(create.error)} onRetry={() => create.mutate(name.trim())} />
            ) : null}
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear cargo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RetirePositionDialog({ position, onClose }: { position: Position; onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchor = useDialogAnchor(true);
  const retire = useMutation<Position, FailedResponse | null, void>({
    mutationFn: () => retirePosition(position.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      void queryClient.invalidateQueries({ queryKey: ['members'] });
      onClose();
    },
  });

  return (
    <AlertDialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <AlertDialogContent {...anchor}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Retirar el cargo {position.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Ya no podrá asignarse a nadie. Quienes lo tienen hoy lo conservan en el directorio.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {retire.status === 'error' ? (
          <ErrorState refusal={classifyRefusal(retire.error)} onRetry={() => retire.mutate()} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={retire.isPending}
            onClick={(event) => {
              event.preventDefault();
              retire.mutate();
            }}
          >
            {retire.isPending ? 'Retirando…' : 'Retirar cargo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
