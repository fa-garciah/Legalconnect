/**
 * T015 — the firm's clients. 022/FR-005.
 *
 * Two requirements pull in opposite directions and both matter. The list has to be varied
 * enough that `/clientes` and the case register read like a real practice, and it has to be
 * unmistakably invented — no real company, no real person. A demo that ships a real firm's
 * client list is a problem for that firm and for this product.
 *
 * The distinctness assertion is not cosmetic: `client` has no natural key (two people called
 * Juan Pérez at one firm is not a data error, per `schema.ts:347`), so the seed's idempotency
 * guard is a lookup on `(tenant_id, legal_name)`. That guard is only safe while these names
 * are unique, which is why it is asserted here rather than assumed there.
 */
import { describe, expect, it } from 'vitest';
import { demoClients } from '../../drizzle/demo/clients';
import { DEMO_FIRMS } from '../../drizzle/demo/firm';

const RFC_SHAPE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const full = DEMO_FIRMS[0]!;
const sparse = DEMO_FIRMS[1]!;

describe('volume', () => {
  it('gives the full firm about 25 clients', () => {
    expect(demoClients(full).length).toBe(25);
  });

  it('gives the sparse firm a handful (Decision 8)', () => {
    expect(demoClients(sparse).length).toBe(4);
  });

  it('is deterministic', () => {
    expect(demoClients(full)).toEqual(demoClients(full));
  });
});

describe('the names', () => {
  const clients = demoClients(full);

  it('are distinct case-insensitively, which is what makes the seed idempotent', () => {
    const keys = clients.map((c) => c.legalName.trim().toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('do not collide with the sparse firm\'s, so a cross-tenant mix-up is visible', () => {
    const a = new Set(clients.map((c) => c.legalName));
    for (const other of demoClients(sparse)) expect(a.has(other.legalName)).toBe(false);
  });

  it('name no real company', () => {
    // A representative list of the real Mexican companies the static mockups used.
    const real = [
      'banorte', 'cemex', 'bimbo', 'femsa', 'televisa', 'telmex', 'pemex', 'oxxo',
      'liverpool', 'soriana', 'elektra', 'banamex', 'bbva', 'santander', 'walmart',
      'coppel', 'alsea', 'gruma', 'kof', 'imss', 'infonavit', 'impi', 'tfja',
    ];
    for (const client of [...clients, ...demoClients(sparse)]) {
      const lower = client.legalName.toLowerCase();
      for (const name of real) {
        expect(lower, `"${client.legalName}" resembles a real company`).not.toContain(name);
      }
    }
  });

  it('mixes organisations and natural persons', () => {
    const organizations = clients.filter((c) => c.kind === 'organization');
    const persons = clients.filter((c) => c.kind === 'person');
    expect(organizations.length).toBeGreaterThanOrEqual(15);
    expect(persons.length).toBeGreaterThanOrEqual(5);
    expect(organizations.length + persons.length).toBe(clients.length);
  });
});

describe('the RFCs', () => {
  const clients = [...demoClients(full), ...demoClients(sparse)];

  it('match the shape the client table enforces, whenever present', () => {
    for (const client of clients) {
      if (client.rfc !== null) expect(client.rfc, client.legalName).toMatch(RFC_SHAPE);
    }
  });

  it('give every organisation a three-letter prefix', () => {
    for (const client of clients.filter((c) => c.kind === 'organization')) {
      expect(client.rfc).not.toBeNull();
      expect(client.rfc!.slice(0, 3)).toMatch(/^[A-ZÑ&]{3}$/);
      expect(client.rfc!).toHaveLength(12);
    }
  });

  it('gives a natural person who has one a four-letter prefix', () => {
    const withRfc = clients.filter((c) => c.kind === 'person' && c.rfc !== null);
    expect(withRfc.length).toBeGreaterThan(0);
    for (const client of withRfc) {
      expect(client.rfc!.slice(0, 4)).toMatch(/^[A-ZÑ&]{4}$/);
      expect(client.rfc!).toHaveLength(13);
    }
  });

  it('leaves at least one natural person without one', () => {
    // `client.rfc` is nullable by requirement — fiscal completeness is a billing concern
    // (`schema.ts:340-345`) — and a fixture where every row is complete never exercises it.
    expect(demoClients(full).some((c) => c.kind === 'person' && c.rfc === null)).toBe(true);
  });

  it('are unique, so a later uniqueness rule would not trip over the fixtures', () => {
    const present = clients.map((c) => c.rfc).filter((r): r is string => r !== null);
    expect(new Set(present).size).toBe(present.length);
  });
});
