import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC rather than the default esbuild transform, and this is not a preference.
  //
  // esbuild has no support for `emitDecoratorMetadata` at all. NestJS needs it: without
  // it, parameter decorators such as @Body(), @Param() and @Req() emit no metadata, so
  // nothing binds and every decorated route answers 500 — while `tsc --noEmit` passes,
  // because tsc handles decorators correctly. That combination is unpleasant to
  // diagnose: the types are fine, the code is fine, and only the runtime is wrong.
  //
  // SWC implements both legacy decorators and emitDecoratorMetadata.
  // The decorator options are stated explicitly rather than left to tsconfig
  // inference. Without `decoratorMetadata` the symptom is identical to having no SWC
  // plugin at all — routes bind nothing and answer 500 — so an implicit default going
  // missing here would be invisible until the runtime failed.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],

  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // Loads .env for every file, so no test depends on import order to get its
    // connection strings, and a missing one fails with a clear message instead of a
    // uniform 500.
    setupFiles: ['./tests/setup-env.ts'],

    // The isolation and RLS suites talk to a real PostgreSQL through Testcontainers
    // (research.md D11). RLS cannot be exercised against a mock without producing
    // tests that pass while proving nothing, so these are slow by design and must not
    // run concurrently against one container.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/main.ts'],

      // Constitution, Development Workflow & Quality Gates: tenant isolation is on the
      // non-negotiable blocking critical-coverage list.
      thresholds: {
        'src/common/tenant/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/common/audit/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        'src/common/authz/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
