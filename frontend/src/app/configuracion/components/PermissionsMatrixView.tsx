/**
 * 014 T027 (US3, Decision 1). What each role may do — read-only.
 *
 * Nothing here is a control. Roles are fixed by the product (004 Decision 4); a firm decides who
 * holds each one, on the other two tabs. Each cell says "Permitido" / "No permitido" in words
 * (visually hidden next to the mark), so the table reads correctly without colour or icons.
 */
import { Check, Minus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ARCHETYPE_LABEL } from '@/shell/archetype-labels';
import { MATRIX_COLUMNS, buildMatrixViewModel } from '@/configuracion/matrix-view-model';

export function PermissionsMatrixView(): React.JSX.Element {
  const groups = buildMatrixViewModel();

  return (
    <div className="flex flex-col gap-6">
      <div role="note" className="rounded-md border border-border bg-muted p-4 text-sm">
        Los roles los define LegalConnect y son iguales en todos los despachos. Tu despacho decide
        quién tiene cada rol desde las otras dos pestañas; lo que cada rol puede hacer no se
        modifica aquí.
      </div>

      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`matriz-${group.title}`} className="flex flex-col gap-2">
          <h3 id={`matriz-${group.title}`} className="font-display text-heading font-semibold">
            {group.title}
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Acción</TableHead>
                  {MATRIX_COLUMNS.map((archetype) => (
                    <TableHead key={archetype} scope="col" className="text-center">
                      {ARCHETYPE_LABEL[archetype]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => (
                  <TableRow key={row.capability}>
                    <TableHead scope="row" className="font-normal text-foreground">
                      {row.label}
                    </TableHead>
                    {MATRIX_COLUMNS.map((archetype) => (
                      <TableCell key={archetype} className="text-center">
                        {row.allowed[archetype] ? (
                          <Check aria-hidden className="mx-auto h-4 w-4 text-primary" />
                        ) : (
                          <Minus aria-hidden className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{row.allowed[archetype] ? 'Permitido' : 'No permitido'}</span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
