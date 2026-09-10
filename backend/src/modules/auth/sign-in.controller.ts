/**
 * T053 — the three authentication routes. contracts/authentication.md.
 *
 * EVERY ROUTE HERE IS UNGATED BY 004, AND THAT IS CORRECT RATHER THAN AN
 * OVERSIGHT. contracts/README.md states it so an ungated authentication route is
 * not later filed as a defect, and the markers below say it in code:
 *
 *   @AuthSurface()     — exempt from SessionGuard. These routes are how a session
 *                        comes to exist; requiring one would be circular.
 *   @IdentitySurface() — exempt from TenantContextInterceptor. No tenant has been
 *                        chosen yet, and none could be: which firm a person
 *                        reaches is decided after they are known, not before.
 *
 * There is no @Capability() either. 004 decides what a resolved principal may do;
 * these routes run before a principal exists at all.
 */
import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthSurface } from '../../common/auth/session.guard';
import { IdentitySurface } from '../../common/permissions/guard';
import { ValidationFailed } from '../../common/http/errors';
import {
  SignInService,
  type CredentialStepResult,
  type SessionResult,
} from './sign-in.service';

interface SignInBody {
  readonly email?: string;
  readonly password?: string;
}
interface FactorBody {
  readonly challengeToken?: string;
  readonly code?: string;
}
interface RefreshBody {
  readonly refreshToken?: string;
}

interface RequestWithIp {
  ip?: string;
  socket?: { remoteAddress?: string };
}

@AuthSurface()
@IdentitySurface()
@Controller('auth')
export class SignInController {
  constructor(private readonly signIn: SignInService) {}

  @Post('sign-in')
  async credentialStep(
    @Body() body: SignInBody,
    @Req() request: RequestWithIp,
  ): Promise<CredentialStepResult> {
    if (!body?.email || !body?.password) {
      throw new ValidationFailed('Se requieren correo y contraseña.');
    }
    const origin = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    return this.signIn.signIn(body.email, body.password, origin);
  }

  @Post('factor')
  async challengeStep(@Body() body: FactorBody): Promise<SessionResult> {
    if (!body?.challengeToken || !body?.code) {
      throw new ValidationFailed('Se requieren el token de reto y el código.');
    }
    return this.signIn.completeChallenge(body.challengeToken, body.code);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshBody): Promise<SessionResult> {
    if (!body?.refreshToken) {
      throw new ValidationFailed('Se requiere el token de renovación.');
    }
    return this.signIn.refresh(body.refreshToken);
  }
}
