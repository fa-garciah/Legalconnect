import { defineConfig, devices } from '@playwright/test';

/**
 * T004 — desktop and mobile projects, per SC-011: every control in the shell must be
 * reachable and usable at both a desktop-sized and a mobile-sized viewport.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Chromium-based mobile emulation rather than devices['iPhone 13'] (WebKit) —
      // SC-011 is about the viewport size, and this avoids a second browser engine
      // download for what is, for this slice's purposes, a CSS breakpoint question.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
