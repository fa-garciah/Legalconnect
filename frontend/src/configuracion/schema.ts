/**
 * 014 T011 (US1). The invitation form's rules and the roles an issuer may grant.
 *
 * `offerableArchetypes` mirrors `backend/src/modules/invitation/archetype-rank.ts` (002/FR-021:
 * nobody grants a role broader than their own). Transcribed rather than imported — `frontend/`
 * does not depend on `backend/`'s source tree. Only SA and MP hold `invitation.issue`, so every
 * other archetype is offered nothing. Portal roles (CC, IC, CB, EL) are not offered from this
 * screen: they belong to a client's or insurer's people, whom `/configuracion` does not manage.
 */
import { z } from 'zod';
import type { Archetype } from '../session/types';

const INTERNAL_BY_RANK: readonly Archetype[] = ['SA', 'MP', 'AA', 'PL', 'CM', 'BM'];

export function offerableArchetypes(issuer: Archetype): readonly Archetype[] {
  if (issuer === 'SA') return INTERNAL_BY_RANK;
  if (issuer === 'MP') return INTERNAL_BY_RANK.filter((a) => a !== 'SA');
  return [];
}

export const inviteFormSchema = z.object({
  email: z
    .string({ error: 'Escribe el correo de la persona que invitas.' })
    .trim()
    .toLowerCase()
    .min(1, { error: 'Escribe el correo de la persona que invitas.' })
    .pipe(z.email({ error: 'Escribe un correo válido, por ejemplo nombre@despacho.mx.' })),
  targetArchetype: z.enum(['SA', 'MP', 'AA', 'PL', 'CM', 'BM'], {
    error: 'Selecciona el rol que tendrá en el despacho.',
  }),
});

export type InviteFormValues = z.infer<typeof inviteFormSchema>;

/** `017`'s column bound (`position.service.ts`, `assertPositionName`). */
const POSITION_NAME_MAX = 120;

/**
 * 014 T023 (US2). A new position's name, against the firm's current catalog.
 *
 * Mirrors `017`: trimmed, required, at most 120 characters, and unique among ACTIVE positions
 * ignoring case — a retired name may be reused (017 research D6). The server's own check is
 * authoritative; this one answers before a round trip.
 */
type Catalog = readonly { name: string; status: 'active' | 'retired' }[];

/**
 * A firm catalog entry's name: trimmed, required, bounded, unique among ACTIVE entries ignoring
 * case (a retired name may be reused). One rule for every catalog the firm maintains.
 */
function catalogNameSchema(catalog: Catalog, copy: { required: string; duplicate: string; max: number }) {
  const active = new Set(catalog.filter((p) => p.status === 'active').map((p) => p.name.trim().toLowerCase()));
  return z
    .string()
    .trim()
    .min(1, { error: copy.required })
    .max(copy.max, { error: `El nombre no puede pasar de ${copy.max} caracteres.` })
    .refine((name) => !active.has(name.toLowerCase()), { error: copy.duplicate });
}

export function positionNameSchema(catalog: Catalog) {
  return catalogNameSchema(catalog, {
    required: 'Escribe el nombre del cargo.',
    duplicate: 'Ya existe un cargo activo con ese nombre.',
    max: POSITION_NAME_MAX,
  });
}

/** 021 (US4). `007`'s bound is 200 characters (`document-category.service.ts`). */
export function documentCategoryNameSchema(catalog: Catalog) {
  return catalogNameSchema(catalog, {
    required: 'Escribe el nombre de la categoría.',
    duplicate: 'Ya existe una categoría activa con ese nombre.',
    max: 200,
  });
}
