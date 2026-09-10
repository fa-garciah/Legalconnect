/**
 * T032 — the per-origin throttle. FR-005, research.md D7.
 *
 * THIS IS BEST-EFFORT AND EXPLICITLY NOT AUTHORITATIVE. It cannot be, and saying
 * so in the file is the point rather than a disclaimer.
 *
 * The counters live in this process's memory. Production runs several ECS tasks
 * behind a load balancer with no Redis and no shared store, so an attacker
 * spreading attempts across tasks divides their observed rate by the task count,
 * and a deploy resets every counter to zero. Anything that treated this as the
 * control would be relying on a number that is wrong by a factor nobody measures.
 *
 * THE SECURITY CONTROL IS THE PER-IDENTITY LOCKOUT — five consecutive failures,
 * fifteen minutes, enforced inside `claim_attempt()` under FOR UPDATE against a
 * row in PostgreSQL (FR-021, D7). That one is authoritative because the state is
 * shared, transactional and survives a deploy. This throttle exists for a
 * different and smaller job: bounding the log and refusal volume a scripted
 * attempt generates against a single instance, so a burst does not drown the audit
 * log that is the product's only detection net while the primary factor stays
 * phishable.
 *
 * It is therefore correct for this to be approximate. It would NOT be correct for
 * it to be the thing standing between an attacker and an account, and no caller
 * should ever be written as though it were.
 */

export interface ThrottleDecision {
  readonly allowed: boolean;
  /** Seconds until the window rolls over. Never disclosed to a caller (FR-055). */
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

export class OriginThrottle {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Records an attempt and says whether it is within the window's allowance.
   *
   * The caller must refuse INDISTINGUISHABLY from a wrong credential when this
   * returns false. A throttle that announced itself would tell an attacker they
   * had found a real endpoint and how fast they may probe it (FR-022, FR-055).
   */
  record(origin: string): ThrottleDecision {
    const now = this.now();
    const windowMs = this.windowSeconds * 1000;
    const bucket = this.buckets.get(origin);

    if (!bucket || now - bucket.windowStartedAt >= windowMs) {
      this.buckets.set(origin, { count: 1, windowStartedAt: now });
      return { allowed: true, retryAfterSeconds: this.windowSeconds };
    }

    bucket.count += 1;
    const elapsed = now - bucket.windowStartedAt;
    return {
      allowed: bucket.count <= this.limit,
      retryAfterSeconds: Math.max(0, Math.ceil((windowMs - elapsed) / 1000)),
    };
  }

  /**
   * Drops windows that have rolled over.
   *
   * Without this the map grows once per distinct origin for the process's
   * lifetime, which is a slow memory leak an attacker can drive deliberately by
   * varying their source. Called opportunistically rather than on a timer, so
   * there is no interval to leak in tests.
   */
  prune(): void {
    const cutoff = this.now() - this.windowSeconds * 1000;
    for (const [origin, bucket] of this.buckets) {
      if (bucket.windowStartedAt < cutoff) this.buckets.delete(origin);
    }
  }

  /** Test seam. Never called in production. */
  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Shared instance. Thresholds mirror FR-021's per-identity values so neither step
 * of the sign-in is throttled more loosely than the other (FR-005) — but note the
 * asymmetry in what they defend: the lockout defends ONE ACCOUNT, this defends one
 * instance's logs against ONE SOURCE.
 */
export const signInOriginThrottle = new OriginThrottle(
  Number(process.env.AUTH_LOCKOUT_THRESHOLD ?? 5),
  Number(process.env.AUTH_LOCKOUT_MINUTES ?? 15) * 60,
);
