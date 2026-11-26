/**
 * 024 F1 — the platform surface answers only a TCP peer on this machine.
 *
 * Found putting the API in a container: it has to listen on 0.0.0.0 to be reachable, and with the
 * loopback BINDING gone `GET /internal/platform/tenants/:id` answered a stranger with the firm's
 * record — and `POST` on the same surface creates firms and seeds their administrators. The guard
 * now checks the socket's peer itself. Every case below is one a reverse proxy or a hostile client
 * can produce; none needs a database, because the surface resolves no session.
 */
import { describe, expect, it } from 'vitest';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { SessionGuard, isLoopbackPeer } from '../../src/common/auth/session.guard';
import { AUTH_SURFACE, PLATFORM_SURFACE } from '../../src/common/permissions/guard';

function platformGuard(): SessionGuard {
  const reflector = {
    getAllAndOverride: (key: unknown) => (key === PLATFORM_SURFACE ? true : key === AUTH_SURFACE ? false : undefined),
  } as unknown as Reflector;
  return new SessionGuard(reflector);
}

function contextFrom(remoteAddress: string | undefined, headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers, socket: { remoteAddress }, method: 'POST', originalUrl: '/internal/platform/tenants' };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('platform surface — loopback peers only', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.53'])('admits %s', async (peer) => {
    await expect(platformGuard().canActivate(contextFrom(peer))).resolves.toBe(true);
  });

  it.each(['10.0.1.7', '172.18.0.3', '::ffff:192.168.1.20', '2001:db8::1', '0.0.0.0', ''])(
    'refuses %s with the body an unknown route gets',
    async (peer) => {
      const refusal = platformGuard().canActivate(contextFrom(peer));
      await expect(refusal).rejects.toBeInstanceOf(NotFoundException);
      await expect(refusal).rejects.toMatchObject({
        response: { statusCode: 404, error: 'Not Found', message: 'Cannot POST /internal/platform/tenants' },
      });
    },
  );

  it('ignores X-Forwarded-For: a client can write it, so it can never make a peer local', async () => {
    const forged = contextFrom('203.0.113.9', { 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' });
    await expect(platformGuard().canActivate(forged)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses when the socket reports no peer at all', async () => {
    await expect(platformGuard().canActivate(contextFrom(undefined))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not take look-alikes for loopback', () => {
    for (const address of ['127.0.0', '127.0.0.1.evil', '::ffff:10.0.0.1', '1.127.0.0.1', '::2']) {
      expect(isLoopbackPeer(address), address).toBe(false);
    }
  });
});
