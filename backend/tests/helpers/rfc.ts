let counter = 0;

/**
 * A syntactically valid, unique RFC for a moral person: 3 letters, 6 digits, 3
 * alphanumerics.
 *
 * Uniqueness comes from a counter plus the process start, not from Date.now() alone —
 * two tenants provisioned in the same millisecond inside one test would otherwise
 * collide, and the failure would look like the uniqueness constraint working when it
 * was really the fixture.
 */
export function uniqueRfc(): string {
  counter += 1;
  const digits = String(Date.now()).slice(-6);
  const suffix = String(counter).padStart(3, '0').slice(-3);
  return `TST${digits}${suffix}`.toUpperCase();
}
