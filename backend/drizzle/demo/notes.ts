/**
 * 008 T023 — the demo firm's notes on its open matters.
 *
 * Written only by people on the matter whose archetype writes notes (MP, AA, PL, CM — Decision 6),
 * over the six weeks before the seed day, the newest two on the busiest matters within the last few
 * hours so `/notas` shows "Corregir" on a fresh login.
 *
 * IDEMPOTENT ACROSS DAYS. Each id is keyed on (firm, the matter's date-free `slot`, the note's index on
 * it) — never on a file number or a date — exactly as 009's hours and 022's documents now are.
 *
 * THE CLOCK IS AN ARGUMENT (022/FR-017): the caller passes the seed instant.
 */
import { DEMO_PEOPLE, type DemoFirm } from './firm';
import type { DemoMatter } from './matters';
import { DEMO_SEED, intBetween, mulberry32, pick } from './rng';

export interface DemoNote {
  readonly authorSlug: string;
  readonly matterFileNumber: string;
  readonly body: string;
  /** ISO instant, never after the seed instant. */
  readonly createdAt: string;
  /** Parts for `deterministicUuid('case-note', ...idKey)`. Date-free on purpose (see header). */
  readonly idKey: readonly string[];
}

type Writer = 'MP' | 'AA' | 'PL' | 'CM';

const BODIES: Readonly<Record<Writer, readonly string[]>> = {
  MP: [
    'Hablé con la dirección jurídica del cliente: prefieren explorar un convenio antes de la audiencia.',
    'Revisar con el equipo la estrategia de pruebas antes del viernes.',
    'El cliente autorizó el presupuesto de peritaje.',
  ],
  AA: [
    'El juez difirió la audiencia; el acuerdo se publicará en el boletín de mañana.',
    'La contraparte ofreció la pericial en contabilidad; hay que preparar las repreguntas.',
    'Conviene citar la jurisprudencia de la Segunda Sala sobre la carga de la prueba.',
    'El cliente confirmó que tiene los originales de las facturas; pedirlos para el cotejo.',
    'Pendiente: revisar el término para interponer el recurso de apelación.',
  ],
  PL: [
    'El actuario pidió copia certificada de la demanda.',
    'Se presentó el escrito en oficialía de partes; el acuse está en Documentos.',
    'Faltan dos anexos del cliente para integrar el expediente.',
  ],
  CM: [
    'Se agendó la junta con el perito para la próxima semana.',
    'Recordatorio: el plazo para desahogar la vista vence el jueves.',
  ],
};

const DAYS_BACK = 42;
const MAX_PER_MATTER = 4;

/** Every note index a matter can hold — the key space `seed-demo.ts` voids stale demo notes within. */
export const DEMO_NOTE_KEYS_PER_MATTER = MAX_PER_MATTER;

function archetypeIn(firm: DemoFirm, slug: string): string | undefined {
  const person = DEMO_PEOPLE.find((p) => p.slug === slug);
  if (!person) return undefined;
  if (!firm.sparse) return person.archetype;
  return person.alsoAt?.firmRfc === firm.rfc ? person.alsoAt.archetype : undefined;
}

const isWriter = (archetype: string | undefined): archetype is Writer =>
  archetype === 'MP' || archetype === 'AA' || archetype === 'PL' || archetype === 'CM';

export function demoNotes(firm: DemoFirm, matters: readonly DemoMatter[], asOf: Date): readonly DemoNote[] {
  const next = mulberry32(DEMO_SEED + 808 + (firm.sparse ? 7 : 0));
  const notes: DemoNote[] = [];
  let fresh = 0;

  for (const matter of matters) {
    // Drawn for every matter, open or not, so one matter's state never shifts the stream for the
    // next — which is what keeps ids stable across re-seeds.
    const count = intBetween(next, 1, MAX_PER_MATTER);
    const draws = Array.from({ length: count }, () => ({ who: next(), what: next(), back: next(), hour: next() }));
    if (matter.closedOn !== null) continue;

    const writers = [matter.leadSlug, ...matter.collaboratorSlugs].filter(
      (slug): slug is string => slug !== null && isWriter(archetypeIn(firm, slug)),
    );
    if (writers.length === 0) continue;

    const opened = Date.parse(`${matter.openedOn}T15:00:00Z`);
    for (const [i, draw] of draws.entries()) {
      const slug = writers[Math.floor(draw.who * writers.length)]!;
      const archetype = archetypeIn(firm, slug) as Writer;
      const body = pick(() => draw.what, BODIES[archetype]);

      // The first note of the first two staffed matters: an hour or two ago, still correctable.
      const recent = i === 0 && fresh < 2;
      const hoursBack = recent ? 1 + fresh : 24 + Math.floor(draw.back * (DAYS_BACK - 1) * 24) + Math.floor(draw.hour * 8);
      if (recent) fresh += 1;
      const at = Math.max(asOf.getTime() - hoursBack * 3_600_000, opened);
      if (at > asOf.getTime()) continue;

      notes.push({
        authorSlug: slug,
        matterFileNumber: matter.fileNumber,
        body,
        createdAt: new Date(at).toISOString(),
        idKey: [firm.rfc, matter.slot, `n${i}`],
      });
    }
  }
  return notes;
}
