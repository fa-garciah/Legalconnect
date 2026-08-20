import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // The isolation and RLS suites talk to a real PostgreSQL through
    // Testcontainers (research.md D11). RLS cannot be exercised against a mock
    // without producing tests that pass while proving nothing, so these are slow
    // by design and must not run concurrently against one container.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/main.ts'],

      // Constitution, Development Workflow & Quality Gates: tenant isolation is
      // on the non-negotiable blocking critical-coverage list.
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
      },
    },
  },
});
