/** 008. The three refusals a correction or a void can meet, in the firm's words (contract §3–§4). */
import type { FailedResponse } from '@/lib/api-client';

export function noteRefusalCopy(error: FailedResponse | null, verb: 'corregir' | 'eliminar'): string | null {
  const code = error?.body?.error?.code;
  if (code === 'correction_window_closed') return `Ya pasaron las 24 horas; esta nota ya no se puede ${verb}.`;
  if (code === 'note_voided') return 'Esta nota ya fue eliminada.';
  if (error?.status === 404) return 'Esta nota ya no está disponible.';
  return null;
}
