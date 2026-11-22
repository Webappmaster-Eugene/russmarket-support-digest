import { defineConfig } from '@playwright/test'

const localUrl = 'http://127.0.0.1:4367'
const externalUrl = process.env.RUSSMARKET_E2E_URL
const executablePath = process.env.RUSSMARKET_CHROMIUM_PATH

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL: externalUrl ?? localUrl,
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: 'retain-on-failure',
  },
  webServer: externalUrl ? undefined : {
    command: 'corepack pnpm exec next dev --hostname 127.0.0.1 --port 4367',
    url: `${localUrl}/api/health`,
    timeout: 90_000,
  },
})
