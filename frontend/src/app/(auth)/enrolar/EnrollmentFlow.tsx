'use client';

/**
 * T072, T081 — enrollment, and the one-time display of the backup codes.
 *
 * TWO THINGS THIS SCREEN MUST NOT DO, both of which are easy to do by accident:
 *
 * 1. PERSIST ANYTHING. The secret, the QR and the ten codes all pass through
 *    this component and none may reach localStorage, sessionStorage or
 *    IndexedDB (FR-051, SC-028). They live in React state for the length of the
 *    flow and are gone on unmount.
 *
 * 2. OFFER TO SHOW THE CODES AGAIN. There is no route that returns them — not
 *    for their owner, not for an SA, not for the platform operator (FR-024,
 *    FR-029) — so a "view codes" affordance would be a button that cannot work.
 *    The acknowledgement gate below exists because of that: once this screen is
 *    left, the codes are gone for good, and the person needs to have understood
 *    that before leaving.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const REFUSED = 'No fue posible completar el acceso. Revisa tus datos e inténtalo de nuevo.';

type Stage =
  | { name: 'loading' }
  | { name: 'register'; secret: string; otpauthUri: string; token: string }
  | { name: 'codes'; codes: string[] }
  | { name: 'failed' };

export function EnrollmentFlow(): React.JSX.Element {
  const router = useRouter();
  const challengeToken = useSearchParams().get('reto') ?? '';

  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);

  async function begin(): Promise<void> {
    setPending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/enrollment/begin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeToken }),
      });
      if (!response.ok) {
        setStage({ name: 'failed' });
        return;
      }
      const body = (await response.json()) as {
        secret: string;
        otpauthUri: string;
        enrollmentToken: string;
      };
      setStage({
        name: 'register',
        secret: body.secret,
        otpauthUri: body.otpauthUri,
        token: body.enrollmentToken,
      });
    } catch {
      setStage({ name: 'failed' });
    } finally {
      setPending(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (stage.name !== 'register') return;
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/enrollment/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enrollmentToken: stage.token, code }),
      });
      if (!response.ok) {
        setError(REFUSED);
        setCode('');
        return;
      }
      const body = (await response.json()) as { backupCodes: string[] };
      setStage({ name: 'codes', codes: body.backupCodes });
    } catch {
      setError(REFUSED);
    } finally {
      setPending(false);
    }
  }

  if (stage.name === 'loading') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Para continuar necesitas registrar una aplicación de autenticación.
        </p>
        <Button className="w-full" onClick={begin} disabled={pending}>
          {pending ? 'Preparando…' : 'Comenzar registro'}
        </Button>
      </div>
    );
  }

  if (stage.name === 'failed') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {REFUSED}
      </p>
    );
  }

  if (stage.name === 'codes') {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-sm font-medium">Códigos de respaldo</h2>
          <p className="text-sm text-muted-foreground">
            Guárdalos en un lugar seguro. <strong>Se muestran una sola vez</strong> y no
            podrás volver a verlos.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {stage.codes.map((backupCode) => (
            <li key={backupCode}>{backupCode}</li>
          ))}
        </ul>

        <div className="flex items-start gap-2">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(value) => setAcknowledged(value === true)}
          />
          <Label htmlFor="acknowledge" className="text-sm font-normal leading-snug">
            Ya guardé mis códigos de respaldo.
          </Label>
        </div>

        <Button
          className="w-full"
          disabled={!acknowledged}
          onClick={() => {
            router.push('/');
            router.refresh();
          }}
        >
          Continuar
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4" noValidate>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Escanea este código en tu aplicación de autenticación, o ingresa la clave
          manualmente.
        </p>
        {/* The otpauth URI is what a QR renders; the bare secret is the manual
            fallback the contract requires alongside it. */}
        <p className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs" data-testid="otpauth-uri">
          {stage.otpauthUri}
        </p>
        <div className="space-y-1">
          <Label htmlFor="secret">Clave para ingreso manual</Label>
          <p id="secret" className="font-mono text-sm tracking-wider">
            {stage.secret}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">Código de verificación</Label>
        <InputOTP id="code" maxLength={6} value={code} onChange={setCode} containerClassName="justify-center">
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
        {pending ? 'Verificando…' : 'Confirmar'}
      </Button>
    </form>
  );
}
