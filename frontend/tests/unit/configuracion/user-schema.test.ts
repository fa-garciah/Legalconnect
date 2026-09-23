/**
 * 014 T010 (US1). The invitation form's rules, before any request is sent.
 *
 * The role offer mirrors `backend/src/modules/invitation/archetype-rank.ts`: nobody may grant a
 * role broader than their own (002/FR-021). The server refuses regardless; offering a role it
 * would refuse is a control that exists only to fail.
 */
import { describe, expect, it } from 'vitest';
import { inviteFormSchema, offerableArchetypes } from '@/configuracion/schema';

describe('invitation form schema', () => {
  it('requires an email', () => {
    const result = inviteFormSchema.safeParse({ email: '', targetArchetype: 'AA' });
    expect(result.success).toBe(false);
  });

  it('refuses a malformed email', () => {
    const result = inviteFormSchema.safeParse({ email: 'lucia-at-despacho', targetArchetype: 'AA' });
    expect(result.success).toBe(false);
  });

  it('trims and lower-cases a well-formed email', () => {
    const result = inviteFormSchema.safeParse({ email: '  Lucia@DespachoAlfa.mx ', targetArchetype: 'AA' });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('lucia@despachoalfa.mx');
  });

  it('requires a role', () => {
    const result = inviteFormSchema.safeParse({ email: 'lucia@despachoalfa.mx' });
    expect(result.success).toBe(false);
  });

  it('writes its messages in Spanish', () => {
    const result = inviteFormSchema.safeParse({ email: 'x', targetArchetype: 'AA' });
    expect(result.error?.issues[0]?.message).toMatch(/correo/i);
  });
});

describe('roles offered to the issuer', () => {
  it('an MP is never offered SA', () => {
    expect(offerableArchetypes('MP')).not.toContain('SA');
  });

  it('an MP is offered every internal role up to its own', () => {
    expect([...offerableArchetypes('MP')].sort()).toEqual(['AA', 'BM', 'CM', 'MP', 'PL']);
  });

  it('an SA is offered every internal role, SA included', () => {
    expect([...offerableArchetypes('SA')].sort()).toEqual(['AA', 'BM', 'CM', 'MP', 'PL', 'SA']);
  });

  it('nobody else is offered anything — they cannot invite at all', () => {
    for (const archetype of ['AA', 'PL', 'CM', 'BM', 'CC', 'IC', 'CB', 'EL'] as const) {
      expect(offerableArchetypes(archetype)).toEqual([]);
    }
  });
});
