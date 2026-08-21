/**
 * The real production wiring (`AppModule`) with the real `DbMembershipPort` —
 * for contract tests that need actual seeded identity/membership/invitation
 * rows behind real HTTP requests, rather than the fixture-driven
 * `InMemoryMembershipPort` helpers 001 built for its own tests.
 */
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

export async function createRealApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  return app;
}
