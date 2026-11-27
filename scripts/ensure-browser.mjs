// Makes sure Playwright's Chromium is installed before the e2e run; installs it only when missing.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
if (!existsSync(chromium.executablePath())) {
  try { const b = await chromium.launch(); await b.close(); }
  catch { console.log('Installing Chromium for the e2e tests…'); const r = spawnSync('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit', shell: true }); process.exit(r.status ?? 1); }
}
