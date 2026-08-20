import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { PlatformAuditController } from './platform-audit.controller';

/**
 * The audit read surface — tenant-facing (US4) and platform-facing (cross-tenant).
 * Both share the query repository and window clamp; nothing about the read logic
 * differs between them beyond which transaction and which tenant scope apply.
 */
@Module({
  controllers: [AuditController, PlatformAuditController],
})
export class AuditModule {}
