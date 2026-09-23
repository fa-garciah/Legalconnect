'use client';

/**
 * T059 — the credential step. FR-049, FR-050, SC-005.
 *
 * ONE REFUSAL MESSAGE, WHATEVER HAPPENED. The API answers a wrong credential,
 * an unknown email and a locked account with the same body, and this screen must
 * not undo that by rendering three different things. Copy that said "no existe
 * esa cuenta" would hand back exactly the enumeration oracle the uniform 401
 * exists to close.
 *
 * NO "REMEMBER ME" AND NO TRUSTED-DEVICE CONTROL, here or anywhere. The
 * constitution forbids the capability from existing, not merely from being
 * enabled: "no device-remembering capability may be built". Every access reaches
 * material covered by attorney-client privilege, and this product recognises no
 * low-risk role.
 */
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconField, PasswordField } from '../fields';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/** The one message. Never varied by cause. */
const REFUSED = 'No fue posible completar el acceso. Revisa tus datos e inténtalo de nuevo.';

export function SignInForm(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError(REFUSED);
        return;
      }

      const body = (await response.json()) as { challengeToken: string; next: 'factor' | 'enrollment' };

      // The challenge token is handed to the next screen through the URL rather
      // than stored: FR-051 keeps credentials and factor material out of
      // localStorage, sessionStorage and IndexedDB, and this token is short-lived
      // and single-use so a history entry outlives its usefulness by design.
      const destination = body.next === 'enrollment' ? '/enrolar' : '/verificar';
      router.push(`${destination}?reto=${encodeURIComponent(body.challengeToken)}`);
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
        placeholder="nombre@despacho.mx"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <PasswordField
        id="password"
        name="password"
        label="Contraseña"
        autoComplete="current-password"
        placeholder="Tu contraseña"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/*
        "Continuar", not the reference's "Iniciar sesión": after this step the person is NOT
        signed in yet — the second factor comes next, and the label says so honestly. It is
        also the name 23 tests across the unit, component and e2e tiers already address.
      */}
      <Button type="submit" className="h-[var(--space-control-h)] w-full gap-2" disabled={pending}>
        {pending ? 'Verificando…' : 'Continuar'}
        {pending ? null : <ArrowRight aria-hidden className="h-4 w-4" />}
      </Button>
    </form>
  );
}
