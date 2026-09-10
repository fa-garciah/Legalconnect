/**
 * T089 — `POST /auth/recovery/backup-code` and `/reenroll`.
 * contracts/recovery.md.
 *
 * `/reenroll` is reachable ONLY immediately after a satisfied recovery, and the
 * gate is the enrollment token that route returned. It is the same token
 * `/auth/enrollment/begin` accepts, which is the point: the enrollment
 * mechanism is REUSED rather than duplicated. There is one way to enroll a
 * factor in this product and recovery walks through it — so the
 * confirmed_at / mfa_enrolled_at invariant has one implementation, not two.
 */
import { Body, Controller, Post } from '@nestjs/common';
import { AuthSurface } from '../../common/auth/session.guard';
import { IdentitySurface } from '../../common/permissions/guard';
import { ValidationFailed } from '../../common/http/errors';
import { RecoveryService, type RecoveryResult } from './recovery.service';
import { EnrollmentService, type ConfirmResult } from './enrollment.service';

interface BackupCodeBody {
  readonly challengeToken?: string;
  readonly backupCode?: string;
}
interface ReenrollBody {
  readonly enrollmentToken?: string;
  readonly code?: string;
}

@AuthSurface()
@IdentitySurface()
@Controller('auth/recovery')
export class RecoveryController {
  constructor(
    private readonly recovery: RecoveryService,
    private readonly enrollment: EnrollmentService,
  ) {}

  @Post('backup-code')
  async withBackupCode(@Body() body: BackupCodeBody): Promise<RecoveryResult> {
    if (!body?.challengeToken || !body?.backupCode) {
      throw new ValidationFailed('Se requieren el token de reto y el código de respaldo.');
    }
    const satisfied = await this.recovery.satisfyWithBackupCode(
      body.challengeToken,
      body.backupCode,
    );

    // IMMEDIATELY, in the same request. Satisfying with a backup code retires
    // the old factor, drops the rest of the code set, and REVOKES EVERY LIVE
    // SESSION — because the ordinary reason somebody is here is that their
    // phone was stolen, and leaving the thief's session alive while its owner
    // recovers would defeat the recovery.
    //
    // It also has to happen before /auth/enrollment/begin will do anything:
    // that route refuses an identity holding a confirmed factor (FR-012), which
    // is exactly what makes the enrollment mechanism reusable here rather than
    // duplicated.
    await this.recovery.prepareReenrollment(satisfied.identityId);

    return satisfied;
  }

  @Post('reenroll')
  async reenroll(@Body() body: ReenrollBody): Promise<ConfirmResult> {
    if (!body?.enrollmentToken || !body?.code) {
      throw new ValidationFailed('Se requieren el token de enrolamiento y el código.');
    }
    // Confirmation is EnrollmentService's, unchanged: it sets both columns in
    // one transaction and issues a complete new set of ten (FR-028).
    return this.enrollment.confirm(body.enrollmentToken, body.code);
  }
}
