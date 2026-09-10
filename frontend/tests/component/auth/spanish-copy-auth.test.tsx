/**
 * T094 — the four authentication screens carry 0 English user-facing copy.
 * FR-049, SC-026.
 *
 * A separate file from `spanish-copy.test.tsx` rather than an extension of it,
 * and deliberately: that file is 016a's and belongs to the shell. These four
 * screens are 003's, they need their own mocks — a router, search params,
 * next-auth — and folding them in would make a shell test depend on an
 * authentication library.
 *
 * The constitution's language rule is not decoration. "Spanish for UI and
 * client-facing documentation. No mixing within a layer." A Mexican law firm's
 * staff meet these four screens before anything else in the product, and an
 * English string on the sign-in form is the first thing they would see.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SignInForm } from '@/app/(auth)/ingresar/SignInForm';
import { ChallengeForm } from '@/app/(auth)/verificar/ChallengeForm';
import { EnrollmentFlow } from '@/app/(auth)/enrolar/EnrollmentFlow';
import { RecoveryForm } from '@/app/(auth)/recuperar/RecoveryForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('reto=token'),
}));
vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));

/** Brand and protocol tokens that are not translatable copy. */
const ALLOWED_TOKENS = ['LegalConnect', 'MX', 'otpauth', 'totp', 'issuer', 'secret', 'period', 'digits'];

const ENGLISH_TELLS =
  /\b(the|and|is|are|to|for|of|please|loading|error|empty|retry|password|email|code|continue|verify|enroll|backup|sign in|submit|cancel)\b/i;

function assertOnlySpanish(container: HTMLElement, screenName: string): void {
  const text = container.textContent ?? '';
  const stripped = ALLOWED_TOKENS.reduce((acc, token) => acc.split(token).join(''), text);
  expect(stripped, `English copy on ${screenName}: "${text}"`).not.toMatch(ENGLISH_TELLS);
}

describe('003 authentication screens are Spanish-only (FR-049, SC-026)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('the sign-in screen', () => {
    const { container } = render(<SignInForm />);
    assertOnlySpanish(container, 'ingresar');
  });

  it('the challenge screen', () => {
    const { container } = render(<ChallengeForm />);
    assertOnlySpanish(container, 'verificar');
  });

  it('the enrollment screen', () => {
    const { container } = render(<EnrollmentFlow />);
    assertOnlySpanish(container, 'enrolar');
  });

  it('the recovery screen', () => {
    const { container } = render(<RecoveryForm />);
    assertOnlySpanish(container, 'recuperar');
  });

  it('every LABEL is Spanish — the part a screen reader announces', () => {
    // Visible text and accessible names can diverge: an aria-label is easy to
    // leave in English because nobody sees it. It is precisely what a
    // screen-reader user hears instead of the visible copy.
    for (const [name, element] of [
      ['ingresar', <SignInForm key="s" />],
      ['recuperar', <RecoveryForm key="r" />],
    ] as const) {
      const { container } = render(element);
      const labelled = container.querySelectorAll('[aria-label], label');
      for (const node of labelled) {
        const label = node.getAttribute('aria-label') ?? node.textContent ?? '';
        expect(label, `English label on ${name}: "${label}"`).not.toMatch(ENGLISH_TELLS);
      }
    }
  });
});
