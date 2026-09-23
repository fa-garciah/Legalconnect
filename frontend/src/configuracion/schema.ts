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
export function positionNameSchema(catalog: readonly { name: string; status: 'active' | 'retired' }[]) {
  const active = new Set(
    catalog.filter((p) => p.status === 'active').map((p) => p.name.trim().toLowerCase()),
  );
  return z
    .string()
    .trim()
    .min(1, { error: 'Escribe el nombre del cargo.' })
    .max(POSITION_NAME_MAX, { error: `El nombre no puede pasar de ${POSITION_NAME_MAX} caracteres.` })
    .refine((name) => !active.has(name.toLowerCase()), { error: 'Ya existe un cargo activo con ese nombre.' });
}
