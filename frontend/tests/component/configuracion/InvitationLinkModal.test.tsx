/**
 * 014 T013 (US1, Decision 3). The one moment the invitation link exists outside the database.
 *
 * The API returns the raw token once and it cannot be re-read. So this modal must make copying
 * it easy, say plainly it will not be shown again, keep it out of every browser store, and let
 * it go when closed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitationLinkModal } from '@/app/configuracion/components/InvitationLinkModal';

const ISSUED = {
  id: 'inv-1',
  targetArchetype: 'AA' as const,
  status: 'pending' as const,
  issuedAt: '2026-09-23T18:00:00Z',
  expiresAt: '2026-09-30T18:00:00Z',
  invitationLink: '/aceptar/raw-token-abc',
};

const FULL_LINK = () => `${window.location.origin}/aceptar/raw-token-abc`;

describe('InvitationLinkModal', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  const onClose = vi.fn();

  /* userEvent.setup() installs its own clipboard stub, so ours goes on AFTER it. */
  function setup() {
    const user = userEvent.setup();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return user;
  }

  beforeEach(() => writeText.mockReset());
  afterEach(() => vi.clearAllMocks());

  it('shows the full link: this origin plus the returned path', () => {
    render(<InvitationLinkModal invitation={ISSUED} onClose={onClose} />);
    expect(screen.getByLabelText(/enlace de invitación/i)).toHaveValue(FULL_LINK());
  });

  it('warns that the link will not be shown again', () => {
    render(<InvitationLinkModal invitation={ISSUED} onClose={onClose} />);
    expect(screen.getByText(/solo se muestra una vez/i)).toBeInTheDocument();
  });

  it('"Copiar enlace" writes it to the clipboard and says so', async () => {
    const user = setup();
    render(<InvitationLinkModal invitation={ISSUED} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /copiar enlace/i }));
    expect(writeText).toHaveBeenCalledWith(FULL_LINK());
    expect(await screen.findByText(/enlace copiado/i)).toBeInTheDocument();
  });

  it('never writes the link to browser storage or a cookie', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const user = setup();
    render(<InvitationLinkModal invitation={ISSUED} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /copiar enlace/i }));
    for (const call of setItem.mock.calls) {
      expect(String(call[1])).not.toContain('raw-token-abc');
    }
    expect(document.cookie).not.toContain('raw-token-abc');
    setItem.mockRestore();
  });

  it('renders nothing once the caller discards it', () => {
    const { rerender } = render(<InvitationLinkModal invitation={ISSUED} onClose={onClose} />);
    rerender(<InvitationLinkModal invitation={null} onClose={onClose} />);
    expect(screen.queryByLabelText(/enlace de invitación/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('raw-token-abc');
  });

  it('closing tells the caller, which drops the link', async () => {
    const user = setup();
    render(<InvitationLinkModal invitation={ISSUED} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /^listo$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
