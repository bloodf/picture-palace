import { boot, expect, id, sim, stageVariety, start, test } from './kit';
test('the title screen loads the theater and shows a real picture', async ({ page }) => {
  await boot(page); await expect(page).toHaveTitle('Picture Palace'); await page.waitForTimeout(1500); expect(await stageVariety(page)).toBeGreaterThan(60);
  for (const b of ['new-game', 'load-game']) await expect(id(page, b)).toBeVisible();
});
test('a new game can be named, staffed with a manager and toured', async ({ page }) => {
  await boot(page); await id(page, 'new-game').click(); await id(page, 'theater-name').fill('The Bijou'); await id(page, 'avatar').getByText('Man', { exact: true }).click(); await id(page, 'diff-directors').click(); await id(page, 'start-game').click();
  await expect(id(page, 'hud')).toContainText('$8,000'); expect(await page.evaluate(() => [window.__pp.game.s.site.name, window.__pp.game.s.avatar, window.__pp.game.s.difficulty])).toEqual(['The Bijou', 'mgr_m', 'directors']);
  await expect(id(page, 'coach')).toBeVisible(); for (let i = 0; i < 7; i++) await id(page, 'coach-next').click(); await expect(id(page, 'coach')).toHaveCount(0);
});
test('time can be paused, sped up and skipped to opening', async ({ page }) => {
  await start(page); const m = () => page.evaluate(() => window.__pp.game.s.minute as number);
  const a = await m(); await page.waitForTimeout(900); expect(await m()).toBe(a);
  await id(page, 'speed-4').click(); await expect.poll(m, { timeout: 20_000 }).toBeGreaterThan(a + 2); await page.keyboard.press('Space'); await page.waitForTimeout(400); const b = await m(); await page.waitForTimeout(700); expect(await m()).toBe(b);
  await page.keyboard.press('1'); expect(await page.evaluate(() => window.__pp.game.s.speed)).toBe(1); await id(page, 'open-doors').click(); await expect.poll(() => page.evaluate(() => window.__pp.game.s.phase), { timeout: 30_000 }).toBe('open');
});
test('the manager view renders guests arriving, and the frame loop keeps turning', async ({ page }) => {
  await start(page); await sim(page, 13 * 60); expect(await page.evaluate(() => window.__pp.game.s.guests.length)).toBeGreaterThan(3); await page.evaluate(() => window.__pp.ui().set({ paused: false }));
  await expect.poll(() => page.evaluate(() => window.__pp.engine.crowd.drawn), { timeout: 20_000 }).toBeGreaterThan(3); expect(await stageVariety(page)).toBeGreaterThan(50); expect(await page.evaluate(() => window.__pp.engine.fps)).toBeGreaterThan(0.5);
});
