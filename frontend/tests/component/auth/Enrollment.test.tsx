/**
 * T068 and T077 — the enrollment screen and the one-time code display.
 * FR-051, SC-028, SC-026.
 *
 * One file for both because they are two stages of one component, and the
 * property that matters most spans them: NOTHING from this flow — not the
 * secret, not the QR, not the ten codes — may reach browser storage. Splitting
 * them would let each half assert about its own stage and miss a leak in the
 * transition.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnrollmentFlow } from '@/app/(auth)/enrolar/EnrollmentFlow';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('reto=opaque-enrollment-token'),
}));

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const OTPAUTH = `otpauth://totp/LegalConnect%20MX:persona@despacho.mx?secret=${SECRET}&issuer=LegalConnect%20MX&period=30&digits=6`;
const CODES = [
  '4F2A9-1BD7C-03E5F-1B8D4-2A67E-0',
  '119C3-D5A7F-40BEC-92E1D-0538B-6',
  '7FA2D-14C08-E99E5-B6321-A70DC-F',
  '48ABC-DEF12-34567-89JKM-NPQRS-T',
  'V1234-56789-ABCDE-FGHJK-MNPQR-S',
  'TVWXY-Z0123-456789-ABCDE-FGHJK-M',
  'NPQRS-TVWXY-Z0123-45678-9ABCD-E',
  'FGHJK-MNPQR-STVWX-YZ012-34567-8',
  '9ABCD-EFGHJ-KMNPQ-RSTVW-XYZ01-2',
  '34567-89ABC-DEFGH-JKMNP-QRSTV-W',
];

function mockBegin(): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ secret: SECRET, otpauthUri: OTPAUTH, enrollmentToken: 'token' }),
  } as Response);
}

function mockConfirm(): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ backupCodes: CODES, accessToken: 'a', refreshToken: 'r', expiresAt: 'x' }),
  } as Response);
}

async function reachRegisterStage(): Promise<void> {
  mockBegin();
  render(<EnrollmentFlow />);
  await userEvent.click(screen.getByRole('button', { name: 'Comenzar registro' }));
  await screen.findByLabelText('Clave para ingreso manual');
}

async function reachCodesStage(): Promise<void> {
  await reachRegisterStage();
  mockConfirm();
  await userEvent.type(screen.getByRole('textbox'), '492013');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  await screen.findByText('Códigos de respaldo');
}

describe('EnrollmentFlow (T068, T077)', () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
    sessionStorage.clear();
  });

  it('offers BOTH the QR payload and a manual key (contracts/enrollment.md)', async () => {
    // Both, not either. A person whose phone camera cannot reach a second
    // screen types the key; a person with no manual-entry option cannot enroll
    // at all from a laptop.
    await reachRegisterStage();
    // A REAL QR, not the raw URI printed as text. The screen said "Escanea este código" and
    // showed an `otpauth://` string — found by `design:design-critique` on 2026-09-22: a
    // person enrolling from a phone had to type a 32-character key by hand. The image
    // encodes exactly the URI the API returned, generated in the browser so the secret is
    // never sent to a third-party service.
    const qr = await screen.findByRole('img', { name: /código qr/i });
    const src = qr.getAttribute('src') ?? '';
    expect(src.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(src)).toContain('<svg');
    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });

  it('is in Spanish (FR-049, SC-026)', async () => {
    await reachRegisterStage();
    expect(screen.getByText('Código de verificación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('shows the ten codes exactly once, with the warning that they will not return', async () => {
    await reachCodesStage();
    for (const code of CODES) expect(screen.getByText(code)).toBeInTheDocument();
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument();
  });

  it('REQUIRES ACKNOWLEDGEMENT BEFORE PROCEEDING (FR-024)', async () => {
    // Not paternalism. There is no route that returns the codes — not for
    // their owner, not for an SA, not for the platform operator — so leaving
    // this screen without having recorded them is unrecoverable, and the gate
    // is the only place the product can say so.
    await reachCodesStage();
    const proceed = screen.getByRole('button', { name: 'Continuar' });
    expect(proceed).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(proceed).toBeEnabled();
  });

  it('OFFERS NO WAY TO SEE THE CODES AGAIN — such a control could not work', async () => {
    await reachCodesStage();

    // Asserted over ACTIONABLE ELEMENTS, not over prose. The screen's own
    // warning says "no podrás volver a verlos", and a raw-text scan flags that
    // as an offer to re-display — catching the sentence that exists to say the
    // opposite. What must not exist is a control.
    const actionable = [
      ...screen.queryAllByRole('button'),
      ...screen.queryAllByRole('link'),
    ].map((element) => element.textContent?.toLowerCase() ?? '');

    for (const label of actionable) {
      for (const offer of ['ver', 'descargar', 'reenviar', 'copiar', 'imprimir', 'mostrar']) {
        expect(label, `control offering "${offer}"`).not.toContain(offer);
      }
    }
    // The only controls here are the acknowledgement and the way forward.
    expect(actionable).toEqual(['continuar']);
  });

  it('WRITES NOTHING TO BROWSER STORAGE — not the secret, not the codes (FR-051, SC-028)', async () => {
    await reachCodesStage();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    // And nothing is hiding under a key with a different name.
    const dumped = JSON.stringify({ ...localStorage, ...sessionStorage });
    expect(dumped).not.toContain(SECRET);
    for (const code of CODES) expect(dumped).not.toContain(code);
  });

  it('shows the one uniform refusal when confirmation fails, and clears the code', async () => {
    await reachRegisterStage();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);

    await userEvent.type(screen.getByRole('textbox'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const alert = await screen.findByRole('alert');
    for (const leak of ['clave', 'expir', 'incorrecto', 'llave']) {
      expect(alert.textContent?.toLowerCase()).not.toContain(leak);
    }
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  });

  it('will not submit until six digits are present', async () => {
    await reachRegisterStage();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});
