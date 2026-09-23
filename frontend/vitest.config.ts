import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      /*
       * `next-auth/lib/env.js` imports `next/server` extensionless. Next resolves that
       * natively; Vite's ESM resolver does not, and the failure surfaces as "Cannot find
       * module .../next/server" in any suite whose component tree reaches a server action
       * — `Shell` does, through the rail's sign-out control (005).
       *
       * Aliased rather than worked around in product code: making `sign-out.ts` avoid
       * `@/auth` would mean not using NextAuth's own `signOut`, and mocking the module in
       * every suite that happens to mount the shell would put the burden on tests that
       * have nothing to do with authentication. This is a test-environment gap, so it is
       * closed in the test environment.
       */
      'next/server': path.resolve(__dirname, './node_modules/next/server.js'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    /*
     * `next-auth` is shipped as ESM that imports `next/server` extensionless, which Vite's
     * dependency resolver leaves untouched unless the package is processed rather than
     * externalised — so the alias above only reaches it once it is inlined here. Any suite
     * whose tree reaches a server action needs this; `Shell` does, through the rail's
     * sign-out control (005).
     */
    server: { deps: { inline: ['next-auth', '@auth/core'] } },
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/component/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/app/**/layout.tsx', 'src/app/**/page.tsx'],
    },
  },
});
