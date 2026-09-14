import { defineConfig, devices } from '@playwright/test'
import { settings } from './support/env.js'

/**
 * One Vite dev server per store, each built against the real Odoo API.
 *
 * `VITE_*` values are read when the dev server starts, so the second store
 * (S-8, S-9) needs a second server rather than a second base URL at runtime.
 * Variables already in the environment beat `.env.local`, so a developer's own
 * settings there do not leak into the run.
 */
const devServer = ({ port, api, tag }) => ({
  command: `node node_modules/vite/bin/vite.js --config e2e/support/vite.config.mjs --port ${port} --strictPort`,
  cwd: settings.storefrontRoot,
  url: `http://localhost:${port}`,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
  stdout: 'ignore',
  stderr: 'pipe',
  env: {
    ...process.env,
    VITE_DATA_SOURCE: 'api',
    VITE_API_BASE_URL: api,
    VITE_API_CACHE: 'off',
    VITE_API_TIMEOUT: '30000',
    VITE_API_TOKEN: '',
    LOOM_E2E_VITE_TAG: tag,
  },
})

/**
 * The storefront as a host serves it: built, with pages rendered on request by server/handler.mjs. S-12 reads raw
 * HTML from it, including a product created after the build.
 */
const renderServer = ({ port, api }) => ({
  command: 'node e2e/support/render-server.mjs',
  cwd: settings.storefrontRoot,
  url: `http://localhost:${port}/cart`,
  reuseExistingServer: !process.env.CI,
  timeout: 300_000,
  stdout: 'ignore',
  stderr: 'pipe',
  env: {
    ...process.env,
    PORT: String(port),
    VITE_DATA_SOURCE: 'api',
    VITE_API_BASE_URL: api,
    VITE_API_TIMEOUT: '30000',
    VITE_API_TOKEN: '',
    LOOM_E2E_VITE_TAG: 'render',
    SITE_URL: '',
  },
})

export default defineConfig({
  testDir: './tests',
  // The scenarios share one Odoo database and some of them change prices, stock
  // and promotions while they run. One at a time, in file order.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  globalSetup: './support/global-setup.js',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: settings.storefrontUrl,
    locale: 'en-US',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: settings.skipWebServer
    ? undefined
    : [
        devServer({ port: settings.port, api: settings.api, tag: 'store-e2e' }),
        devServer({ port: settings.port2, api: settings.api2, tag: 'store-e2e-kw' }),
        ...(process.env.LOOM_E2E_CRAWL_URL ? [] : [renderServer({ port: settings.renderPort, api: settings.api })]),
      ],
})
