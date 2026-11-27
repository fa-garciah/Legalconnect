/**
 * 003/FR-005 — the per-origin throttle counts FAILED credential attempts and resets on success.
 *
 * Found 2026-11-27 driving the rehearsal: it counted every attempt, so the sixth person of an
 * office (one public address) to sign in within 15 minutes was refused — and behind Traefik,
 * where every request carried the proxy's address, the sixth person of the whole platform.
 */
import { describe, expect, it } from 'vitest';
import { OriginThrottle } from '../../src/common/auth/origin-throttle';

describe('OriginThrottle (003/FR-005)', () => {
  it('is not blocked by any number of successes, because only failures are recorded', () => {
    const throttle = new OriginThrottle(5, 900, () => 0);
    for (let i = 0; i < 20; i += 1) {
      expect(throttle.isBlocked('office')).toBe(false);
      throttle.clear('office'); // what a successful credential step does
    }
  });

  it('blocks after five failures within the window, and only that origin', () => {
    const throttle = new OriginThrottle(5, 900, () => 0);
    for (let i = 0; i < 4; i += 1) throttle.record('attacker');
    expect(throttle.isBlocked('attacker')).toBe(false);
    throttle.record('attacker');
    expect(throttle.isBlocked('attacker')).toBe(true);
    expect(throttle.isBlocked('office')).toBe(false);
  });

  it('a success clears the count (counter reset on success)', () => {
    const throttle = new OriginThrottle(5, 900, () => 0);
    for (let i = 0; i < 4; i += 1) throttle.record('office');
    throttle.clear('office');
    for (let i = 0; i < 4; i += 1) throttle.record('office');
    expect(throttle.isBlocked('office')).toBe(false);
  });

  it('unblocks once the window rolls over', () => {
    let now = 0;
    const throttle = new OriginThrottle(5, 900, () => now);
    for (let i = 0; i < 5; i += 1) throttle.record('attacker');
    expect(throttle.isBlocked('attacker')).toBe(true);
    now = 900 * 1000;
    expect(throttle.isBlocked('attacker')).toBe(false);
  });
});
