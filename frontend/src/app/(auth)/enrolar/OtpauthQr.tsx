/**
 * The QR an authenticator app scans to register the second factor.
 *
 * WHY IT EXISTS. The enrollment screen said "Escanea este código" and showed the raw
 * `otpauth://` URI as text — there was no code to scan, so a person enrolling from a phone
 * had to type a 32-character key by hand. Found by `design:design-critique`, 2026-09-22.
 *
 * GENERATED IN THE BROWSER, FROM THE URI THE API RETURNED, AND NOWHERE ELSE. The URI carries
 * the TOTP secret. Rendering it through a remote QR service would hand that secret to a third
 * party; `qrcode` builds the image locally. The result lives in component state only and is
 * gone on unmount — the same no-persistence rule the rest of this flow keeps (FR-051).
 *
 * An SVG string rendered as an `<img src="data:…">`, rather than a canvas or injected markup:
 * it needs no canvas (so it works in tests and on every browser), and it never goes through
 * `dangerouslySetInnerHTML`. The QR's own black-on-white is left as the library draws it —
 * maximum contrast is what makes a code scan reliably, so it is not themed.
 */
'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function OtpauthQr({ uri }: { uri: string }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (!cancelled) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      })
      .catch(() => {
        // Nothing to draw. The manual key beside it is the fallback, so the flow still works.
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return (
    <div className="flex justify-center">
      <div className="rounded-lg border bg-card p-3">
        {src ? (
          // `next/image` optimises remote or static images. This is a `data:` SVG built in the
          // browser from a secret-bearing URI: there is nothing to fetch, resize or cache, and
          // routing it through the image optimiser would send the URI to the server.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Código QR para registrar LegalConnect MX en tu aplicación de autenticación"
            width={176}
            height={176}
            className="h-44 w-44"
          />
        ) : (
          <div aria-hidden className="h-44 w-44 animate-pulse rounded bg-muted" />
        )}
      </div>
    </div>
  );
}
