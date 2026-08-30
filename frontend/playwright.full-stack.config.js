import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const frontendDir = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(frontendDir, '../backend')
const python = process.platform === 'win32'
  ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
  : path.join(backendDir, '.venv', 'bin', 'python')
const databaseUrl = process.env.FULL_STACK_DATABASE_URL
  || 'postgresql+psycopg://erp:erp@127.0.0.1:5434/erp_test'
const adminPassword = process.env.FULL_STACK_ADMIN_PASSWORD
  || 'full-stack-test-password-not-a-secret-2026'

export default defineConfig({
  testDir: './e2e/full-stack',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3200',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `"${python}" -m app.scripts.run_full_stack_test_server`,
      cwd: backendDir,
      url: 'http://127.0.0.1:8200/health/ready',
      env: {
        APP_ENV: 'test',
        DATABASE_URL: databaseUrl,
        JWT_SECRET_KEY: 'full-stack-test-jwt-secret-with-at-least-32-characters',
        CORS_ORIGINS: 'http://127.0.0.1:3200',
        DEMO_SEED_ENABLED: 'true',
        LOCAL_BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 3200 --strictPort',
      cwd: frontendDir,
      url: 'http://127.0.0.1:3200',
      env: {
        API_PROXY_TARGET: 'http://127.0.0.1:8200',
        VITE_API_BASE_URL: '/api-backend',
        VITE_DEMO_SEED_ENABLED: 'false',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
