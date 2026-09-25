/**
 * T002 — the demo seed refuses to run anywhere but a local database. 022/FR-012, Decision 3.
 *
 * WHAT THIS PROTECTS. `db:seed:demo` writes known credentials for known people: one shared
 * password and a TOTP secret derived from a phrase committed in this repository. That is
 * defensible fixture material for a local database and a catastrophe anywhere else, and the
 * two facts are inseparable — Decision 2 (fixed, documented credentials) is only arguable
 * because this file makes them unreachable outside a developer's own machine.
 *
 * TWO INDEPENDENT CHECKS, EITHER SUFFICIENT TO REFUSE, because each covers the other's blind
 * spot:
 *
 *   - NODE_ENV alone would permit a run against a production URL from a laptop, where
 *     NODE_ENV is usually unset. That is the realistic accident: a developer with a
 *     production connection string exported in their shell.
 *   - The host check alone would permit a run inside a deployed container that happens to
 *     reach its database over a local socket.
 *
 * AND THEY ARE INVERTED WITH RESPECT TO EACH OTHER, deliberately. Environments are a
 * DENY-list, reused from `deployment-assertions.ts` rather than restated, so a new
 * environment name (`preprod`) inherits refusal. Hosts are an ALLOW-list, so a new host name
 * inherits refusal too. Both directions fail closed.
 *
 * THERE IS NO OVERRIDE, and there must never be one. The constitution's reasoning about MFA
 * applies verbatim: "a mechanism whose only purpose is to switch this off must not exist to
 * be misused, misconfigured or wrongly defaulted." The correct way to seed a demo firm
 * somewhere that is not local is: do not.
 */
import { isDeployedEnvironment } from '../../src/common/auth/deployment-assertions';

/**
 * Hosts a local development database is reachable at. `postgres` is here because that is
 * the service name inside a compose network, and `host.docker.internal` because that is how
 * a container reaches the developer's own machine.
 *
 * Matched EXACTLY, never as a substring: `localhost.attacker.example` and `notlocalhost` are
 * both refused, which a `includes()` test would have let through.
 */
const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'postgres',
]);

export class DemoSeedRefused extends Error {
  constructor(reason: string) {
    super(
      `refusing to seed the demo firm: ${reason}. ` +
        'This command writes known credentials for known people and is for a local database only ' +
        '(022/FR-012). Point DATABASE_URL_MIGRATION at localhost and leave NODE_ENV unset or set ' +
        'to development. There is deliberately no override.',
    );
    this.name = 'DemoSeedRefused';
  }
}

/**
 * The host of a connection string, or null if there is not one to read.
 *
 * Returns the host ALONE — never the URL — because this value ends up in a refusal message,
 * and a connection string carries a password (Principle VI, FR-020).
 */
function hostOf(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    const { hostname } = new URL(connectionString);
    if (hostname === '') return null;
    // `new URL` KEEPS the brackets on an IPv6 literal — `hostname` is `[::1]`, not `::1`.
    // Verified rather than assumed: the first draft of this function assumed the opposite
    // and its test caught it.
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  } catch {
    return null;
  }
}

/**
 * Throws `DemoSeedRefused` unless this is a local development target.
 *
 * Call it BEFORE opening any connection, so that a refusal cannot have written anything.
 */
export function assertLocalDemoTarget(env: NodeJS.ProcessEnv = process.env): void {
  if (isDeployedEnvironment(env)) {
    throw new DemoSeedRefused(`NODE_ENV is ${env.NODE_ENV ?? ''}`);
  }

  const host = hostOf(env.DATABASE_URL_MIGRATION);
  if (host === null) {
    throw new DemoSeedRefused('DATABASE_URL_MIGRATION is missing or is not a valid URL');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new DemoSeedRefused(`the database host is ${host}, which is not a local host`);
  }
}
