/**
 * A minimal Nest app with a probe controller, for the contract-level checks in US1.
 *
 * US1's business endpoints do not exist yet — provisioning is US3, the audit read is
 * US4. But `spec.md` says US1 must be independently testable, and the behaviour under
 * test here is the MECHANISM: does reaching for another tenant's row answer with
 * something indistinguishable from absence? A probe route exercises exactly that
 * without waiting for a business surface to exist.
 */
import { Controller, Get, Module, Param } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../../src/common/db/schema';
import { ResourceNotFound } from '../../src/common/http/errors';
import {
  TenantContextInterceptor,
  currentTx,
} from '../../src/common/tenant/middleware';
import { AuditInterceptor } from '../../src/common/audit/interceptor';
import {
  InMemoryMembershipPort,
  MEMBERSHIP_PORT,
  type MembershipRecord,
} from '../../src/common/tenant/membership';

@Controller('probe')
export class ProbeController {
  /** Fetches one audit entry by id, within whatever tenant the request activated. */
  @Get('audit/:id')
  async byId(@Param('id') id: string): Promise<{ id: string }> {
    const rows = await currentTx().select().from(auditEvent).where(eq(auditEvent.id, id));
    const row = rows[0];
    // RLS already made a foreign row invisible. The handler cannot tell "belongs to
    // someone else" from "does not exist" — which is precisely the property FR-008
    // wants, expressed as code rather than as a rule to remember.
    if (!row) throw new ResourceNotFound();
    return { id: row.id };
  }
}

export function buildTestModule(memberships: readonly MembershipRecord[]) {
  @Module({
    controllers: [ProbeController],
    providers: [
      { provide: MEMBERSHIP_PORT, useValue: new InMemoryMembershipPort(memberships) },
      { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      // Mirrors app.module.ts's registration order. ProbeController declares no
      // @Audited action, so this is a no-op for every existing test here — and it is
      // what proves an undeclared route passes straight through without recording.
      { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ],
  })
  class TestModule {}
  return TestModule;
}

export async function createTestApp(
  memberships: readonly MembershipRecord[],
): Promise<INestApplication> {
  const app = await NestFactory.create(buildTestModule(memberships), { logger: false });
  await app.init();
  return app;
}
