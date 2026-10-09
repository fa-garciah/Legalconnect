/**
 * 008 FR-002 — a note's body: 1 to 5000 characters once trimmed. The same bounds as the server's
 * `note-input.ts`, checked here so a person sees the reason before anything is sent.
 */
export const MAX_NOTE_LENGTH = 5000;

export function noteBodyError(raw: string): string | null {
  const body = raw.trim();
  if (body.length === 0) return 'Escribe la nota.';
  if (body.length > MAX_NOTE_LENGTH) return `La nota no puede pasar de ${MAX_NOTE_LENGTH} caracteres.`;
  return null;
}
