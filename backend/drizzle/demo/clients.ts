/**
 * T016 — the firm's clients. 022/FR-005.
 *
 * Twenty-five invented parties for the full firm, four for the sparse one. Eighteen
 * organisations and seven natural persons, because a practice that represents only companies
 * reads as a fixture and because `client.kind` drives a visible distinction on `/clientes`
 * (`020`/FR-005 gives the person/organisation contrast its own accent colour).
 *
 * NO REAL COMPANY AND NO REAL PERSON. The static mockups this product was designed against
 * used Banorte, Cemex, Bimbo and IMPI; `demo-clients.test.ts` asserts against exactly those.
 *
 * RFCs are GENERATED, not invented per row, so the shape constraint on `client` is satisfied
 * by construction rather than by twenty-five lucky guesses: three letters for a moral person
 * and four for a natural one, six date digits, three of homoclave. They are not valid
 * taxpayer identifiers and do not resolve to anybody.
 */
import { createHash } from 'node:crypto';
import type { DemoFirm } from './firm';

export interface DemoClient {
  readonly legalName: string;
  readonly kind: 'organization' | 'person';
  /** Nullable by requirement — fiscal completeness is a billing concern (`schema.ts:340`). */
  readonly rfc: string | null;
}

const MENDEZ_ORGANIZATIONS = [
  'Grupo Industrial Varela, S.A. de C.V.',
  'Constructora Ríos del Norte, S.A. de C.V.',
  'Comercializadora Aguilar Hermanos, S. de R.L.',
  'Transportes Peñaloza, S.A. de C.V.',
  'Editorial Cumbres del Sur, S.A.',
  'Agroalimentos Quiroga, S.P.R. de R.L.',
  'Inmobiliaria Sierra Azul, S.A. de C.V.',
  'Textiles La Merced, S.A. de C.V.',
  'Servicios Médicos Valdivia, S.C.',
  'Tecnologías Núcleo Sur, S.A.P.I. de C.V.',
  'Refaccionaria Arteaga, S.A. de C.V.',
  'Hotelera Playa Cristal, S.A. de C.V.',
  'Distribuidora Lomas Verdes, S.A. de C.V.',
  'Panificadora Doña Eulalia, S. de R.L.',
  'Metalúrgica Puente Grande, S.A. de C.V.',
  'Consultoría Fiscal Berrones, S.C.',
  'Vigilancia Privada Halcón Gris, S.A. de C.V.',
  'Papelera del Bajío, S.A. de C.V.',
] as const;

const MENDEZ_PERSONS = [
  'María Fernanda Osorio Lugo',
  'Ricardo Beltrán Iñiguez',
  'Norma Alicia Cepeda Rivas',
  'Óscar Iván Maldonado Tapia',
  'Gabriela Sotomayor Ruelas',
  'Héctor Manuel Zamudio Pardo',
  'Lorena Guadalupe Ávalos Ceja',
] as const;

const RIOS_CLIENTS = [
  { name: 'Ferretería Los Encinos, S.A. de C.V.', kind: 'organization' as const },
  { name: 'Autotransportes Caballero, S. de R.L.', kind: 'organization' as const },
  { name: 'Ana Sofía Mercado Urbina', kind: 'person' as const },
  { name: 'Joaquín Esparza Villagrán', kind: 'person' as const },
];

const RFC_LETTERS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
const HOMOCLAVE = 'ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789';

/**
 * A well-formed but meaningless RFC, derived from the name so it is stable across runs.
 *
 * Deliberately built from a hash rather than from the name's real initials: a generated
 * identifier that looked derivable from a person's name would invite somebody to treat it as
 * real. The only contract it honours is `tenant`/`client`'s shape check.
 */
function rfcFor(name: string, letters: 3 | 4): string {
  const digest = createHash('sha256').update(`demo-rfc-${name}`).digest();
  let prefix = '';
  for (let i = 0; i < letters; i += 1) {
    prefix += RFC_LETTERS[(digest[i] as number) % RFC_LETTERS.length];
  }
  // A TWO-DIGIT year, wrapped: 80–99 reads as 1980–1999 and 00–19 as 2000–2019. Without the
  // `% 100` the sum reaches 119 and the RFC grows a seventh digit, which the shape check
  // refuses — the first version of this function did exactly that.
  const year = (80 + ((digest[8] as number) % 40)) % 100;
  const month = 1 + ((digest[9] as number) % 12);
  const day = 1 + ((digest[10] as number) % 28);
  const date =
    String(year).padStart(2, '0') +
    String(month).padStart(2, '0') +
    String(day).padStart(2, '0');
  let tail = '';
  for (let i = 0; i < 3; i += 1) {
    tail += HOMOCLAVE[(digest[11 + i] as number) % HOMOCLAVE.length];
  }
  return prefix + date + tail;
}

export function demoClients(firm: DemoFirm): readonly DemoClient[] {
  if (firm.sparse) {
    return RIOS_CLIENTS.map((c, index) => ({
      legalName: c.name,
      kind: c.kind,
      // One of the two natural persons deliberately has no RFC.
      rfc: c.kind === 'organization' ? rfcFor(c.name, 3) : index === 2 ? rfcFor(c.name, 4) : null,
    }));
  }

  return [
    ...MENDEZ_ORGANIZATIONS.map((name) => ({
      legalName: name,
      kind: 'organization' as const,
      rfc: rfcFor(name, 3),
    })),
    ...MENDEZ_PERSONS.map((name, index) => ({
      legalName: name,
      kind: 'person' as const,
      // Two of the seven have not handed over fiscal data yet, which is the realistic state
      // and the only way the nullable column is ever exercised by a fixture.
      rfc: index % 4 === 3 ? null : rfcFor(name, 4),
    })),
  ];
}
