import { expect, id, start, test } from './kit';

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

test('phone controls support zoom, walking, cancellation and interaction', async ({ page }) => {
  await start(page, 'Pocket Palace');
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  await expect(zoom).toBeVisible();
  const before = await page.evaluate(() => window.__pp.engine.rig.dist);
  await zoom.tap();
  await expect.poll(() => page.evaluate(() => window.__pp.engine.rig.dist)).toBeLessThan(before);
  await id(page, 'mode').tap();
  const forward = page.getByRole('button', { name: 'Move forward', exact: true });
  await expect(forward).toBeVisible();
  const touch = await page.context().newCDPSession(page);
  const startTouch = async (target: typeof forward) => {
    const box = await target.boundingBox();
    if (!box) throw new Error('Touch control is not visible');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 7 }] });
  };
  await startTouch(forward);
  await expect.poll(() => page.evaluate(() => window.__pp.engine.input.fwd)).toBe(1);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__pp.engine.input.fwd)).toBe(0);
  const use = page.getByRole('button', { name: 'Interact or hold to work' });
  await startTouch(use);
  await expect.poll(() => page.evaluate(() => window.__pp.engine.input.use)).toBe(true);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__pp.engine.input.use)).toBe(false);
  await page.setViewportSize({ width: 812, height: 375 });
  const box = await forward.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(375);
});
