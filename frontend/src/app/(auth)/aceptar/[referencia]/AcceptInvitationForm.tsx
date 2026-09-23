/**
 * Accepting an invitation and setting a credential — `002`'s accept contract, 003/FR-053.
 *
 * THE ONLY WAY INTO THIS PRODUCT. The reference design offered "Crear una cuenta" as open
 * sign-up; there is none here by design. A firm's administrator issues an invitation (002),
 * the person follows its link, and sets their password HERE. `proxy.ts` has listed `/aceptar`
 * as a public path since 003 and nothing was ever behind it, so until now the only way to
 * make a user was `backend/scripts/demo-invitation.ts`.
 *
 * WHAT IT ASKS FOR, AND WHAT IT DOES NOT. Email and password, because that is exactly what
 * `POST /identity/invitations/{reference}/accept` takes. No name field (the contract has
 * none), and no terms checkbox (there is no terms document to link to — a checkbox agreeing
 * to nothing is worse than no checkbox).
 *
 * ONE REFUSAL FOR EVERY FAILURE. The contract answers 400 identically for an unknown,
 * expired, used or revoked reference and for an email that does not match the invitation —
 * deliberately, so the endpoint cannot be used to learn which emails were invited
 * (002/FR-028). This screen must not undo that by guessing which one happened.
 *
 * The two local checks — matching passwords, and the 12-character floor the API enforces
 * (`MIN_CREDENTIAL_LENGTH`) — run before the request, so an obvious mistake does not spend
 * one of the reference's limited attempts.
 */
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconField, PasswordField } from '../../fields';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/** Mirrors `MIN_CREDENTIAL_LENGTH` in `accept-invitation.service.ts`. */
const MIN_LENGTH = 12;

const REFUSED =
  'No fue posible aceptar la invitación. Revisa que el correo sea el mismo al que llegó y que el enlace siga vigente.';

export function AcceptInvitationForm({ reference }: { reference: string }): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/identity/invitations/${encodeURIComponent(reference)}/accept`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, credential: password }),
        },
      );
      if (!response.ok) {
        setError(REFUSED);
        return;
      }
      router.push('/ingresar?invitacion=aceptada');
    } catch {
      setError(REFUSED);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <IconField
        id="email"
        name="email"
        label="Correo electrónico"
        icon={Mail}
        type="email"
        autoComplete="username"
        placeholder="El correo al que llegó la invitación"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <PasswordField
        id="password"
        name="password"
        label="Contraseña"
        autoComplete="new-password"
        placeholder={`Mínimo ${MIN_LENGTH} caracteres`}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <PasswordField
        id="confirm"
        name="confirm"
        label="Confirma tu contraseña"
        autoComplete="new-password"
        placeholder="Repite tu contraseña"
        required
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-[var(--space-control-h)] w-full gap-2" disabled={pending}>
        {pending ? 'Creando tu acceso…' : 'Crear mi acceso'}
        {pending ? null : <ArrowRight aria-hidden className="h-4 w-4" />}
      </Button>

      <p className="text-xs text-muted-foreground">
        Después registrarás tu segundo factor. Es obligatorio para todas las cuentas.
      </p>
    </form>
  );
}
