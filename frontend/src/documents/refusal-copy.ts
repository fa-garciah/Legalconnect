/**
 * 021 T015 (FR-018). Spanish copy for the refusals the document screens can meet.
 *
 * `007`'s messages are English ("This file type is not allowed.") and are never rendered. A code
 * with its own sentence here gets it; everything else — permission, plan limit, unreachable case,
 * network — goes through `016a`'s classifier, which the caller renders with `ErrorState`.
 */
import type { FailedResponse } from '@/lib/api-client';
import { ACCEPTED_TYPES_LABEL } from './upload-rules';

const BY_CODE: Readonly<Record<string, string>> = {
  file_too_large: 'El archivo pasa de 25 MB, el máximo permitido. Reduce su tamaño o divídelo.',
  validation_failed: `Ese tipo de archivo no se admite. Sube ${ACCEPTED_TYPES_LABEL}.`,
  catalog_entry_not_available: 'Esa categoría ya no está disponible. Elige otra.',
  catalog_entry_already_exists: 'Ya existe una categoría activa con ese nombre.',
  already_retired: 'Esa categoría ya estaba retirada.',
  already_withdrawn: 'Otra persona ya retiró este documento.',
  not_withdrawn: 'Otra persona ya restauró este documento.',
};

/** The sentence for this refusal, or `null` when `016a`'s classifier should render it. */
export function documentRefusalCopy(refusal: FailedResponse | null | undefined): string | null {
  const code = refusal?.body?.error?.code;
  return code ? (BY_CODE[code] ?? null) : null;
}

/** The two refusals after which the screen re-reads, because a colleague changed the record. */
export function isStaleRecord(refusal: FailedResponse | null | undefined): boolean {
  const code = refusal?.body?.error?.code;
  return code === 'already_withdrawn' || code === 'not_withdrawn' || code === 'catalog_entry_not_available';
}
