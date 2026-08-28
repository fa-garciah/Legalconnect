/**
 * T044 — 018/FR-025, FR-026, SC-013. The four accessibility properties a
 * dialogs-and-forms slice most often loses.
 *
 * **Why these four and not a generic audit.** The ported components implement most of WCAG
 * already — Radix does the roles, the focus trap, the labelling associations. What this
 * slice adds is *wrappers*, and a wrapper is the easy place to throw all of that away: a
 * `<div onClick>` where a `<Button>` belongs, a label rendered as a sibling rather than
 * associated, an error message placed beside an input rather than tied to it. So these
 * assertions target the seam this slice owns.
 *
 * **The Escape case has its own test, deliberately.** Closing a dialog with its own button
 * usually returns focus by accident — the button is inside the dialog, the browser has to
 * put focus somewhere, and it often lands somewhere reasonable. Escape takes a different
 * path out of the component entirely, and it is the path that broke here: the modal
 * content's close-focus override focuses a `DialogTrigger` that this composition does not
 * have, dropping focus onto the document body. A keyboard user is then returned to the top
 * of the page with no indication of where they were.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

vi.mock('@/session/principal', () => ({
  getPrincipal: vi.fn().mockResolvedValue({ identityId: 'identity-1', memberships: [] }),
}));
vi.mock('@/session/active-tenant', () => ({
  readActiveTenantClient: vi.fn().mockReturnValue({ status: 'active', tenantId: 'tenant-1' }),
}));

import { ClientDirectory } from '@/app/clientes/ClientDirectory';
import { ClientFormDialog } from '@/app/clientes/ClientFormDialog';
import { WithdrawDialog } from '@/app/clientes/WithdrawDialog';
import type { Client } from '@/clients/types';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function respondWith(body: unknown, status = 200): () => Promise<Response> {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );
}

const CLIENT: Client = {
  id: 'c1',
  kind: 'organization',
  legalName: 'Grupo Torres, S.A. de C.V.',
  rfc: 'GTO120315AB1',
  status: 'active',
};

describe('every control is a real control', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ items: [CLIENT], nextCursor: 'next' }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes every interactive element with a button or link role', async () => {
    // A `<div onClick>` is invisible to a keyboard and to assistive technology. It also
    // looks completely correct in a screenshot, which is why this is asserted rather than
    // reviewed.
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    for (const name of [/nuevo cliente/i, /editar grupo torres/i, /retirar grupo torres/i, /cargar más/i]) {
      expect(screen.getByRole('button', { name }), `not reachable as a button: ${name}`).toBeInTheDocument();
    }
  });

  it('gives every control an accessible name that identifies its row', async () => {
    // Fifteen buttons all named "Editar" tell a screen-reader user nothing about which
    // record they are on.
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    const edit = screen.getByRole('button', { name: /editar/i });
    expect(edit.getAttribute('aria-label') ?? edit.textContent ?? '').toMatch(/grupo torres/i);
  });

  it('reaches every control by keyboard alone', async () => {
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    const reachable = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      await userEvent.tab();
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) {
        reachable.add((active.getAttribute('aria-label') ?? active.textContent ?? '').toLowerCase());
      }
    }

    expect([...reachable].some((label) => label.includes('nuevo cliente'))).toBe(true);
    expect([...reachable].some((label) => label.includes('editar'))).toBe(true);
  });
});

describe('every input is labelled, and every error is announced', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith(CLIENT));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('associates a label with every field in the form', async () => {
    // `getByLabelText` resolves through `for`/`id`, `aria-labelledby` and `aria-label` — the
    // three associations that actually reach assistive technology. Text merely sitting next
    // to an input satisfies none of them.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');

    expect(screen.getByLabelText(/razón social/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/RFC/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /organizaci/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /persona/i })).toBeInTheDocument();
  });

  it('labels the directory filters too', async () => {
    fetchMock.mockImplementation(respondWith({ items: [CLIENT], nextCursor: null }));
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    expect(screen.getByRole('searchbox', { name: /buscar/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /estado/i })).toBeInTheDocument();
  });

  it('announces each validation error and ties it to its input', async () => {
    // FR-026. Red text beside a field is not an error a screen-reader user receives; the
    // pair that delivers it is `aria-invalid` plus `aria-describedby` pointing at a live
    // region.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await screen.findByText(/Ingresa la razón social/i);

    const field = screen.getByLabelText(/razón social/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');

    const ids = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids.length, 'the error is not associated with its input').toBeGreaterThan(0);

    const message = ids.map((id) => document.getElementById(id)).find(Boolean);
    expect(message?.textContent ?? '').toMatch(/Ingresa la razón social/i);
    // `role="alert"` is what makes it announced rather than merely present.
    expect(message).toHaveAttribute('role', 'alert');
  });

  it('shows no error before the form has been submitted', async () => {
    // FR-007 again, from the assistive-technology side: an alert region populated on mount
    // is announced on mount, so a premature error is not just visually wrong, it interrupts.
    renderWithClient(<ClientFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByRole('dialog');

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('dialogs keep and return focus', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(respondWith({ items: [CLIENT], nextCursor: null }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('moves focus into the form dialog when it opens', async () => {
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    await userEvent.click(screen.getByRole('button', { name: /nuevo cliente/i }));
    const dialog = await screen.findByRole('dialog');

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('returns focus to the opener when closed with Escape', async () => {
    /*
     * **The case most likely to be missed**, and the one that was actually broken here.
     * Radix's modal content prevents its focus scope's own restore and focuses a
     * `DialogTrigger` instead; this composition drives the dialog from state and has no
     * trigger, so the override focused nothing and Escape dropped the user on the body.
     */
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    const trigger = screen.getByRole('button', { name: /nuevo cliente/i });
    trigger.focus();
    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('returns focus to the row control that opened the edit dialog', async () => {
    // Not the same path as the header button: the opener is inside a table row that
    // re-renders when the list query settles, so this checks the ref survives that.
    renderWithClient(<ClientDirectory archetype="MP" />);
    await screen.findByText('Grupo Torres, S.A. de C.V.');

    const trigger = screen.getByRole('button', { name: /editar grupo torres/i });
    trigger.focus();
    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('gives the confirmation dialog an alertdialog role and a described consequence', async () => {
    // `alertdialog` rather than `dialog`: it interrupts to ask about a consequence, and the
    // role is what tells assistive technology to read the description immediately.
    renderWithClient(
      <WithdrawDialog open action="withdraw" client={CLIENT} onClose={vi.fn()} onDone={vi.fn()} />,
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/asuntos existentes no se ven afectados/i)).toBeInTheDocument();
  });
});
