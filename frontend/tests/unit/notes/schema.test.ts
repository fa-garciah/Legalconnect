/**
 * 008 T017 — the note body's bounds (FR-002), checked here so a person sees the reason before
 * anything is sent. The same bounds as the server's `note-input.ts`.
 */
import { describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH, noteBodyError } from '@/notes/schema';

describe('noteBodyError', () => {
  it('accepts text of 1 to 5000 characters once trimmed', () => {
    expect(noteBodyError('El juez difirió la audiencia')).toBeNull();
    expect(noteBodyError(`  ${'x'.repeat(MAX_NOTE_LENGTH)}  `)).toBeNull();
  });

  it('refuses a blank note in Spanish', () => {
    expect(noteBodyError('   ')).toBe('Escribe la nota.');
  });

  it('refuses a note over 5000 characters in Spanish', () => {
    expect(MAX_NOTE_LENGTH).toBe(5000);
    expect(noteBodyError('x'.repeat(5001))).toBe('La nota no puede pasar de 5000 caracteres.');
  });
});
