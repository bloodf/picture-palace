import { expect, test as base, type Page } from '@playwright/test';
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PP { game: any; engine: any; session: any; ui: () => any }
declare global { interface Window { __pp: PP } }
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => { const list: string[] = []; page.on('pageerror', (e) => list.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') list.push(m.text()); }); await use(list); expect(list, 'no console errors').toEqual([]); }, { auto: true }],
});
export { expect };
export const id = (p: Page, t: string) => p.getByTestId(t);
export async function boot(page: Page): Promise<void> { await page.goto('/?quality=low&seed=4242'); await expect(id(page, 'title')).toBeVisible({ timeout: 150_000 }); }
export async function start(page: Page, name = 'Test House'): Promise<void> {
  await boot(page);
  await id(page, 'new-game').click(); await id(page, 'theater-name').fill(name); await id(page, 'manager-name').fill('Robin'); await id(page, 'start-game').click();
  await expect(id(page, 'hud')).toBeVisible(); await id(page, 'coach-skip').click();
  await page.evaluate(() => { const g = window.__pp.game; g.s.eventCool = Object.fromEntries(['fire', 'blackout', 'pirate', 'rowdy', 'heckler', 'lostchild', 'faint', 'rat', 'bat', 'leak', 'flood', 'vomit', 'ring', 'graffiti', 'projector', 'pickpocket'].map((k: string) => [k, 99])); g.s.flags.eventsDay = g.s.day; g.s.flags.eventsToday = 99; window.__pp.ui().set({ paused: true }); });
}
/** Run the simulation forward without waiting for real time. */
export const sim = (page: Page, minute: number) => page.evaluate((m) => { const g = window.__pp.game; let n = 0; g.s.flags.eventsToday = 99; while (g.s.minute < m && g.s.phase !== 'report' && n++ < 20000) { g.step(0.1); for (const e of [...g.s.events]) g.chooseEvent(e.id, Math.max(0, e.choices.length - 1)); } g.s.events = []; window.__pp.session.bump(); return g.s.minute as number; }, minute);
export const cash = (page: Page) => page.evaluate(() => window.__pp.game.s.cash as number);
export const give = (page: Page, n: number) => page.evaluate((v) => { window.__pp.game.s.cash = v; window.__pp.session.bump(); }, n);
export const panel = async (page: Page, p: string) => { await id(page, `dock-${p}`).click(); await expect(id(page, `panel-${p}`)).toBeVisible(); };
export const closePanel = async (page: Page) => { await id(page, 'panel-close').click(); };
/** Fraction of distinct colours on the stage: a blank or crashed canvas is nearly uniform. */
export async function stageVariety(page: Page): Promise<number> { const png = await id(page, 'stage').screenshot(); return page.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const c = document.createElement('canvas'); c.width = 64; c.height = 40; const x = c.getContext('2d')!; x.drawImage(i, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data, s = new Set<number>(); for (let k = 0; k < d.length; k += 4) s.add(((d[k]! >> 4) << 8) | ((d[k + 1]! >> 4) << 4) | (d[k + 2]! >> 4)); return s.size; }, png.toString('base64')); }
export const walkMode = async (page: Page) => { await page.evaluate(() => window.__pp.ui().set({ paused: false })); await id(page, 'mode').click(); await expect.poll(() => page.evaluate(() => window.__pp.engine.rig.mode)).toBe('walk'); };
export const pos = (page: Page) => page.evaluate(() => ({ ...window.__pp.engine.player }) as { x: number; y: number; z: number });
export const teleport = (page: Page, x: number, z: number, yaw: number) => page.evaluate(([a, b, c]) => { const e = window.__pp.engine; e.phys.teleport(a, b); e.rig.wyaw = c; e.player.dir = c; e.player.x = a; e.player.z = b; }, [x, z, yaw]);
/** Hold a key for a number of rendered frames so slow machines do the same work as fast ones. */
export async function hold(page: Page, key: string, frames: number): Promise<void> { await page.keyboard.down(key); await page.evaluate((n) => new Promise<void>((r) => { const e = window.__pp.engine; let k = 0; const prev = e.cb.frame; e.cb.frame = (dt: number) => { prev?.(dt); if (++k >= n) { e.cb.frame = prev; r(); } }; }), frames); await page.keyboard.up(key); }
