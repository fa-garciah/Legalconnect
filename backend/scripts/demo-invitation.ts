/**
 * Mints one usable invitation for a local demo, and prints its raw reference.
 *
 * WHY THIS EXISTS. The product generates an invitation token, stores only its SHA-256
 * hash, and then discards the raw value: `invitation.controller.ts` returns the row
 * without it, the platform bootstrap route does the same, and the transactional email
 * that would carry it is not implemented ("actually dispatching it is an infra concern"
 * — 002's own note). The seeded invitations are worse: their `reference_hash` is the
 * literal string `seed-reference-<tenantId>`, which is not the SHA-256 of anything, so
 * no reference can ever redeem them.
 *
 * The consequence is that on a fresh local stack there is NO path by which a human
 * becomes a signed-in user. This script is the crutch: it writes the hash of a reference
 * it also prints, so the ordinary accept-invitation flow can be walked in the browser.
 *
 * IT IS FIXTURE SETUP, NOT A PRODUCT PATH — the same standing `drizzle/seed.ts` has, and
 * it runs on the migration connection for the same reason: `lc_app` holds no INSERT on
 * `invitation`, and it should not. Delete it the day the email provider lands, or the day
 * the bootstrap route returns its own token.
 *
 * Usage: npx tsx scripts/demo-invitation.ts <tenantId> <issuerMembershipId> [email] [archetype]
 */
import { Client } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateInvitationToken } from '../src/modules/invitation/token';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
  }
}

async function main(): Promise<void> {
  loadEnvFile(join(__dirname, '..', '.env'));

  const [tenantId, membershipId, email = 'demo@despachoalfa.mx', archetype = 'MP'] =
    process.argv.slice(2);

  if (!tenantId || !membershipId) {
    throw new Error(
      'usage: tsx scripts/demo-invitation.ts <tenantId> <issuerMembershipId> [email] [archetype]',
    );
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL_MIGRATION });
  await client.connect();
  try {
    const token = generateInvitationToken();

    // `issued_at` and `expires_at` are BOTH left to their defaults, deliberately.
    // `invitation_expires_at_fixed` (0014) checks `expires_at = issued_at + interval
    // '7 days'`, so supplying either one independently violates it — the window is not
    // the caller's to choose. `drizzle/seed.ts` omits them for the same reason.
    await client.query(
      `INSERT INTO invitation
         (tenant_id, target_archetype, invited_email, reference_hash,
          issued_by_membership_id, seeded)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [tenantId, archetype, email, token.hash, membershipId],
    );

    console.log('\nINVITATION_EMAIL=' + email);
    console.log('INVITATION_ARCHETYPE=' + archetype);
    console.log('INVITATION_REFERENCE=' + token.raw);
    console.log('\nAccept it at: /aceptar/' + token.raw + '\n');
  } finally {
    await client.end();
  }
}

void main();
