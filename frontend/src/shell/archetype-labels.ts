/**
 * Spanish role names, so nobody reading Spanish is shown `MP`.
 *
 * Moved out of `Sidebar.tsx` when the firm picker became its second reader: two copies of
 * this table is how one of them ends up saying "Socio" and the other "Socia".
 */
import type { Archetype } from '../session/types';

export const ARCHETYPE_LABEL: Readonly<Record<Archetype, string>> = {
  MP: 'Socio',
  AA: 'Abogado asociado',
  PL: 'Pasante',
  CM: 'Gestor de casos',
  // Was "Administración", two letters from SA's "Administrador"; a real invitation went out
  // with the wrong one (2026-09-25). Named for what the role does.
  BM: 'Facturación y cobranza',
  SA: 'Administrador',
  CC: 'Contacto de cliente',
  IC: 'Contacto de aseguradora',
  CB: 'Corredor',
  EL: 'Perito',
};
