/**
 * 023 — uploading from the firm-wide page. FR-012, Decision 7.
 *
 * THE MATTER COMES FIRST, and that is a requirement rather than a layout choice.
 * `POST /tenant/cases/:caseId/documents` cannot be called without a case, and
 * `document.upload` is `assigned`-scoped — so the matter must be chosen *and* must be one this
 * person can reach. The selector is fed by the already-`assigned`-scoped case list, which
 * means an unreachable matter is never offered rather than offered and then refused.
 *
 * Once a matter is chosen this hands over to `021`'s `UploadDialog` untouched: the file-type
 * check, the 25 MB cap, the category selector and every Spanish refusal are already right
 * there, and a second upload form would be a second place for them to drift.
 */
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UploadDialog } from '@/app/expedientes/[caseId]/documentos/UploadDialog';

export interface UploadFromFirmCase {
  readonly id: string;
  readonly fileNumber: string;
}

export interface UploadFromFirmDialogProps {
  readonly open: boolean;
  readonly cases: readonly UploadFromFirmCase[];
  readonly onClose: () => void;
  readonly onUploaded: () => void;
}

export function UploadFromFirmDialog({
  open,
  cases,
  onClose,
  onUploaded,
}: UploadFromFirmDialogProps): React.JSX.Element | null {
  const [caseId, setCaseId] = useState('');

  /*
   * Reopening starts from the matter step again — an upload targets one matter, and carrying
   * the last one over is how a document lands on the wrong file.
   *
   * That is achieved by the PARENT not rendering this component while it is closed, so the
   * state is gone rather than reset. The first version kept it mounted and cleared `caseId`
   * in an effect, which lint refuses (`react-hooks/set-state-in-effect`) and rightly: an
   * effect that only undoes state is a sign the state should not have survived.
   */
  if (!open) return null;

  // Step two IS `021`'s dialog. Rendered instead of the picker rather than beneath it, so
  // there is one dialog on screen at a time.
  if (caseId) {
    return (
      <UploadDialog
        open
        caseId={caseId}
        onClose={() => {
          setCaseId('');
          onClose();
        }}
        onUploaded={() => {
          setCaseId('');
          onUploaded();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>
            Elige primero el expediente al que pertenece el documento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="subir-expediente">Expediente</Label>
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger id="subir-expediente" aria-label="Expediente">
              <SelectValue placeholder="Selecciona un expediente" />
            </SelectTrigger>
            <SelectContent>
              {cases.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.fileNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cases.length === 0 ? (
            <p className="text-small text-muted-foreground">
              No tienes expedientes asignados a los que puedas subir documentos.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
