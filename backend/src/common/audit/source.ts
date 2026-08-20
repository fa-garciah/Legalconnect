/**
 * T062 — builds the `source` of an audit entry: where the request came from, as
 * observed by the system, with no personal data.
 *
 * `channel` is the load-bearing field. FR-025 and FR-026 gate two actions on it, so
 * misclassifying an automated caller as interactive would reintroduce the
 * self-amplification those rules exist to prevent.
 */
import type { AuditSource } from '../db/schema';
import type { Channel } from '../tenant/principal';

interface SourceInput {
  readonly channel?: string | undefined;
  readonly userAgent?: string | undefined;
  readonly ip?: string | undefined;
}

/**
 * Only an explicit `automated` marker makes a call automated.
 *
 * Defaulting to `interactive` is the safe direction: it over-records rather than
 * under-records, and a missing entry is the failure Principle V cannot tolerate. The
 * cost of the default is log volume, which retention bounds.
 */
export function toChannel(raw: string | undefined): Channel {
  return raw === 'automated' ? 'automated' : 'interactive';
}

/**
 * Coarsens a network origin to something that locates a request without identifying a
 * person. An end client's home IP is personal data under LFPDPPP; the fact that a
 * request arrived over the public internet is not.
 */
export function coarseOrigin(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.')) return 'loopback';
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 'private';
  return 'public';
}

/** A client class, never the raw user agent — those carry identifying detail. */
export function clientClass(userAgent: string | undefined): string {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('mozilla') || ua.includes('safari') || ua.includes('chrome')) return 'web';
  if (ua.includes('curl') || ua.includes('wget') || ua.includes('httpie')) return 'cli';
  if (ua.includes('node') || ua.includes('python') || ua.includes('java')) return 'sdk';
  return 'other';
}

export function buildSource(input: SourceInput): AuditSource {
  return {
    channel: toChannel(input.channel),
    clientClass: clientClass(input.userAgent),
    networkOrigin: coarseOrigin(input.ip),
  };
}
