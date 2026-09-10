'use client';

/**
 * T090 — recovery with a backup code. FR-027, FR-028.
 *
 * REACHED FROM THE CHALLENGE SCREEN, NOT AS A SEPARATE FLOW. A person here has
 * already proved their credential; what they have lost is their authenticator.
 * Making this a distinct entry point would mean either asking for the
 * credential twice or accepting a backup code without one, and the second is
 * the shape of thing that turns a printout into a master key.
 *
 * WHAT SUCCESS DOES NOT DO: sign anybody in. The API answers with an enrollment
 * token and no session (FR-027), so this screen hands straight to
 * re-enrollment. A person recovering reaches no tenant-scoped capability until
 * a new factor is confirmed — otherwise a written-down code would be worth
 * exactly as much as the second factor it replaces.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const REFUSED = 'No fue posible completar el acceso. Revisa tus datos e inténtalo de nuevo.';

export function RecoveryForm(): React.JSX.Element {
  const router = useRouter();
  const challengeToken = useSearchParams().get('reto') ?? '';

  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/recovery/backup-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeToken, backupCode: backupCode.trim() }),
      });

      if (!response.ok) {
        setError(REFUSED);
        setBackupCode('');
        return;
      }

      const body = (await response.json()) as { enrollmentToken: string };
      // Straight to re-enrollment, carrying the token. No session exists yet
      // and none will until a new factor is confirmed.
      router.push(`/enrolar?reto=${encodeURIComponent(body.enrollmentToken)}`);
    } catch {
      setError(REFUSED);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="backupCode">Código de respaldo</Label>
        <Input
          id="backupCode"
          name="backupCode"
          autoComplete="one-time-code"
          spellCheck={false}
          className="font-mono"
          required
          value={backupCode}
          onChange={(event) => setBackupCode(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Usa uno de los códigos que guardaste al registrar tu segundo factor. Cada
          código sirve una sola vez.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending || backupCode.trim().length === 0}>
        {pending ? 'Verificando…' : 'Continuar'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Tendrás que registrar una nueva aplicación de autenticación en el siguiente
        paso, y recibirás códigos de respaldo nuevos.
      </p>
    </form>
  );
}
