/**
 * T031 — `POST /auth/step-up`. contracts/session-lifecycle.md.
 *
 * `@AuthSurface()` + `@IdentitySurface()`, the same pair `sign-out.controller.ts`
 * carries — see `step-up.service.ts` for why it resolves its own presented token.
 */
import { Body, Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AuthSurface, bearerToken } from '../../common/auth/session.guard';
import { IdentitySurface } from '../../common/permissions/guard';
import { ValidationFailed } from '../../common/http/errors';
import { StepUpService, type StepUpResult } from './step-up.service';

interface StepUpBody {
  readonly capability?: string;
  readonly code?: string;
}
interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

@AuthSurface()
@IdentitySurface()
@Controller('auth')
export class StepUpController {
  constructor(private readonly stepUpService: StepUpService) {}

  @Post('step-up')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: StepUpBody, @Req() request: RequestWithHeaders): Promise<StepUpResult> {
    if (!body?.capability || !body?.code) {
      throw new ValidationFailed('Se requieren capability y código.');
    }
    const token = bearerToken(request.headers);
    if (!token) throw new UnauthorizedException('No autenticado.');
    return this.stepUpService.verify(token, body.capability, body.code);
  }
}
