/**
 * 021 (FR-018). Renders a refusal from a document action: the specific Spanish sentence when
 * `refusal-copy.ts` has one, otherwise `016a`'s classified state. Never the server's `message`.
 */
'use client';

import { ErrorState } from '@/feedback/ErrorState';
import { classifyRefusal } from '@/feedback/refusal-bucket';
import { documentRefusalCopy } from '@/documents/refusal-copy';
import type { FailedResponse } from '@/lib/api-client';

export function RefusalNotice({
  refusal,
  onRetry,
}: {
  readonly refusal: FailedResponse | null;
  readonly onRetry?: () => void;
}): React.JSX.Element {
  const copy = documentRefusalCopy(refusal);
  if (copy) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {copy}
      </p>
    );
  }
  return <ErrorState refusal={classifyRefusal(refusal)} onRetry={onRetry ?? (() => {})} />;
}
