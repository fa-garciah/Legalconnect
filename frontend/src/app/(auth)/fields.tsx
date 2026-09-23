/**
 * The fields the authentication screens share: a leading icon, and a show/hide control on
 * passwords. Taken from the reference design reviewed on 2026-09-22; everything else about
 * them is the stock `Input`, so focus, borders and disabled states stay the design system's.
 *
 * `className` passes through to `Input` rather than being replaced, so a field keeps the
 * `--input` border (3:1, WCAG 1.4.11) and the brand focus ring.
 *
 * Height is `--space-control-h` (42px) rather than the stock 40px: the design-critique pass
 * found the auth fields a step below the density token `020` defines for every control.
 */
'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type NativeInput = Omit<ComponentProps<'input'>, 'id'>;

export interface IconFieldProps extends NativeInput {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Rendered inside the field on the right — the password toggle uses it. */
  readonly trailing?: React.ReactNode;
}

export function IconField({
  id,
  label,
  icon: Icon,
  trailing,
  className,
  ...input
}: IconFieldProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          className={cn('h-[var(--space-control-h)] bg-card pl-10', trailing ? 'pr-11' : '', className)}
          {...input}
        />
        {trailing ? <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div> : null}
      </div>
    </div>
  );
}

export interface PasswordFieldProps extends Omit<IconFieldProps, 'icon' | 'type' | 'trailing'> {
  readonly autoComplete: 'current-password' | 'new-password';
}

/**
 * A password field whose value can be revealed.
 *
 * The toggle is a real `type="button"` — a bare `<button>` inside a form defaults to
 * `submit`, and a person checking what they typed would submit the form instead. Its name
 * says what it WILL do and `aria-pressed` says what state it is in, so a screen reader
 * announces both.
 */
export function PasswordField({ autoComplete, ...props }: PasswordFieldProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <IconField
      {...props}
      icon={Lock}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      trailing={
        <button
          type="button"
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ToggleIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      }
    />
  );
}
