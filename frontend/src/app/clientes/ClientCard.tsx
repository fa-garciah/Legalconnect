/**
 * One client, as a card.
 *
 * **What is on it, and what is not.** The layout follows the product design: a type icon,
 * the name, a subtitle, a badge top-right, then a labelled detail block, then the row's
 * actions. The design's detail block shows email, telephone and the responsible attorney,
 * and its badge shows a case count.
 *
 * `006` stores none of those. `GET /tenant/clients` returns exactly
 * `{ id, kind, legalName, rfc, status }` — the prototype's contact details are hardcoded
 * sample data with nothing behind them. Rather than render four empty rows, or invent a
 * client-side join that would need a capability `BM` does not hold, the card shows what the
 * record actually contains: type, RFC, and status. The missing fields need a `006` change —
 * columns, a migration and an API change — not a frontend one.
 *
 * The badge therefore carries **status** rather than a case count, which is the more useful
 * of the two here anyway: a withdrawn client still appears in the directory (`006` does not
 * hide them) and needs to be tellable apart from an active one at a glance.
 */
'use client';

import { Building2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Client } from '@/clients/types';

/** The wire's vocabulary translated once, here, so no card does it inline. */
const KIND_LABEL = { organization: 'Organización', person: 'Persona Física' } as const;

/** `inactive` is the wire's word; *retirado* is the domain's, and the only one a reader sees. */
const STATUS_LABEL = { active: 'Activo', inactive: 'Retirado' } as const;

export interface ClientCardProps {
  readonly client: Client;
  /** Absent when the caller does not hold `client.update`. */
  readonly onEdit?: (client: Client) => void;
  /** Absent when the caller does not hold `client.deactivate`. */
  readonly onChangeStatus?: (client: Client) => void;
}

export function ClientCard({ client, onEdit, onChangeStatus }: ClientCardProps): React.JSX.Element {
  const isOrganization = client.kind === 'organization';
  const isActive = client.status === 'active';
  const Icon = isOrganization ? Building2 : User;

  return (
    <Card
      // `article` so each card is one landmark a screen reader can jump between, and named
      // by its own heading rather than by "article 7 of 12".
      role="article"
      aria-label={client.legalName}
      className={cn('h-full transition-shadow hover:shadow-md', !isActive && 'opacity-75')}
    >
      <CardContent className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
                // Organisation and person read differently at a glance. Both are theme
                // tokens with a tint, never colour literals (design-system.md §3.4).
                isOrganization ? 'bg-accent text-accent-foreground' : 'bg-secondary text-foreground',
              )}
            >
              <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-medium">{client.legalName}</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{KIND_LABEL[client.kind]}</p>
            </div>
          </div>

          <Badge variant={isActive ? 'secondary' : 'outline'} className="shrink-0">
            {STATUS_LABEL[client.status]}
          </Badge>
        </div>

        {/*
         * One row, because there is one field left to show.
         *
         * The design's detail block has three — email, telephone, responsible attorney —
         * and `006` stores none of them. Type is already said twice above (the icon and the
         * subtitle) and status is on the badge, so repeating either here would pad the card
         * with information the reader already has rather than fill the gap.
         */}
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">RFC:</dt>
            {/*
             * A dash, not an empty value. `rfc` is null when it was never collected, and a
             * blank reads as a card that failed to draw rather than as a fact about the
             * record (018/FR-005).
             */}
            <dd className="min-w-0 truncate">{client.rfc ?? '—'}</dd>
          </div>
        </dl>

        {onEdit || onChangeStatus ? (
          <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
            {onEdit ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(client)}
                // Names the client, so a screen-reader user hears which card's control this
                // is rather than the fifteenth "Editar" on the page.
                aria-label={`Editar ${client.legalName}`}
              >
                Editar
              </Button>
            ) : null}
            {onChangeStatus ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChangeStatus(client)}
                aria-label={`${isActive ? 'Retirar' : 'Restaurar'} ${client.legalName}`}
              >
                {isActive ? 'Retirar' : 'Restaurar'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
