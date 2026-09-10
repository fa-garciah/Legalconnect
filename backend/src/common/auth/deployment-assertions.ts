/**
 * T027 — the startup assertion that refuses the local key provider in a deployed
 * environment. research.md D5, FR-013.
 *
 * AN ASSERTION, NOT A WARNING, and the distinction is the whole task. A warning at
 * boot scrolls past in a deploy log nobody reads twice, and the consequence of
 * missing it is that every TOTP secret in a production database is wrapped under a
 * key sitting in an environment variable — which is exactly the control the
 * constitution says must not fail:
 *
 *   "A database dump, a restored backup, or read access to the table MUST NOT be
 *    sufficient to derive a working second factor. Storing the secret in plaintext,
 *    or encrypted under a key the database itself holds, defeats the entire
 *    control."
 *
 * An env-var key is not quite as bad as a key in the database, but it is in the
 * same class: it travels with the deployment, lands in process listings and crash
 * dumps, and is not restricted or audited to the PAC/CSD standard FR-016 requires.
 *
 * This sits beside `assertApplicationRoleIsSafe` in main.ts for the same reason
 * that one exists: both are single misconfigurations that leave every test green
 * and the protection absent. Neither is recoverable by noticing later.
 */
import { configuredKeyProviderKind } from './key-provider';

/**
 * Environments where the local provider is a configuration error rather than the
 * intended setup. Deliberately a DENY-list keyed on NODE_ENV rather than an
 * allow-list of dev names: a new environment name should inherit the safe
 * behaviour, and `NODE_ENV=staging` must not silently be treated as development.
 */
const DEPLOYED_ENVIRONMENTS = new Set(['production', 'staging']);

export function isDeployedEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return DEPLOYED_ENVIRONMENTS.has(env.NODE_ENV ?? '');
}

export class InsecureKeyProviderInDeployment extends Error {
  constructor(nodeEnv: string) {
    super(
      `refusing to start: AUTH_KEY_PROVIDER=local in NODE_ENV=${nodeEnv}. ` +
        'The TOTP envelope key would come from an environment variable rather than from a ' +
        'key restricted and audited to the PAC/CSD standard (FR-016), and a restored backup ' +
        'in a less-protected environment would then yield working second factors (SC-008). ' +
        'Set AUTH_KEY_PROVIDER=kms and AUTH_KMS_KEY_ID. There is deliberately no override.',
    );
    this.name = 'InsecureKeyProviderInDeployment';
  }
}

/**
 * Throws in a deployed environment configured with the local provider.
 *
 * THERE IS NO OVERRIDE FLAG, and there must never be one. FR-007's reasoning
 * applies here by analogy: a mechanism whose only purpose is to switch a
 * protection off must not exist to be misused, misconfigured or wrongly defaulted.
 * The correct way past this in a deployed environment is to configure KMS.
 */
export function assertKeyProviderIsSafe(env: NodeJS.ProcessEnv = process.env): void {
  if (!isDeployedEnvironment(env)) return;
  if (configuredKeyProviderKind(env) === 'local') {
    throw new InsecureKeyProviderInDeployment(env.NODE_ENV ?? '');
  }
}
