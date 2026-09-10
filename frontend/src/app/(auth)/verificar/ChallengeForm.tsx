'use client';

/**
 * T060 — the challenge step. FR-019, FR-049, FR-050, SC-005.
 *
 * THERE IS NO "REMEMBER THIS DEVICE" CONTROL, and there must never be one. The
 * constitution does not merely require the challenge on every sign-in; it
 * forbids the device-remembering capability from BEING BUILT — "substituting a
 * device credential for the MFA challenge is prohibited, whether a provider
 * offers it or this product would implement it". A checkbox here would be a
 * constitution violation, not a UX decision.
 *
 * Uses `016a`'s existing `input-otp` component. The challenge screen needed no
 * new UI package, which is why T003 added only `next-auth`.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

/** The same one message the credential step uses. A wrong code, an expired
 *  challenge, a replay, a lockout and an unavailable key are indistinguishable
 *  at the API and must stay indistinguishable here (FR-022, FR-055, FR-017). */
const REFUSED = 'No fue posible completar el acceso. Revisa tus datos e inténtalo de nuevo.';

export function ChallengeForm(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const challengeToken = params.get('reto') ?? '';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    // Through NextAuth, so the resulting credential lands in its httpOnly
    // cookie rather than anywhere script on this page can read (FR-051).
    const result = await signIn('legalconnect', {
      challengeToken,
      code,
      redirect: false,
    });

    setPending(false);

    if (!result || result.error) {
      setError(REFUSED);
      setCode('');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">Código de verificación</Label>
        <InputOTP
          id="code"
          maxLength={6}
          value={code}
          onChange={setCode}
          containerClassName="justify-center"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <p className="text-xs text-muted-foreground">
          Ingresa el código de seis dígitos que muestra tu aplicación de autenticación.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? 'Verificando…' : 'Verificar'}
      </Button>

      <p className="text-xs text-muted-foreground">
        ¿Perdiste tu aplicación?{' '}
        <a href="/recuperar" className="underline underline-offset-4">
          Usa un código de respaldo
        </a>
        .
      </p>
    </form>
  );
}
