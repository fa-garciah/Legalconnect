/**
 * 014 T025 (US3). The read-only permissions matrix, derived from the frontend's mirror.
 *
 * Derived rather than written out a second time: `capability-matrix.ts` is kept faithful to the
 * specs by `capability-matrix-sync.test.ts`, so a table built from it inherits that check. A
 * hand-written table here would be a third copy that nothing compares.
 *
 * Grouped by the capability id's domain prefix. A new mirrored capability with an unknown
 * prefix, or without a Spanish label, fails `matrix-view-model.test.ts` rather than rendering as
 * a raw id.
 */
import { CAPABILITY_MATRIX } from '../authz/capability-matrix';
import type { Archetype } from '../session/types';

export const MATRIX_COLUMNS: readonly Archetype[] = ['SA', 'MP', 'AA', 'PL', 'CM', 'BM'];

const GROUPS: readonly { readonly prefix: readonly string[]; readonly title: string }[] = [
  { prefix: ['invitation', 'membership'], title: 'Usuarios e invitaciones' },
  { prefix: ['directory'], title: 'Directorio y cargos' },
  { prefix: ['client'], title: 'Clientes' },
  { prefix: ['case'], title: 'Expedientes' },
  { prefix: ['document'], title: 'Documentos' },
  { prefix: ['calendar'], title: 'Calendario' },
];

const LABELS: Readonly<Record<string, string>> = {
  'invitation.issue': 'Invitar a una persona',
  'invitation.revoke': 'Revocar una invitación',
  'invitation.read_pending': 'Ver invitaciones pendientes',
  'membership.read_tenant': 'Ver miembros y su correo',
  'membership.revoke': 'Desactivar a un miembro',
  'membership.change_archetype': 'Cambiar el rol de un miembro',
  'directory.read': 'Consultar el directorio',
  'directory.manage_catalog': 'Crear y retirar cargos',
  'directory.assign_position': 'Asignar cargos',
  'client.read': 'Consultar clientes',
  'client.create': 'Registrar clientes',
  'client.update': 'Editar clientes',
  'client.deactivate': 'Retirar y restaurar clientes',
  'case.read_list': 'Ver la lista de expedientes',
  'case.read': 'Abrir un expediente',
  'case.create': 'Abrir expedientes nuevos',
  'case.change_status': 'Cambiar el estado de un expediente',
  'case.read_catalog': 'Consultar catálogos de expedientes',
  'document.upload': 'Subir documentos a un expediente',
  'document.read': 'Ver y previsualizar documentos',
  'document.download': 'Descargar documentos',
  'document.change_category': 'Cambiar la categoría de un documento',
  'document.withdraw': 'Retirar documentos',
  'document.restore': 'Restaurar documentos retirados',
  'document.read_catalog': 'Consultar categorías de documentos',
  'document.manage_catalog': 'Crear y retirar categorías de documentos',
  'calendar.read': 'Ver el calendario y sus recordatorios',
  'calendar.manage': 'Crear, cambiar y cancelar eventos',
};

export interface MatrixRow {
  readonly capability: string;
  readonly label: string;
  readonly allowed: Readonly<Record<Archetype, boolean>>;
}

export interface MatrixGroup {
  readonly title: string;
  readonly rows: readonly MatrixRow[];
}

export function buildMatrixViewModel(): readonly MatrixGroup[] {
  const ids = Object.keys(CAPABILITY_MATRIX);
  return GROUPS.map((group) => ({
    title: group.title,
    rows: ids
      .filter((id) => group.prefix.includes(id.split('.')[0]!))
      .map((id) => {
        const subjects = CAPABILITY_MATRIX[id]!;
        const allowed = Object.fromEntries(
          MATRIX_COLUMNS.map((a) => [a, subjects.has(a)]),
        ) as Record<Archetype, boolean>;
        return { capability: id, label: LABELS[id] ?? id, allowed };
      }),
  })).filter((group) => group.rows.length > 0);
}
