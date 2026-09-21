/**
 * T054 — the authentication module.
 *
 * Holds the ONLY code permitted to import `common/auth/auth-db`, which is the
 * lc_auth connection and the one connection in this product that can reach
 * authentication material at all. A module that imports it is claiming to be part
 * of the authentication layer, and that claim should be visible in review.
 */
import { Module } from '@nestjs/common';
import { SignInController } from './sign-in.controller';
import { EnrollmentController } from './enrollment.controller';
import { RecoveryController } from './recovery.controller';
import { SignInService } from './sign-in.service';
import { EnrollmentService } from './enrollment.service';
import { RecoveryService } from './recovery.service';
// 005-session-lifecycle.
import { SignOutController } from './sign-out.controller';
import { SignOutService } from './sign-out.service';
import { StepUpController } from './step-up.controller';
import { StepUpService } from './step-up.service';

@Module({
  controllers: [
    SignInController,
    EnrollmentController,
    RecoveryController,
    SignOutController,
    StepUpController,
  ],
  providers: [SignInService, EnrollmentService, RecoveryService, SignOutService, StepUpService],
  exports: [SignInService, EnrollmentService, RecoveryService, SignOutService, StepUpService],
})
export class AuthModule {}
