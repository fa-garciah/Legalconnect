/**
 * `npm run db:seed:demo` — the demo firm. 022-demo-firm-seed.
 *
 * WHY THIS EXISTS. `drizzle/seed.ts` writes identities with no `identity_credential` and no
 * `identity_factor`, so **no seeded person can sign in**; `scripts/demo-invitation.ts` says so
 * in its own header, and on 2026-09-25 getting one person signed in on a developer's machine
 * required hand-writing those rows through a throwaway script. This command replaces that
 * with something repeatable: two fictional firms whose people authenticate through the real
 * ceremony, and enough clients, matters, documents and events for `015`'s dashboards and
 * `023`'s document list to be judged rather than guessed at.
 *
 * WHY IT IS NOT PART OF `db:seed` (Decision 1). `db:seed` is the fixture set the isolation
 * suite reads: `no-context.test.ts` sweeps every registered tenant-scoped table and needs
 * each one non-empty while a tenant is active, which is what makes its "zero rows after
 * release" assertion a real regression test. Folding ~350 demo rows and 130 objects into it
 * would put demo volume under a security suite and make a failure there ambiguous.
 *
 * WHERE IT MAY RUN. `demo/guard.ts`, before any connection is opened. Two independent checks,
 * no override. This command writes known credentials for known people.
 *
 * WHICH CONNECTION, AND WHY. `DATABASE_URL_PLATFORM` for `plan` and `tenant`, exactly as
 * `seed.ts` does — provisioning is a platform operation and FORCE ROW LEVEL SECURITY makes
 * the owner subject to policies it has none of. `DATABASE_URL_MIGRATION` for everything else,
 * the standing `seedIdentitiesAndMemberships` already holds: `lc_app` holds no INSERT on
 * `identity` or `membership` and no privilege at all on the three auth tables, which is the
 * point of those grants. This is fixture setup, not a simulated user journey.
 *
 * IDEMPOTENT (FR-014). Every insert has a conflict target on a real natural key, and every id
 * this command chooses is derived (`demo/deterministic-id.ts`) rather than generated — so a
 * second run writes no row and, crucially, no second object into a store that has no
 * user-facing delete.
 */
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnvFile } from './load-env';
import { assertLocalDemoTarget } from './demo/guard';
import {
  DEMO_CATEGORIES_EXTRA,
  DEMO_FIRMS,
  DEMO_PASSWORD,
  DEMO_PEOPLE,
  DEMO_POSITIONS_EXTRA,
  backupCodesFor,
  totpSecretFor,
  type DemoFirm,
} from './demo/firm';
import { demoClients } from './demo/clients';
import { demoMatters } from './demo/matters';
import { demoDocuments } from './demo/documents';
import { demoCalendarEvents } from './demo/calendar';
import { demoTimeEntries, demoTimeEntryKeySpace } from './demo/time-entries';
import { deterministicUuid } from './demo/deterministic-id';
import { renderCredentialTable } from './demo/report';
import { hashCredential, hashHighEntropy } from '../src/common/auth/argon2';
import { resolveKeyProvider } from '../src/common/auth/key-provider';
import { DEFAULT_POSITION_CATALOG } from '../src/modules/directory/position-catalog.seed';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../src/modules/documents/categories/document-category.seed';
import {
  DEFAULT_CASE_STATUSES,
  DEFAULT_MATTER_TYPES,
} from '../src/modules/case-core/catalogs/case-catalog.seed';
import { objectStoreConfigFromEnv } from '../src/common/storage/object-store/object-store.config';
import { S3ObjectStore } from '../src/common/storage/object-store/s3-object-store';
import { buildObjectKey } from '../src/common/storage/object-store/object-store.port';

const PLANS_USED = [
  { code: 'esencial', name: 'Esencial', limits: { users: 10, storageBytes: 10 * 2 ** 30, monthlyCfdi: 50 } },
  { code: 'profesional', name: 'Profesional', limits: { users: 25, storageBytes: 100 * 2 ** 30, monthlyCfdi: 250 } },
] as const;

/**
 * The day the demo firm is seeded as of. One value, passed everywhere (FR-017).
 *
 * `DEMO_SEED_AS_OF` (`YYYY-MM-DD`) simulates another day. It exists for `demo-seed.test.ts`, which
 * re-seeds as of a later day to prove a re-run on a different day adds no row; a malformed value
 * is refused rather than silently read as today.
 */
const AS_OF = ((): Date => {
  const raw = process.env.DEMO_SEED_AS_OF;
  if (!raw) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T12:00:00Z`))) {
    throw new Error(`DEMO_SEED_AS_OF debe ser una fecha AAAA-MM-DD; se recibió "${raw}".`);
  }
  return new Date(`${raw}T12:00:00Z`);
})();

interface WrittenFirm {
  readonly firm: DemoFirm;
  readonly tenantId: string;
  /** slug → membership id, for this firm only. */
  readonly memberships: ReadonlyMap<string, string>;
  /** file number → case id. */
  readonly cases: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, string>;
}

async function main(): Promise<void> {
  loadEnvFile(join(__dirname, '..', '.env'));

  // BEFORE any connection is opened, so a refusal cannot have written anything.
  assertLocalDemoTarget();

  const platform = new Client({ connectionString: process.env.DATABASE_URL_PLATFORM });
  const migration = new Client({ connectionString: process.env.DATABASE_URL_MIGRATION });
  await platform.connect();
  await migration.connect();

  const missingObjects: string[] = [];

  try {
    await assertMigrated(migration);

    for (const plan of PLANS_USED) {
      await platform.query(
        `INSERT INTO plan (code, name, limits, entitlements)
         VALUES ($1, $2, $3::jsonb, '{}'::jsonb)
         ON CONFLICT (code) DO NOTHING`,
        [plan.code, plan.name, JSON.stringify(plan.limits)],
      );
    }

    const written: WrittenFirm[] = [];
    for (const firm of DEMO_FIRMS) {
      written.push(await seedFirm(platform, migration, firm));
    }

    await seedPeople(migration, written);

    for (const target of written) {
      await seedClientsAndMatters(migration, target);
      const missing = await seedDocuments(migration, target);
      missingObjects.push(...missing);
      await seedCalendar(migration, target);
      await seedTimeEntries(migration, target);
      await recomputeStorageCounter(migration, target.tenantId);
    }

    console.log(renderCredentialTable());
    for (const target of written) {
      console.log(`${target.firm.name} — tenant ${target.tenantId}`);
    }
  } finally {
    await platform.end();
    await migration.end();
  }

  if (missingObjects.length > 0) {
    // FR-016 — every row was written; the bytes were not. Loud and non-zero, never silent.
    console.error(
      `\n${missingObjects.length} documento(s) quedaron sin bytes en el almacén de objetos.\n` +
        'Las filas se escribieron; la vista previa y la descarga fallarán para estos documentos\n' +
        'hasta que el almacén esté disponible y se vuelva a ejecutar el comando.\n' +
        missingObjects.slice(0, 5).map((key) => `  - ${key}`).join('\n') +
        (missingObjects.length > 5 ? `\n  … y ${missingObjects.length - 5} más` : ''),
    );
    process.exitCode = 1;
  }
}

/**
 * A readable failure when the database has tables but not these ones, instead of a raw
 * `relation "calendar_event" does not exist` forty statements in.
 */
async function assertMigrated(migration: Client): Promise<void> {
  const required = ['tenant', 'identity', 'identity_credential', 'identity_factor', 'backup_code', 'client', 'case_file', 'document', 'calendar_event', 'time_entry'];
  const { rows } = await migration.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [required],
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = required.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(
      `la base de datos no está migrada: faltan las tablas ${missing.join(', ')}. ` +
        'Ejecuta `npm run db:migrate` primero.',
    );
  }
}

async function seedFirm(platform: Client, migration: Client, firm: DemoFirm): Promise<WrittenFirm> {
  const tenantId = deterministicUuid('tenant', firm.rfc);

  const { rows } = await platform.query<{ id: string }>(
    `INSERT INTO tenant (id, name, rfc, plan_id)
     VALUES ($1, $2, $3, (SELECT id FROM plan WHERE code = $4))
     ON CONFLICT (rfc) DO UPDATE SET name = excluded.name
     RETURNING id`,
    [tenantId, firm.name, firm.rfc, firm.planCode],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`no se pudo crear el despacho ${firm.rfc}`);

  // The catalogs a real firm gets at provisioning (001's `ProvisionService`), plus the rows
  // this firm owns itself (Decision 6). Both go into THIS tenant's catalog; Principle III is
  // untouched.
  for (const name of [...DEFAULT_POSITION_CATALOG, ...DEMO_POSITIONS_EXTRA]) {
    await migration.query(
      `INSERT INTO position (tenant_id, name) VALUES ($1, $2)
       ON CONFLICT (tenant_id, (lower(trim(name)))) WHERE status = 'active' DO NOTHING`,
      [id, name],
    );
  }
  for (const status of DEFAULT_CASE_STATUSES) {
    await migration.query(
      `INSERT INTO case_status (tenant_id, name, is_closing) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, (lower(trim(name)))) WHERE status = 'active' DO NOTHING`,
      [id, status.name, status.isClosing],
    );
  }
  for (const name of DEFAULT_MATTER_TYPES) {
    await migration.query(
      `INSERT INTO matter_type (tenant_id, name) VALUES ($1, $2)
       ON CONFLICT (tenant_id, (lower(trim(name)))) WHERE status = 'active' DO NOTHING`,
      [id, name],
    );
  }
  const categoryNames = [...DEFAULT_DOCUMENT_CATEGORIES, ...DEMO_CATEGORIES_EXTRA];
  for (const name of categoryNames) {
    await migration.query(
      `INSERT INTO document_category (tenant_id, name) VALUES ($1, $2)
       ON CONFLICT (tenant_id, (lower(trim(name)))) WHERE status = 'active' DO NOTHING`,
      [id, name],
    );
  }

  const { rows: categoryRows } = await migration.query<{ id: string; name: string }>(
    `SELECT id, name FROM document_category WHERE tenant_id = $1 AND status = 'active'`,
    [id],
  );

  return {
    firm,
    tenantId: id,
    memberships: new Map(),
    cases: new Map(),
    categories: new Map(categoryRows.map((r) => [r.name, r.id])),
  };
}

/**
 * The four auth writes per person, in the order `enrollment.service.ts:174-197` performs
 * them — credential, factor, the shipped `mfa_enrolled_at` interface column, then ten backup
 * codes under one `set_id`.
 *
 * `confirmed_at` and `identity.mfa_enrolled_at` are written TOGETHER (FR-004). The existing
 * `seed.ts` sets the second without the first, which is a state the application itself can
 * never produce, and `enrollment.service.ts` says in as many words that the two must not
 * diverge.
 */
async function seedPeople(migration: Client, firms: readonly WrittenFirm[]): Promise<void> {
  const provider = resolveKeyProvider();
  const byRfc = new Map(firms.map((f) => [f.firm.rfc, f]));
  const home = firms[0] as WrittenFirm;

  for (const person of DEMO_PEOPLE) {
    const identityId = deterministicUuid('identity', person.email);

    await migration.query(
      `INSERT INTO identity (id, subject, email, mfa_enrolled_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (subject) DO UPDATE SET email = excluded.email, mfa_enrolled_at = now()`,
      [identityId, `demo|${person.slug}`, person.email],
    );

    await migration.query(
      `INSERT INTO identity_credential (identity_id, digest) VALUES ($1, $2)
       ON CONFLICT (identity_id) DO UPDATE SET digest = excluded.digest, updated_at = now()`,
      [identityId, await hashCredential(DEMO_PASSWORD)],
    );

    const wrapped = await provider.wrap(Buffer.from(totpSecretFor(person.slug), 'utf8'));
    await migration.query(
      `INSERT INTO identity_factor (identity_id, secret_ciphertext, key_reference, confirmed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (identity_id) DO UPDATE
         SET secret_ciphertext = excluded.secret_ciphertext,
             key_reference = excluded.key_reference,
             confirmed_at = now(),
             failed_attempt_count = 0,
             locked_until = NULL`,
      [identityId, wrapped.ciphertext, wrapped.keyReference],
    );

    // One set_id for the whole set, so a re-issue replaces it wholesale (003/FR-028).
    const setId = deterministicUuid('backup-set', person.email);
    const { rows: existing } = await migration.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM backup_code WHERE identity_id = $1 AND set_id = $2`,
      [identityId, setId],
    );
    if (Number(existing[0]?.n ?? '0') === 0) {
      for (const code of backupCodesFor(person.slug)) {
        await migration.query(
          `INSERT INTO backup_code (identity_id, set_id, digest) VALUES ($1, $2, $3)`,
          [identityId, setId, await hashHighEntropy(code)],
        );
      }
    }

    const places: { tenantId: string; archetype: string; position: string }[] = [
      { tenantId: home.tenantId, archetype: person.archetype, position: person.position },
    ];
    if (person.alsoAt) {
      const other = byRfc.get(person.alsoAt.firmRfc);
      if (other) {
        places.push({
          tenantId: other.tenantId,
          archetype: person.alsoAt.archetype,
          position: person.alsoAt.position,
        });
      }
    }

    for (const place of places) {
      const { rows: membershipRows } = await migration.query<{ id: string }>(
        `INSERT INTO membership (id, identity_id, tenant_id, archetype)
         VALUES ($1, $2, $3, $4::archetype)
         ON CONFLICT (identity_id, tenant_id) DO UPDATE SET archetype = excluded.archetype
         RETURNING id`,
        [
          deterministicUuid('membership', person.email, place.tenantId),
          identityId,
          place.tenantId,
          place.archetype,
        ],
      );
      const membershipId = membershipRows[0]!.id;
      const target = firms.find((f) => f.tenantId === place.tenantId);
      if (target) (target.memberships as Map<string, string>).set(person.slug, membershipId);

      // 017 — a directory entry per person, so `/configuracion`'s directory has seven rows
      // rather than the one `seed.ts` writes.
      await migration.query(
        `INSERT INTO directory_entry (membership_id, tenant_id, position_id)
         SELECT $1, $2, p.id FROM position p
          WHERE p.tenant_id = $2 AND lower(trim(p.name)) = lower(trim($3)) AND p.status = 'active'
         ON CONFLICT (membership_id) DO UPDATE SET position_id = excluded.position_id`,
        [membershipId, place.tenantId, place.position],
      );
    }
  }
}

async function seedClientsAndMatters(migration: Client, target: WrittenFirm): Promise<void> {
  const { tenantId, firm } = target;

  // `client` has no natural key by design — two people called Juan Pérez at one firm is not a
  // data error (`schema.ts:347`) — so idempotency is an explicit lookup. Safe because
  // `demo-clients.test.ts` asserts the names are distinct.
  const clientIds: string[] = [];
  for (const client of demoClients(firm)) {
    const { rows: found } = await migration.query<{ id: string }>(
      `SELECT id FROM client WHERE tenant_id = $1 AND legal_name = $2`,
      [tenantId, client.legalName],
    );
    if (found[0]) {
      clientIds.push(found[0].id);
      continue;
    }
    const { rows } = await migration.query<{ id: string }>(
      `INSERT INTO client (tenant_id, kind, legal_name, rfc)
       VALUES ($1, $2::client_kind, $3, $4) RETURNING id`,
      [tenantId, client.kind, client.legalName, client.rfc],
    );
    clientIds.push(rows[0]!.id);
  }

  const { rows: statusRows } = await migration.query<{ id: string; name: string }>(
    `SELECT id, name FROM case_status WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId],
  );
  const statusIds = new Map(statusRows.map((r) => [r.name, r.id]));
  const { rows: typeRows } = await migration.query<{ id: string; name: string }>(
    `SELECT id, name FROM matter_type WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId],
  );
  const typeIds = new Map(typeRows.map((r) => [r.name, r.id]));

  for (const matter of demoMatters(firm, AS_OF)) {
    /*
     * IDENTITY IS THE SLOT, NOT THE FILE NUMBER (022/FR-014 across days).
     *
     * The file number carries the year the matter opened, and the opening day moves with the seed
     * day — so a re-seed in another quarter or year produced new file numbers, which the old
     * `ON CONFLICT (file_number)` treated as new matters: a second generation of matters,
     * documents and events beside the first (149 documents where 130 were expected). The row is
     * now found by an id derived from the matter's date-free slot and UPDATED in place, file
     * number included.
     *
     * The INSERT below is reached only when that id is not there yet: a fresh database, or one
     * seeded before this change, whose rows were keyed on file numbers. For the latter it adopts
     * the existing row by file number rather than adding a duplicate. If a slot's NEW file number
     * is held by such a legacy row, the UPDATE would violate the unique index; it falls back to
     * adopting that row too, so an old database never stops the seed.
     */
    const caseId = deterministicUuid('case', firm.rfc, matter.slot);
    const tuple = [
      caseId,
      tenantId,
      clientIds[matter.clientIndex],
      matter.fileNumber,
      statusIds.get(matter.statusName),
      typeIds.get(matter.matterTypeName),
      matter.openedOn,
      matter.closedOn,
      matter.outcome,
    ];
    let updated = 0;
    try {
      const result = await migration.query(
        `UPDATE case_file
            SET client_id = $3, file_number = $4, case_status_id = $5, matter_type_id = $6,
                opened_on = $7::date, closed_on = $8::date, outcome = $9::case_outcome
          WHERE id = $1 AND tenant_id = $2`,
        tuple,
      );
      updated = result.rowCount ?? 0;
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
    }
    if (updated === 0) await migration.query(
      /*
       * 015/Decision 9 — `outcome` on every closed matter and on no open one, which is also what
       * `case_file_outcome_requires_closed` enforces. Without it the KPI screen reads "Datos
       * insuficientes" on its most prominent tile against the very firm built to demonstrate it.
       *
       * EVERY GENERATED COLUMN IS REFRESHED ON CONFLICT, `opened_on` INCLUDED — and that one was
       * missing, which produced a matter closed nine days BEFORE it opened.
       *
       * The generator clamps a matter's opening day to the seed date, so re-seeding on a later
       * day legitimately moves `opened_on` for matters in the current quarter. Leaving it out of
       * the update list meant a re-seed kept the first run's opening date and took the second
       * run's closing date — two generations spliced into one row. `015`'s average resolution
       * time is `closed_on - opened_on`, so the splice fed a negative duration into a figure the
       * dashboard presents as a number of months.
       *
       * A partial `DO UPDATE` is only safe where the omitted columns cannot move. Here they can,
       * so the rule is simply: write the whole generated tuple.
       */
      `INSERT INTO case_file
         (id, tenant_id, client_id, file_number, case_status_id, matter_type_id, opened_on,
          closed_on, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9::case_outcome)
       ON CONFLICT (tenant_id, (lower(trim(file_number))))
         DO UPDATE SET client_id      = excluded.client_id,
                       case_status_id = excluded.case_status_id,
                       matter_type_id = excluded.matter_type_id,
                       opened_on      = excluded.opened_on,
                       closed_on      = excluded.closed_on,
                       outcome        = excluded.outcome`,
      tuple,
    );
    const { rows } = await migration.query<{ id: string }>(
      `SELECT id FROM case_file WHERE tenant_id = $1 AND file_number = $2`,
      [tenantId, matter.fileNumber],
    );
    const realCaseId = rows[0]!.id;
    (target.cases as Map<string, string>).set(matter.fileNumber, realCaseId);

    const assignments: { slug: string; role: 'lead' | 'collaborator' }[] = [];
    if (matter.leadSlug) assignments.push({ slug: matter.leadSlug, role: 'lead' });
    for (const slug of matter.collaboratorSlugs) assignments.push({ slug, role: 'collaborator' });

    const wanted = assignments
      .map((a) => target.memberships.get(a.slug))
      .filter((id): id is string => id !== undefined);

    /*
     * CLOSE WHAT THIS GENERATION NO LONGER WANTS, BEFORE ADDING WHAT IT DOES.
     *
     * The insert below is `DO NOTHING`, so on its own the seed only ever ACCUMULATES: change
     * anything that moves the RNG stream and a matter keeps the previous run's lead alongside
     * the new one. The unique index is `(case_id, membership_id) WHERE unassigned_at IS NULL`,
     * so two different people being live `lead` on one matter is perfectly legal — nothing in
     * `006` forbids it — and the database has no reason to complain.
     *
     * `015` is where that surfaced: `loadPerAttorney` counts one row per (matter, lead) pair,
     * so a matter with two leads is counted for both and the bars sum to MORE than the firm's
     * active-matter count. The chart is not wrong; the data was. Found while writing this
     * slice's results by noticing 33 bars' worth of matters in a firm with 21 active ones.
     *
     * Closing rather than deleting, because that is what the product itself does when somebody
     * is taken off a matter — the row is history, not a mistake.
     */
    await migration.query(
      `UPDATE case_assignment
          SET unassigned_at = now()
        WHERE case_id = $1
          AND unassigned_at IS NULL
          AND NOT (membership_id = ANY($2::uuid[]))`,
      [realCaseId, wanted],
    );

    for (const assignment of assignments) {
      const membershipId = target.memberships.get(assignment.slug);
      if (!membershipId) continue;
      await migration.query(
        `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
         VALUES ($1, $2, $3, $4::case_role)
         ON CONFLICT (case_id, membership_id) WHERE unassigned_at IS NULL
           DO UPDATE SET role_on_case = excluded.role_on_case`,
        [realCaseId, membershipId, tenantId, assignment.role],
      );
    }
  }
}

/**
 * Documents, and the bytes behind them (FR-009).
 *
 * Returns the keys whose bytes could not be written. Rows are ALWAYS written (FR-016): a
 * half-seeded database where the metadata is missing is harder to reason about than one where
 * a preview fails, and the caller turns a non-empty return into a non-zero exit.
 */
async function seedDocuments(migration: Client, target: WrittenFirm): Promise<readonly string[]> {
  const { tenantId, firm } = target;
  const matters = demoMatters(firm, AS_OF);
  const documents = demoDocuments(firm, matters, AS_OF);
  if (documents.length === 0) return [];

  let store: S3ObjectStore | null = null;
  try {
    store = new S3ObjectStore(objectStoreConfigFromEnv());
  } catch {
    // No OBJECT_STORE_* configured at all. Every row is still written; every key is reported.
    store = null;
  }

  const uploaderFallback = target.memberships.get('mendez') ?? [...target.memberships.values()][0];
  const missing: string[] = [];

  for (const document of documents) {
    const caseId = target.cases.get(document.matterFileNumber);
    const categoryId = target.categories.get(document.categoryName);
    const membershipId = target.memberships.get(document.uploadedBySlug) ?? uploaderFallback;
    if (!caseId || !categoryId || !membershipId) continue;

    const documentId = deterministicUuid(...document.storageKeyParts);
    const storageKey = buildObjectKey(tenantId, caseId, documentId);

    // Upserted on the id, which is keyed on the matter's slot (date-free); the columns that move
    // with the seed day are refreshed in place, so a re-seed on another day adds no document.
    // `case_id` and `storage_key` are left alone: the object already lives under that key.
    await migration.query(
      `INSERT INTO document
         (id, tenant_id, case_id, uploaded_by_membership_id, category_id, storage_key,
          original_filename, mime_type, size_bytes, status, uploaded_at, withdrawn_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::document_status, $11::timestamptz,
               CASE WHEN $10 = 'withdrawn' THEN $11::timestamptz ELSE NULL END)
       ON CONFLICT (id) DO UPDATE
         SET uploaded_by_membership_id = excluded.uploaded_by_membership_id,
             category_id = excluded.category_id,
             original_filename = excluded.original_filename,
             mime_type = excluded.mime_type,
             size_bytes = excluded.size_bytes,
             status = excluded.status,
             uploaded_at = excluded.uploaded_at,
             withdrawn_at = excluded.withdrawn_at`,
      [
        documentId,
        tenantId,
        caseId,
        membershipId,
        categoryId,
        storageKey,
        document.originalFilename,
        document.mimeType,
        document.sizeBytes,
        document.status,
        `${document.uploadedOn}T12:00:00Z`,
      ],
    );

    if (store === null) {
      missing.push(storageKey);
      continue;
    }
    try {
      await store.put({ key: storageKey, body: document.body, contentType: document.mimeType });
    } catch {
      missing.push(storageKey);
    }
  }

  return missing;
}

async function seedCalendar(migration: Client, target: WrittenFirm): Promise<void> {
  const { tenantId, firm } = target;
  const matters = demoMatters(firm, AS_OF);

  for (const event of demoCalendarEvents(firm, matters, AS_OF)) {
    const membershipId = target.memberships.get(event.createdBySlug);
    if (!membershipId) continue;
    const caseId = event.matterFileNumber ? target.cases.get(event.matterFileNumber) ?? null : null;

    // `calendar_event` has no natural key, so the id is derived from the event's date-free key
    // ("hearing-3"). It used to be deduplicated on title + day — and the day moves with the seed
    // day, so a re-seed on another day added a second set of events. Every generated column is
    // refreshed on conflict, for the reason `seedClientsAndMatters` gives.
    await migration.query(
      `INSERT INTO calendar_event
         (id, tenant_id, case_id, type, title, description, location, all_day,
          starts_at, ends_at, starts_on, ends_on, remind_minutes_before, created_by_membership_id)
       VALUES ($14, $1, $2, $3::calendar_event_type, $4, $5, $6, $7,
               $8::timestamptz, $9::timestamptz, $10::date, $11::date, $12, $13)
       ON CONFLICT (id) DO UPDATE
         SET case_id = excluded.case_id, type = excluded.type, title = excluded.title,
             description = excluded.description, location = excluded.location,
             all_day = excluded.all_day, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
             starts_on = excluded.starts_on, ends_on = excluded.ends_on,
             remind_minutes_before = excluded.remind_minutes_before,
             created_by_membership_id = excluded.created_by_membership_id,
             status = 'scheduled', cancelled_at = NULL, updated_at = now()`,
      [
        tenantId,
        caseId,
        event.type,
        event.title,
        event.description,
        event.location,
        event.allDay,
        event.startsAt,
        event.endsAt,
        event.startsOn,
        event.endsOn,
        event.remindMinutesBefore,
        membershipId,
        deterministicUuid('calendar-event', firm.rfc, event.key),
      ],
    );
  }
}

/**
 * 009/FR-022, Decision 11 — six weeks of recorded time for the five timekeepers.
 *
 * UPSERT ON A DATE-FREE ID, and that is the whole idempotency story: `demo/time-entries.ts` derives
 * each id from the person and the working-day index counted back from the seed day, so re-seeding on
 * a later day rewrites the same rows into the new window rather than adding a second history beside
 * the first. Every generated column is refreshed on conflict, for the reason `seedClientsAndMatters`
 * gives: a partial update splices two generations into one row.
 *
 * Written as `logged`, never `running`: a demo person signing in to a timer that has been running
 * since the seed would be refused when stopping it (FR-007), which demonstrates the wrong thing.
 */
async function seedTimeEntries(migration: Client, target: WrittenFirm): Promise<void> {
  const { tenantId, firm } = target;
  const matters = demoMatters(firm, AS_OF);
  const written = new Set<string>();

  for (const entry of demoTimeEntries(firm, matters, AS_OF)) {
    const membershipId = target.memberships.get(entry.personSlug);
    const caseId = target.cases.get(entry.matterFileNumber);
    if (!membershipId || !caseId) continue;
    written.add(deterministicUuid('time-entry', ...entry.idKey));

    await migration.query(
      `INSERT INTO time_entry
         (id, tenant_id, case_id, membership_id, source, status, work_date, minutes, description,
          started_at, stopped_at, logged_at)
       VALUES ($1, $2, $3, $4, $5::time_entry_source, 'logged', $6::date, $7, $8,
               $9::timestamptz, $10::timestamptz, $11::timestamptz)
       ON CONFLICT (id) DO UPDATE
         SET case_id = excluded.case_id, membership_id = excluded.membership_id,
             source = excluded.source, status = 'logged', work_date = excluded.work_date,
             minutes = excluded.minutes, description = excluded.description,
             started_at = excluded.started_at, stopped_at = excluded.stopped_at,
             logged_at = excluded.logged_at, voided_at = NULL, updated_at = now()`,
      [
        deterministicUuid('time-entry', ...entry.idKey),
        tenantId,
        caseId,
        membershipId,
        entry.source,
        entry.workDate,
        entry.minutes,
        entry.description,
        entry.startedAt,
        entry.stoppedAt,
        entry.loggedAt,
      ],
    );
  }

  /*
   * ACROSS DAYS: void what this generation no longer produces. Which (person, day, position) keys
   * produce an entry depends on which matters were open that day, so a re-seed on another day can
   * stop producing a key the previous one wrote. Left alone, that row would sit beside today's as
   * a second generation of hours. Voided, not deleted — exactly what the product does — and only
   * rows whose id lies in the generator's own key space, so an entry a person recorded through the
   * screen is never touched.
   */
  const stale = demoTimeEntryKeySpace(firm)
    .map((key) => deterministicUuid('time-entry', ...key))
    .filter((id) => !written.has(id));
  await migration.query(
    `UPDATE time_entry SET status = 'voided', voided_at = now(), updated_at = now()
      WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'logged'`,
    [tenantId, stale],
  );
}

/**
 * FR-010 — `tenant.storage_bytes_used` is a transactionally-maintained running total that the
 * upload check reads live (`schema.ts:88-91`). `seed.ts` writes a document row and never
 * touches it, so the counter says 0 while a row claims 1024 bytes.
 *
 * Summed over EVERY row including withdrawn ones, because 007/FR-015 says the counter is
 * never decremented by withdrawal — the number means "bytes this firm has ever stored", and a
 * fixture that summed only active rows would disagree with the product's own semantics.
 */
async function recomputeStorageCounter(migration: Client, tenantId: string): Promise<void> {
  await migration.query(
    `UPDATE tenant
        SET storage_bytes_used = (SELECT COALESCE(SUM(size_bytes), 0) FROM document WHERE tenant_id = $1)
      WHERE id = $1`,
    [tenantId],
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
