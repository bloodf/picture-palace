import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', timeout: 240_000, expect: { timeout: 30_000 }, workers: 1, fullyParallel: false, retries: 1, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1280, height: 800 }, actionTimeout: 30_000, screenshot: 'only-on-failure', trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] } },
  webServer: { command: 'npx vite build --logLevel warn && npx vite preview --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', timeout: 240_000, reuseExistingServer: false },
});
