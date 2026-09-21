/**
 * T023 — `POST /auth/sign-out`. contracts/session-lifecycle.md.
 *
 * `@AuthSurface()` + `@IdentitySurface()`, the exact pair `sign-in.controller.ts`
 * already carries — this route requires a presented access token but no tenant
 * context, and (research.md D4) sits outside `AuthorizationInterceptor`'s reach
 * entirely, the same carve-out `003` already established for `/auth/refresh`. See
 * `sign-out.service.ts` for why it resolves its own token rather than reading
 * anything `SessionGuard` would have populated.
 */
import { Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AuthSurface, bearerToken } from '../../common/auth/session.guard';
import { IdentitySurface } from '../../common/permissions/guard';
import { SignOutService, type SignOutResult } from './sign-out.service';

interface RequestWithAuthHeader {
  headers: Record<string, string | string[] | undefined>;
}

@AuthSurface()
@IdentitySurface()
@Controller('auth')
export class SignOutController {
  constructor(private readonly signOutService: SignOutService) {}

  @Post('sign-out')
  @HttpCode(HttpStatus.OK)
  async signOut(@Req() request: RequestWithAuthHeader): Promise<SignOutResult> {
    const token = bearerToken(request.headers);
    // No credential presented at all is a structural precondition failure, not
    // "an already-dead session" — FR-005's idempotency is about a real, expired or
    // revoked token, not about the absence of one.
    if (!token) throw new UnauthorizedException('No autenticado.');
    return this.signOutService.signOut(token);
  }
}
