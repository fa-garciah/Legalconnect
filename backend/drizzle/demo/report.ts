/**
 * T014a — what the command prints. 022/FR-018, FR-020.
 *
 * Extracted from `seed-demo.ts` so it can be asserted: this is the one output that carries
 * credential material on purpose, and it sits inches away from material Principle VI forbids
 * ever printing — the Argon2id digest, the wrapped TOTP secret, the backup-code digests, the
 * connection string. `demo-output-safety.test.ts` checks the boundary rather than trusting it.
 *
 * What may be printed, and why:
 *   - the email, the shared password and the TOTP secret, because FR-018 requires them and a
 *     human has to retype them into a sign-in form and an authenticator app;
 *   - the plaintext backup codes, because they are derived fixtures for a database the guard
 *     has already proved is local, and `quickstart.md` documents them anyway.
 *
 * What must never be printed: anything READ BACK from the database. The digests and the
 * ciphertext are one-way by design and printing them would put material in a terminal
 * scrollback and a CI log that the constitution says may not appear in either.
 */
import { DEMO_PASSWORD, DEMO_PEOPLE, backupCodesFor, totpSecretFor } from './firm';

export interface CredentialLine {
  readonly name: string;
  readonly email: string;
  readonly archetype: string;
  readonly position: string;
  readonly totpSecret: string;
  readonly secondFirm: string | null;
}

export function credentialLines(): readonly CredentialLine[] {
  return DEMO_PEOPLE.map((person) => ({
    name: person.name,
    email: person.email,
    archetype: person.archetype,
    position: person.position,
    totpSecret: totpSecretFor(person.slug),
    secondFirm: person.alsoAt ? `${person.alsoAt.archetype} en ${person.alsoAt.firmRfc}` : null,
  }));
}

/**
 * The table the command prints on success.
 *
 * Plain text and fixed columns rather than anything clever: this gets copied out of a
 * terminal into a chat window, and alignment is the only formatting that survives that.
 */
export function renderCredentialTable(lines: readonly CredentialLine[] = credentialLines()): string {
  const rows = lines.map((line) => [
    line.archetype.padEnd(3),
    line.email.padEnd(42),
    line.totpSecret,
  ]);

  const out: string[] = [
    '',
    'Contraseña compartida para todas las personas de demostración:',
    `  ${DEMO_PASSWORD}`,
    '',
    'ARQ  CORREO                                     SECRETO TOTP (base32)',
    '---  -----------------------------------------  ----------------------------------',
    ...rows.map((row) => row.join('  ')),
    '',
  ];

  for (const line of lines) {
    if (line.secondFirm !== null) {
      out.push(`${line.email} también tiene membresía como ${line.secondFirm}.`);
      out.push('');
    }
  }

  out.push(
    'Agrega el secreto TOTP a una app autenticadora (opción "introducir clave manualmente").',
    'Los códigos de respaldo de cada persona están en specs/022-demo-firm-seed/quickstart.md.',
    '',
  );

  return out.join('\n');
}

/** The ten derived backup codes for one person, for `quickstart.md` and for the `--codes` flag. */
export function renderBackupCodes(slug: string): string {
  return backupCodesFor(slug).join('\n');
}
