import { test, expect } from '@playwright/test';

test('小书紧邻标题并实际翻页，减少动态效果后静止', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?demo=1');
  const book = page.locator('[data-book-scene]');
  await expect(book).toBeVisible();
  const title = await page
    .getByRole('heading', { name: '作业安排', exact: true })
    .boundingBox();
  const bounds = await book.boundingBox();
  expect(bounds!.x - title!.x - title!.width).toBeLessThan(60);
  const leaf = page.locator('[data-book-leaf]');
  const before = await leaf.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(() => leaf.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(before);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(book).toHaveAttribute('data-motion', 'static');
  // 等待 React 生命周期清理把书页复位，而不是只等待状态属性更新。
  await expect(leaf).toHaveCSS('transform', 'none');
  const stopped = await leaf.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(350);
  expect(await leaf.evaluate((el) => getComputedStyle(el).transform)).toBe(
    stopped,
  );
  await expect(page.locator('[data-book-gpu]')).toHaveCount(0);
});

test('无 WebGPU 时仍有完整小书和翻页', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'gpu', { value: undefined }),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?demo=1');
  await expect(page.locator('[data-book-scene]')).toBeVisible();
  await expect(page.locator('[data-book-leaf]')).toBeVisible();
  await expect(page.locator('[data-book-gpu]')).toHaveCount(0);
});

test('WebGPU 初始化不可用时回退，不影响作业操作', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'gpu', {
      value: { requestAdapter: async () => null },
    }),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const gpuLoaded = page.waitForResponse((response) =>
    /book-paper-gpu-.*\.js/.test(response.url()),
  );
  await page.goto('/?demo=1');
  await gpuLoaded;
  await expect(page.locator('[data-book-scene]')).toHaveAttribute(
    'data-motion',
    'playing',
  );
  await expect(page.locator('[data-book-gpu]')).toHaveCount(0);
  await page.getByRole('link', { name: '整理今天的作业' }).click();
  await expect(page.getByLabel('作业内容')).toBeVisible();
  await expect(page.locator('[data-book-scene]')).toHaveCount(0);
});
