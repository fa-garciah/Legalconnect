/**
 * T071 — `POST /auth/enrollment/begin` and `/confirm`. contracts/enrollment.md.
 *
 * REACHABLE ONLY BY AN IDENTITY PAST THE CREDENTIAL STEP WITH NO CONFIRMED
 * FACTOR, and that gate is STATE rather than capability. There is no
 * `@Capability()` here for the same reason there is none on `/auth/*`: an
 * unenrolled identity holds no capability by definition, which is exactly the
 * state these routes exist to end. The token is the gate, and the service
 * refuses an already-enrolled identity (FR-012).
 */
import { Body, Controller, Post } from '@nestjs/common';
import { AuthSurface } from '../../common/auth/session.guard';
import { IdentitySurface } from '../../common/permissions/guard';
import { ValidationFailed } from '../../common/http/errors';
import { EnrollmentService, type BeginResult, type ConfirmResult } from './enrollment.service';

interface BeginBody {
  readonly challengeToken?: string;
}
interface ConfirmBody {
  readonly enrollmentToken?: string;
  readonly code?: string;
}

@AuthSurface()
@IdentitySurface()
@Controller('auth/enrollment')
export class EnrollmentController {
  constructor(private readonly enrollment: EnrollmentService) {}

  @Post('begin')
  async begin(@Body() body: BeginBody): Promise<BeginResult> {
    if (!body?.challengeToken) throw new ValidationFailed('Se requiere el token de reto.');
    return this.enrollment.begin(body.challengeToken);
  }

  @Post('confirm')
  async confirm(@Body() body: ConfirmBody): Promise<ConfirmResult> {
    if (!body?.enrollmentToken || !body?.code) {
      throw new ValidationFailed('Se requieren el token de enrolamiento y el código.');
    }
    return this.enrollment.confirm(body.enrollmentToken, body.code);
  }
}
