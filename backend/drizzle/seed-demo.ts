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

/** The day the demo firm is seeded as of. One value, passed everywhere (FR-017). */
const AS_OF = new Date();

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
  const required = ['tenant', 'identity', 'identity_credential', 'identity_factor', 'backup_code', 'client', 'case_file', 'document', 'calendar_event'];
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
    const caseId = deterministicUuid('case', firm.rfc, matter.fileNumber);
    await migration.query(
      `INSERT INTO case_file
         (id, tenant_id, client_id, file_number, case_status_id, matter_type_id, opened_on, closed_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date)
       ON CONFLICT (tenant_id, (lower(trim(file_number)))) DO NOTHING`,
      [
        caseId,
        tenantId,
        clientIds[matter.clientIndex],
        matter.fileNumber,
        statusIds.get(matter.statusName),
        typeIds.get(matter.matterTypeName),
        matter.openedOn,
        matter.closedOn,
      ],
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

    for (const assignment of assignments) {
      const membershipId = target.memberships.get(assignment.slug);
      if (!membershipId) continue;
      await migration.query(
        `INSERT INTO case_assignment (case_id, membership_id, tenant_id, role_on_case)
         VALUES ($1, $2, $3, $4::case_role)
         ON CONFLICT (case_id, membership_id) WHERE unassigned_at IS NULL DO NOTHING`,
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

    await migration.query(
      `INSERT INTO document
         (id, tenant_id, case_id, uploaded_by_membership_id, category_id, storage_key,
          original_filename, mime_type, size_bytes, status, uploaded_at, withdrawn_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::document_status, $11::timestamptz,
               CASE WHEN $10 = 'withdrawn' THEN $11::timestamptz ELSE NULL END)
       ON CONFLICT (storage_key) DO NOTHING`,
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

    // `calendar_event` has no natural key; the guard is an existence check on the shape that
    // identifies one to a human — same title, same day, same firm.
    await migration.query(
      `INSERT INTO calendar_event
         (tenant_id, case_id, type, title, description, location, all_day,
          starts_at, ends_at, starts_on, ends_on, remind_minutes_before, created_by_membership_id)
       SELECT $1, $2, $3::calendar_event_type, $4, $5, $6, $7,
              $8::timestamptz, $9::timestamptz, $10::date, $11::date, $12, $13
        WHERE NOT EXISTS (
          SELECT 1 FROM calendar_event
           WHERE tenant_id = $1 AND title = $4
             AND coalesce(starts_on::text, starts_at::text) = coalesce($10::text, $8::text)
        )`,
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
      ],
    );
  }
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
