import { test, expect } from '@playwright/test';
for (const width of [1440, 390, 375]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`v3 ${width}px ${theme} 布局、详情和资源`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 960 : 1000,
      });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/?demo=1');
      const row = page.getByRole('link', {
        name: '查看作业：阅读一篇短文并记录三个新词',
      });
      await expect(row).toBeVisible();
      await expect(page.locator('html')).toHaveClass(
        theme === 'dark' ? /dark/ : /^$/,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const book = page.locator('[data-book-scene]');
      await expect(book).toBeVisible();
      await expect(page.locator('[data-book-leaf]')).toBeVisible();
      const size = await page
        .getByRole('link', { name: '整理今天的作业' })
        .boundingBox();
      expect(size!.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('[data-motion-content]')).toHaveCSS(
        'transform',
        'none',
      );
      await page.screenshot({
        path: testInfo.outputPath(`schedule-${width}-${theme}.png`),
        fullPage: true,
      });
      await row.click();
      await expect(
        page.getByRole('region', { name: '作业详情' }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width < 1024)
        await expect(
          page.getByRole('navigation', { name: '移动主导航' }),
        ).toBeHidden();
      await page.screenshot({
        path: testInfo.outputPath(`detail-${width}-${theme}.png`),
        fullPage: true,
      });
    });
  }
}
test('键盘可跳到主要内容', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '作业安排', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});
