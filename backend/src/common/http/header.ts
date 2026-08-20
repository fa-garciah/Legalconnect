/**
 * Extracts one header value. Node collapses a repeated ordinary header into a single
 * comma-joined string, but the type of `IncomingMessage.headers` still allows an
 * array (some headers, `set-cookie` among them, are always arrays) — so any code
 * reading a header must handle both shapes or it is only accidentally correct.
 *
 * Shared by TenantContextInterceptor and AuditInterceptor, which is what to change if
 * this ever needs to become case-insensitive or gain a default value.
 */
export function firstHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}
