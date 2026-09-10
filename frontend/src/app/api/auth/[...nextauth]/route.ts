/**
 * T057 — NextAuth's route handler. The whole configuration lives in `src/auth.ts`;
 * this file exists because the App Router needs the handlers mounted at a path.
 */
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
