/**
 * Where a person lands after signing in, and which `destino` the sign-in flow will honour.
 *
 * Found by the 2026-10-29 critique: every sign-in ended on "Bienvenido a LegalConnect MX.", an
 * empty page, and a person whose session expired on /expedientes was sent there too, although
 * `proxy.ts` had already put `?destino=/expedientes` on the sign-in URL.
 *
 * `safeDestination` is the open-redirect guard. `destino` arrives in a URL anybody can craft, so
 * only a same-origin path is honoured: never a scheme, never a protocol-relative `//host`, never
 * a backslash a browser may normalise into one, and never the sign-in screens themselves.
 */
import { describe, expect, it } from 'vitest';
import { safeDestination } from '@/session/destination';
import { landingFor } from '@/shell/landing';

describe('safeDestination', () => {
  it.each(['/expedientes', '/clientes', '/expedientes/abc/documentos', '/horas'])(
    'honours the in-app path %s',
    (path) => {
      expect(safeDestination(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'expedientes',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/expedientes',
    'javascript:alert(1)',
    '/ingresar',
    '/verificar',
    '/api/sesion/expirada',
    '/',
  ])('refuses %s', (raw) => {
    expect(safeDestination(raw)).toBeNull();
  });

  it('keeps only the path, dropping any query or fragment', () => {
    expect(safeDestination('/clientes?x=1#y')).toBe('/clientes');
  });
});

describe('landingFor', () => {
  it('sends the case-holding archetypes to the case register', () => {
    for (const archetype of ['MP', 'AA', 'PL', 'CM', 'SA'] as const) {
      expect(landingFor(archetype)).toBe('/expedientes');
    }
  });

  it('sends a billing manager, who holds no case capability, to the first section they have', () => {
    expect(landingFor('BM')).toBe('/clientes');
  });
});
