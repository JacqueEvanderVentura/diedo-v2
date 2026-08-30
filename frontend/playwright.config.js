import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/full-stack/**',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx vite --host 127.0.0.1 --port 3100 --strictPort',
      url: 'http://127.0.0.1:3100',
      env: { VITE_DEMO_SEED_ENABLED: 'false' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 3101 --strictPort',
      url: 'http://127.0.0.1:3101',
      env: { VITE_DEMO_SEED_ENABLED: 'true' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
